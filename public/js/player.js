import { MOVE_SPEED, PLAYER_WIDTH, PLAYER_HEIGHT, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, T } from './constants.js';
import { isSolid, getTile, ZONES_PX } from './map.js';

// Lock checker — set by main.js
let lockedDoorChecker = null;
export function setLockedDoorChecker(fn) { lockedDoorChecker = fn; }

// Furniture collision checker — set by main.js
let furnitureCollider = null;
export function setFurnitureCollider(fn) { furnitureCollider = fn; }

// Items that should block movement
const SOLID_FURNITURE = new Set(['desk', 'table', 'server', 'bookshelf', 'fridge', 'pinball', 'wall_h', 'wall_v', 'divider']);

export class Player {
  constructor(x, y, appearance) {
    this.x = x;
    this.y = y;
    this.appearance = appearance;
    this.direction = 'down';
    this.isMoving = false;
    this.animFrame = 0;
    this.animTimer = 0;
    this.username = '';
  }

  update(keysDown, dt) {
    let dx = 0;
    let dy = 0;

    if (keysDown.has('ArrowUp') || keysDown.has('w')) dy -= 1;
    if (keysDown.has('ArrowDown') || keysDown.has('s')) dy += 1;
    if (keysDown.has('ArrowLeft') || keysDown.has('a')) dx -= 1;
    if (keysDown.has('ArrowRight') || keysDown.has('d')) dx += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    const speed = MOVE_SPEED;
    const moveX = dx * speed;
    const moveY = dy * speed;

    this.isMoving = dx !== 0 || dy !== 0;

    if (this.isMoving) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.direction = dx > 0 ? 'right' : 'left';
      } else {
        this.direction = dy > 0 ? 'down' : 'up';
      }
    }

    // Axis-separated collision
    if (moveX !== 0) {
      const newX = this.x + moveX;
      if (!this.collides(newX, this.y)) {
        this.x = newX;
      }
    }
    if (moveY !== 0) {
      const newY = this.y + moveY;
      if (!this.collides(this.x, newY)) {
        this.y = newY;
      }
    }

    // Clamp to map bounds
    this.x = Math.max(PLAYER_WIDTH / 2, Math.min(MAP_WIDTH - PLAYER_WIDTH / 2, this.x));
    this.y = Math.max(PLAYER_HEIGHT / 2, Math.min(MAP_HEIGHT - PLAYER_HEIGHT / 2, this.y));

    // Walk animation
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

  collides(px, py) {
    const hw = PLAYER_WIDTH / 2;
    const hh = PLAYER_HEIGHT / 2;
    const corners = [
      [px - hw + 2, py - hh + 2],
      [px + hw - 3, py - hh + 2],
      [px - hw + 2, py + hh - 3],
      [px + hw - 3, py + hh - 3],
    ];

    for (const [cx, cy] of corners) {
      const col = Math.floor(cx / TILE_SIZE);
      const row = Math.floor(cy / TILE_SIZE);
      if (isSolid(col, row)) return true;
      // Check if this is a locked door
      if (getTile(col, row) === T.DOOR && lockedDoorChecker) {
        if (lockedDoorChecker(col, row)) return true;
      }
    }

    // Check placed furniture collision
    if (furnitureCollider) {
      const items = furnitureCollider();
      const halfTile = TILE_SIZE / 2;
      for (const item of items) {
        if (!SOLID_FURNITURE.has(item.type)) continue;
        // Simple AABB check: item occupies a 32x32 area centered on its position
        const ix = item.x - halfTile;
        const iy = item.y - halfTile;
        if (px + hw - 3 > ix && px - hw + 2 < ix + TILE_SIZE &&
            py + hh - 3 > iy && py - hh + 2 < iy + TILE_SIZE) {
          return true;
        }
      }
    }

    return false;
  }
}
