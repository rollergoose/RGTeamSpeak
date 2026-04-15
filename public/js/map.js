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
  // TOP ROW — utility rooms
  { id: 'tv_area',   name: 'Video Hangout',  type: ZONE_TYPES.CHILL,    tx: 1,  ty: 1,  tw: 8,  th: 5 },
  { id: 'resting',   name: 'Resting Area',   type: ZONE_TYPES.RESTING,  tx: 10, ty: 1,  tw: 8,  th: 5 },
  { id: 'toilet',    name: 'Restroom',       type: ZONE_TYPES.TOILET,   tx: 19, ty: 1,  tw: 7,  th: 5 },
  { id: 'kitchen',   name: 'Kitchen',        type: ZONE_TYPES.KITCHEN,  tx: 27, ty: 1,  tw: 8,  th: 5 },
  { id: 'archives',  name: 'Archives',       type: ZONE_TYPES.ARCHIVES, tx: 36, ty: 1,  tw: 6,  th: 5 },

  // HALLWAY
  { id: 'hallway',   name: 'Hallway',        type: ZONE_TYPES.HALLWAY,  tx: 1,  ty: 7,  tw: 48, th: 2 },

  // BOTTOM ROW — 3 offices (6x6 interior = 8x8 with walls) + meeting room
  { id: 'henrik',    name: "Henrik's Office", type: ZONE_TYPES.OFFICE,   tx: 1,  ty: 10, tw: 6,  th: 6 },
  { id: 'alice',     name: "Alice's Office",  type: ZONE_TYPES.OFFICE,   tx: 8,  ty: 10, tw: 6,  th: 6 },
  { id: 'leo',       name: "Leo's Office",    type: ZONE_TYPES.OFFICE,   tx: 15, ty: 10, tw: 6,  th: 6 },
  { id: 'meeting',   name: 'Meeting Room',   type: ZONE_TYPES.MEETING,  tx: 22, ty: 10, tw: 10, th: 6 },

  // OUTSIDE AREA
  { id: 'outside',   name: 'Outside',        type: ZONE_TYPES.HALLWAY,  tx: 33, ty: 10, tw: 16, th: 6 },
  { id: 'sidewalk',  name: 'Sidewalk',       type: ZONE_TYPES.HALLWAY,  tx: 1,  ty: 18, tw: 48, th: 2 },
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

  // ========== TOP ROW — utility rooms ==========
  hWall(0, 6, MAP_COLS);
  vWall(9,  0, 7);
  vWall(18, 0, 7);
  vWall(26, 0, 7);
  vWall(35, 0, 7);
  vWall(42, 0, 7);

  // Doors into hallway (row 6)
  m[6][4]  = T.DOOR; m[6][5]  = T.DOOR;   // Video
  m[6][13] = T.DOOR; m[6][14] = T.DOOR;   // Resting
  m[6][22] = T.DOOR; m[6][23] = T.DOOR;   // Restroom
  m[6][30] = T.DOOR; m[6][31] = T.DOOR;   // Kitchen
  m[6][38] = T.DOOR; m[6][39] = T.DOOR;   // Archives

  // Video Hangout
  m[2][1] = T.TV; m[3][1] = T.TV;
  fill(3, 2, 3, 1, T.COUCH); fill(3, 4, 3, 1, T.COUCH);
  fill(3, 3, 3, 1, T.RUG); m[1][7] = T.PLANT;

  // Resting
  fill(11, 2, 3, 1, T.COUCH); fill(11, 4, 3, 1, T.COUCH);
  m[3][15] = T.TABLE; m[3][16] = T.TABLE; m[1][10] = T.PLANT;

  // Restroom — split into His & Hers with wall at col 22
  vWall(22, 0, 7);
  // Her side (cols 19-21): 3 toilets on top, 3 sinks on bottom
  m[1][19] = T.TOILET_TILE; m[1][20] = T.TOILET_TILE; m[1][21] = T.TOILET_TILE;
  m[4][19] = T.COUNTER; m[4][20] = T.COUNTER; m[4][21] = T.COUNTER;
  // His side (cols 23-25): 3 toilets on top, 3 sinks on bottom
  m[1][23] = T.TOILET_TILE; m[1][24] = T.TOILET_TILE; m[1][25] = T.TOILET_TILE;
  m[4][23] = T.COUNTER; m[4][24] = T.COUNTER; m[4][25] = T.COUNTER;

  // Kitchen — horizontal table with chairs, 1 tile free around
  fill(28, 1, 4, 1, T.COUNTER); fill(33, 1, 1, 3, T.COUNTER);
  fill(29, 3, 3, 1, T.TABLE); // horizontal table
  m[2][29] = T.CHAIR; m[2][30] = T.CHAIR; m[2][31] = T.CHAIR; // chairs above
  m[4][29] = T.CHAIR; m[4][30] = T.CHAIR; m[4][31] = T.CHAIR; // chairs below
  m[1][27] = T.PLANT;

  // Archives
  m[1][36] = T.DESK; m[1][37] = T.DESK; m[1][38] = T.DESK; m[1][39] = T.DESK;
  m[2][40] = T.DESK; m[3][40] = T.DESK;
  m[3][37] = T.TABLE; m[4][37] = T.CHAIR; m[2][36] = T.PLANT;

  // ========== HALLWAY (rows 7-8) ==========
  // Planning board on wall
  m[6][16] = T.BOARD; m[6][17] = T.BOARD; m[6][18] = T.BOARD;
  m[7][1] = T.PLANT; m[7][48] = T.PLANT;

  // ========== BOTTOM ROW — offices (6x6 interior) + meeting room ==========
  hWall(0, 9, MAP_COLS);

  // Henrik's Office (cols 1-6, rows 10-15) — walls around 6x6
  vWall(7, 9, 8);
  m[9][3] = T.DOOR; m[9][4] = T.DOOR;
  m[10][6] = T.BOARD; // notice board

  // Alice's Office (cols 8-13)
  vWall(14, 9, 8);
  m[9][10] = T.DOOR; m[9][11] = T.DOOR;
  m[10][13] = T.BOARD;

  // Leo's Office (cols 15-20)
  vWall(21, 9, 8);
  m[9][17] = T.DOOR; m[9][18] = T.DOOR;
  m[10][20] = T.BOARD;

  // Meeting Room (cols 22-31, rows 10-15)
  vWall(32, 9, 8);
  m[9][25] = T.DOOR; m[9][26] = T.DOOR;
  // Meeting table + chairs (centered with 1 tile gap all around)
  fill(24, 12, 4, 2, T.MEETING_TABLE);
  m[11][24] = T.CHAIR; m[11][26] = T.CHAIR; m[11][27] = T.CHAIR;
  m[14][24] = T.CHAIR; m[14][26] = T.CHAIR; m[14][27] = T.CHAIR;
  m[12][23] = T.CHAIR; m[13][23] = T.CHAIR;
  m[12][28] = T.CHAIR; m[13][28] = T.CHAIR;
  m[10][22] = T.PLANT; m[10][30] = T.PLANT;

  // ========== OUTSIDE YARD (cols 33-48, rows 10-17) ==========
  m[9][34] = T.DOOR; m[9][35] = T.DOOR;
  fill(33, 10, 17, 8, T.GRASS);
  fill(33, 10, 2, 8, T.SIDEWALK); // path from building door down to sidewalk
  // No fence — open yard
  // Picnic blankets
  fill(37, 11, 2, 2, T.RUG); fill(42, 13, 2, 2, T.RUG);
  m[11][40] = T.PLANT; m[14][45] = T.PLANT; m[12][47] = T.PLANT;

  // ========== BOTTOM WALL with windows ==========
  hWall(0, 16, 33);
  // Henrik windows (evenly: 2, 4)
  m[16][2] = T.WINDOW; m[16][4] = T.WINDOW;
  // Alice windows
  m[16][9] = T.WINDOW; m[16][11] = T.WINDOW;
  // Leo windows
  m[16][16] = T.WINDOW; m[16][18] = T.WINDOW;
  // Meeting windows
  m[16][24] = T.WINDOW; m[16][26] = T.WINDOW; m[16][28] = T.WINDOW;

  hWall(0, 17, 33);

  // ========== SIDEWALK + STREET ==========
  fill(0, 18, MAP_COLS, 2, T.SIDEWALK);
  fill(0, 20, MAP_COLS, 3, T.STREET);
  fill(0, 23, MAP_COLS, 1, T.GRASS);

  // Bus stop on the sidewalk near the yard entrance
  m[18][38] = T.COUNTER; // bus stop bench
  m[18][39] = T.COUNTER;
  m[17][39] = T.BUS_SIGN; // yellow bus stop sign

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
        case T.STREET:
          ctx.fillStyle = colors.line;
          ctx.fillRect(x, y + TILE_SIZE / 2 - 1, TILE_SIZE, 2);
          break;
        case T.SIDEWALK:
          ctx.strokeStyle = colors.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          break;
        case T.GRASS:
          // Random grass tufts
          ctx.fillStyle = colors.dark;
          const seed = (c * 7 + r * 13) % 5;
          if (seed < 3) { ctx.fillRect(x + 8 + seed * 4, y + 10, 2, 6); }
          if (seed < 2) { ctx.fillRect(x + 20, y + 16, 2, 5); }
          break;
        case T.FENCE:
          ctx.fillStyle = colors.post;
          ctx.fillRect(x + 13, y, 6, TILE_SIZE);
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 2, y + 6, TILE_SIZE - 4, 4);
          ctx.fillRect(x + 2, y + 20, TILE_SIZE - 4, 4);
          break;
        case T.BUS_SIGN:
          // Yellow bus stop sign with gray pole
          ctx.fillStyle = '#888';
          ctx.fillRect(x + 14, y + 12, 4, 20); // pole
          ctx.fillStyle = colors.fill; // yellow
          ctx.fillRect(x + 6, y + 2, 20, 12);
          ctx.strokeStyle = colors.frame; // gray outline
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 6, y + 2, 20, 12);
          // BUS text
          ctx.fillStyle = '#333';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('BUS', x + 16, y + 10);
          break;
        case T.WINDOW:
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.strokeStyle = colors.frame;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.strokeStyle = colors.frame;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 16, y + 28); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 4, y + 16); ctx.lineTo(x + 28, y + 16); ctx.stroke();
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

// Check if near an office notice board, return the office id
export function getOfficeBoardNearby(px, py) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  // Office board positions match map: Henrik (6,10), Alice (13,10), Leo (20,10)
  const boards = { '6,10': 'henrik', '13,10': 'alice', '20,10': 'leo' };
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const key = (col + dc) + ',' + (row + dr);
      if (boards[key]) return { officeId: boards[key], zoneName: ZONES.find(z => z.id === boards[key])?.name || boards[key] };
    }
  }
  return null;
}

// Only detects the HALLWAY planning board (row 6), not office notice boards (row 10)
export function isBoardNearby(px, py) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  // Planning board is at row 6 — only match boards in rows 5-7
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 5 && r <= 7 && getTile(c, r) === T.BOARD) return true;
    }
  }
  return false;
}
