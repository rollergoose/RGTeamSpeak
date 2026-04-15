import { ZONES_PX } from './map.js';

let currentZoneId = null;
let onEnterCallbacks = [];
let onLeaveCallbacks = [];

export function onZoneEnter(cb) { onEnterCallbacks.push(cb); }
export function onZoneLeave(cb) { onLeaveCallbacks.push(cb); }

export function getCurrentZone() {
  return ZONES_PX.find(z => z.id === currentZoneId) || null;
}

export function checkZone(px, py) {
  let foundZone = null;

  for (const zone of ZONES_PX) {
    if (px >= zone.x && px < zone.x + zone.w &&
        py >= zone.y && py < zone.y + zone.h) {
      foundZone = zone;
      break;
    }
  }

  const newId = foundZone ? foundZone.id : null;

  if (newId !== currentZoneId) {
    const oldZone = ZONES_PX.find(z => z.id === currentZoneId) || null;
    if (oldZone) {
      for (const cb of onLeaveCallbacks) cb(oldZone);
    }
    currentZoneId = newId;
    if (foundZone) {
      for (const cb of onEnterCallbacks) cb(foundZone);
    }
  }

  return foundZone;
}
