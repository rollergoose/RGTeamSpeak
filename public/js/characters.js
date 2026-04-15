import { CHAR_W, CHAR_H, SKIN_TONES, HAIR_COLORS } from './constants.js';

// Darken a hex color by a factor (0-1)
function darken(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - factor;
  return `rgb(${Math.floor(r * f)},${Math.floor(g * f)},${Math.floor(b * f)})`;
}

function lighten(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.floor(r + (255 - r) * factor))},${Math.min(255, Math.floor(g + (255 - g) * factor))},${Math.min(255, Math.floor(b + (255 - b) * factor))})`;
}

/**
 * Draw a character on the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} sx - screen X (center of character)
 * @param {number} sy - screen Y (bottom of character)
 * @param {object} appearance - { skinTone, hairStyle, hairColor, shirtColor, pantsColor }
 * @param {string} direction - 'up' | 'down' | 'left' | 'right'
 * @param {boolean} isMoving
 * @param {number} animFrame - 0 or 1
 * @param {string} username
 * @param {object} status - { inMeeting, muted, isScreenSharing }
 */
export function drawCharacter(ctx, sx, sy, appearance, direction, isMoving, animFrame, username, status = {}) {
  const x = Math.floor(sx - CHAR_W / 2);
  const y = Math.floor(sy - CHAR_H);
  const { skinTone, hairStyle, hairColor, shirtColor, pantsColor } = appearance;

  // === Shadow ===
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 1, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // === Legs / Pants ===
  const legW = 6;
  const legH = 8;
  const legY = y + CHAR_H - legH;
  ctx.fillStyle = pantsColor;

  if (isMoving && animFrame === 1) {
    const offset = (direction === 'left' || direction === 'up') ? -2 : 2;
    ctx.fillRect(x + 3 + offset, legY, legW, legH);      // left leg
    ctx.fillRect(x + CHAR_W - 9 - offset, legY, legW, legH); // right leg
  } else {
    ctx.fillRect(x + 4, legY, legW, legH);
    ctx.fillRect(x + CHAR_W - 10, legY, legW, legH);
  }

  // Shoes
  ctx.fillStyle = darken(pantsColor, 0.4);
  if (isMoving && animFrame === 1) {
    const offset = (direction === 'left' || direction === 'up') ? -2 : 2;
    ctx.fillRect(x + 3 + offset, sy - 2, legW, 2);
    ctx.fillRect(x + CHAR_W - 9 - offset, sy - 2, legW, 2);
  } else {
    ctx.fillRect(x + 4, sy - 2, legW, 2);
    ctx.fillRect(x + CHAR_W - 10, sy - 2, legW, 2);
  }

  // === Body / Shirt ===
  const bodyH = 10;
  const bodyY = legY - bodyH + 2;
  ctx.fillStyle = shirtColor;
  ctx.fillRect(x + 2, bodyY, CHAR_W - 4, bodyH);
  // Shirt detail - collar line
  ctx.fillStyle = darken(shirtColor, 0.15);
  ctx.fillRect(x + 7, bodyY, CHAR_W - 14, 2);

  // Arms
  ctx.fillStyle = shirtColor;
  const armY = bodyY + 2;
  if (isMoving && animFrame === 1) {
    ctx.fillRect(x - 1, armY - 1, 4, 7);
    ctx.fillRect(x + CHAR_W - 3, armY + 1, 4, 7);
  } else {
    ctx.fillRect(x, armY, 3, 7);
    ctx.fillRect(x + CHAR_W - 3, armY, 3, 7);
  }

  // Hands (skin)
  ctx.fillStyle = skinTone;
  if (isMoving && animFrame === 1) {
    ctx.fillRect(x - 1, armY + 5, 4, 3);
    ctx.fillRect(x + CHAR_W - 3, armY + 7, 4, 3);
  } else {
    ctx.fillRect(x, armY + 6, 3, 3);
    ctx.fillRect(x + CHAR_W - 3, armY + 6, 3, 3);
  }

  // === Head ===
  const headW = 14;
  const headH = 12;
  const headX = x + (CHAR_W - headW) / 2;
  const headY = bodyY - headH + 2;
  ctx.fillStyle = skinTone;
  ctx.fillRect(headX, headY, headW, headH);

  // === Eyes ===
  const eyeY = headY + 4;
  const eyeOffX = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const eyeOffY = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;

  if (direction !== 'up') {
    // Eye whites
    ctx.fillStyle = '#fff';
    ctx.fillRect(headX + 3, eyeY, 3, 3);
    ctx.fillRect(headX + headW - 6, eyeY, 3, 3);
    // Pupils
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(headX + 4 + eyeOffX, eyeY + 1 + eyeOffY, 2, 2);
    ctx.fillRect(headX + headW - 5 + eyeOffX, eyeY + 1 + eyeOffY, 2, 2);
  }

  // Mouth (only when facing down or side)
  if (direction === 'down') {
    ctx.fillStyle = darken(skinTone, 0.2);
    ctx.fillRect(headX + 5, headY + 9, 4, 1);
  }

  // === Hair ===
  drawHair(ctx, headX, headY, headW, headH, hairStyle, hairColor, direction);

  // === Username label ===
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  const labelY = headY - 12;

  // Status dot
  if (status.inMeeting) {
    const dotColor = status.muted ? '#e74c3c' : '#2ecc71';
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(sx, labelY - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name background
  const nameW = ctx.measureText(username || '???').width;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(sx - nameW / 2 - 3, labelY - 3, nameW + 6, 13);
  ctx.fillStyle = '#fff';
  ctx.fillText(username || '???', sx, labelY + 7);
}

function drawHair(ctx, hx, hy, hw, hh, style, color, direction) {
  ctx.fillStyle = color;

  switch (style) {
    case 'short':
      ctx.fillRect(hx - 1, hy - 2, hw + 2, 5);
      if (direction === 'left') ctx.fillRect(hx - 1, hy, 2, 5);
      if (direction === 'right') ctx.fillRect(hx + hw - 1, hy, 2, 5);
      break;

    case 'long':
      ctx.fillRect(hx - 1, hy - 2, hw + 2, 5);
      ctx.fillRect(hx - 1, hy, 2, hh + 4);
      ctx.fillRect(hx + hw - 1, hy, 2, hh + 4);
      break;

    case 'curly':
      ctx.fillRect(hx - 2, hy - 3, hw + 4, 6);
      ctx.fillRect(hx - 2, hy, 3, hh);
      ctx.fillRect(hx + hw - 1, hy, 3, hh);
      // Curly bumps
      ctx.fillRect(hx - 3, hy + 2, 2, 3);
      ctx.fillRect(hx + hw, hy + 2, 2, 3);
      ctx.fillRect(hx - 3, hy + 6, 2, 3);
      ctx.fillRect(hx + hw, hy + 6, 2, 3);
      break;

    case 'spiky':
      ctx.fillRect(hx, hy - 2, hw, 4);
      // Spikes
      ctx.fillRect(hx + 1, hy - 5, 3, 4);
      ctx.fillRect(hx + 5, hy - 6, 3, 5);
      ctx.fillRect(hx + 9, hy - 4, 3, 3);
      break;

    case 'none':
      // Bald - no hair
      break;
  }
}
