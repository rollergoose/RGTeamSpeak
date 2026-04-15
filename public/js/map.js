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
  { id: 'archives',  name: 'Archives',       type: ZONE_TYPES.ARCHIVES, tx: 44, ty: 1,  tw: 5,  th: 5 },

  // HALLWAY (horizontal band)
  { id: 'hallway',   name: 'Hallway',        type: ZONE_TYPES.HALLWAY,  tx: 1,  ty: 7,  tw: 48, th: 2 },

  // BOTTOM ROW — three equal offices
  { id: 'henrik',    name: "Henrik's Office", type: ZONE_TYPES.OFFICE,   tx: 1,  ty: 10, tw: 12, th: 9 },
  { id: 'alice',     name: "Alice's Office",  type: ZONE_TYPES.OFFICE,   tx: 14, ty: 10, tw: 12, th: 9 },
  { id: 'leo',       name: "Leo's Office",    type: ZONE_TYPES.OFFICE,   tx: 27, ty: 10, tw: 12, th: 9 },

  // OUTSIDE AREA (bottom right — sidewalk + grass area)
  { id: 'outside',   name: 'Outside',        type: ZONE_TYPES.HALLWAY,  tx: 40, ty: 10, tw: 9,  th: 9 },
  // Sidewalk corridor at bottom
  { id: 'sidewalk',  name: 'Sidewalk',       type: ZONE_TYPES.HALLWAY,  tx: 1,  ty: 21, tw: 48, th: 2 },
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

  // ========== ARCHIVES (cols 44-48, rows 1-5) ==========
  // Left wall (shared with kitchen's right wall area)
  vWall(43, 0, 7);  // already exists as kitchen right wall — reinforce
  // Door from archives to hallway
  m[6][46] = T.DOOR; m[6][47] = T.DOOR;
  // Bookshelves along walls (representing stored records)
  m[1][44] = T.DESK; m[1][45] = T.DESK; m[1][46] = T.DESK; m[1][47] = T.DESK;
  m[2][48] = T.DESK;
  m[3][48] = T.DESK;
  // Reading desk
  m[3][45] = T.TABLE;
  m[4][45] = T.CHAIR;
  m[2][44] = T.PLANT;

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

  // ========== OFFICES ARE EMPTY — players furnish them with the placement system ==========
  // Henrik's Office (cols 1-12, rows 10-18) — empty
  // Alice's Office (cols 14-25, rows 10-18) — empty
  // Leo's Office (cols 27-38, rows 10-18) — empty

  // ========== OUTSIDE YARD (cols 40-48, rows 10-27) ==========
  // This is the entrance/yard — no building walls, just fence on edges
  // Door from hallway to yard
  vWall(39, 9, 2); // short wall above door
  m[9][41] = T.DOOR; m[9][42] = T.DOOR; // door from hallway
  vWall(39, 12, 8); // wall below door (office wall continues)

  // Yard is grass + sidewalk, fence on right and bottom
  fill(40, 10, 9, 9, T.GRASS);       // grass yard
  fill(40, 10, 2, 9, T.SIDEWALK);    // path from door
  // Fence on right edge
  for (let r = 10; r < 19; r++) m[r][49] = T.FENCE;
  // Fence on bottom of yard
  for (let c = 40; c < 49; c++) m[19][c] = T.FENCE;
  // Remove outer walls in the yard area (replace with open/fence)
  for (let r = 10; r < 19; r++) m[r][MAP_COLS - 1] = T.FENCE;

  // Picnic blankets on grass
  fill(44, 12, 2, 2, T.RUG);  // picnic blanket 1
  fill(46, 15, 2, 2, T.RUG);  // picnic blanket 2
  // Plants and decoration
  m[11][43] = T.PLANT;
  m[16][47] = T.PLANT;
  m[14][45] = T.PLANT;

  // ========== BOTTOM WALL with evenly spaced windows ==========
  hWall(0, 19, 39); // bottom wall of offices (up to yard)

  // Henrik's windows (cols 1-12, evenly at 3, 5, 7, 9)
  m[19][3] = T.WINDOW; m[19][5] = T.WINDOW; m[19][7] = T.WINDOW; m[19][9] = T.WINDOW;
  // Alice's windows (cols 14-25, evenly at 16, 18, 20, 22)
  m[19][16] = T.WINDOW; m[19][18] = T.WINDOW; m[19][20] = T.WINDOW; m[19][22] = T.WINDOW;
  // Leo's windows (cols 27-38, evenly at 29, 31, 33, 35)
  m[19][29] = T.WINDOW; m[19][31] = T.WINDOW; m[19][33] = T.WINDOW; m[19][35] = T.WINDOW;

  // ========== LOWER BUILDING WALL (row 20) ==========
  hWall(0, 20, 40);

  // ========== SIDEWALK (row 21-22) ==========
  fill(0, 21, 40, 2, T.SIDEWALK);  // sidewalk only in front of building
  fill(40, 20, 9, 3, T.GRASS);     // yard continues down

  // ========== STREET (rows 23-25) ==========
  fill(0, 23, 40, 3, T.STREET);
  fill(40, 23, 9, 3, T.GRASS);     // grass continues beside street
  // Road markings
  for (let c = 2; c < 40; c += 4) {
    m[24][c] = T.FLOOR;
  }

  // ========== BOTTOM SIDEWALK + GRASS (rows 26-27) ==========
  fill(0, 26, 40, 1, T.SIDEWALK);
  fill(0, 27, 40, 1, T.GRASS);
  fill(40, 26, 9, 2, T.GRASS);     // more yard grass
  // Fence along the very bottom
  for (let c = 40; c < 49; c++) m[27][c] = T.FENCE;
  // More picnic blankets outside
  fill(42, 24, 2, 2, T.RUG);
  m[25][46] = T.PLANT;
  m[21][44] = T.PLANT;

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
