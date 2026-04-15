// === Map ===
export const TILE_SIZE = 32;
export const MAP_COLS = 50;
export const MAP_ROWS = 20;
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;

// === Tile Types ===
export const T = {
  FLOOR: 0,
  WALL: 1,
  DOOR: 2,
  DESK: 3,
  CHAIR: 4,
  TABLE: 5,
  COUCH: 6,
  TV: 7,
  COMPUTER: 8,
  MEETING_TABLE: 9,
  BOARD: 10,
  COUNTER: 11,
  TOILET_TILE: 12,
  PLANT: 13,
  RUG: 14,
};

// === Tile Colors ===
export const TILE_COLORS = {
  [T.FLOOR]:         { fill: '#d4c5a9', grid: '#cabb9e' },
  [T.WALL]:          { fill: '#4a3f35', highlight: '#5e5248' },
  [T.DOOR]:          { fill: '#c8b898', frame: '#a09078' },
  [T.DESK]:          { fill: '#8b6914', top: '#a07818' },
  [T.CHAIR]:         { fill: '#5a5a5a', seat: '#6e6e6e' },
  [T.TABLE]:         { fill: '#a0522d', surface: '#b8633a' },
  [T.COUCH]:         { fill: '#4682b4', cushion: '#5a9bc9' },
  [T.TV]:            { fill: '#1a1a1a', screen: '#333', glow: '#00ff88' },
  [T.COMPUTER]:      { fill: '#2a2a2a', screen: '#4488ff' },
  [T.MEETING_TABLE]: { fill: '#6b4e2e', surface: '#7d5c38' },
  [T.BOARD]:         { fill: '#f5f0e0', border: '#8b7355', pin: '#e74c3c' },
  [T.COUNTER]:       { fill: '#7a6a5a', top: '#8d7d6d' },
  [T.TOILET_TILE]:   { fill: '#e0e8f0', accent: '#c0d0e0' },
  [T.PLANT]:         { fill: '#2d8a4e', pot: '#8b5e3c' },
  [T.RUG]:           { fill: '#8b4560', border: '#6b2540' },
};

// === Which tiles block movement ===
export const SOLID_TILES = new Set([T.WALL, T.DESK, T.TABLE, T.TV, T.COMPUTER, T.MEETING_TABLE, T.BOARD, T.COUNTER, T.TOILET_TILE, T.PLANT]);

// === Player ===
export const MOVE_SPEED = 2.5;
export const POSITION_SEND_INTERVAL = 66;
export const PLAYER_WIDTH = 16;
export const PLAYER_HEIGHT = 16;
export const LERP_FACTOR = 0.18;

// === Character draw sizes ===
export const CHAR_W = 20;
export const CHAR_H = 28;

// === Skin tone palette ===
export const SKIN_TONES = [
  '#fde0c4', '#f5c5a3', '#d4a373', '#b07d56', '#7b5233', '#4a2f1a'
];

// === Hair colors ===
export const HAIR_COLORS = [
  '#1a1a1a', '#3d2314', '#8b4513', '#d4a03c', '#c0392b', '#e67e22', '#7f8c8d', '#f5f5f5'
];

// === Shirt colors ===
export const SHIRT_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e84393', '#ecf0f1', '#2c3e50'
];

// === Pants colors ===
export const PANTS_COLORS = [
  '#2c3e50', '#34495e', '#1a237e', '#4a4a4a', '#795548', '#1b5e20'
];

// === Hair styles ===
export const HAIR_STYLES = ['short', 'long', 'curly', 'spiky', 'none'];

// === Zone types ===
export const ZONE_TYPES = {
  HALLWAY: 'hallway',
  KITCHEN: 'kitchen',
  CHILL: 'chill',
  OFFICE: 'office',
  MEETING: 'meeting',
  RECEPTION: 'reception',
  TOILET: 'toilet',
  RESTING: 'resting',
};

// Spawn in the hallway (row 8, center)
export const SPAWN_X = 25 * TILE_SIZE;
export const SPAWN_Y = 8 * TILE_SIZE;

// === WebRTC ===
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Free TURN relay for when peer-to-peer fails across NATs
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export const BANDWIDTH_OPTIONS = [500, 1000, 2000, 5000, 10000, 20000];
export const DEFAULT_BANDWIDTH = 2000;
