import { T, TILE_SIZE, MAP_COLS, MAP_ROWS, TILE_COLORS, SOLID_TILES, ZONE_TYPES } from './constants.js';

/*
  OFFICE LAYOUT v4 — Wide horizontal, 50 cols x 20 rows
  Hallway runs horizontally through the middle.
  Rooms on top and bottom, accessed via doors.

  Col: 0    5    10   15   20   25   30   35   40   45  49
  Row 0 ╔════════╦════════╦════════╦════════╦══════╦═══════╗
        ║ Video  ║Resting ║ Rest-  ║Meeting ║Kitch-║       ║
        ║Hangout ║ Area   ║ room   ║ Room   ║ en   ║       ║
  Row 6 ╠══D═════╩══D═════╩══D════╩══D═════╩══D═══╩═══════╣
        ║            HALLWAY  [board]  [spawn]              ║
  Row 9 ╠══D═════════╦══D═════════╦══D═════════╦═══════════╣
        ║  Henrik's  ║  Alice's   ║   Leo's    ║           ║
        ║  Office    ║  Office    ║   Office   ║           ║
  Row19 ╚════════════╩════════════╩════════════╩═══════════╝

  D = door
*/

export const ZONES = [
  // TOP ROW (left to right)
  { id: 'tv_area',   name: 'Video Hangout',  type: ZONE_TYPES.CHILL,    tx: 1,  ty: 1,  tw: 8,  th: 5 },
  { id: 'resting',   name: 'Resting Area',   type: ZONE_TYPES.RESTING,  tx: 10, ty: 1,  tw: 8,  th: 5 },
  { id: 'toilet',    name: 'Restroom',       type: ZONE_TYPES.TOILET,   tx: 19, ty: 1,  tw: 7,  th: 5 },
  { id: 'meeting',   name: 'Meeting Room',   type: ZONE_TYPES.MEETING,  tx: 27, ty: 1,  tw: 8,  th: 5 },
  { id: 'kitchen',   name: 'Kitchen',        type: ZONE_TYPES.KITCHEN,  tx: 36, ty: 1,  tw: 7,  th: 5 },

  // HALLWAY (horizontal band)
  { id: 'hallway',   name: 'Hallway',        type: ZONE_TYPES.HALLWAY,  tx: 1,  ty: 7,  tw: 48, th: 2 },

  // BOTTOM ROW — three equal offices
  { id: 'henrik',    name: "Henrik's Office", type: ZONE_TYPES.OFFICE,   tx: 1,  ty: 10, tw: 12, th: 9 },
  { id: 'alice',     name: "Alice's Office",  type: ZONE_TYPES.OFFICE,   tx: 14, ty: 10, tw: 12, th: 9 },
  { id: 'leo',       name: "Leo's Office",    type: ZONE_TYPES.OFFICE,   tx: 27, ty: 10, tw: 12, th: 9 },
];

export const ZONES_PX = ZONES.map(z => ({
  ...z,
  x: z.tx * TILE_SIZE,
  y: z.ty * TILE_SIZE,
  w: z.tw * TILE_SIZE,
  h: z.th * TILE_SIZE,
}));

function createMap() {
  const m = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    m[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      m[r][c] = T.FLOOR;
    }
  }

  function fill(x, y, w, h, tile) {
    for (let r = y; r < y + h && r < MAP_ROWS; r++)
      for (let c = x; c < x + w && c < MAP_COLS; c++)
        m[r][c] = tile;
  }
  function hWall(x, y, len) { fill(x, y, len, 1, T.WALL); }
  function vWall(x, y, len) { fill(x, y, 1, len, T.WALL); }

  // ========== OUTER WALLS ==========
  hWall(0, 0, MAP_COLS);
  hWall(0, MAP_ROWS - 1, MAP_COLS);
  vWall(0, 0, MAP_ROWS);
  vWall(MAP_COLS - 1, 0, MAP_ROWS);

  // ========== TOP ROW WALLS ==========
  // Bottom wall of top rooms (hallway ceiling)
  hWall(0, 6, MAP_COLS);
  // Vertical dividers between top rooms
  vWall(9,  0, 7);   // between Video & Resting
  vWall(18, 0, 7);   // between Resting & Restroom
  vWall(26, 0, 7);   // between Restroom & Meeting
  vWall(35, 0, 7);   // between Meeting & Kitchen
  vWall(43, 0, 7);   // right wall of Kitchen

  // Doors from top rooms into hallway (row 6)
  m[6][4]  = T.DOOR; m[6][5]  = T.DOOR;   // Video Hangout
  m[6][13] = T.DOOR; m[6][14] = T.DOOR;   // Resting
  m[6][22] = T.DOOR; m[6][23] = T.DOOR;   // Restroom
  m[6][30] = T.DOOR; m[6][31] = T.DOOR;   // Meeting Room
  m[6][38] = T.DOOR; m[6][39] = T.DOOR;   // Kitchen

  // ========== VIDEO HANGOUT (cols 1-8, rows 1-5) ==========
  m[2][1] = T.TV; m[3][1] = T.TV;
  fill(3, 2, 3, 1, T.COUCH);
  fill(3, 4, 3, 1, T.COUCH);
  fill(3, 3, 3, 1, T.RUG);
  m[1][7] = T.PLANT;

  // ========== RESTING AREA (cols 10-17, rows 1-5) ==========
  fill(11, 2, 3, 1, T.COUCH);
  fill(11, 4, 3, 1, T.COUCH);
  m[3][15] = T.TABLE;
  m[3][16] = T.TABLE;
  m[1][10] = T.PLANT;
  m[4][16] = T.PLANT;

  // ========== RESTROOM (cols 19-25, rows 1-5) ==========
  m[2][20] = T.TOILET_TILE;
  m[2][22] = T.TOILET_TILE;
  m[4][20] = T.COUNTER;
  m[4][22] = T.COUNTER;

  // ========== MEETING ROOM (cols 27-34, rows 1-5) ==========
  fill(29, 2, 4, 2, T.MEETING_TABLE);
  m[1][29] = T.CHAIR; m[1][31] = T.CHAIR; m[1][32] = T.CHAIR;
  m[4][29] = T.CHAIR; m[4][31] = T.CHAIR; m[4][32] = T.CHAIR;
  m[2][28] = T.CHAIR; m[3][28] = T.CHAIR;
  m[2][33] = T.CHAIR; m[3][33] = T.CHAIR;
  m[1][27] = T.PLANT;

  // ========== KITCHEN (cols 36-42, rows 1-5) ==========
  fill(37, 1, 4, 1, T.COUNTER);
  fill(41, 2, 1, 2, T.COUNTER);
  fill(38, 3, 2, 1, T.TABLE);
  m[2][38] = T.CHAIR; m[4][38] = T.CHAIR;
  m[2][39] = T.CHAIR; m[4][39] = T.CHAIR;
  m[4][36] = T.PLANT;

  // ========== HALLWAY (rows 7-8) — open space ==========
  // Planning board on the hallway top wall
  m[6][24] = T.BOARD; m[6][25] = T.BOARD; m[6][26] = T.BOARD;
  // Wait — board is on row 6 which is the wall. Let me put it on the hallway floor near the wall instead.
  // Actually the board should be a wall tile. Let me place it correctly:
  // Remove the door conflict and put board tiles in the wall
  m[6][24] = T.BOARD; m[6][25] = T.BOARD; m[6][26] = T.BOARD;
  // Hallway plants
  m[7][1] = T.PLANT;
  m[7][48] = T.PLANT;

  // ========== BOTTOM ROW WALLS ==========
  // Top wall of offices (hallway floor)
  hWall(0, 9, MAP_COLS);
  // Right wall closing off the office section
  vWall(39, 9, 11);

  // Vertical dividers between offices
  vWall(13, 9, 11);   // between Henrik & Alice
  vWall(26, 9, 11);   // between Alice & Leo

  // Doors from hallway into offices (row 9)
  m[9][6]  = T.DOOR; m[9][7]  = T.DOOR;   // Henrik
  m[9][19] = T.DOOR; m[9][20] = T.DOOR;   // Alice
  m[9][32] = T.DOOR; m[9][33] = T.DOOR;   // Leo

  // ========== HENRIK'S OFFICE (cols 1-12, rows 10-18) ==========
  // Desk + computer (against left wall)
  fill(2, 12, 2, 2, T.DESK);
  m[12][2] = T.COMPUTER;
  m[14][2] = T.CHAIR;
  // Couch on right side
  fill(9, 12, 1, 2, T.COUCH);
  fill(10, 12, 1, 2, T.COUCH);
  // Plants
  m[10][1]  = T.PLANT;
  m[10][11] = T.PLANT;
  m[17][1]  = T.PLANT;
  // Rug in middle
  fill(5, 13, 3, 2, T.RUG);

  // ========== ALICE'S OFFICE (cols 14-25, rows 10-18) ==========
  fill(15, 12, 2, 2, T.DESK);
  m[12][15] = T.COMPUTER;
  m[14][15] = T.CHAIR;
  // Couch
  fill(22, 12, 1, 2, T.COUCH);
  fill(23, 12, 1, 2, T.COUCH);
  // Plants
  m[10][14] = T.PLANT;
  m[10][24] = T.PLANT;
  m[17][14] = T.PLANT;
  // Rug
  fill(18, 13, 3, 2, T.RUG);

  // ========== LEO'S OFFICE (cols 27-38, rows 10-18) ==========
  fill(28, 12, 2, 2, T.DESK);
  m[12][28] = T.COMPUTER;
  m[14][28] = T.CHAIR;
  // Couch
  fill(35, 12, 1, 2, T.COUCH);
  fill(36, 12, 1, 2, T.COUCH);
  // Plants
  m[10][27] = T.PLANT;
  m[10][37] = T.PLANT;
  m[17][27] = T.PLANT;
  // Rug
  fill(31, 13, 3, 2, T.RUG);

  // ========== RIGHT OPEN AREA (cols 40-48, rows 10-18) ==========
  // Leave this as open floor / extra hallway space
  m[10][44] = T.PLANT;
  m[17][44] = T.PLANT;

  return m;
}

export const tileMap = createMap();

export function isSolid(col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return true;
  return SOLID_TILES.has(tileMap[row][col]);
}

export function getTile(col, row) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return T.WALL;
  return tileMap[row][col];
}

export function drawMap(ctx, camera) {
  const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endCol = Math.min(MAP_COLS, Math.ceil((camera.x + camera.w) / TILE_SIZE) + 1);
  const endRow = Math.min(MAP_ROWS, Math.ceil((camera.y + camera.h) / TILE_SIZE) + 1);

  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const tile = tileMap[r][c];
      const x = c * TILE_SIZE - camera.x;
      const y = r * TILE_SIZE - camera.y;
      const colors = TILE_COLORS[tile];
      if (!colors) continue;

      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      switch (tile) {
        case T.FLOOR:
          ctx.strokeStyle = colors.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          break;
        case T.WALL:
          ctx.fillStyle = colors.highlight;
          ctx.fillRect(x, y + TILE_SIZE / 2 - 1, TILE_SIZE, 2);
          ctx.fillRect(x + TILE_SIZE / 2 - 1, y, 2, TILE_SIZE);
          break;
        case T.DOOR:
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 2, y, 2, TILE_SIZE);
          ctx.fillRect(x + TILE_SIZE - 4, y, 2, TILE_SIZE);
          break;
        case T.DESK:
          ctx.fillStyle = colors.top;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 4);
          break;
        case T.CHAIR:
          ctx.fillStyle = colors.seat;
          ctx.fillRect(x + 8, y + 8, 16, 16);
          ctx.fillRect(x + 10, y + 4, 12, 6);
          break;
        case T.TABLE:
          ctx.fillStyle = colors.surface;
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.strokeStyle = colors.fill;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          break;
        case T.COUCH:
          ctx.fillStyle = colors.cushion;
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 2, y + 2, 4, TILE_SIZE - 4);
          ctx.fillRect(x + TILE_SIZE - 6, y + 2, 4, TILE_SIZE - 4);
          break;
        case T.TV:
          ctx.fillStyle = colors.screen;
          ctx.fillRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
          ctx.fillStyle = '#ff3333';
          ctx.fillRect(x + TILE_SIZE - 8, y + TILE_SIZE - 8, 3, 3);
          break;
        case T.COMPUTER:
          ctx.fillStyle = colors.screen;
          ctx.fillRect(x + 6, y + 4, TILE_SIZE - 12, TILE_SIZE - 12);
          ctx.fillStyle = '#4488ff';
          ctx.fillRect(x + 8, y + 6, TILE_SIZE - 16, TILE_SIZE - 16);
          ctx.fillStyle = '#444';
          ctx.fillRect(x + 10, y + TILE_SIZE - 10, TILE_SIZE - 20, 6);
          break;
        case T.MEETING_TABLE:
          ctx.fillStyle = colors.surface;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.strokeStyle = '#5a3e22';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          break;
        case T.BOARD:
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.strokeStyle = colors.border;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.fillStyle = colors.pin;
          ctx.fillRect(x + 8, y + 8, 3, 3);
          ctx.fillRect(x + 20, y + 8, 3, 3);
          ctx.fillStyle = '#3498db';
          ctx.fillRect(x + 8, y + 18, 3, 3);
          ctx.fillRect(x + 20, y + 18, 3, 3);
          ctx.fillStyle = '#ffe0b2';
          ctx.fillRect(x + 6, y + 12, 8, 5);
          ctx.fillStyle = '#b2ebf2';
          ctx.fillRect(x + 17, y + 12, 8, 5);
          break;
        case T.COUNTER:
          ctx.fillStyle = colors.top;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 2, y + TILE_SIZE - 6, TILE_SIZE - 4, 4);
          break;
        case T.TOILET_TILE:
          ctx.fillStyle = colors.accent;
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + 8, y + 6, TILE_SIZE - 16, TILE_SIZE - 14);
          break;
        case T.PLANT:
          ctx.fillStyle = colors.pot;
          ctx.fillRect(x + 10, y + 20, 12, 10);
          ctx.fillRect(x + 8, y + 18, 16, 4);
          ctx.fillStyle = colors.fill;
          ctx.beginPath();
          ctx.arc(x + 16, y + 14, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1a7a3a';
          ctx.beginPath();
          ctx.arc(x + 12, y + 11, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + 20, y + 11, 5, 0, Math.PI * 2);
          ctx.fill();
          break;
        case T.RUG:
          ctx.fillStyle = colors.border;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
          break;
      }
    }
  }
}

export function drawZoneLabels(ctx, camera) {
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';

  for (const z of ZONES_PX) {
    if (z.type === ZONE_TYPES.HALLWAY) continue;

    const cx = z.x + z.w / 2 - camera.x;
    const cy = z.y + 18 - camera.y;

    if (cx < -100 || cx > camera.w + 100 || cy < -20 || cy > camera.h + 20) continue;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const textW = ctx.measureText(z.name).width;
    ctx.fillRect(cx - textW / 2 - 6, cy - 10, textW + 12, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(z.name, cx, cy);
  }
}

export function isBoardNearby(px, py) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (getTile(col + dc, row + dr) === T.BOARD) return true;
    }
  }
  return false;
}
