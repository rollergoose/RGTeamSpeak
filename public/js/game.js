import { drawMap, drawZoneLabels, isBoardNearby, ZONES_PX } from './map.js';
import { drawCharacter } from './characters.js';
import { Camera } from './camera.js';
import { checkZone, getCurrentZone } from './zones.js';
import { sendPosition, emit } from './network.js';
import { ZONE_TYPES, TILE_SIZE, MAP_COLS, PLAYER_WIDTH, PLAYER_HEIGHT, CHAR_W, CHAR_H } from './constants.js';
import { updatePets, drawPets, getNearbyPet } from './pets.js';
import { initDogPark, updateDogPark, drawDogPark } from './dogpark.js';

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

// Mouse hover tracking for nametag display (canvas-local coords; mouseActive=false when off-canvas)
let mouseCanvasX = 0;
let mouseCanvasY = 0;
let mouseActive = false;

// Mario-style death easter-egg constants (see triggerVehicleDeath / drawCharacter calls below)
const DEATH_PAUSE_MS = 150;       // freeze-frame before the hop
const DEATH_DURATION_MS = 1800;   // total before local player respawns
const DEATH_JUMP_VELOCITY = -280; // px/s initial upward velocity
const DEATH_GRAVITY = 700;        // px/s² downward acceleration
const RESPAWN_X = 14 * TILE_SIZE; // center of Resting Area zone (tx=10..18 → col 14)
const RESPAWN_Y = 3.5 * TILE_SIZE + TILE_SIZE / 2; // just below the couch row
// Grace period after respawn so the player doesn't immediately die again if a car is on top
let lastRespawnAt = 0;
const RESPAWN_GRACE_MS = 1500;

let onBoardProximity = null;
let onOfficeProximityForKnock = null;
let onKeyAction = null;
let getSpeechBubblesFn = null;
let onLocalDeath = null; // fires once when the local player gets hit — main.js plays sound
let getAllFurnitureFn = null; // returns a Map<username, items[]>

export function setCallbacks({ boardProximity, knockProximity, keyAction, speechBubbles, localDeath, allFurniture }) {
  onBoardProximity = boardProximity || null;
  onOfficeProximityForKnock = knockProximity || null;
  onKeyAction = keyAction || null;
  getSpeechBubblesFn = speechBubbles || null;
  if (localDeath) onLocalDeath = localDeath;
  if (allFurniture) getAllFurnitureFn = allFurniture;
}

// Returns the vertical offset (pixels, negative = up, positive = down) for a Mario-style
// hop-and-fall, given milliseconds elapsed since death was triggered.
function computeDeathOffset(elapsedMs) {
  if (elapsedMs < DEATH_PAUSE_MS) return 0;
  const t = (elapsedMs - DEATH_PAUSE_MS) / 1000;
  return DEATH_JUMP_VELOCITY * t + 0.5 * DEATH_GRAVITY * t * t;
}

// AABB overlap of the local player and any active vehicle → trigger the death animation.
function checkVehicleCollision() {
  if (!localPlayer || localPlayer.isDead) return;
  if (performance.now() - lastRespawnAt < RESPAWN_GRACE_MS) return;
  const pLeft  = localPlayer.x - PLAYER_WIDTH / 2;
  const pRight = localPlayer.x + PLAYER_WIDTH / 2;
  const pTop   = localPlayer.y - PLAYER_HEIGHT / 2;
  const pBot   = localPlayer.y + PLAYER_HEIGHT / 2;
  for (const v of vehicles) {
    const w = v.type === 'truck' ? 48 : 32;
    const h = 16;
    if (v.x + w / 2 < pLeft) continue;
    if (v.x - w / 2 > pRight) continue;
    if (v.y + h / 2 < pTop)  continue;
    if (v.y - h / 2 > pBot)  continue;
    if (localPlayer.triggerDeath()) {
      if (onLocalDeath) onLocalDeath();
      emit('player:died', { x: localPlayer.x, y: localPlayer.y });
    }
    break;
  }
}

// Externally-callable entry used by main.js when a remote player:died is relayed by the server.
export function triggerRemoteDeath(playerId) {
  const rp = remotePlayers.get(playerId);
  if (rp && typeof rp.triggerDeath === 'function') rp.triggerDeath();
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

  // Canvas-local mouse tracking for hover-to-see-nametag
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // The canvas is rendered 1:1 with its CSS size (no devicePixelRatio scaling elsewhere),
    // so client coords - rect offset lands in canvas pixels.
    mouseCanvasX = e.clientX - rect.left;
    mouseCanvasY = e.clientY - rect.top;
    mouseActive = true;
  });
  canvas.addEventListener('mouseleave', () => { mouseActive = false; });

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
    onKeyAction('interact'); // Planning board OR knock
    e.preventDefault();
  }
  if (key === 'q' && onKeyAction) {
    onKeyAction('lock'); // Lock/unlock office door
    e.preventDefault();
  }
  if ((key === ' ' || key === 'Space') && onKeyAction) {
    onKeyAction('knock');
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

  // Easter-egg: cars on the street are deadly. Check before anything else so the
  // respawn position can be sent in the next sendPosition call this frame.
  checkVehicleCollision();
  if (localPlayer.isDead) {
    const elapsed = performance.now() - localPlayer.deathStartTime;
    if (elapsed >= DEATH_DURATION_MS) {
      // Respawn in the Resting Area
      localPlayer.x = RESPAWN_X;
      localPlayer.y = RESPAWN_Y;
      localPlayer.direction = 'down';
      localPlayer.clearDeath();
      lastRespawnAt = performance.now();
    }
  }

  // Auto-clear stale remote deaths so we don't lock remote players visually if a respawn
  // player:move arrives late (or not at all).
  for (const rp of remotePlayers.values()) {
    if (rp.isDead && performance.now() - rp.deathStartTime >= DEATH_DURATION_MS) {
      rp.clearDeath();
    }
  }

  checkZone(localPlayer.x, localPlayer.y);
  sendPosition(localPlayer.x, localPlayer.y, localPlayer.direction, localPlayer.isMoving);
  // Expose for chat pet commands
  window._playerX = localPlayer.x;
  window._playerY = localPlayer.y;

  for (const rp of remotePlayers.values()) { rp.interpolate(dt); }

  // Update pets
  updatePets(dt);
  updateDogPark(dt);

  const nearBoard = isBoardNearby(localPlayer.x, localPlayer.y);
  if (onBoardProximity) onBoardProximity(nearBoard);

  checkKnockProximity();

  camera.follow(localPlayer.x, localPlayer.y);
  camera.update();

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawMap(ctx, camera);
  drawLockedDoors(ctx, camera);
  drawZoneLabels(ctx, camera);
  // Rugs first — they sit flat on the floor under everything else.
  drawPlacedFurniture(ctx, camera, 'rug');
  drawPlacedFurniture(ctx, camera, 'regular');
  drawPets(ctx, camera);
  drawDogPark(ctx, camera);
  drawNoticeBadges(ctx, camera);

  const allChars = [];

  allChars.push({
    x: localPlayer.x, y: localPlayer.y,
    appearance: localPlayer.appearance,
    direction: localPlayer.direction,
    isMoving: localPlayer.isMoving,
    animFrame: localPlayer.animFrame,
    username: localPlayer.username,
    level: localPlayer.level || 0,
    playerStatus: localPlayer.status || {},
    workStatus: localPlayer.workStatus || null,
    zone: getCurrentZone()?.id || null,
    isDead: localPlayer.isDead,
    deathStartTime: localPlayer.deathStartTime,
    holdingCakeUntil: localPlayer.holdingCakeUntil || 0,
  });

  for (const rp of remotePlayers.values()) {
    allChars.push({
      x: rp.x, y: rp.y,
      appearance: rp.appearance,
      direction: rp.direction,
      isMoving: rp.isMoving,
      animFrame: rp.animFrame,
      username: rp.username,
      level: rp.level || 0,
      playerStatus: { inMeeting: rp.inMeeting, muted: rp.muted },
      workStatus: rp.workStatus || null,
      zone: rp.zone,
      isDead: rp.isDead,
      deathStartTime: rp.deathStartTime,
      holdingCakeUntil: rp.holdingCakeUntil || 0,
    });
  }

  allChars.sort((a, b) => a.y - b.y);

  for (const c of allChars) {
    const sx = c.x - camera.x;
    let sy = c.y - camera.y;
    // Apply Mario-death vertical offset so the character hops then falls off-screen
    if (c.isDead) {
      const deathOffset = computeDeathOffset(performance.now() - c.deathStartTime);
      sy += deathOffset;
    }
    drawCharacter(ctx, sx, sy, c.appearance, c.direction, c.isMoving, c.animFrame, c.username, c.playerStatus);
    if (c.workStatus && c.workStatus.text && !c.isDead) {
      drawStatusBubble(ctx, sx, sy, c.workStatus);
    }
    // Sitting animations based on zone (but not while being hit by a car)
    if (!c.isMoving && !c.isDead) drawSittingAnimation(ctx, sx, sy, c.zone);
    // Pixel cake easter egg — hand position relative to character
    if (c.holdingCakeUntil && c.holdingCakeUntil > Date.now() && !c.isDead) {
      drawPixelCake(ctx, sx, sy, c.direction);
    }
  }

  // Hover nametag — pick the topmost character under the mouse cursor and draw their name.
  // Iterating allChars in reverse walks front-to-back (same sort as draw order, sorted by y
  // ascending, so later entries are drawn in front / lower on screen).
  if (mouseActive) {
    for (let i = allChars.length - 1; i >= 0; i--) {
      const c = allChars[i];
      if (!c.username) continue;
      if (c.isDead) continue; // don't tag a character mid-death animation
      const sx = c.x - camera.x;
      const sy = c.y - camera.y;
      // Character bounding box: width CHAR_W centered on sx, height CHAR_H with bottom at sy
      if (mouseCanvasX >= sx - CHAR_W / 2 && mouseCanvasX <= sx + CHAR_W / 2 &&
          mouseCanvasY >= sy - CHAR_H     && mouseCanvasY <= sy) {
        const accent = c.appearance?.shirtColor || '#e94560';
        drawNametag(ctx, sx, sy - CHAR_H - 6, c.username, accent, c.level || 0);
        break;
      }
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

  // Ceiling-mounted items (fans, lights) render on top of characters and furniture.
  drawPlacedFurniture(ctx, camera, 'ceiling');

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

// Pixel cake held by a character who just finished a task. (sx, sy) is the character's
// bottom-center anchor; the cake is offset to "hand height". Directional offset so it
// appears in front of the character based on facing.
function drawPixelCake(ctx, sx, sy, direction) {
  // Hand-height offset: roughly mid-body. Place on the right by default, flip for 'left'.
  const handY = Math.round(sy - 14);
  const dx = direction === 'left' ? -12 : 12;
  const cx = Math.round(sx + dx);
  const cy = handY;

  // Gentle bob so the cake isn't perfectly static (1-pixel sine bob).
  const bob = Math.round(Math.sin(performance.now() / 400) * 1);

  // --- Plate ---
  ctx.fillStyle = '#d0d0d0';
  ctx.fillRect(cx - 6, cy + 5 + bob, 12, 1);
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - 5, cy + 4 + bob, 10, 1);

  // --- Cake body (chocolate base) ---
  ctx.fillStyle = '#6b3410';
  ctx.fillRect(cx - 5, cy + 2 + bob, 10, 3);
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(cx - 5, cy + 2 + bob, 10, 1);

  // --- Frosting layer ---
  ctx.fillStyle = '#fef2e0';
  ctx.fillRect(cx - 5, cy + bob, 10, 2);
  // Pink icing drip decorations
  ctx.fillStyle = '#e91e63';
  ctx.fillRect(cx - 3, cy + 1 + bob, 1, 1);
  ctx.fillRect(cx + 2, cy + 1 + bob, 1, 1);
  ctx.fillStyle = '#ff1493';
  ctx.fillRect(cx - 1, cy + 1 + bob, 1, 1);

  // --- Candle ---
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(cx, cy - 3 + bob, 1, 3);
  ctx.fillStyle = '#3498db';
  ctx.fillRect(cx - 1, cy - 3 + bob, 1, 3);

  // --- Flame (flicker slightly) ---
  const flickerT = performance.now() / 80;
  const flameShape = Math.sin(flickerT) > 0 ? 0 : 1;
  ctx.fillStyle = '#ff6b35';
  ctx.fillRect(cx - 1, cy - 5 + bob, 2, 2);
  ctx.fillStyle = '#ffe66d';
  ctx.fillRect(cx, cy - 5 + flameShape + bob, 1, 1);

  // --- Subtle glow ---
  ctx.fillStyle = 'rgba(255, 215, 120, 0.2)';
  ctx.beginPath();
  ctx.arc(cx, cy - 3 + bob, 6, 0, Math.PI * 2);
  ctx.fill();
}

// Draws a small pill-shaped nametag with a downward pointer above a character.
// (sx, sy) is the pointer tip — the label floats above it. Shows "Name · Lv N" when a level is provided.
function drawNametag(ctx, sx, sy, username, accentColor, level = 0) {
  const name = String(username);
  const levelText = `Lv ${Math.max(0, Math.min(50, level | 0))}`;
  ctx.font = 'bold 11px monospace';
  const padX = 8;
  const nameW = ctx.measureText(name).width;
  const sepW = ctx.measureText(' · ').width;
  const lvW = ctx.measureText(levelText).width;
  const textW = nameW + sepW + lvW;
  const boxW = Math.ceil(textW + padX * 2);
  const boxH = 18;
  const boxX = Math.round(sx - boxW / 2);
  const boxY = Math.round(sy - boxH - 4);

  // Background pill
  ctx.fillStyle = 'rgba(12,12,25,0.92)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 5);
  ctx.fill();
  ctx.strokeStyle = accentColor || 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Downward pointer
  ctx.fillStyle = 'rgba(12,12,25,0.92)';
  ctx.beginPath();
  ctx.moveTo(sx - 4, boxY + boxH);
  ctx.lineTo(sx + 4, boxY + boxH);
  ctx.lineTo(sx, boxY + boxH + 4);
  ctx.closePath();
  ctx.fill();

  // Text — username white, separator dim, level accent-colored so it reads as a stat
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textY = boxY + boxH / 2 + 1;
  let cursorX = boxX + padX;
  ctx.fillStyle = '#fff';
  ctx.fillText(name, cursorX, textY);
  cursorX += nameW;
  ctx.fillStyle = '#778899';
  ctx.fillText(' · ', cursorX, textY);
  cursorX += sepW;
  ctx.fillStyle = accentColor || '#f1c40f';
  ctx.fillText(levelText, cursorX, textY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
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

// ========== LOCKED DOOR OVERLAY ==========
// Door positions: Henrik (6,9)(7,9), Alice (19,9)(20,9), Leo (32,9)(33,9)
const OFFICE_DOORS = {
  henrik: [[3, 9], [4, 9]],
  alice: [[10, 9], [11, 9]],
  leo: [[17, 9], [18, 9]],
};

function drawLockedDoors(ctx, camera) {
  const locks = window._officeLocks || {};
  for (const [officeId, doors] of Object.entries(OFFICE_DOORS)) {
    const lock = locks[officeId];
    if (lock && lock.locked) {
      for (const [col, row] of doors) {
        const x = col * TILE_SIZE - camera.x;
        const y = row * TILE_SIZE - camera.y;
        // Closed door — darker wood with panels and handle
        ctx.fillStyle = '#5a4030';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        // Door panels
        ctx.fillStyle = '#4a3525';
        ctx.fillRect(x + 4, y + 3, TILE_SIZE - 8, 11);
        ctx.fillRect(x + 4, y + 18, TILE_SIZE - 8, 11);
        // Panel insets
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 5, y + 4, TILE_SIZE - 10, 9);
        ctx.strokeRect(x + 5, y + 19, TILE_SIZE - 10, 9);
        // Door handle
        ctx.fillStyle = '#c0a040';
        ctx.beginPath();
        ctx.arc(x + TILE_SIZE - 8, y + TILE_SIZE / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ========== NOTICE BOARD BADGES ==========
// Board tile positions match map.js: Henrik (6,10), Alice (13,10), Leo (20,10)
const NOTICE_BOARDS = {
  henrik: { col: 6, row: 10 },
  alice: { col: 13, row: 10 },
  leo: { col: 20, row: 10 },
};

function drawNoticeBadges(ctx, camera) {
  const counts = window._officeNoticeCounts || {};
  for (const [officeId, pos] of Object.entries(NOTICE_BOARDS)) {
    const count = counts[officeId] || 0;
    if (count <= 0) continue;

    // Top-right corner of the board tile
    const bx = pos.col * TILE_SIZE - camera.x + TILE_SIZE - 4;
    const by = pos.row * TILE_SIZE - camera.y + 4;

    if (bx < -20 || bx > camera.w + 20 || by < -20 || by > camera.h + 20) continue;

    const label = count > 99 ? '99+' : String(count);
    const r = 9;

    // Red circle with white border (for contrast)
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(bx, by, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();

    // Number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx, by + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
}

// ========== PLACED FURNITURE RENDERING ==========
const S = 32; // tile size for placed furniture

// Three render layers:
//   'rug'     — flat floor coverings, drawn under everything else
//   'ceiling' — mounted-from-above items, drawn on top of everything (characters too)
//   'regular' — everything else, drawn between
const RUG_TYPES = new Set(['rug', 'rug_blue', 'rug_green', 'rug_gray', 'rug_black']);
const CEILING_TYPES = new Set(['ceiling_fan', 'ceiling_light']);

function getFurnitureLayer(type) {
  if (RUG_TYPES.has(type)) return 'rug';
  if (CEILING_TYPES.has(type)) return 'ceiling';
  return 'regular';
}

function drawPlacedFurniture(ctx, camera, layer = 'regular') {
  // Furniture is now a single shared global list — pull it via the callback set in main.js.
  const allFurniture = (getAllFurnitureFn && getAllFurnitureFn()) || [];

  for (const item of allFurniture) {
    if (getFurnitureLayer(item.type) !== layer) continue;
    const x = item.x - camera.x - S / 2;
    const y = item.y - camera.y - S / 2;

    if (x < -S || x > camera.w + S || y < -S || y > camera.h + S) continue;

    drawFurnitureItem(ctx, x, y, item.type);
  }
}

function drawFurnitureItem(ctx, x, y, type) {
  switch (type) {
    case 'desk':
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
      ctx.fillStyle = '#a07818';
      ctx.fillRect(x + 1, y + 1, S - 2, 4);
      break;
    case 'computer':
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x + 6, y + 4, S - 12, S - 12);
      ctx.fillStyle = '#4488ff';
      ctx.fillRect(x + 8, y + 6, S - 16, S - 16);
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 10, y + S - 10, S - 20, 6);
      break;
    case 'chair':
      // Classic wooden chair
      // Legs
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(x + 8, y + 22, 3, 8);
      ctx.fillRect(x + 21, y + 22, 3, 8);
      ctx.fillRect(x + 8, y + 10, 3, 8);
      ctx.fillRect(x + 21, y + 10, 3, 8);
      // Seat
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x + 7, y + 18, 18, 5);
      // Backrest
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(x + 7, y + 4, 18, 3);
      ctx.fillRect(x + 7, y + 9, 18, 3);
      // Back posts
      ctx.fillRect(x + 8, y + 4, 3, 14);
      ctx.fillRect(x + 21, y + 4, 3, 14);
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
    case 'redbull_fridge':
      // Mini fridge — silver body with Red Bull navy-blue/red branding
      ctx.fillStyle = '#d0d0d0'; // silver body
      ctx.fillRect(x + 4, y + 2, S - 8, S - 4);
      ctx.fillStyle = '#9a9a9a'; // top shelf shadow
      ctx.fillRect(x + 4, y + 2, S - 8, 3);
      // Red Bull blue band
      ctx.fillStyle = '#002654';
      ctx.fillRect(x + 4, y + 10, S - 8, 12);
      // Yellow sun/disc (Red Bull logo backdrop)
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.arc(x + 16, y + 16, 4, 0, Math.PI * 2); ctx.fill();
      // Two charging red "bulls" (abstract dashes)
      ctx.fillStyle = '#d90429';
      ctx.fillRect(x + 10, y + 13, 4, 2);
      ctx.fillRect(x + 18, y + 17, 4, 2);
      // Handle
      ctx.fillStyle = '#555'; ctx.fillRect(x + S - 8, y + 12, 2, 8);
      // Bottom trim
      ctx.fillStyle = '#666'; ctx.fillRect(x + 4, y + S - 5, S - 8, 1);
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
    case 'wall_h':
      ctx.fillStyle = '#4a3f35';
      ctx.fillRect(x, y + 12, S, 8);
      ctx.fillStyle = '#5e5248';
      ctx.fillRect(x, y + 15, S, 2);
      break;
    case 'wall_v':
      ctx.fillStyle = '#4a3f35';
      ctx.fillRect(x + 12, y, 8, S);
      ctx.fillStyle = '#5e5248';
      ctx.fillRect(x + 15, y, 2, S);
      break;
    case 'divider':
      ctx.fillStyle = '#7a6a5a';
      ctx.fillRect(x + 4, y + 2, S - 8, S - 4);
      ctx.fillStyle = '#8d7d6d';
      ctx.fillRect(x + 6, y + 4, S - 12, 3);
      ctx.fillRect(x + 6, y + S - 8, S - 12, 3);
      // Frame lines
      ctx.strokeStyle = '#6a5a4a'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 5, y + 3, S - 10, S - 6);
      break;
    case 'rug_blue':
      ctx.fillStyle = '#1a3a6a';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#2a5a8a';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
      break;
    case 'rug_green':
      ctx.fillStyle = '#1a5a2a';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#2a7a3a';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
      break;
    case 'rug_gray':
      ctx.fillStyle = '#888';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
      break;
    case 'rug_black':
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#333';
      ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
      break;

    case 'filing_cabinet': {
      // 3-drawer metal cabinet
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(x + 6, y + 4, 20, 26);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(x + 6, y + 4, 20, 1);
      // Drawer divisions
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(x + 6, y + 12, 20, 1);
      ctx.fillRect(x + 6, y + 21, 20, 1);
      // Drawer handles (silver)
      ctx.fillStyle = '#ddd';
      ctx.fillRect(x + 13, y + 8, 6, 1.5);
      ctx.fillRect(x + 13, y + 16, 6, 1.5);
      ctx.fillRect(x + 13, y + 25, 6, 1.5);
      // Top paper sticking out
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 9, y + 1, 14, 4);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(x + 11, y + 2, 10, 0.6);
      ctx.fillRect(x + 11, y + 3, 8, 0.6);
      break;
    }
    case 'office_chair': {
      // Wheeled ergonomic chair — top-down 3/4 view
      const cx = x + 16;
      // 5-star wheel base
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = i * (Math.PI * 2 / 5);
        ctx.beginPath();
        ctx.moveTo(cx, y + 26);
        ctx.lineTo(cx + Math.cos(a) * 8, y + 26 + Math.sin(a) * 4);
        ctx.stroke();
      }
      // Wheels
      ctx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 5; i++) {
        const a = i * (Math.PI * 2 / 5);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 8, y + 26 + Math.sin(a) * 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Gas-lift pole
      ctx.fillStyle = '#444';
      ctx.fillRect(cx - 1, y + 18, 2, 8);
      // Seat
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - 8, y + 14, 16, 5);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(cx - 7, y + 14, 14, 1);
      // Tall mesh backrest
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 7, y + 3, 14, 11);
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 7, y + 5 + i * 2);
        ctx.lineTo(cx + 7, y + 5 + i * 2);
        ctx.stroke();
      }
      // Armrests
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(cx - 10, y + 13, 3, 2);
      ctx.fillRect(cx + 7, y + 13, 3, 2);
      break;
    }
    case 'coffee_machine': {
      // Espresso machine
      // Body
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x + 5, y + 4, 22, 22);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(x + 5, y + 4, 22, 4);
      // Bean hopper on top
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 10, y + 1, 12, 4);
      // Display screen
      ctx.fillStyle = '#88ddff';
      ctx.fillRect(x + 8, y + 10, 16, 4);
      ctx.fillStyle = '#1a3a4a';
      ctx.fillRect(x + 9, y + 11, 4, 2);
      ctx.fillRect(x + 14, y + 11, 8, 2);
      // Drip tray
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 8, y + 22, 16, 4);
      // Mug under spout
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 13, y + 18, 6, 5);
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(x + 13, y + 18, 6, 1.5);
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(x + 20, y + 20, 1.5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      // Steam
      const t = Date.now() * 0.003;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(t) * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 14, y + 17);
      ctx.quadraticCurveTo(x + 12 + Math.sin(t) * 2, y + 14, x + 14, y + 11);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 17, y + 17);
      ctx.quadraticCurveTo(x + 19 + Math.sin(t + 1) * 2, y + 14, x + 17, y + 11);
      ctx.stroke();
      break;
    }
    case 'aquarium': {
      // Glass tank with swimming fish + bubbles
      // Wooden stand
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(x + 2, y + 24, 28, 6);
      // Tank frame
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 3, y + 6, 26, 19);
      // Water (blue gradient)
      const wgrad = ctx.createLinearGradient(x, y + 8, x, y + 23);
      wgrad.addColorStop(0, 'rgba(120,200,235,0.9)');
      wgrad.addColorStop(1, 'rgba(40,120,180,0.9)');
      ctx.fillStyle = wgrad;
      ctx.fillRect(x + 4, y + 7, 24, 17);
      // Sand bottom
      ctx.fillStyle = '#e8d8a8';
      ctx.fillRect(x + 4, y + 21, 24, 3);
      // Plant
      ctx.fillStyle = '#1a7a3a';
      ctx.fillRect(x + 8, y + 14, 1, 7);
      ctx.fillRect(x + 9, y + 12, 1, 9);
      ctx.fillRect(x + 7, y + 16, 1, 5);
      // Castle
      ctx.fillStyle = '#888';
      ctx.fillRect(x + 22, y + 17, 4, 4);
      ctx.fillRect(x + 21, y + 14, 1, 3);
      ctx.fillRect(x + 26, y + 14, 1, 3);
      // Swimming fish (bounces back and forth)
      const t = Date.now() * 0.001;
      const fx1 = x + 8 + ((Math.sin(t) + 1) / 2) * 16; // 8 -> 24
      const dir1 = Math.cos(t) > 0 ? 1 : -1;
      ctx.fillStyle = '#ff6f3c';
      ctx.beginPath(); ctx.ellipse(fx1, y + 12, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      // Tail
      ctx.beginPath();
      ctx.moveTo(fx1 - dir1 * 3, y + 12);
      ctx.lineTo(fx1 - dir1 * 5, y + 10);
      ctx.lineTo(fx1 - dir1 * 5, y + 14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx1 + dir1 * 1, y + 11, 0.8, 0.8);
      // Second fish (different speed)
      const fx2 = x + 24 - ((Math.sin(t * 0.7) + 1) / 2) * 16;
      const dir2 = -Math.cos(t * 0.7) > 0 ? 1 : -1;
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.ellipse(fx2, y + 18, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx2 - dir2 * 2.5, y + 18);
      ctx.lineTo(fx2 - dir2 * 4, y + 16);
      ctx.lineTo(fx2 - dir2 * 4, y + 20);
      ctx.closePath(); ctx.fill();
      // Bubbles rising
      for (let i = 0; i < 3; i++) {
        const bt = (t * 30 + i * 7) % 17;
        ctx.fillStyle = `rgba(255,255,255,${0.4 + (1 - bt / 17) * 0.4})`;
        ctx.beginPath();
        ctx.arc(x + 12 + i * 5, y + 23 - bt, 1 + i * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lava_lamp': {
      // Bottom base
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x + 9, y + 23, 14, 5);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(x + 10, y + 23, 12, 1);
      // Top cap
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x + 11, y + 4, 10, 3);
      // Glass cone (slightly wider in middle)
      ctx.fillStyle = 'rgba(255,140,40,0.85)';
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 7);
      ctx.lineTo(x + 20, y + 7);
      ctx.lineTo(x + 21, y + 23);
      ctx.lineTo(x + 11, y + 23);
      ctx.closePath();
      ctx.fill();
      // Glass highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 13, y + 8, 1, 14);
      // Animated lava blobs
      const t = Date.now() * 0.0012;
      ctx.fillStyle = '#ff4020';
      const b1y = y + 12 + Math.sin(t) * 5;
      ctx.beginPath(); ctx.ellipse(x + 16, b1y, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      const b2y = y + 18 + Math.sin(t * 1.4 + 1) * 4;
      ctx.beginPath(); ctx.ellipse(x + 17, b2y, 2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      const b3y = y + 16 + Math.sin(t * 0.8 + 2) * 5;
      ctx.beginPath(); ctx.ellipse(x + 14, b3y, 1.5, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      // Glow halo
      const grad = ctx.createRadialGradient(x + 16, y + 16, 2, x + 16, y + 16, 14);
      grad.addColorStop(0, 'rgba(255,180,80,0.3)');
      grad.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, S, S);
      break;
    }
    case 'bicycle': {
      // Side-view bicycle
      // Wheels
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + 8, y + 22, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 24, y + 22, 5, 0, Math.PI * 2); ctx.stroke();
      // Spokes
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(x + 8, y + 22); ctx.lineTo(x + 8 + Math.cos(a) * 5, y + 22 + Math.sin(a) * 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 24, y + 22); ctx.lineTo(x + 24 + Math.cos(a) * 5, y + 22 + Math.sin(a) * 5); ctx.stroke();
      }
      // Frame (red diamond)
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 22);    // back wheel
      ctx.lineTo(x + 16, y + 14);   // top tube apex
      ctx.lineTo(x + 24, y + 22);   // front wheel
      ctx.moveTo(x + 16, y + 14);
      ctx.lineTo(x + 16, y + 22);   // seat tube
      ctx.moveTo(x + 16, y + 14);
      ctx.lineTo(x + 26, y + 12);   // top to handlebar stem
      ctx.stroke();
      // Seat
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 14, y + 12, 5, 2);
      // Handlebars
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 10);
      ctx.lineTo(x + 28, y + 10);
      ctx.stroke();
      // Pedal (small, slowly spinning)
      const a = (Date.now() * 0.005) % (Math.PI * 2);
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(x + 16, y + 22, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 16 + Math.cos(a) * 3, y + 22 + Math.sin(a) * 3);
      ctx.lineTo(x + 16 - Math.cos(a) * 3, y + 22 - Math.sin(a) * 3);
      ctx.stroke();
      break;
    }
    case 'neon_sign': {
      // Glowing OPEN sign with flickering glow
      const t = Date.now() * 0.005;
      const flicker = 0.85 + Math.sin(t * 3) * 0.1 + (Math.random() < 0.05 ? -0.2 : 0);
      // Black backplate
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x + 3, y + 7, 26, 16);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 3, y + 7, 26, 16);
      // Pink/cyan neon "OPEN" text rendered as stroked rectangles
      ctx.shadowColor = '#ff3a8a';
      ctx.shadowBlur = 6 * flicker;
      ctx.strokeStyle = `rgba(255,80,180,${flicker})`;
      ctx.lineWidth = 1.4;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,180,220,${flicker})`;
      ctx.fillText('OPEN', x + 16, y + 18);
      ctx.strokeText('OPEN', x + 16, y + 18);
      ctx.shadowBlur = 0;
      // Pink glow halo
      const grad = ctx.createRadialGradient(x + 16, y + 15, 2, x + 16, y + 15, 18);
      grad.addColorStop(0, `rgba(255,80,180,${0.35 * flicker})`);
      grad.addColorStop(1, 'rgba(255,80,180,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 4, y - 4, S + 8, S + 8);
      // Hanging chains
      ctx.strokeStyle = '#444'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x + 6, y); ctx.lineTo(x + 6, y + 7);
      ctx.moveTo(x + 26, y); ctx.lineTo(x + 26, y + 7);
      ctx.stroke();
      break;
    }
    case 'donut_box': {
      // Pink Krispy-Kreme-style box, lid open
      // Box base
      ctx.fillStyle = '#e84393';
      ctx.fillRect(x + 4, y + 14, 24, 14);
      ctx.fillStyle = '#c43377';
      ctx.fillRect(x + 4, y + 26, 24, 2);
      // Open lid in back
      ctx.fillStyle = '#e84393';
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 14);
      ctx.lineTo(x + 8, y + 4);
      ctx.lineTo(x + 28, y + 4);
      ctx.lineTo(x + 28, y + 14);
      ctx.closePath();
      ctx.fill();
      // Lid inside
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 13);
      ctx.lineTo(x + 9, y + 5);
      ctx.lineTo(x + 27, y + 5);
      ctx.lineTo(x + 27, y + 13);
      ctx.closePath();
      ctx.fill();
      // 4 donuts inside
      const donuts = [
        { dx: 9,  dy: 18, glaze: '#f5d59c' }, // glazed
        { dx: 17, dy: 18, glaze: '#fbb' },    // strawberry
        { dx: 25, dy: 18, glaze: '#6b3a1a' }, // chocolate
        { dx: 13, dy: 24, glaze: '#fff' },    // sugar
      ];
      for (const d of donuts) {
        // Donut body
        ctx.fillStyle = '#d4a574';
        ctx.beginPath(); ctx.arc(x + d.dx, y + d.dy, 3.5, 0, Math.PI * 2); ctx.fill();
        // Glaze
        ctx.fillStyle = d.glaze;
        ctx.beginPath(); ctx.arc(x + d.dx, y + d.dy, 2.8, 0, Math.PI * 2); ctx.fill();
        // Hole
        ctx.fillStyle = '#3a2a1a';
        ctx.beginPath(); ctx.arc(x + d.dx, y + d.dy, 0.9, 0, Math.PI * 2); ctx.fill();
        // Sprinkles on the strawberry / sugar ones
        if (d.glaze === '#fbb' || d.glaze === '#fff') {
          ctx.fillStyle = '#3498db';
          ctx.fillRect(x + d.dx - 2, y + d.dy - 1, 1, 0.5);
          ctx.fillStyle = '#f1c40f';
          ctx.fillRect(x + d.dx + 1, y + d.dy + 1, 1, 0.5);
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(x + d.dx + 1, y + d.dy - 2, 1, 0.5);
        }
      }
      break;
    }
    case 'ceiling_fan': {
      // Mounted from above — chrome rod, motor housing, 4 spinning blades, light below.
      const cx = x + 16, cy = y + 16;
      // Mount rod from ceiling
      ctx.fillStyle = '#bbb';
      ctx.fillRect(cx - 1, y, 2, 6);
      // Motor housing (dome)
      ctx.fillStyle = '#777';
      ctx.beginPath(); ctx.arc(cx, cy - 2, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#999';
      ctx.beginPath(); ctx.arc(cx, cy - 3, 3, 0, Math.PI * 2); ctx.fill();
      // 4 spinning blades — fast rotation
      const a0 = (Date.now() * 0.02) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        // Blade — wood-tone with subtle highlight
        ctx.fillStyle = 'rgba(160,120,70,0.85)';
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(13, -3);
        ctx.lineTo(13, 3);
        ctx.lineTo(0, 2);
        ctx.closePath();
        // Apply spin separately so blade shape stays oriented per slot
      }
      ctx.restore();
      // Actual spinning blades — 4 rotated rectangles around center
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(140,100,60,0.85)';
        ctx.beginPath();
        ctx.moveTo(2, -2);
        ctx.lineTo(13, -3);
        ctx.lineTo(13, 3);
        ctx.lineTo(2, 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(190,150,100,0.6)';
        ctx.fillRect(4, -1, 8, 1);
        ctx.rotate(Math.PI / 2);
      }
      ctx.restore();
      // Motion blur ring
      ctx.strokeStyle = 'rgba(140,100,60,0.18)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
      // Hub cap
      ctx.fillStyle = '#444';
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
      // Pull-chain light glow underneath
      ctx.fillStyle = 'rgba(255,235,180,0.35)';
      ctx.beginPath(); ctx.arc(cx, cy + 4, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ceiling_light': {
      // Hanging pendant lamp casting a warm glow.
      const cx = x + 16;
      // Cord from ceiling
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 0.5, y, 1, 8);
      // Ceiling mount
      ctx.fillStyle = '#666';
      ctx.fillRect(cx - 3, y, 6, 2);
      // Lamp shade — trapezoidal
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.moveTo(cx - 5, y + 8);
      ctx.lineTo(cx + 5, y + 8);
      ctx.lineTo(cx + 9, y + 18);
      ctx.lineTo(cx - 9, y + 18);
      ctx.closePath();
      ctx.fill();
      // Shade highlight
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(cx - 5, y + 8);
      ctx.lineTo(cx - 3, y + 8);
      ctx.lineTo(cx - 7, y + 18);
      ctx.lineTo(cx - 9, y + 18);
      ctx.closePath();
      ctx.fill();
      // Bulb glow underneath (pulsing slightly)
      const pulse = 0.55 + Math.sin(Date.now() * 0.003) * 0.1;
      ctx.fillStyle = `rgba(255,235,150,${pulse})`;
      ctx.beginPath(); ctx.arc(cx, y + 20, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,250,210,${pulse + 0.15})`;
      ctx.beginPath(); ctx.arc(cx, y + 20, 3, 0, Math.PI * 2); ctx.fill();
      // Outer warm pool spilling onto the floor
      const grad = ctx.createRadialGradient(cx, y + 22, 2, cx, y + 22, 18);
      grad.addColorStop(0, 'rgba(255,230,150,0.3)');
      grad.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 4, y + 12, S + 8, S);
      break;
    }

    // ===== STATUES (Disney + Marvel) =====
    // All sit on a small gold pedestal so they read as collectible statues.
    case 'statue_mickey': {
      drawStatuePedestal(ctx, x, y);
      // Mickey: black body, big round ears, red shorts, yellow shoes
      const cx = x + 16;
      // Yellow shoes
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(cx - 6, y + 22, 5, 3);
      ctx.fillRect(cx + 1, y + 22, 5, 3);
      // Red shorts with white buttons
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cx - 5, y + 17, 10, 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 2, y + 20, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 2, y + 20, 1, 0, Math.PI * 2); ctx.fill();
      // Black body / arms
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 4, y + 13, 8, 5);
      ctx.fillRect(cx - 7, y + 14, 3, 4);
      ctx.fillRect(cx + 4, y + 14, 3, 4);
      // White-glove hands
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 7, y + 18, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, y + 18, 1.6, 0, Math.PI * 2); ctx.fill();
      // Head
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx, y + 9, 4.5, 0, Math.PI * 2); ctx.fill();
      // Face muzzle
      ctx.fillStyle = '#f5d7b8';
      ctx.beginPath(); ctx.arc(cx, y + 11, 2.5, 0, Math.PI * 2); ctx.fill();
      // Nose
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx, y + 10, 1, 0, Math.PI * 2); ctx.fill();
      // Iconic round ears
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx - 5, y + 5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, y + 5, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'statue_minnie': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Yellow shoes
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(cx - 6, y + 22, 5, 3);
      ctx.fillRect(cx + 1, y + 22, 5, 3);
      // Polka-dot pink dress
      ctx.fillStyle = '#e84393';
      ctx.beginPath();
      ctx.moveTo(cx - 7, y + 22);
      ctx.lineTo(cx - 4, y + 13);
      ctx.lineTo(cx + 4, y + 13);
      ctx.lineTo(cx + 7, y + 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 2, y + 17, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 3, y + 19, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 4, y + 21, 1, 0, Math.PI * 2); ctx.fill();
      // White gloves
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 7, y + 18, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, y + 18, 1.6, 0, Math.PI * 2); ctx.fill();
      // Head
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx, y + 9, 4.5, 0, Math.PI * 2); ctx.fill();
      // Muzzle + nose
      ctx.fillStyle = '#f5d7b8';
      ctx.beginPath(); ctx.arc(cx, y + 11, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx, y + 10, 1, 0, Math.PI * 2); ctx.fill();
      // Ears
      ctx.beginPath(); ctx.arc(cx - 5, y + 5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, y + 5, 3, 0, Math.PI * 2); ctx.fill();
      // Big pink bow on top
      ctx.fillStyle = '#e84393';
      ctx.beginPath(); ctx.arc(cx - 2, y + 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 2, y + 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx - 1, y + 2, 2, 2);
      break;
    }
    case 'statue_donald': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Orange feet
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(cx - 6, y + 23, 5, 2);
      ctx.fillRect(cx + 1, y + 23, 5, 2);
      // White body
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(cx, y + 18, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      // Blue sailor jacket top
      ctx.fillStyle = '#2980b9';
      ctx.fillRect(cx - 5, y + 13, 10, 4);
      // Yellow buttons
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(cx, y + 14, 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, y + 16, 0.8, 0, Math.PI * 2); ctx.fill();
      // Wings (white)
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 7, y + 15, 2, 5);
      ctx.fillRect(cx + 5, y + 15, 2, 5);
      // White head
      ctx.beginPath(); ctx.arc(cx, y + 9, 4, 0, Math.PI * 2); ctx.fill();
      // Yellow beak
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + 10);
      ctx.lineTo(cx - 7, y + 12);
      ctx.lineTo(cx - 4, y + 12);
      ctx.closePath();
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - 1, y + 7, 1, 2);
      ctx.fillRect(cx + 1, y + 7, 1, 2);
      // Blue sailor hat
      ctx.fillStyle = '#2980b9';
      ctx.fillRect(cx - 4, y + 4, 8, 2);
      ctx.fillRect(cx - 3, y + 2, 6, 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - 1, y + 3, 2, 1);
      break;
    }
    case 'statue_goofy': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Brown shoes
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(cx - 7, y + 22, 5, 3);
      ctx.fillRect(cx + 2, y + 22, 5, 3);
      // Blue pants
      ctx.fillStyle = '#2980b9';
      ctx.fillRect(cx - 4, y + 17, 8, 5);
      // Orange shirt
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(cx - 5, y + 12, 10, 6);
      // Black vest details
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 5, y + 12, 1, 6);
      ctx.fillRect(cx + 4, y + 12, 1, 6);
      // White gloves
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 7, y + 17, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, y + 17, 1.6, 0, Math.PI * 2); ctx.fill();
      // Tan dog face — long muzzle
      ctx.fillStyle = '#c8924a';
      ctx.beginPath(); ctx.ellipse(cx, y + 9, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill();
      // Long muzzle
      ctx.beginPath(); ctx.ellipse(cx + 1, y + 11, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      // Nose
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx + 4, y + 11, 1, 0, Math.PI * 2); ctx.fill();
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 1, y + 7, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 2, y + 7, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - 1, y + 7, 1, 1);
      ctx.fillRect(cx + 2, y + 7, 1, 1);
      // Floppy ears
      ctx.fillStyle = '#a06820';
      ctx.fillRect(cx - 5, y + 7, 2, 5);
      ctx.fillRect(cx + 3, y + 7, 2, 5);
      // Green hat
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(cx - 3, y + 4, 6, 2);
      ctx.fillRect(cx - 2, y + 2, 4, 2);
      break;
    }
    case 'statue_spiderman': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Red boots
      ctx.fillStyle = '#a01818';
      ctx.fillRect(cx - 5, y + 22, 4, 3);
      ctx.fillRect(cx + 1, y + 22, 4, 3);
      // Blue legs
      ctx.fillStyle = '#1f4ea8';
      ctx.fillRect(cx - 4, y + 17, 3, 5);
      ctx.fillRect(cx + 1, y + 17, 3, 5);
      // Red torso with spider
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cx - 5, y + 12, 10, 6);
      // Spider symbol
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx, y + 15, 1.2, 0, Math.PI * 2); ctx.fill();
      // Legs of spider
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - 2, y + 14); ctx.lineTo(cx - 3, y + 13);
      ctx.moveTo(cx + 2, y + 14); ctx.lineTo(cx + 3, y + 13);
      ctx.moveTo(cx - 2, y + 16); ctx.lineTo(cx - 3, y + 17);
      ctx.moveTo(cx + 2, y + 16); ctx.lineTo(cx + 3, y + 17);
      ctx.stroke();
      // Arms — one raised in web-shooting pose
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cx - 8, y + 13, 3, 5);
      ctx.fillRect(cx + 5, y + 10, 3, 5);
      // Red mask head
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(cx, y + 8, 4, 0, Math.PI * 2); ctx.fill();
      // White eye lenses
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(cx - 2, y + 8, 1.4, 1, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 2, y + 8, 1.4, 1, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Web pattern lines on mask
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - 3, y + 6); ctx.lineTo(cx + 3, y + 6);
      ctx.moveTo(cx - 3, y + 10); ctx.lineTo(cx + 3, y + 10);
      ctx.moveTo(cx, y + 5); ctx.lineTo(cx, y + 11);
      ctx.stroke();
      break;
    }
    case 'statue_ironman': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Red boots
      ctx.fillStyle = '#b8222a';
      ctx.fillRect(cx - 5, y + 22, 4, 3);
      ctx.fillRect(cx + 1, y + 22, 4, 3);
      // Gold legs
      ctx.fillStyle = '#d4a30a';
      ctx.fillRect(cx - 4, y + 17, 3, 5);
      ctx.fillRect(cx + 1, y + 17, 3, 5);
      // Red torso
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cx - 5, y + 12, 10, 6);
      // Arc reactor (glowing blue)
      ctx.fillStyle = '#bde7f7';
      ctx.beginPath(); ctx.arc(cx, y + 15, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,210,255,0.7)';
      ctx.beginPath(); ctx.arc(cx, y + 15, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx, y + 15, 1, 0, Math.PI * 2); ctx.fill();
      // Gold arms
      ctx.fillStyle = '#d4a30a';
      ctx.fillRect(cx - 8, y + 13, 3, 5);
      ctx.fillRect(cx + 5, y + 13, 3, 5);
      // Gold helmet
      ctx.fillStyle = '#d4a30a';
      ctx.beginPath(); ctx.arc(cx, y + 8, 4, 0, Math.PI * 2); ctx.fill();
      // Faceplate (red)
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cx - 3, y + 7, 6, 4);
      // Glowing slit eyes
      ctx.fillStyle = '#bde7f7';
      ctx.fillRect(cx - 2, y + 8, 1, 1);
      ctx.fillRect(cx + 1, y + 8, 1, 1);
      break;
    }
    case 'statue_cap': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Red boots
      ctx.fillStyle = '#a01818';
      ctx.fillRect(cx - 5, y + 22, 4, 3);
      ctx.fillRect(cx + 1, y + 22, 4, 3);
      // Blue suit
      ctx.fillStyle = '#1f3a8a';
      ctx.fillRect(cx - 5, y + 12, 10, 10);
      // White stripes (belly)
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 4, y + 16, 2, 4);
      ctx.fillRect(cx - 1, y + 16, 2, 4);
      ctx.fillRect(cx + 2, y + 16, 2, 4);
      // White star on chest
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      const sx = cx, sy = y + 14;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        const a2 = a + Math.PI / 5;
        ctx.lineTo(sx + Math.cos(a) * 2.5, sy + Math.sin(a) * 2.5);
        ctx.lineTo(sx + Math.cos(a2) * 1, sy + Math.sin(a2) * 1);
      }
      ctx.closePath();
      ctx.fill();
      // Arms (blue)
      ctx.fillStyle = '#1f3a8a';
      ctx.fillRect(cx - 8, y + 13, 3, 5);
      ctx.fillRect(cx + 5, y + 13, 3, 5);
      // Round shield held in right hand (concentric circles)
      const shx = cx + 9, shy = y + 16;
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(shx, shy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(shx, shy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(shx, shy, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f3a8a';
      ctx.beginPath(); ctx.arc(shx, shy, 1, 0, Math.PI * 2); ctx.fill();
      // Head — fleshtone
      ctx.fillStyle = '#f5c5a3';
      ctx.beginPath(); ctx.arc(cx, y + 8, 3.5, 0, Math.PI * 2); ctx.fill();
      // Blue hood
      ctx.fillStyle = '#1f3a8a';
      ctx.fillRect(cx - 4, y + 4, 8, 4);
      // Wing decals on hood
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 4, y + 6, 2, 1);
      ctx.fillRect(cx + 2, y + 6, 2, 1);
      // 'A' on forehead
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 1, y + 5, 2, 2);
      break;
    }
    case 'statue_hulk': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Bare green feet
      ctx.fillStyle = '#1f6b32';
      ctx.fillRect(cx - 6, y + 23, 5, 2);
      ctx.fillRect(cx + 1, y + 23, 5, 2);
      // Purple ripped shorts
      ctx.fillStyle = '#6c3483';
      ctx.fillRect(cx - 6, y + 17, 12, 6);
      // Ripped edge details
      ctx.fillStyle = '#4a2360';
      ctx.fillRect(cx - 6, y + 22, 2, 2);
      ctx.fillRect(cx + 4, y + 22, 2, 2);
      // Big green torso
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(cx - 7, y + 11, 14, 6);
      // Pec lines
      ctx.fillStyle = '#1f8a4a';
      ctx.fillRect(cx - 1, y + 11, 2, 6);
      // Massive green arms (flexing)
      ctx.fillStyle = '#27ae60';
      ctx.beginPath(); ctx.ellipse(cx - 9, y + 13, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 9, y + 13, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
      // Fists raised
      ctx.beginPath(); ctx.arc(cx - 9, y + 9, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 9, y + 9, 2.5, 0, Math.PI * 2); ctx.fill();
      // Head — green, scowling
      ctx.fillStyle = '#27ae60';
      ctx.beginPath(); ctx.arc(cx, y + 7, 3.5, 0, Math.PI * 2); ctx.fill();
      // Black hair
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 3, y + 4, 6, 2);
      // Angry eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 2, y + 7, 1, 1);
      ctx.fillRect(cx + 1, y + 7, 1, 1);
      // Mouth (angry frown)
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - 1.5, y + 9.5);
      ctx.lineTo(cx + 1.5, y + 9.5);
      ctx.stroke();
      break;
    }

    case 'statue_pikachu': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Yellow body
      ctx.fillStyle = '#f5d020';
      ctx.beginPath(); ctx.ellipse(cx, y + 17, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
      // Brown stripes on back
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(cx - 5, y + 14, 10, 1);
      ctx.fillRect(cx - 5, y + 17, 10, 1);
      // Round head
      ctx.fillStyle = '#f5d020';
      ctx.beginPath(); ctx.arc(cx, y + 9, 5, 0, Math.PI * 2); ctx.fill();
      // Long pointy ears with black tips
      ctx.fillStyle = '#f5d020';
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + 5);
      ctx.lineTo(cx - 7, y - 1);
      ctx.lineTo(cx - 2, y + 5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 4, y + 5);
      ctx.lineTo(cx + 7, y - 1);
      ctx.lineTo(cx + 2, y + 5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(cx - 6, y + 1);
      ctx.lineTo(cx - 7, y - 1);
      ctx.lineTo(cx - 5, y + 2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 6, y + 1);
      ctx.lineTo(cx + 7, y - 1);
      ctx.lineTo(cx + 5, y + 2);
      ctx.closePath(); ctx.fill();
      // Eyes
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx - 2, y + 8, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 2, y + 8, 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 2, y + 7, 0.5, 0.5);
      ctx.fillRect(cx + 2, y + 7, 0.5, 0.5);
      // Red cheeks
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.arc(cx - 4, y + 10, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4, y + 10, 1.2, 0, Math.PI * 2); ctx.fill();
      // Tiny mouth
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.arc(cx, y + 10, 0.8, 0, Math.PI);
      ctx.stroke();
      // Lightning-bolt tail
      ctx.fillStyle = '#f5d020';
      ctx.beginPath();
      ctx.moveTo(cx + 6, y + 17);
      ctx.lineTo(cx + 10, y + 13);
      ctx.lineTo(cx + 8, y + 16);
      ctx.lineTo(cx + 11, y + 14);
      ctx.lineTo(cx + 9, y + 19);
      ctx.lineTo(cx + 6, y + 19);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8b4513'; ctx.lineWidth = 0.6;
      ctx.stroke();
      break;
    }
    case 'statue_charizard': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Big orange body
      ctx.fillStyle = '#e67e22';
      ctx.beginPath(); ctx.ellipse(cx, y + 17, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
      // Cream belly
      ctx.fillStyle = '#fcd9a8';
      ctx.beginPath(); ctx.ellipse(cx, y + 18, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill();
      // Wings (teal/blue spread)
      ctx.fillStyle = '#2a9bb5';
      ctx.beginPath();
      ctx.moveTo(cx - 5, y + 13);
      ctx.lineTo(cx - 12, y + 8);
      ctx.lineTo(cx - 11, y + 16);
      ctx.lineTo(cx - 5, y + 17);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 5, y + 13);
      ctx.lineTo(cx + 12, y + 8);
      ctx.lineTo(cx + 11, y + 16);
      ctx.lineTo(cx + 5, y + 17);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1a4a55'; ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - 5, y + 13); ctx.lineTo(cx - 11, y + 12);
      ctx.moveTo(cx + 5, y + 13); ctx.lineTo(cx + 11, y + 12);
      ctx.stroke();
      // Head with snout
      ctx.fillStyle = '#e67e22';
      ctx.beginPath(); ctx.ellipse(cx, y + 9, 4.5, 4, 0, 0, Math.PI * 2); ctx.fill();
      // Snout
      ctx.beginPath(); ctx.ellipse(cx + 3, y + 11, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      // Horns
      ctx.fillStyle = '#c66218';
      ctx.beginPath();
      ctx.moveTo(cx - 3, y + 5); ctx.lineTo(cx - 5, y + 1); ctx.lineTo(cx - 1, y + 4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, y + 5); ctx.lineTo(cx + 5, y + 1); ctx.lineTo(cx + 1, y + 4);
      ctx.closePath(); ctx.fill();
      // Eye
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx + 1, y + 8, 0.8, 0, Math.PI * 2); ctx.fill();
      // Tail with FLAME on the tip
      ctx.fillStyle = '#e67e22';
      ctx.beginPath();
      ctx.moveTo(cx + 5, y + 18);
      ctx.quadraticCurveTo(cx + 12, y + 22, cx + 12, y + 16);
      ctx.lineTo(cx + 10, y + 16);
      ctx.quadraticCurveTo(cx + 9, y + 21, cx + 5, y + 19);
      ctx.closePath(); ctx.fill();
      // Animated tail flame
      const t = Date.now() * 0.006;
      ctx.fillStyle = '#ffae0a';
      ctx.beginPath();
      ctx.moveTo(cx + 12, y + 16);
      ctx.lineTo(cx + 14 + Math.sin(t) * 1, y + 12);
      ctx.lineTo(cx + 12, y + 14);
      ctx.lineTo(cx + 10 + Math.sin(t + 1) * 1, y + 11);
      ctx.lineTo(cx + 11, y + 16);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff200';
      ctx.beginPath();
      ctx.moveTo(cx + 12, y + 16);
      ctx.lineTo(cx + 13, y + 13);
      ctx.lineTo(cx + 11, y + 16);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'statue_eevee': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Brown body
      ctx.fillStyle = '#a06530';
      ctx.beginPath(); ctx.ellipse(cx, y + 18, 5.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      // Cream collar/ruff
      ctx.fillStyle = '#f5d59c';
      ctx.beginPath(); ctx.arc(cx, y + 14, 4, 0, Math.PI * 2); ctx.fill();
      // Cream paws
      ctx.fillStyle = '#f5d59c';
      ctx.fillRect(cx - 5, y + 22, 3, 2);
      ctx.fillRect(cx + 2, y + 22, 3, 2);
      // Head
      ctx.fillStyle = '#a06530';
      ctx.beginPath(); ctx.arc(cx, y + 9, 4.5, 0, Math.PI * 2); ctx.fill();
      // Big triangular ears
      ctx.fillStyle = '#a06530';
      ctx.beginPath();
      ctx.moveTo(cx - 3, y + 6);
      ctx.lineTo(cx - 6, y + 1);
      ctx.lineTo(cx - 1, y + 5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, y + 6);
      ctx.lineTo(cx + 6, y + 1);
      ctx.lineTo(cx + 1, y + 5);
      ctx.closePath(); ctx.fill();
      // Inner ears
      ctx.fillStyle = '#6b3a1a';
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + 5);
      ctx.lineTo(cx - 5, y + 2);
      ctx.lineTo(cx - 2, y + 5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 4, y + 5);
      ctx.lineTo(cx + 5, y + 2);
      ctx.lineTo(cx + 2, y + 5);
      ctx.closePath(); ctx.fill();
      // Big shiny eyes
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx - 2, y + 9, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 2, y + 9, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 1.5, y + 8.5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 2.5, y + 8.5, 0.5, 0, Math.PI * 2); ctx.fill();
      // Tiny black nose
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(cx, y + 11, 0.8, 0, Math.PI * 2); ctx.fill();
      // Bushy cream-tipped tail
      ctx.fillStyle = '#a06530';
      ctx.beginPath(); ctx.ellipse(cx + 7, y + 15, 3, 2.5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5d59c';
      ctx.beginPath(); ctx.ellipse(cx + 9, y + 13, 1.8, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'statue_mewtwo': {
      drawStatuePedestal(ctx, x, y);
      const cx = x + 16;
      // Purple-tinted body
      ctx.fillStyle = '#c0a8d0';
      ctx.beginPath(); ctx.ellipse(cx, y + 17, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
      // Purple lower belly
      ctx.fillStyle = '#9b7fb8';
      ctx.beginPath(); ctx.ellipse(cx, y + 20, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
      // Long tail curling around
      ctx.strokeStyle = '#c0a8d0'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + 4, y + 22);
      ctx.quadraticCurveTo(cx + 12, y + 22, cx + 11, y + 17);
      ctx.stroke();
      ctx.fillStyle = '#9b7fb8';
      ctx.beginPath(); ctx.arc(cx + 11, y + 17, 1.5, 0, Math.PI * 2); ctx.fill();
      // Arms
      ctx.fillStyle = '#c0a8d0';
      ctx.fillRect(cx - 7, y + 14, 2, 6);
      ctx.fillRect(cx + 5, y + 14, 2, 6);
      // 3-fingered hands
      ctx.beginPath(); ctx.arc(cx - 6, y + 21, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, y + 21, 1.5, 0, Math.PI * 2); ctx.fill();
      // Head — big and oblong with tube going to back of neck
      ctx.fillStyle = '#c0a8d0';
      ctx.beginPath(); ctx.ellipse(cx, y + 8, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      // Curved tube from back of head to neck
      ctx.strokeStyle = '#c0a8d0'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 3, y + 11);
      ctx.quadraticCurveTo(cx - 6, y + 13, cx - 3, y + 14);
      ctx.stroke();
      // Two pointed ears
      ctx.fillStyle = '#c0a8d0';
      ctx.beginPath();
      ctx.moveTo(cx - 2, y + 4); ctx.lineTo(cx - 4, y); ctx.lineTo(cx - 1, y + 3);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 2, y + 4); ctx.lineTo(cx + 4, y); ctx.lineTo(cx + 1, y + 3);
      ctx.closePath(); ctx.fill();
      // Glowing purple eyes (psychic)
      ctx.fillStyle = '#7b3aa8';
      ctx.fillRect(cx - 2, y + 8, 1.2, 1.2);
      ctx.fillRect(cx + 1, y + 8, 1.2, 1.2);
      ctx.fillStyle = '#dabbff';
      ctx.fillRect(cx - 1.8, y + 8.2, 0.6, 0.6);
      ctx.fillRect(cx + 1.2, y + 8.2, 0.6, 0.6);
      // Psychic aura
      const t = Date.now() * 0.003;
      const auraAlpha = 0.15 + Math.sin(t) * 0.08;
      const grad = ctx.createRadialGradient(cx, y + 12, 4, cx, y + 12, 16);
      grad.addColorStop(0, `rgba(170,80,220,${auraAlpha})`);
      grad.addColorStop(1, 'rgba(170,80,220,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 4, y - 4, S + 8, S + 8);
      break;
    }

    default:
      ctx.fillStyle = 'rgba(150,150,150,0.5)';
      ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
      break;
  }
}

// Shared gold pedestal used by all statue figurines.
function drawStatuePedestal(ctx, x, y) {
  // Marble base
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + 6, y + 26, 20, 4);
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(x + 8, y + 24, 16, 3);
  // Gold name plate
  ctx.fillStyle = '#d4a30a';
  ctx.fillRect(x + 9, y + 25, 14, 2);
  ctx.fillStyle = '#8b6f1a';
  ctx.fillRect(x + 9, y + 26, 14, 1);
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
    // Nodding / looking around — head bobbing indicator
    const nod = Math.sin(now * 0.004);
    const lookX = Math.sin(now * 0.002) * 2;
    // Small nod indicator dots
    if (nod > 0.3) {
      ctx.fillStyle = 'rgba(46,204,113,0.6)';
      ctx.beginPath(); ctx.arc(sx + lookX, sy - 36, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (zone === 'tv_area') {
    // Applause in video room
    const clap = Math.sin(now * 0.008) > 0.5;
    if (clap) {
      ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('👏', sx, sy - 35);
    }
  }

  // (No animation in offices — players design their own space)
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
  const officeZoneIds = ['henrik', 'alice', 'leo'];
  const px = localPlayer.x;
  const py = localPlayer.y;

  // If INSIDE an office, show lock controls for that office
  if (currentZone && officeZoneIds.includes(currentZone.id)) {
    let occupant = null;
    for (const rp of remotePlayers.values()) {
      if (rp.zone === currentZone.id) { occupant = rp.username; break; }
    }
    onOfficeProximityForKnock({ zoneId: currentZone.id, zoneName: currentZone.name, occupant, isInside: true });
    return;
  }

  // Only show knock/lock from hallway
  if (currentZone && currentZone.type !== ZONE_TYPES.HALLWAY) {
    onOfficeProximityForKnock(null);
    return;
  }

  // Check proximity to ANY office door (close range)
  for (const zoneId of officeZoneIds) {
    const zone = ZONES_PX.find(z => z.id === zoneId);
    if (!zone) continue;

    const dist = distToRect(px, py, zone.x, zone.y, zone.w, zone.h);
    if (dist < 1.2 * TILE_SIZE) {
      let occupant = null;
      for (const rp of remotePlayers.values()) {
        if (rp.zone === zoneId) { occupant = rp.username; break; }
      }
      onOfficeProximityForKnock({ zoneId, zoneName: zone.name, occupant, isInside: false });
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
const STREET_Y = 21 * TILE_SIZE; // row 21 = center of street (rows 20-22)

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

