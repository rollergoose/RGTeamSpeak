import { drawMap, drawZoneLabels, isBoardNearby, ZONES_PX } from './map.js';
import { drawCharacter } from './characters.js';
import { Camera } from './camera.js';
import { checkZone, getCurrentZone } from './zones.js';
import { sendPosition, emit } from './network.js';
import { ZONE_TYPES, TILE_SIZE } from './constants.js';
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

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

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

  drawSessionTimer(ctx);
  drawInteractHint(ctx, nearBoard);

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
    default:
      ctx.fillStyle = 'rgba(150,150,150,0.5)';
      ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
      break;
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

  for (const rp of remotePlayers.values()) {
    if (officeZoneIds.includes(rp.zone)) {
      const zone = ZONES_PX.find(z => z.id === rp.zone);
      if (!zone) continue;

      const dist = distToRect(px, py, zone.x, zone.y, zone.w, zone.h);
      if (dist < 3 * TILE_SIZE) {
        onOfficeProximityForKnock({ zoneId: rp.zone, zoneName: zone.name, occupant: rp.username });
        return;
      }
    }
  }
  onOfficeProximityForKnock(null);
}

function distToRect(px, py, rx, ry, rw, rh) {
  const cx = Math.max(rx, Math.min(px, rx + rw));
  const cy = Math.max(ry, Math.min(py, ry + rh));
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
