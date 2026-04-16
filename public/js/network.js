import { POSITION_SEND_INTERVAL, LERP_FACTOR } from './constants.js';

let socket = null;
let lastSendTime = 0;

export function connect() {
  return new Promise((resolve) => {
    socket = io();
    socket.on('connect', () => resolve(socket));
  });
}

export function getSocket() { return socket; }
export function getSocketId() { return socket ? socket.id : null; }

export function on(event, handler) {
  if (socket) socket.on(event, handler);
}

export function off(event, handler) {
  if (socket) socket.off(event, handler);
}

export function emit(event, data) {
  if (socket) socket.emit(event, data);
}

// Throttled position send — always send immediately when stopping
let lastIsMoving = false;
export function sendPosition(x, y, direction, isMoving) {
  const now = Date.now();
  const stoppedMoving = lastIsMoving && !isMoving;
  lastIsMoving = isMoving;
  // Always send when player stops (so remote players see them stop)
  if (!stoppedMoving && now - lastSendTime < POSITION_SEND_INTERVAL) return;
  lastSendTime = now;
  emit('player:move', { x, y, direction, isMoving });
}

// Remote player interpolation helper
export class RemotePlayer {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.appearance = data.appearance;
    this.x = data.x;
    this.y = data.y;
    this.targetX = data.x;
    this.targetY = data.y;
    this.direction = data.direction || 'down';
    this.isMoving = false;
    this.animFrame = 0;
    this.animTimer = 0;
    this.zone = data.zone || null;
    this.muted = false;
    this.inMeeting = false;
    this.isScreenSharing = false;
    this.workStatus = data.status || null;
    this.officeFurniture = [];
    // Mario-style death easter egg (set when server relays player:died for this player).
    this.isDead = false;
    this.deathStartTime = 0;
  }

  triggerDeath() {
    if (this.isDead) return;
    this.isDead = true;
    this.deathStartTime = performance.now();
  }

  clearDeath() {
    this.isDead = false;
    this.deathStartTime = 0;
  }

  setTarget(x, y, direction, isMoving) {
    this.targetX = x;
    this.targetY = y;
    this.direction = direction;
    this.isMoving = isMoving;
  }

  interpolate(dt) {
    this.x += (this.targetX - this.x) * LERP_FACTOR;
    this.y += (this.targetY - this.y) * LERP_FACTOR;

    if (this.isMoving) {
      this.animTimer += dt;
      if (this.animTimer > 200) {
        this.animFrame = this.animFrame === 0 ? 1 : 0;
        this.animTimer = 0;
      }
    } else {
      this.animFrame = 0;
      this.animTimer = 0;
    }
  }
}
