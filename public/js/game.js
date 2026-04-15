import { drawMap, drawZoneLabels, isBoardNearby, ZONES_PX } from './map.js';
import { drawCharacter } from './characters.js';
import { Camera } from './camera.js';
import { checkZone, getCurrentZone } from './zones.js';
import { sendPosition } from './network.js';
import { ZONE_TYPES, TILE_SIZE } from './constants.js';

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

  resizeCanvas();
  camera = new Camera(canvas.width, canvas.height);
  camera.x = localPlayer.x - camera.w / 2;
  camera.y = localPlayer.y - camera.h / 2;
  camera.targetX = camera.x;
  camera.targetY = camera.y;

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
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
}

function onKeyUp(e) {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keysDown.delete(key);
}

function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (!localPlayer) { requestAnimationFrame(gameLoop); return; }

  if (!chatFocused && !inputFocused) {
    localPlayer.update(keysDown, dt);
  }

  checkZone(localPlayer.x, localPlayer.y);
  sendPosition(localPlayer.x, localPlayer.y, localPlayer.direction, localPlayer.isMoving);

  for (const rp of remotePlayers.values()) { rp.interpolate(dt); }

  const nearBoard = isBoardNearby(localPlayer.x, localPlayer.y);
  if (onBoardProximity) onBoardProximity(nearBoard);

  checkKnockProximity();

  camera.follow(localPlayer.x, localPlayer.y);
  camera.update();

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawMap(ctx, camera);
  drawZoneLabels(ctx, camera);

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
