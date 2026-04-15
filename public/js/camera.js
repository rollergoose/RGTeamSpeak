import { MAP_WIDTH, MAP_HEIGHT } from './constants.js';

export class Camera {
  constructor(canvasWidth, canvasHeight) {
    this.x = 0;
    this.y = 0;
    this.w = canvasWidth;
    this.h = canvasHeight;
    this.targetX = 0;
    this.targetY = 0;
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
  }

  follow(px, py) {
    this.targetX = px - this.w / 2;
    this.targetY = py - this.h / 2;
  }

  update() {
    // Lerp towards target
    this.x += (this.targetX - this.x) * 0.08;
    this.y += (this.targetY - this.y) * 0.08;

    // Clamp to map bounds
    this.x = Math.max(0, Math.min(MAP_WIDTH - this.w, this.x));
    this.y = Math.max(0, Math.min(MAP_HEIGHT - this.h, this.y));

    // If map smaller than viewport, center it
    if (MAP_WIDTH < this.w) this.x = (MAP_WIDTH - this.w) / 2;
    if (MAP_HEIGHT < this.h) this.y = (MAP_HEIGHT - this.h) / 2;
  }
}
