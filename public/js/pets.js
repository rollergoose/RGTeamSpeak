import * as network from './network.js';
import { TILE_SIZE } from './constants.js';
import { ZONES_PX } from './map.js';

/*
  Pet system:
  - Players can place dogs in their office via the furniture menu
  - Dogs wander randomly within the office zone
  - Players near a dog can press F to pet it → heart emojis
  - Chat commands: /sit, /spin, /bark, /come — dog near you does the action
*/

const PET_TYPES = {
  dog_golden: { name: 'Golden Retriever', color: '#daa520', darkColor: '#b8860b', size: 12 },
  dog_husky:  { name: 'Husky',            color: '#b0c4de', darkColor: '#6e8898', size: 12 },
  dog_corgi:  { name: 'Corgi',            color: '#e8a849', darkColor: '#c4863a', size: 10 },
  dog_poodle: { name: 'Poodle',           color: '#f5f5f5', darkColor: '#ccc',    size: 11 },
  dog_dalmation: { name: 'Dalmatian',     color: '#fff',    darkColor: '#222',    size: 12 },
};

export { PET_TYPES };

// Active pets in the world
const pets = new Map(); // petId -> pet state

// Hearts animation
const hearts = []; // [{ x, y, startTime }]

export function initPets() {
  network.on('pet:spawn', (pet) => {
    pets.set(pet.id, {
      ...pet,
      drawX: pet.x,
      drawY: pet.y,
      animFrame: 0,
      animTimer: 0,
      actionTimer: 0,
      action: 'idle', // idle, walk, sit, spin, bark
      targetX: pet.x,
      targetY: pet.y,
      direction: 'down',
      spinAngle: 0,
    });
  });

  network.on('pet:remove', ({ petId }) => {
    pets.delete(petId);
  });

  network.on('pet:update', ({ petId, x, y, action }) => {
    const pet = pets.get(petId);
    if (!pet) return;
    pet.targetX = x;
    pet.targetY = y;
    if (action) pet.action = action;
  });

  network.on('pet:heart', ({ petId }) => {
    const pet = pets.get(petId);
    if (pet) {
      for (let i = 0; i < 3; i++) {
        hearts.push({
          petId: petId, // track which pet this heart belongs to
          offsetX: (Math.random() - 0.5) * 16,
          startTime: Date.now() + i * 200,
        });
      }
    }
  });

  network.on('pet:action', ({ petId, action }) => {
    const pet = pets.get(petId);
    if (pet) {
      pet.action = action;
      pet.actionTimer = Date.now();
    }
  });

  // Sync existing pets on join
  network.on('pet:sync', ({ allPets }) => {
    pets.clear();
    for (const p of allPets) {
      pets.set(p.id, {
        ...p,
        drawX: p.x,
        drawY: p.y,
        animFrame: 0,
        animTimer: 0,
        actionTimer: 0,
        action: 'idle',
        targetX: p.x,
        targetY: p.y,
        direction: 'down',
        spinAngle: 0,
      });
    }
  });
}

export function updatePets(dt) {
  for (const pet of pets.values()) {
    // Lerp position — slow stroll
    pet.drawX += (pet.targetX - pet.drawX) * 0.02;
    pet.drawY += (pet.targetY - pet.drawY) * 0.02;

    // Direction based on movement
    const dx = pet.targetX - pet.drawX;
    const dy = pet.targetY - pet.drawY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      if (Math.abs(dx) > Math.abs(dy)) {
        pet.direction = dx > 0 ? 'right' : 'left';
      } else {
        pet.direction = dy > 0 ? 'down' : 'up';
      }
      pet.animTimer += dt;
      if (pet.animTimer > 250) {
        pet.animFrame = pet.animFrame === 0 ? 1 : 0;
        pet.animTimer = 0;
      }
    } else {
      pet.animFrame = 0;
    }

    // Spin animation
    if (pet.action === 'spin') {
      pet.spinAngle += dt * 0.01;
      if (Date.now() - pet.actionTimer > 2000) pet.action = 'idle';
    }
  }

  // Clean expired hearts
  const now = Date.now();
  for (let i = hearts.length - 1; i >= 0; i--) {
    if (now - hearts[i].startTime > 1500) hearts.splice(i, 1);
  }
}

export function drawPets(ctx, camera) {
  const now = Date.now();

  for (const pet of pets.values()) {
    const type = PET_TYPES[pet.type] || PET_TYPES.dog_golden;
    const sx = pet.drawX - camera.x;
    const sy = pet.drawY - camera.y;
    const s = type.size;

    // Skip if offscreen
    if (sx < -30 || sx > camera.w + 30 || sy < -30 || sy > camera.h + 30) continue;

    ctx.save();

    if (pet.action === 'spin') {
      ctx.translate(sx, sy);
      ctx.rotate(pet.spinAngle);
      ctx.translate(-sx, -sy);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + s / 2 + 2, s * 0.7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = type.color;
    ctx.beginPath();
    ctx.ellipse(sx, sy, s, s * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = type.darkColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, sy, s, s * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Head
    const headOffX = pet.direction === 'left' ? -6 : pet.direction === 'right' ? 6 : 0;
    const headOffY = pet.direction === 'up' ? -5 : pet.direction === 'down' ? 3 : -2;
    const hx = sx + headOffX;
    const hy = sy + headOffY - s * 0.4;

    ctx.fillStyle = type.color;
    ctx.beginPath();
    ctx.arc(hx, hy, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = type.darkColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx, hy, s * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Ears
    ctx.fillStyle = type.darkColor;
    ctx.beginPath();
    ctx.ellipse(hx - s * 0.35, hy - s * 0.25, 3, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + s * 0.35, hy - s * 0.25, 3, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (only if not facing up)
    if (pet.direction !== 'up') {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(hx - 2, hy, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx + 2, hy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nose
    if (pet.direction === 'down') {
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(hx, hy + 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tail (little wagging line)
    const tailWag = Math.sin(now * 0.008) * 4;
    const tailX = pet.direction === 'right' ? sx - s : sx + s;
    ctx.strokeStyle = type.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tailX, sy - 2);
    ctx.lineTo(tailX + (pet.direction === 'right' ? -6 : 6), sy - 6 + tailWag);
    ctx.stroke();

    // Legs (walking animation)
    ctx.fillStyle = type.darkColor;
    const legOff = pet.animFrame === 1 ? 2 : 0;
    ctx.fillRect(sx - s * 0.5 - legOff, sy + s * 0.3, 3, 5);
    ctx.fillRect(sx + s * 0.3 + legOff, sy + s * 0.3, 3, 5);

    // Sit animation — draw differently
    if (pet.action === 'sit') {
      ctx.fillStyle = type.color;
      ctx.fillRect(sx - s * 0.6, sy + s * 0.1, s * 1.2, s * 0.5);
    }

    // Bark animation — speech bubble
    if (pet.action === 'bark' && now - pet.actionTimer < 2000) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      const bx = sx;
      const by = hy - s - 8;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.roundRect(bx - 20, by - 8, 40, 16, 6);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.fillText('Woof!', bx, by + 4);
    }

    // Pet name label
    if (pet.name) {
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(pet.name, sx, sy + s + 12);
    }

    ctx.restore();
  }

  // Draw hearts — follow the pet they belong to
  for (const heart of hearts) {
    if (now < heart.startTime) continue;
    const pet = pets.get(heart.petId);
    if (!pet) continue;

    const elapsed = now - heart.startTime;
    const progress = elapsed / 1500;
    const alpha = 1 - progress;
    const hx = pet.drawX - camera.x + heart.offsetX;
    const hy = pet.drawY - camera.y - 15 - elapsed * 0.03;

    ctx.globalAlpha = alpha;
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('❤️', hx, hy);
  }
  ctx.globalAlpha = 1;
}

// Check if local player is near any pet — range covers the whole office
export function getNearbyPet(px, py) {
  for (const pet of pets.values()) {
    const dist = Math.sqrt((px - pet.drawX) ** 2 + (py - pet.drawY) ** 2);
    if (dist < TILE_SIZE * 10) return pet; // ~10 tiles = full office
  }
  return null;
}

// Handle chat commands for pets
export function handlePetCommand(command, playerX, playerY) {
  const nearby = getNearbyPet(playerX, playerY);
  if (!nearby) return false;

  const cmd = command.toLowerCase().trim();
  if (cmd === '/sit' || cmd === '/spin' || cmd === '/bark' || cmd === '/come' || cmd === '/goodboy') {
    network.emit('pet:command', { petId: nearby.id, command: cmd.slice(1) });
    return true;
  }
  return false;
}

export function getPets() { return pets; }
