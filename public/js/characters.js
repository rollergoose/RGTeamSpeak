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

  // === Hat (cosmetic) ===
  if (appearance.hat && appearance.hat !== 'none') {
    drawHat(ctx, headX, headY, headW, headH, appearance.hat);
  }

  // === Face accessory ===
  if (appearance.face && appearance.face !== 'none') {
    drawFace(ctx, headX, headY, headW, headH, appearance.face, direction);
  }

  // === Outfit overlay ===
  if (appearance.outfit && appearance.outfit !== 'none') {
    drawOutfit(ctx, x, bodyY, bodyH, appearance.outfit);
  }

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

// === HATS ===
function drawHat(ctx, hx, hy, hw, hh, hatId) {
  const cx = hx + hw / 2;
  const top = hy - 3;

  switch (hatId) {
    case 'cap':
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(hx - 2, top - 4, hw + 4, 5);
      ctx.fillRect(hx + hw - 1, top - 2, 6, 3); // brim
      break;
    case 'beanie':
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(hx - 1, top - 5, hw + 2, 7);
      ctx.fillStyle = '#34495e';
      ctx.fillRect(hx, top - 6, hw, 3);
      // Pom pom
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.arc(cx, top - 7, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'tophat':
      ctx.fillStyle = '#222';
      ctx.fillRect(hx - 1, top - 10, hw + 2, 10);
      ctx.fillRect(hx - 4, top - 1, hw + 8, 3);
      break;
    case 'crown':
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(hx, top - 6, hw, 6);
      ctx.fillRect(hx - 1, top - 8, 3, 3);
      ctx.fillRect(hx + hw / 2 - 1, top - 9, 3, 4);
      ctx.fillRect(hx + hw - 2, top - 8, 3, 3);
      // Gems
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(hx + 2, top - 4, 2, 2);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(hx + hw - 4, top - 4, 2, 2);
      break;
    case 'wizard':
      ctx.fillStyle = '#6c3483';
      ctx.beginPath();
      ctx.moveTo(cx, top - 14);
      ctx.lineTo(hx - 3, top);
      ctx.lineTo(hx + hw + 3, top);
      ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(cx - 1, top - 6, 3, 3); // star
      break;
    case 'cowboy':
      ctx.fillStyle = '#8b5e3c';
      ctx.fillRect(hx + 1, top - 6, hw - 2, 6);
      ctx.fillRect(hx - 5, top - 1, hw + 10, 3);
      ctx.fillRect(hx - 3, top - 2, hw + 6, 2);
      break;
    case 'hood':
      ctx.fillStyle = '#2c2c3a';
      ctx.fillRect(hx - 3, top - 4, hw + 6, hh + 6);
      ctx.fillStyle = '#1a1a28';
      ctx.fillRect(hx - 2, top - 3, hw + 4, 5);
      ctx.fillRect(hx - 4, hy + 2, 3, hh - 2);
      ctx.fillRect(hx + hw + 1, hy + 2, 3, hh - 2);
      break;
    case 'halo':
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, top - 5, 8, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(241,196,15,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx, top - 5, 10, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'horns':
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(hx - 1, hy);
      ctx.lineTo(hx - 4, top - 8);
      ctx.lineTo(hx + 3, hy - 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + hw + 1, hy);
      ctx.lineTo(hx + hw + 4, top - 8);
      ctx.lineTo(hx + hw - 3, hy - 2);
      ctx.fill();
      break;
    case 'clown':
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(cx, top - 5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(cx, top - 5, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

// === FACE ACCESSORIES ===
function drawFace(ctx, hx, hy, hw, hh, faceId, direction) {
  if (direction === 'up') return;
  const cx = hx + hw / 2;
  const eyeY = hy + 4;

  switch (faceId) {
    case 'sunglasses':
      ctx.fillStyle = '#111';
      ctx.fillRect(hx + 1, eyeY - 1, hw - 2, 4);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(hx + 2, eyeY, 4, 3);
      ctx.fillRect(hx + hw - 6, eyeY, 4, 3);
      break;
    case 'monocle':
      ctx.strokeStyle = '#d4a03c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx + hw - 4, eyeY + 1, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#d4a03c';
      ctx.beginPath();
      ctx.moveTo(hx + hw - 1, eyeY + 3);
      ctx.lineTo(hx + hw + 2, hy + hh + 4);
      ctx.stroke();
      break;
    case 'clown':
      // Red nose
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(cx, hy + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      // White face
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(hx + 1, hy + 1, hw - 2, hh - 2);
      // Blue eye makeup
      ctx.fillStyle = 'rgba(52,152,219,0.5)';
      ctx.fillRect(hx + 2, eyeY - 2, 4, 2);
      ctx.fillRect(hx + hw - 6, eyeY - 2, 4, 2);
      break;
    case 'bandana':
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(hx - 1, hy - 1, hw + 2, 4);
      ctx.fillRect(hx + hw, hy, 4, 6); // trailing end
      break;
    case 'eyepatch':
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(hx + hw - 4, eyeY + 1, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 1);
      ctx.lineTo(hx + hw - 4, eyeY + 1);
      ctx.lineTo(hx + hw, hy + hh);
      ctx.stroke();
      break;
    case 'mask':
      ctx.fillStyle = '#2c2c2c';
      ctx.fillRect(hx + 1, eyeY - 2, hw - 2, 5);
      ctx.fillStyle = '#111';
      ctx.fillRect(hx + 3, eyeY, 3, 2);
      ctx.fillRect(hx + hw - 6, eyeY, 3, 2);
      break;
    case 'golden':
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(hx + 1, eyeY - 2, hw - 2, 6);
      ctx.fillStyle = '#d4ac0d';
      ctx.fillRect(hx + 3, eyeY, 3, 3);
      ctx.fillRect(hx + hw - 6, eyeY, 3, 3);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(hx + hw / 2 - 1, eyeY + 3, 3, 2);
      break;
  }
}

// === OUTFIT OVERLAY ===
function drawOutfit(ctx, charX, bodyY, bodyH, outfitId) {
  const w = CHAR_W;

  switch (outfitId) {
    case 'suit':
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(charX + 2, bodyY, w - 4, bodyH);
      ctx.fillStyle = '#fff';
      ctx.fillRect(charX + w / 2 - 1, bodyY, 2, bodyH);
      break;
    case 'vest':
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(charX + 2, bodyY, 4, bodyH);
      ctx.fillRect(charX + w - 6, bodyY, 4, bodyH);
      break;
    case 'hoodie':
      ctx.fillStyle = '#555';
      ctx.fillRect(charX + 1, bodyY, w - 2, bodyH);
      ctx.fillStyle = '#444';
      ctx.fillRect(charX + w / 2 - 3, bodyY, 6, bodyH);
      // Hood hint on shoulders
      ctx.fillRect(charX, bodyY - 1, w, 3);
      break;
    case 'cloak':
      ctx.fillStyle = 'rgba(20,10,30,0.7)';
      ctx.fillRect(charX - 1, bodyY - 2, w + 2, bodyH + 8);
      ctx.fillStyle = 'rgba(40,20,60,0.5)';
      ctx.fillRect(charX, bodyY, w, bodyH + 6);
      break;
    case 'armor':
      ctx.fillStyle = '#8899aa';
      ctx.fillRect(charX + 1, bodyY, w - 2, bodyH);
      ctx.fillStyle = '#aabbcc';
      ctx.fillRect(charX + 3, bodyY + 2, w - 6, 3);
      ctx.fillRect(charX + 3, bodyY + bodyH - 4, w - 6, 3);
      // Shoulder plates
      ctx.fillRect(charX - 2, bodyY, 5, 4);
      ctx.fillRect(charX + w - 3, bodyY, 5, 4);
      break;
    case 'clown':
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(charX + 2, bodyY, w / 2 - 2, bodyH);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(charX + w / 2, bodyY, w / 2 - 2, bodyH);
      // Buttons
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.arc(charX + w / 2, bodyY + 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(charX + w / 2, bodyY + 7, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'royal':
      ctx.fillStyle = '#6c3483';
      ctx.fillRect(charX + 1, bodyY, w - 2, bodyH);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(charX + 2, bodyY, w - 4, 2);
      ctx.fillRect(charX + 2, bodyY + bodyH - 2, w - 4, 2);
      break;
  }
}
