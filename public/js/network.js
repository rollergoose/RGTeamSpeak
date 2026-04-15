import { POSITION_SEND_INTERVAL, LERP_FACTOR } from './constants.js';

let socket = null;
let lastSendTime = 0;
const eventHandlers = {};

export function connect() {
  socket = io();

  socket.onAny((event, ...args) => {
    const handlers = eventHandlers[event];
    if (handlers) {
      for (const h of handlers) h(...args);
    }
  });

  socket.on('connect', () => {
    const handlers = eventHandlers['_connect'];
    if (handlers) for (const h of handlers) h();
  });

  socket.on('disconnect', () => {
    const handlers = eventHandlers['_disconnect'];
    if (handlers) for (const h of handlers) h();
  });

  return socket;
}

export function getSocket() { return socket; }
export function getSocketId() { return socket ? socket.id : null; }

export function on(event, handler) {
  if (!eventHandlers[event]) eventHandlers[event] = [];
  eventHandlers[event].push(handler);
}

export function off(event, handler) {
  if (!eventHandlers[event]) return;
  eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
}

export function emit(event, data) {
  if (socket) socket.emit(event, data);
}

// Throttled position send
export function sendPosition(x, y, direction, isMoving) {
  const now = Date.now();
  if (now - lastSendTime < POSITION_SEND_INTERVAL) return;
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
