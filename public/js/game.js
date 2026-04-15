import { drawMap, drawZoneLabels, isBoardNearby, ZONES_PX } from './map.js';
import { drawCharacter } from './characters.js';
import { Camera } from './camera.js';
import { checkZone, getCurrentZone } from './zones.js';
import { sendPosition, emit } from './network.js';
import { ZONE_TYPES, TILE_SIZE, MAP_COLS } from './constants.js';
import { updatePets, drawPets, getNearbyPet } from './pets.js';

let canvas, ctx;
let camera;
let localPlayer = null;
let remotePlayers = new Map();
let lastTime = 0;
let keysDown = new Set();
let chatFocused = false;
let inputFocused = false;
let joinedAt = 0;
let lastInputTime = 0; // for AFK detection
const AFK_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Vehicles on the street
const vehicles = [];
let vehicleTimer = 0;

let onBoardProximity = null;
let onOfficeProximityForKnock = null;
let onKeyAction = null;
let getSpeechBubblesFn = null;

export function setCallbacks({ boardProximity, knockProximity, keyAction, speechBubbles }) {
  onBoardProximity = boardProximity || null;
  onOfficeProximityForKnock = knockProximity || null;
  onKeyAction = keyAction || null;
  getSpeechBubblesFn = speechBubbles || null;
}

export function getCamera() { return camera; }

export function initGame(canvasEl, player, remotes) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  localPlayer = player;
  remotePlayers = remotes;
  joinedAt = Date.now();

  lastInputTime = Date.now();

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', () => { lastInputTime = Date.now(); });

  // Right-click on canvas — remove pets
  canvas.addEventListener('contextmenu', (e) => {
    // Check if right-clicking a pet (handled by main.js furniture handler too)
    if (!camera) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = e.clientX - rect.left + camera.x;
    const worldY = e.clientY - rect.top + camera.y;
    const pet = getNearbyPet(worldX, worldY);
    if (pet) {
      e.preventDefault();
      emit('pet:remove-pet', { petId: pet.id });
    }
  });

  // Delay first frame to let the DOM layout settle (game container just became visible)
  requestAnimationFrame(() => {
    resizeCanvas();
    camera = new Camera(canvas.width, canvas.height);
    camera.x = localPlayer.x - camera.w / 2;
    camera.y = localPlayer.y - camera.h / 2;
    camera.targetX = camera.x;
    camera.targetY = camera.y;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  });
}

export function setChatFocused(focused) { chatFocused = focused; }
export function setInputFocused(focused) { inputFocused = focused; }

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  if (camera) camera.resize(canvas.width, canvas.height);
}

function onKeyDown(e) {
  lastInputTime = Date.now();
  if (chatFocused || inputFocused) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) {
    keysDown.add(key);
    e.preventDefault();
  }
  if (key === 'e' && onKeyAction) {
    onKeyAction('interact');
    e.preventDefault();
  }
  if (key === 'f' && localPlayer) {
    const pet = getNearbyPet(localPlayer.x, localPlayer.y);
    if (pet) {
      emit('pet:pet-it', { petId: pet.id });
    }
  }
}

function onKeyUp(e) {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keysDown.delete(key);
}

function gameLoop(timestamp) {
  try {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (!localPlayer) { requestAnimationFrame(gameLoop); return; }

  if (!chatFocused && !inputFocused) {
    localPlayer.update(keysDown, dt);
  }

  checkZone(localPlayer.x, localPlayer.y);
  sendPosition(localPlayer.x, localPlayer.y, localPlayer.direction, localPlayer.isMoving);
  // Expose for chat pet commands
  window._playerX = localPlayer.x;
  window._playerY = localPlayer.y;

  for (const rp of remotePlayers.values()) { rp.interpolate(dt); }

  // Update pets
  updatePets(dt);

  const nearBoard = isBoardNearby(localPlayer.x, localPlayer.y);
  if (onBoardProximity) onBoardProximity(nearBoard);

  checkKnockProximity();

  camera.follow(localPlayer.x, localPlayer.y);
  camera.update();

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawMap(ctx, camera);
  drawZoneLabels(ctx, camera);
  drawPlacedFurniture(ctx, camera);
  drawPets(ctx, camera);

  const allChars = [];

  allChars.push({
    x: localPlayer.x, y: localPlayer.y,
    appearance: localPlayer.appearance,
    direction: localPlayer.direction,
    isMoving: localPlayer.isMoving,
    animFrame: localPlayer.animFrame,
    username: localPlayer.username,
    playerStatus: localPlayer.status || {},
    workStatus: localPlayer.workStatus || null,
    zone: getCurrentZone()?.id || null,
  });

  for (const rp of remotePlayers.values()) {
    allChars.push({
      x: rp.x, y: rp.y,
      appearance: rp.appearance,
      direction: rp.direction,
      isMoving: rp.isMoving,
      animFrame: rp.animFrame,
      username: rp.username,
      playerStatus: { inMeeting: rp.inMeeting, muted: rp.muted },
      workStatus: rp.workStatus || null,
      zone: rp.zone,
    });
  }

  allChars.sort((a, b) => a.y - b.y);

  for (const c of allChars) {
    const sx = c.x - camera.x;
    const sy = c.y - camera.y;
    drawCharacter(ctx, sx, sy, c.appearance, c.direction, c.isMoving, c.animFrame, c.username, c.playerStatus);
    if (c.workStatus && c.workStatus.text) {
      drawStatusBubble(ctx, sx, sy, c.workStatus);
    }
    // Sitting animations based on zone
    if (!c.isMoving) drawSittingAnimation(ctx, sx, sy, c.zone);
  }

  // Draw speech bubbles from chat
  if (getSpeechBubblesFn) {
    const bubbles = getSpeechBubblesFn();
    for (const c of allChars) {
      const bubble = bubbles.get(c.username);
      if (bubble) {
        const sx = c.x - camera.x;
        const sy = c.y - camera.y;
        drawChatBubble(ctx, sx, sy - 42, bubble.text);
      }
    }
  }

  // Draw vehicles on the street
  updateAndDrawVehicles(ctx, camera, dt);

  drawSessionTimer(ctx);
  drawInteractHint(ctx, nearBoard);

  // Draw AFK indicator for players idle > 10 min
  drawAfkIndicators(ctx, camera, allChars);

  // Pet hint
  const nearPet = getNearbyPet(localPlayer.x, localPlayer.y);
  if (nearPet) {
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    const text = `Press F to pet ${nearPet.name}`;
    const tw = ctx.measureText(text).width;
    const cx = canvas.width / 2;
    const cy = canvas.height - 30;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - tw / 2 - 10, cy - 11, tw + 20, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, cx, cy + 2);
  }

  } catch(err) {
    console.error('GAME LOOP ERROR:', err);
  }
  requestAnimationFrame(gameLoop);
}

function drawStatusBubble(ctx, sx, sy, workStatus) {
  const text = workStatus.text;
  const hasLink = !!workStatus.link;
  ctx.font = '10px monospace';
  const textW = ctx.measureText(text).width;
  const bubbleW = Math.min(textW + 20, 180);
  const bubbleH = 22;
  const bx = sx - bubbleW / 2;
  const by = sy - 58;

  ctx.fillStyle = 'rgba(20,20,35,0.85)';
  ctx.beginPath(); ctx.roundRect(bx, by, bubbleW, bubbleH, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(233,69,96,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bx, by, bubbleW, bubbleH, 6); ctx.stroke();

  ctx.fillStyle = 'rgba(20,20,35,0.85)';
  ctx.beginPath();
  ctx.moveTo(sx - 4, by + bubbleH); ctx.lineTo(sx + 4, by + bubbleH); ctx.lineTo(sx, by + bubbleH + 5);
  ctx.fill();

  ctx.fillStyle = '#e0e0e0'; ctx.textAlign = 'left';
  const displayText = text.length > 22 ? text.slice(0, 20) + '..' : text;
  ctx.fillText(displayText, bx + 6, by + 15);
  if (hasLink) { ctx.fillStyle = '#3498db'; ctx.fillText('\u{1F517}', bx + bubbleW - 16, by + 15); }
  ctx.textAlign = 'center';
}

function drawSessionTimer(ctx) {
  const elapsed = Date.now() - joinedAt;
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'right';
  const text = `Session: ${timeStr}`;
  const tw = ctx.measureText(text).width;
  const px = canvas.width - 16;
  const py = 20;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(px - tw - 10, py - 13, tw + 16, 20);
  ctx.fillStyle = '#aabbcc';
  ctx.fillText(text, px, py);
  ctx.textAlign = 'center';
}

function drawInteractHint(ctx, nearBoard) {
  if (!nearBoard) return;
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  const text = 'Press E to open Planning Board';
  const tw = ctx.measureText(text).width;
  const cx = canvas.width / 2;
  const cy = canvas.height - 50;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - tw / 2 - 12, cy - 13, tw + 24, 22);
  ctx.strokeStyle = 'rgba(233,69,96,0.6)'; ctx.lineWidth = 1;
  ctx.strokeRect(cx - tw / 2 - 12, cy - 13, tw + 24, 22);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, cx, cy + 2);
  ctx.textAlign = 'center';
}

// ========== PLACED FURNITURE RENDERING ==========
const S = 32; // tile size for placed furniture

function drawPlacedFurniture(ctx, camera) {
  const allFurniture = [];
  if (localPlayer && localPlayer.officeFurniture) {
    for (const item of localPlayer.officeFurniture) allFurniture.push(item);
  }
  for (const rp of remotePlayers.values()) {
    if (rp.officeFurniture) {
      for (const item of rp.officeFurniture) allFurniture.push(item);
    }
  }

  for (const item of allFurniture) {
    const x = item.x - camera.x - S / 2;
    const y = item.y - camera.y - S / 2;

    if (x < -S || x > camera.w + S || y < -S || y > camera.h + S) continue;

    drawFurnitureItem(ctx, x, y, item.type);
  }
}

function drawFurnitureItem(ctx, x, y, type) {
  switch (type) {
    case 'chair':
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(x + 8, y + 8, 16, 16);
      ctx.fillStyle = '#6e6e6e';
      ctx.fillRect(x + 10, y + 4, 12, 6);
      break;
    case 'table':
      ctx.fillStyle = '#a0522d';
      ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      ctx.fillStyle = '#b8633a';
      ctx.strokeStyle = '#a0522d';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, y + 4, S - 8, S - 8);
      break;
    case 'couch':
      ctx.fillStyle = '#4682b4';
      ctx.fillRect(x + 2, y + 2, 4, S - 4);
      ctx.fillRect(x + S - 6, y + 2, 4, S - 4);
      ctx.fillStyle = '#5a9bc9';
      ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
      break;
    case 'plant':
      ctx.fillStyle = '#8b5e3c';
      ctx.fillRect(x + 10, y + 20, 12, 10);
      ctx.fillRect(x + 8, y + 18, 16, 4);
      ctx.fillStyle = '#2d8a4e';
      ctx.beginPath(); ctx.arc(x + 16, y + 14, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a7a3a';
      ctx.beginPath(); ctx.arc(x + 12, y + 11, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 20, y + 11, 5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bookshelf':
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x + 4, y + 4, S - 8, 6);
      ctx.fillRect(x + 4, y + 12, S - 8, 6);
      ctx.fillRect(x + 4, y + 20, S - 8, 6);
      // Books
      ctx.fillStyle = '#c0392b'; ctx.fillRect(x + 6, y + 5, 4, 5);
      ctx.fillStyle = '#2980b9'; ctx.fillRect(x + 11, y + 5, 4, 5);
      ctx.fillStyle = '#27ae60'; ctx.fillRect(x + 16, y + 5, 4, 5);
      ctx.fillStyle = '#f39c12'; ctx.fillRect(x + 6, y + 13, 4, 5);
      ctx.fillStyle = '#8e44ad'; ctx.fillRect(x + 11, y + 13, 4, 5);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(x + 16, y + 21, 4, 5);
      ctx.fillStyle = '#3498db'; ctx.fillRect(x + 6, y + 21, 4, 5);
      break;
    case 'whiteboard':
      ctx.fillStyle = '#ddd';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, S - 6, S - 6);
      // Lines on board
      ctx.strokeStyle = '#c00';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 24, y + 10); ctx.stroke();
      ctx.strokeStyle = '#00c';
      ctx.beginPath(); ctx.moveTo(x + 8, y + 16); ctx.lineTo(x + 20, y + 16); ctx.stroke();
      ctx.strokeStyle = '#0a0';
      ctx.beginPath(); ctx.moveTo(x + 8, y + 22); ctx.lineTo(x + 22, y + 22); ctx.stroke();
      break;
    case 'lamp':
      // Base
      ctx.fillStyle = '#555';
      ctx.fillRect(x + 12, y + 24, 8, 6);
      // Pole
      ctx.fillStyle = '#777';
      ctx.fillRect(x + 15, y + 10, 2, 14);
      // Shade
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.moveTo(x + 8, y + 12); ctx.lineTo(x + 24, y + 12); ctx.lineTo(x + 20, y + 4); ctx.lineTo(x + 12, y + 4); ctx.fill();
      // Glow
      ctx.fillStyle = 'rgba(241,196,15,0.15)';
      ctx.beginPath(); ctx.arc(x + 16, y + 10, 12, 0, Math.PI * 2); ctx.fill();
      break;
    case 'rug':
      ctx.fillStyle = '#6b2540';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#8b4560';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
      ctx.fillStyle = '#a05070';
      ctx.fillRect(x + 8, y + 8, S - 16, S - 16);
      break;
    case 'poster':
      ctx.fillStyle = '#f0e6d3';
      ctx.fillRect(x + 4, y + 2, S - 8, S - 4);
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 2, S - 8, S - 4);
      // Art
      ctx.fillStyle = '#e94560';
      ctx.fillRect(x + 8, y + 6, 6, 8);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(x + 16, y + 8, 6, 6);
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath(); ctx.arc(x + 16, y + 22, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'clock':
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + 16, y + 16, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 16, y + 16, 12, 0, Math.PI * 2); ctx.stroke();
      // Hands
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 16, y + 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 22, y + 16); ctx.stroke();
      ctx.fillStyle = '#c00';
      ctx.beginPath(); ctx.arc(x + 16, y + 16, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'trophy':
      // Cup
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(x + 10, y + 8, 12, 10);
      ctx.fillRect(x + 12, y + 18, 8, 4);
      ctx.fillRect(x + 10, y + 22, 12, 3);
      // Handles
      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 8, y + 13, 4, 0.5 * Math.PI, 1.5 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 24, y + 13, 4, 1.5 * Math.PI, 0.5 * Math.PI); ctx.stroke();
      // Star
      ctx.fillStyle = '#fff';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', x + 16, y + 16);
      break;
    case 'sign':
      // Post
      ctx.fillStyle = '#8b5e3c';
      ctx.fillRect(x + 14, y + 16, 4, 14);
      // Sign board
      ctx.fillStyle = '#f5f0e0';
      ctx.fillRect(x + 4, y + 4, S - 8, 14);
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, y + 4, S - 8, 14);
      ctx.fillStyle = '#555';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HELLO', x + 16, y + 13);
      break;
    case 'console':
      // Game console — dark box with colored buttons
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 4, y + 10, S - 8, S - 14);
      ctx.fillStyle = '#333';
      ctx.fillRect(x + 6, y + 12, S - 12, S - 18);
      // Buttons
      ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(x + 20, y + 18, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(x + 24, y + 16, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(x + 20, y + 14, 2, 0, Math.PI * 2); ctx.fill();
      // Joystick
      ctx.fillStyle = '#555'; ctx.fillRect(x + 9, y + 14, 4, 4);
      break;
    case 'easel':
      // Canvas on easel stand
      ctx.fillStyle = '#8b5e3c';
      ctx.fillRect(x + 8, y + 20, 3, 10);
      ctx.fillRect(x + 21, y + 20, 3, 10);
      ctx.fillRect(x + 14, y + 24, 4, 8);
      // Canvas
      ctx.fillStyle = '#f5f0e0';
      ctx.fillRect(x + 6, y + 2, 20, 18);
      ctx.strokeStyle = '#8b7355'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 6, y + 2, 20, 18);
      // Paint splotches
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(x + 10, y + 6, 4, 3);
      ctx.fillStyle = '#3498db'; ctx.fillRect(x + 16, y + 8, 5, 4);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(x + 12, y + 13, 3, 3);
      break;
    case 'pinball':
      // Pinball machine — tall cabinet
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(x + 4, y + 2, S - 8, S - 4);
      ctx.fillStyle = '#34495e';
      ctx.fillRect(x + 6, y + 4, S - 12, 14);
      // Playfield lights
      ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(x + 12, y + 8, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(x + 20, y + 10, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(x + 14, y + 14, 2, 0, Math.PI * 2); ctx.fill();
      // Flipper buttons
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(x + 8, y + 22, 4, 3);
      ctx.fillRect(x + 20, y + 22, 4, 3);
      break;
    case 'fridge':
      // Mini fridge — green Monster Energy style
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 4, y + 2, S - 8, S - 4);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x + 6, y + 4, S - 12, S - 8);
      // Monster M logo (green claw marks)
      ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 14, y + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 16, y + 8); ctx.lineTo(x + 16, y + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 20, y + 8); ctx.lineTo(x + 18, y + 20); ctx.stroke();
      // Handle
      ctx.fillStyle = '#444'; ctx.fillRect(x + S - 8, y + 12, 2, 8);
      break;
    case 'mic':
      // Recording mic with sound booth padding
      // Padding panels
      ctx.fillStyle = '#4a3a5a';
      ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      ctx.fillStyle = '#5a4a6a';
      for (let py = 4; py < S - 4; py += 6) {
        ctx.fillRect(x + 4, y + py, S - 8, 3);
      }
      // Mic stand
      ctx.fillStyle = '#666'; ctx.fillRect(x + 15, y + 12, 2, 16);
      ctx.fillRect(x + 11, y + 26, 10, 2);
      // Mic head
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(x + 16, y + 10, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(x + 16, y + 10, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'monitor':
      // Extra monitor on stand
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 4, y + 4, S - 8, S - 14);
      ctx.fillStyle = '#3a5a8a';
      ctx.fillRect(x + 6, y + 6, S - 12, S - 18);
      // Stand
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 13, y + S - 10, 6, 4);
      ctx.fillRect(x + 10, y + S - 6, 12, 2);
      break;
    case 'server':
      // Server rack
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x + 4, y + 2, S - 8, S - 4);
      // Rack units
      for (let sy = 4; sy < S - 6; sy += 5) {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(x + 6, y + sy, S - 12, 4);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(x + 8, y + sy + 1, 2, 2);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(x + 12, y + sy + 1, 2, 2);
      }
      break;
    case 'beanbag':
      // Bean bag chair
      ctx.fillStyle = '#e67e22';
      ctx.beginPath(); ctx.ellipse(x + 16, y + 18, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d35400';
      ctx.beginPath(); ctx.ellipse(x + 16, y + 14, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'figurine':
      // Action figure / collectible
      ctx.fillStyle = '#8b5e3c';
      ctx.fillRect(x + 10, y + 22, 12, 6); // base
      // Figure
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(x + 13, y + 10, 6, 12);
      // Head
      ctx.fillStyle = '#fde0c4';
      ctx.beginPath(); ctx.arc(x + 16, y + 8, 4, 0, Math.PI * 2); ctx.fill();
      // Arms
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(x + 10, y + 12, 3, 6);
      ctx.fillRect(x + 19, y + 12, 3, 6);
      break;
    case 'headphones':
      // Headphone stand
      ctx.fillStyle = '#555';
      ctx.fillRect(x + 14, y + 14, 4, 14); // pole
      ctx.fillRect(x + 10, y + 26, 12, 3); // base
      // Headphone band
      ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + 16, y + 10, 8, Math.PI, 0); ctx.stroke();
      // Ear cups
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 6, y + 8, 5, 8);
      ctx.fillRect(x + 21, y + 8, 5, 8);
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 7, y + 10, 3, 4);
      ctx.fillRect(x + 22, y + 10, 3, 4);
      break;
    case 'keyboard':
      // Mechanical keyboard
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x + 2, y + 10, S - 4, 14);
      ctx.fillStyle = '#3a3a3a';
      // Key rows
      for (let ky = 12; ky < 22; ky += 4) {
        for (let kx = 4; kx < S - 4; kx += 4) {
          ctx.fillRect(x + kx, y + ky, 3, 3);
        }
      }
      // RGB glow
      ctx.fillStyle = 'rgba(0,255,100,0.15)';
      ctx.fillRect(x + 2, y + 10, S - 4, 14);
      break;
    case 'corkboard':
      // Cork board with pins
      ctx.fillStyle = '#c4a35a';
      ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      ctx.strokeStyle = '#8b7340'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, S - 4, S - 4);
      // Pinned notes
      ctx.fillStyle = '#ffe0b2'; ctx.fillRect(x + 6, y + 6, 8, 6);
      ctx.fillStyle = '#b2ebf2'; ctx.fillRect(x + 16, y + 8, 8, 6);
      ctx.fillStyle = '#fff9c4'; ctx.fillRect(x + 8, y + 16, 8, 6);
      ctx.fillStyle = '#f8bbd0'; ctx.fillRect(x + 18, y + 18, 6, 6);
      // Pins
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.arc(x + 10, y + 6, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2196f3';
      ctx.beginPath(); ctx.arc(x + 20, y + 8, 1.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'trashcan':
      ctx.fillStyle = '#666';
      ctx.fillRect(x + 8, y + 8, S - 16, S - 12);
      ctx.fillStyle = '#777';
      ctx.fillRect(x + 6, y + 6, S - 12, 4);
      // Lid
      ctx.fillStyle = '#888';
      ctx.fillRect(x + 7, y + 4, S - 14, 3);
      ctx.fillRect(x + 13, y + 2, 6, 3);
      break;
    case 'fan':
      // Desk fan
      ctx.fillStyle = '#ddd';
      ctx.beginPath(); ctx.arc(x + 16, y + 14, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 16, y + 14, 10, 0, Math.PI * 2); ctx.stroke();
      // Blades (animated with time)
      const angle = (Date.now() * 0.01) % (Math.PI * 2);
      ctx.fillStyle = 'rgba(100,100,100,0.6)';
      for (let i = 0; i < 3; i++) {
        const a = angle + i * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.moveTo(x + 16, y + 14);
        ctx.lineTo(x + 16 + Math.cos(a) * 8, y + 14 + Math.sin(a) * 8);
        ctx.lineTo(x + 16 + Math.cos(a + 0.4) * 7, y + 14 + Math.sin(a + 0.4) * 7);
        ctx.fill();
      }
      // Center
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(x + 16, y + 14, 2, 0, Math.PI * 2); ctx.fill();
      // Base
      ctx.fillStyle = '#888';
      ctx.fillRect(x + 12, y + 24, 8, 4);
      break;
    default:
      ctx.fillStyle = 'rgba(150,150,150,0.5)';
      ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
      break;
  }
}

// ========== SITTING / ACTIVITY ANIMATIONS ==========
function drawSittingAnimation(ctx, sx, sy, zone) {
  const now = Date.now();

  if (zone === 'toilet') {
    // Holding newspaper
    ctx.fillStyle = '#f5f0e0';
    ctx.fillRect(sx - 8, sy - 14, 16, 12);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx - 8, sy - 14, 16, 12);
    ctx.fillStyle = '#888';
    ctx.fillRect(sx - 5, sy - 11, 10, 1);
    ctx.fillRect(sx - 5, sy - 8, 8, 1);
    ctx.fillRect(sx - 5, sy - 5, 10, 1);
    // Dangling legs
    const legSwing = Math.sin(now * 0.003) * 2;
    ctx.fillStyle = 'rgba(90,90,90,0.5)';
    ctx.fillRect(sx - 4, sy + 2 + legSwing, 3, 4);
    ctx.fillRect(sx + 2, sy + 2 - legSwing, 3, 4);
  }

  if (zone === 'kitchen') {
    // Eating from bowl
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.ellipse(sx + 8, sy - 4, 6, 3, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.ellipse(sx + 8, sy - 5, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    const spoonY = Math.sin(now * 0.005) * 3;
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + 12, sy - 6);
    ctx.lineTo(sx + 14, sy - 12 + spoonY);
    ctx.stroke();
  }

  if (zone === 'meeting') {
    // Applause
    const clap = Math.sin(now * 0.008) > 0.5;
    if (clap) {
      ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('👏', sx, sy - 35);
    }
  }

  // OFFICE — typing animation (hand moving up and down near keyboard)
  if (zone === 'henrik' || zone === 'alice' || zone === 'leo') {
    const handY = Math.sin(now * 0.01) * 2;
    const handX = Math.sin(now * 0.007 + 1) * 1.5;
    // Left hand typing
    ctx.fillStyle = 'rgba(200,180,160,0.7)';
    ctx.fillRect(sx - 6 + handX, sy - 2 + handY, 4, 3);
    // Right hand typing
    ctx.fillRect(sx + 3 - handX, sy - 2 - handY, 4, 3);
    // Small keyboard below
    ctx.fillStyle = 'rgba(60,60,60,0.4)';
    ctx.fillRect(sx - 7, sy + 2, 14, 3);
    ctx.fillStyle = 'rgba(100,100,100,0.3)';
    ctx.fillRect(sx - 6, sy + 3, 2, 1);
    ctx.fillRect(sx - 3, sy + 3, 2, 1);
    ctx.fillRect(sx + 0, sy + 3, 2, 1);
    ctx.fillRect(sx + 3, sy + 3, 2, 1);
  }
}

// ========== CHAT SPEECH BUBBLE ==========
function drawChatBubble(ctx, sx, sy, text) {
  ctx.font = '10px sans-serif';
  const textW = ctx.measureText(text).width;
  const bubbleW = Math.min(textW + 16, 200);
  const bubbleH = 20;
  const bx = sx - bubbleW / 2;
  const by = sy - 24;

  // White bubble with rounded corners
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.roundRect(bx, by, bubbleW, bubbleH, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bx, by, bubbleW, bubbleH, 8); ctx.stroke();

  // Tail
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(sx - 4, by + bubbleH);
  ctx.lineTo(sx + 4, by + bubbleH);
  ctx.lineTo(sx, by + bubbleH + 6);
  ctx.fill();

  // Text
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  const display = text.length > 28 ? text.slice(0, 26) + '..' : text;
  ctx.fillText(display, sx, by + 14);
}

// ========== KNOCK PROXIMITY DETECTION ==========
// Uses the directly imported ZONES_PX — no lazy import needed
function checkKnockProximity() {
  if (!onOfficeProximityForKnock) return;

  const currentZone = getCurrentZone();
  // Only show knock when in hallway
  if (currentZone && currentZone.type !== ZONE_TYPES.HALLWAY) {
    onOfficeProximityForKnock(null);
    return;
  }

  const officeZoneIds = ['henrik', 'alice', 'leo'];
  const px = localPlayer.x;
  const py = localPlayer.y;

  // Check proximity to ANY office (for notice board + knock)
  for (const zoneId of officeZoneIds) {
    const zone = ZONES_PX.find(z => z.id === zoneId);
    if (!zone) continue;

    const dist = distToRect(px, py, zone.x, zone.y, zone.w, zone.h);
    if (dist < 3 * TILE_SIZE) {
      // Check if someone is inside for knock
      let occupant = null;
      for (const rp of remotePlayers.values()) {
        if (rp.zone === zoneId) { occupant = rp.username; break; }
      }
      onOfficeProximityForKnock({ zoneId, zoneName: zone.name, occupant });
      return;
    }
  }
  onOfficeProximityForKnock(null);
}

function distToRect(px, py, rx, ry, rw, rh) {
  const cx = Math.max(rx, Math.min(px, rx + rw));
  const cy = Math.max(ry, Math.min(py, ry + rh));
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

// ========== VEHICLES ON STREET ==========
const VEHICLE_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#fff', '#333'];
const STREET_Y = 24 * TILE_SIZE; // row 24 = center of street

function updateAndDrawVehicles(ctx, camera, dt) {
  // Spawn vehicles randomly
  vehicleTimer += dt;
  if (vehicleTimer > 3000 + Math.random() * 5000) {
    vehicleTimer = 0;
    const goingRight = Math.random() > 0.5;
    vehicles.push({
      x: goingRight ? -60 : MAP_COLS * TILE_SIZE + 60,
      y: STREET_Y + (goingRight ? -8 : 8),
      speed: (0.8 + Math.random() * 0.8) * (goingRight ? 1 : -1),
      color: VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)],
      type: Math.random() > 0.3 ? 'car' : 'truck',
    });
  }

  // Update and draw
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    v.x += v.speed * dt * 0.1;

    // Remove if offscreen
    if (v.x < -100 || v.x > MAP_COLS * TILE_SIZE + 100) {
      vehicles.splice(i, 1);
      continue;
    }

    const sx = v.x - camera.x;
    const sy = v.y - camera.y;
    if (sx < -60 || sx > camera.w + 60 || sy < -30 || sy > camera.h + 30) continue;

    const w = v.type === 'truck' ? 48 : 32;
    const h = 16;

    // Body
    ctx.fillStyle = v.color;
    ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
    // Roof
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(sx - w / 4, sy - h / 2 - 4, w / 2, 4);
    // Wheels
    ctx.fillStyle = '#222';
    ctx.fillRect(sx - w / 3, sy + h / 2 - 2, 6, 4);
    ctx.fillRect(sx + w / 3 - 6, sy + h / 2 - 2, 6, 4);
    // Headlights
    ctx.fillStyle = v.speed > 0 ? '#ff0' : '#f00';
    const headX = v.speed > 0 ? sx + w / 2 - 3 : sx - w / 2;
    ctx.fillRect(headX, sy - 2, 3, 4);
  }
}

// ========== AFK DETECTION ==========
export function isAfk() {
  return Date.now() - lastInputTime > AFK_TIMEOUT;
}

function drawAfkIndicators(ctx, camera, allChars) {
  const now = Date.now();

  for (const c of allChars) {
    // Check if this is the local player and they're AFK
    // For remote players, we'd need server-side AFK tracking
    // For now, only show ZzZ on local player
    if (c.username === localPlayer?.username && isAfk()) {
      const sx = c.x - camera.x;
      const sy = c.y - camera.y;
      const bob = Math.sin(now * 0.003) * 3;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(100,100,200,0.8)';
      ctx.fillText('z', sx + 12, sy - 38 + bob);
      ctx.fillText('Z', sx + 18, sy - 46 + bob);
      ctx.fillText('z', sx + 24, sy - 54 + bob);
    }
  }
}

