// === Map ===
export const TILE_SIZE = 32;
export const MAP_COLS = 50;
export const MAP_ROWS = 35;
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
  STREET: 15,
  SIDEWALK: 16,
  GRASS: 17,
  FENCE: 18,
  WINDOW: 19,
  BUS_SIGN: 20,
  CROSSWALK: 21,
  // Across-the-street venues
  GYM_FLOOR: 22,
  TREADMILL: 23,
  WEIGHT_BENCH: 24,
  DUMBBELL: 25,
  GROCERY_FLOOR: 26,
  SHELF: 27,
  CASHIER: 28,
  CINEMA_FLOOR: 29,
  CINEMA_SEAT: 30,
  CINEMA_SCREEN: 31,
  DRAPE: 32,
  // Dog park
  AGILITY_HOOP: 33,
  AGILITY_TUNNEL: 34,
  AGILITY_JUMP: 35,
  DOG_BONE: 36,
  FRISBEE: 37,
  PARK_FENCE: 38,
  // Map decor
  DONUT_BOX_TILE: 39,
  PIZZA_BOX_TILE: 40,
  PARK_BENCH: 41,
  BBQ_GRILL: 42,
  STREETLIGHT: 43,
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
  [T.STREET]:        { fill: '#3a3a3a', line: '#5a5a3a' },
  [T.SIDEWALK]:      { fill: '#b0a898', grid: '#a09888' },
  [T.GRASS]:         { fill: '#4a8c3f', dark: '#3a7030' },
  [T.FENCE]:         { fill: '#8b7355', post: '#6b5335' },
  [T.WINDOW]:        { fill: '#88ccee', frame: '#667788' },
  [T.BUS_SIGN]:      { fill: '#f1c40f', frame: '#888' },
  [T.CROSSWALK]:     { fill: '#3a3a3a', stripe: '#f5f5f5' },
  // Gym
  [T.GYM_FLOOR]:     { fill: '#2c2f33', grid: '#23262a' },
  [T.TREADMILL]:     { fill: '#1a1a1a', frame: '#888', screen: '#4488ff' },
  [T.WEIGHT_BENCH]:  { fill: '#c0392b', frame: '#1a1a1a', accent: '#888' },
  [T.DUMBBELL]:      { fill: '#1a1a1a', accent: '#666' },
  // Grocery
  [T.GROCERY_FLOOR]: { fill: '#ecf0f1', grid: '#d8dde0' },
  [T.SHELF]:         { fill: '#8b6f47', surface: '#a07c52', items: ['#e74c3c', '#f1c40f', '#27ae60', '#3498db'] },
  [T.CASHIER]:       { fill: '#2980b9', counter: '#bdc3c7', skin: '#f5c5a3', shirt: '#27ae60', hair: '#3d2314' },
  // Cinema
  [T.CINEMA_FLOOR]:  { fill: '#0f0f12', grid: '#16161a' },
  [T.CINEMA_SEAT]:   { fill: '#7a1f25', cushion: '#a02530', accent: '#3a0a10' },
  [T.CINEMA_SCREEN]: { fill: '#f5f5f0', frame: '#1a1a1a', glow: 'rgba(220,230,255,0.55)' },
  [T.DRAPE]:         { fill: '#5a1218', highlight: '#7a1820', shadow: '#3a080d' },
  // Dog park
  [T.AGILITY_HOOP]:  { fill: '#e74c3c', frame: '#7f8c8d', accent: '#c0392b' },
  [T.AGILITY_TUNNEL]:{ fill: '#3498db', stripe: '#2c80b4', shadow: '#205d85' },
  [T.AGILITY_JUMP]:  { fill: '#ecf0f1', accent: '#e74c3c', post: '#7f8c8d' },
  [T.DOG_BONE]:      { fill: '#f5e8c8', shadow: '#c4a878' },
  [T.FRISBEE]:       { fill: '#f1c40f', accent: '#d4a40a' },
  [T.PARK_FENCE]:    { fill: '#8b6f47', post: '#6b5335' },
  [T.DONUT_BOX_TILE]:{ fill: '#e84393', accent: '#fff' },
  [T.PIZZA_BOX_TILE]:{ fill: '#c0392b', cheese: '#f1c40f', crust: '#d4a574', pepperoni: '#a01818' },
  [T.PARK_BENCH]:    { fill: '#5a3a1a', plank: '#7a5a2a', leg: '#1a1a1a' },
  [T.BBQ_GRILL]:     { fill: '#1a1a1a', grate: '#666', flame: '#ff7a0a', flameHot: '#ffd24a' },
  [T.STREETLIGHT]:   { fill: '#444', post: '#2a2a2a', glow: '#ffe28a' },
};

// === Which tiles block movement ===
export const SOLID_TILES = new Set([T.WALL, T.DESK, T.TABLE, T.TV, T.COMPUTER, T.MEETING_TABLE, T.COUNTER, T.TOILET_TILE, T.PLANT, T.FENCE, T.WINDOW, T.BUS_SIGN, T.TREADMILL, T.WEIGHT_BENCH, T.DUMBBELL, T.SHELF, T.CASHIER, T.CINEMA_SEAT, T.CINEMA_SCREEN, T.DRAPE, T.AGILITY_TUNNEL, T.PARK_FENCE, T.PARK_BENCH, T.BBQ_GRILL, T.STREETLIGHT, T.DONUT_BOX_TILE, T.PIZZA_BOX_TILE]);

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

// === Level System ===
// 5 categories × 10 sub-levels each = 50 total player level
// Categories: Explorer (steps), Communicator (meeting time), Feedback (notices posted),
//             Chatter (chat messages), Achiever (tasks completed)
export const LEVEL_CATEGORIES = [
  { id: 'explorer',      name: 'Explorer 🚶',      icon: '🚶', perLevel: 500,  stat: 'steps' },
  { id: 'communicator',  name: 'Communicator 💬',   icon: '💬', perLevel: 5,    stat: 'meetingTime' },
  { id: 'feedback',      name: 'Feedback 📝',       icon: '📝', perLevel: 3,    stat: 'feedbackGiven' },
  { id: 'chatter',       name: 'Chatter 💭',        icon: '💭', perLevel: 50,   stat: 'chatMessages' },
  { id: 'achiever',      name: 'Achiever ✅',       icon: '✅', perLevel: 5,    stat: 'tasksCompleted' },
];

// === Unlockable cosmetics (player level = sum of all sub-levels, max 50) ===
export const HATS = [
  { id: 'none',       name: 'None',            level: 0 },
  { id: 'cap',        name: 'Baseball Cap',     level: 2 },
  { id: 'beanie',     name: 'Beanie',           level: 5 },
  { id: 'tophat',     name: 'Top Hat',          level: 8 },
  { id: 'cowboy',     name: 'Cowboy Hat',       level: 12 },
  { id: 'crown',      name: 'Crown',            level: 16 },
  { id: 'wizard',     name: 'Wizard Hat',       level: 20 },
  { id: 'hood',       name: 'Dark Hood',        level: 25 },
  { id: 'halo',       name: 'Halo',             level: 30 },
  { id: 'horns',      name: 'Devil Horns',      level: 38 },
  { id: 'clown',      name: 'Clown Hat',        level: 45 },
];

export const OUTFITS = [
  { id: 'none',       name: 'Default',          level: 0 },
  { id: 'vest',       name: 'Vest',             level: 3 },
  { id: 'suit',       name: 'Business Suit',    level: 10 },
  { id: 'hoodie',     name: 'Hoodie',           level: 15 },
  { id: 'cloak',      name: 'Dark Cloak',       level: 22 },
  { id: 'armor',      name: 'Knight Armor',     level: 30 },
  { id: 'clown',      name: 'Clown Outfit',     level: 38 },
  { id: 'royal',      name: 'Royal Robe',       level: 46 },
];

export const FACES = [
  { id: 'none',       name: 'Normal',           level: 0 },
  { id: 'sunglasses', name: 'Sunglasses',       level: 4 },
  { id: 'monocle',    name: 'Monocle',          level: 10 },
  { id: 'bandana',    name: 'Bandana',          level: 18 },
  { id: 'eyepatch',   name: 'Eyepatch',         level: 24 },
  { id: 'clown',      name: 'Clown Makeup',     level: 32 },
  { id: 'mask',       name: 'Mask',             level: 40 },
  { id: 'golden',     name: 'Golden Mask',      level: 50 },
];

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
  ARCHIVES: 'archives',
  GYM: 'gym',
  GROCERY: 'grocery',
  CINEMA: 'cinema',
  DOGPARK: 'dogpark',
};

// Spawn in the hallway (row 8, center)
// Spawn at the bus stop / yard entrance
export const SPAWN_X = 36 * TILE_SIZE;
export const SPAWN_Y = 18 * TILE_SIZE;

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
