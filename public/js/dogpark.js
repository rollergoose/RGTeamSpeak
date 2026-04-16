import { TILE_SIZE } from './constants.js';
import { isSolid } from './map.js';
import { drawCharacter } from './characters.js';

// Local-only ambient dogs + watchers in the dog park east of the cinema.
// Not networked — each client renders its own simulation; no server state.

// Dog park bounds (cols 35-48, rows 26-33 — inside the fence/walls).
const PARK_X1 = 35 * TILE_SIZE + 4;
const PARK_Y1 = 26 * TILE_SIZE + 4;
const PARK_X2 = 49 * TILE_SIZE - 4;
const PARK_Y2 = 34 * TILE_SIZE - 4;

const DOG_TYPES = [
  { name: 'Buddy',  color: '#daa520', darkColor: '#b8860b', size: 12 }, // golden
  { name: 'Luna',   color: '#b0c4de', darkColor: '#6e8898', size: 12 }, // husky
  { name: 'Pepper', color: '#fff',    darkColor: '#222',    size: 12 }, // dalmatian-ish
];

const dogs = [];
const watchers = [];

function pickTarget(dog) {
  // Pick a random walkable point inside the park
  for (let i = 0; i < 10; i++) {
    const tx = PARK_X1 + Math.random() * (PARK_X2 - PARK_X1);
    const ty = PARK_Y1 + Math.random() * (PARK_Y2 - PARK_Y1);
    const col = Math.floor(tx / TILE_SIZE);
    const row = Math.floor(ty / TILE_SIZE);
    if (!isSolid(col, row)) {
      dog.targetX = tx;
      dog.targetY = ty;
      return;
    }
  }
  // Fallback — center of park
  dog.targetX = (PARK_X1 + PARK_X2) / 2;
  dog.targetY = (PARK_Y1 + PARK_Y2) / 2;
}

export function initDogPark() {
  // 3 dogs at varied starting positions
  for (let i = 0; i < DOG_TYPES.length; i++) {
    const t = DOG_TYPES[i];
    const startX = PARK_X1 + 50 + i * 90;
    const startY = PARK_Y1 + 80 + (i % 2) * 40;
    const dog = {
      ...t,
      x: startX, y: startY,
      targetX: startX, targetY: startY,
      direction: 'down',
      animFrame: 0, animTimer: 0,
      pauseUntil: 0,
      tailWagSeed: Math.random() * 100,
    };
    pickTarget(dog);
    dogs.push(dog);
  }

  // 2 watchers — NPC humans standing near the fence
  watchers.push({
    x: 36 * TILE_SIZE + 16,
    y: 27 * TILE_SIZE + 16,
    name: 'Mia',
    direction: 'down',
    appearance: {
      skinTone: '#f5c5a3',
      hairStyle: 'long',
      hairColor: '#3d2314',
      shirtColor: '#1abc9c',
      pantsColor: '#34495e',
    },
  });
  watchers.push({
    x: 47 * TILE_SIZE + 16,
    y: 30 * TILE_SIZE + 16,
    name: 'Owen',
    direction: 'left',
    appearance: {
      skinTone: '#d4a373',
      hairStyle: 'short',
      hairColor: '#1a1a1a',
      shirtColor: '#e74c3c',
      pantsColor: '#2c3e50',
    },
  });
}

export function updateDogPark(dt) {
  const now = Date.now();
  for (const dog of dogs) {
    if (now < dog.pauseUntil) {
      dog.animFrame = 0;
      continue;
    }
    const dx = dog.targetX - dog.x;
    const dy = dog.targetY - dog.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) {
      // Reached target — pause for a moment then pick a new one
      dog.pauseUntil = now + 800 + Math.random() * 2000;
      pickTarget(dog);
      continue;
    }
    const speed = 0.04;
    dog.x += (dx / dist) * speed * dt;
    dog.y += (dy / dist) * speed * dt;
    if (Math.abs(dx) > Math.abs(dy)) {
      dog.direction = dx > 0 ? 'right' : 'left';
    } else {
      dog.direction = dy > 0 ? 'down' : 'up';
    }
    dog.animTimer += dt;
    if (dog.animTimer > 220) {
      dog.animFrame = dog.animFrame === 0 ? 1 : 0;
      dog.animTimer = 0;
    }
  }
}

function drawDog(ctx, dog, sx, sy) {
  const s = dog.size;
  const now = Date.now();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + s / 2 + 2, s * 0.7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = dog.color;
  ctx.beginPath();
  ctx.ellipse(sx, sy, s, s * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dog.darkColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Dalmatian spots — if the body is white and dark is dark, sprinkle dots
  if (dog.color === '#fff') {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(sx - 4, sy - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 3, sy + 1, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx - 1, sy + 3, 1, 0, Math.PI * 2); ctx.fill();
  }

  // Head
  const headOffX = dog.direction === 'left' ? -6 : dog.direction === 'right' ? 6 : 0;
  const headOffY = dog.direction === 'up' ? -5 : dog.direction === 'down' ? 3 : -2;
  const hx = sx + headOffX;
  const hy = sy + headOffY - s * 0.4;

  ctx.fillStyle = dog.color;
  ctx.beginPath();
  ctx.arc(hx, hy, s * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dog.darkColor;
  ctx.stroke();

  // Ears
  ctx.fillStyle = dog.darkColor;
  ctx.beginPath();
  ctx.ellipse(hx - s * 0.35, hy - s * 0.25, 3, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx + s * 0.35, hy - s * 0.25, 3, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  if (dog.direction !== 'up') {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(hx - 2, hy, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + 2, hy, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  // Nose
  if (dog.direction === 'down') {
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(hx, hy + 3, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  // Tail wag
  const tailWag = Math.sin(now * 0.01 + dog.tailWagSeed) * 4;
  const tailX = dog.direction === 'right' ? sx - s : sx + s;
  ctx.strokeStyle = dog.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tailX, sy - 2);
  ctx.lineTo(tailX + (dog.direction === 'right' ? -6 : 6), sy - 6 + tailWag);
  ctx.stroke();

  // Legs
  ctx.fillStyle = dog.darkColor;
  const legOff = dog.animFrame === 1 ? 2 : 0;
  ctx.fillRect(sx - s * 0.5 - legOff, sy + s * 0.3, 3, 5);
  ctx.fillRect(sx + s * 0.3 + legOff, sy + s * 0.3, 3, 5);

  // Name label
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(dog.name, sx, sy + s + 12);
}

export function drawDogPark(ctx, camera) {
  // Watchers — drawn first so dogs running across them render in front
  for (const w of watchers) {
    const sx = w.x - camera.x;
    const sy = w.y - camera.y;
    if (sx < -40 || sx > camera.w + 40 || sy < -60 || sy > camera.h + 40) continue;
    drawCharacter(ctx, sx, sy, w.appearance, w.direction, false, 0, w.name, {});
  }

  // Dogs
  for (const dog of dogs) {
    const sx = dog.x - camera.x;
    const sy = dog.y - camera.y;
    if (sx < -30 || sx > camera.w + 30 || sy < -30 || sy > camera.h + 30) continue;
    drawDog(ctx, dog, sx, sy);
  }
}
