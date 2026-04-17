import { T, TILE_SIZE, MAP_COLS, MAP_ROWS, TILE_COLORS, SOLID_TILES, ZONE_TYPES } from './constants.js';

// Tiles that are visual overlays rather than full-tile terrain — they should render on top
// of their natural ground (grass for park/yard, sidewalk for street furniture) instead of
// painting the whole 32×32 cell with the item's fill color. Without this, a bus sign looks
// like a yellow square, an agility hoop is a red square, a grill is a black square, etc.
const OVERLAY_BASE = {
  [T.BUS_SIGN]:       T.SIDEWALK,
  [T.STREETLIGHT]:    T.SIDEWALK,
  [T.AGILITY_HOOP]:   T.GRASS,
  [T.AGILITY_TUNNEL]: T.GRASS,
  [T.AGILITY_JUMP]:   T.GRASS,
  [T.DOG_BONE]:       T.GRASS,
  [T.FRISBEE]:        T.GRASS,
  [T.BBQ_GRILL]:      T.GRASS,
  [T.PARK_BENCH]:     T.GRASS,
};

/*
  OFFICE LAYOUT v6 — 50 cols x 35 rows
  Same office on top, 3 wall-to-wall venues across the street, small park east.

  Cols span 0-49. Buildings on south side fit within cols 0-32 (same width as
  the office building above). Cols 33-49 south of the road become a small grass
  park (bounded by walls so player can't escape).

  Col:   0    5    10   15   20   25   30   35   40   45  49
  Row 0  ╔════════╦════════╦════════╦════════╦══════╦═══════╗
         ║ Video  ║Resting ║ Rest-  ║Meeting ║Kitch-║       ║
         ║Hangout ║ Area   ║ room   ║ Room   ║ en   ║       ║
  Row 6  ╠══D═════╩══D═════╩══D════╩══D═════╩══D═══╩═══════╣
         ║            HALLWAY  [board]  [spawn]              ║
  Row 9  ╠══D═════════╦══D═════════╦══D═════════╦═══════════╣
         ║  Henrik's  ║  Alice's   ║   Leo's    ║   Yard +  ║
         ║  Office    ║  Office    ║   Office   ║   bus stop║
  Row17  ╠════════════╩════════════╩════════════╝══════════ ║
  Row18  ║ ─── north sidewalk ─────── bus stop ───────────── ║
  Row20  ║ ─── street ────────── [XW] ────────────────────── ║
  Row23  ║ ─── south sidewalk ─────────────────────────────── ║
  Row25  ║════D═══╦═══D═══╦═══D═══╗ . . . . . . . . . . . . ║
         ║  Gym   ║Grocer.║Cinema ║         park grass        ║
  Row33  ║════════╩═══════╩═══════╝ . . . . . . . . . . . . ║
  Row34  ╚════════════════════════════════════════════════════╝

  D = door, XW = crosswalk (cols 33-34, lines up with yard exit & bus stop)
  Cinema right wall at col 33; cols 34-48 row 25-33 = grass park.
*/

export const ZONES = [
  // TOP ROW (left to right)
  // TOP ROW — utility rooms
  { id: 'tv_area',   name: 'Video Hangout',  type: ZONE_TYPES.CHILL,    tx: 1,  ty: 1,  tw: 8,  th: 5 },
  { id: 'resting',   name: 'Resting Area',   type: ZONE_TYPES.RESTING,  tx: 10, ty: 1,  tw: 8,  th: 5 },
  { id: 'toilet',    name: 'Restroom',       type: ZONE_TYPES.TOILET,   tx: 19, ty: 1,  tw: 7,  th: 5 },
  { id: 'kitchen',   name: 'Kitchen',        type: ZONE_TYPES.KITCHEN,  tx: 27, ty: 1,  tw: 8,  th: 5 },
  { id: 'archives',  name: 'Archives',       type: ZONE_TYPES.ARCHIVES, tx: 36, ty: 1,  tw: 6,  th: 5 },
  { id: 'gaming',    name: '🎮 Gaming Room', type: ZONE_TYPES.GAMING,   tx: 43, ty: 1,  tw: 6,  th: 5 },

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

  // ACROSS THE STREET — 3 wall-to-wall venues within cols 0-32 (same width as office)
  { id: 'gym',       name: '🏋️ Gym',             type: ZONE_TYPES.GYM,      tx: 1,  ty: 26, tw: 10, th: 7 },
  { id: 'grocery',   name: '🛒 Groceries Store', type: ZONE_TYPES.GROCERY,  tx: 12, ty: 26, tw: 10, th: 7 },
  { id: 'cinema',    name: '🎬 Cinema',          type: ZONE_TYPES.CINEMA,   tx: 23, ty: 26, tw: 10, th: 7 },

  // East of cinema — fenced dog park
  { id: 'dogpark',   name: '🐕 Dog Park',        type: ZONE_TYPES.DOGPARK,  tx: 35, ty: 25, tw: 13, th: 9 },
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
  m[6][20] = T.DOOR; m[6][24] = T.DOOR;   // Restroom (one door per side)
  m[6][30] = T.DOOR; m[6][31] = T.DOOR;   // Kitchen
  m[6][38] = T.DOOR; m[6][39] = T.DOOR;   // Archives
  m[6][45] = T.DOOR; m[6][46] = T.DOOR;   // Gaming Room

  // Video Hangout
  m[2][1] = T.TV; m[3][1] = T.TV;
  fill(3, 2, 3, 1, T.COUCH); fill(3, 4, 3, 1, T.COUCH);
  fill(3, 3, 3, 1, T.RUG); m[1][7] = T.PLANT;

  // Resting
  fill(11, 2, 3, 1, T.COUCH); fill(11, 4, 3, 1, T.COUCH);
  m[3][15] = T.TABLE; m[3][16] = T.TABLE; m[1][10] = T.PLANT;
  // Wardrobe against the back wall — walk to it + press E to open customization
  m[1][14] = T.WARDROBE;

  // Restroom — split into His & Hers with wall at col 22
  vWall(22, 0, 7);
  // Her side (cols 19-21): toilets along left wall, sinks along right wall
  m[1][19] = T.TOILET_TILE; m[2][19] = T.TOILET_TILE; m[3][19] = T.TOILET_TILE;
  m[1][21] = T.COUNTER; m[2][21] = T.COUNTER; m[3][21] = T.COUNTER;
  // His side (cols 23-25): toilets along right wall, sinks along left wall
  m[1][25] = T.TOILET_TILE; m[2][25] = T.TOILET_TILE; m[3][25] = T.TOILET_TILE;
  m[1][23] = T.COUNTER; m[2][23] = T.COUNTER; m[3][23] = T.COUNTER;

  // Kitchen — L-shaped counter on right, table shifted left
  // Counter L-form: against the right wall
  fill(33, 1, 2, 1, T.COUNTER); // top right against wall
  m[2][34] = T.COUNTER; m[3][34] = T.COUNTER; m[4][34] = T.COUNTER; // right wall down
  // Table 1 step left — donut box on left end, pizza box on right end
  fill(28, 3, 3, 1, T.TABLE);
  m[3][28] = T.DONUT_BOX_TILE;
  m[3][30] = T.PIZZA_BOX_TILE;
  m[2][28] = T.CHAIR; m[2][29] = T.CHAIR; m[2][30] = T.CHAIR;
  m[4][28] = T.CHAIR; m[4][29] = T.CHAIR; m[4][30] = T.CHAIR;
  m[1][27] = T.PLANT;

  // Archives
  m[1][36] = T.DESK; m[1][37] = T.DESK; m[1][38] = T.DESK; m[1][39] = T.DESK;
  m[2][40] = T.DESK; m[3][40] = T.DESK;
  m[3][37] = T.TABLE; m[4][37] = T.CHAIR; m[2][36] = T.PLANT;

  // ========== GAMING ROOM (cols 43-48, rows 1-5) ==========
  // Dark-purple carpet floor for the whole room.
  fill(43, 1, 6, 5, T.GAMING_FLOOR);
  // 4 gaming PCs across the back wall, each with a chair below it
  m[1][43] = T.GAMING_PC; m[1][44] = T.GAMING_PC; m[1][45] = T.GAMING_PC; m[1][46] = T.GAMING_PC;
  m[2][43] = T.CHAIR;    m[2][44] = T.CHAIR;    m[2][45] = T.CHAIR;    m[2][46] = T.CHAIR;
  // Plant in the far corner
  m[1][48] = T.PLANT;
  // Console gaming area — TV + console stand facing a couch across a rug
  m[4][43] = T.TV;
  m[4][44] = T.GAMING_CONSOLE;
  // Rug between the TV and the couch
  m[5][43] = T.RUG; m[5][44] = T.RUG;
  // Couch facing the TV
  m[4][47] = T.COUCH; m[4][48] = T.COUCH;
  m[5][47] = T.COUCH; m[5][48] = T.COUCH;

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
  // BBQ grill in the yard — between the two picnic blankets, on the grass.
  m[13][40] = T.BBQ_GRILL;

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
  // Use cols 1..MAP_COLS-2 so the outer left/right walls (col 0 and col 49) stay intact.
  fill(1, 18, MAP_COLS - 2, 2, T.SIDEWALK);        // north sidewalk
  fill(1, 20, MAP_COLS - 2, 3, T.STREET);          // street (3 rows)
  fill(33, 20, 2, 3, T.CROSSWALK);                 // crosswalk lined up with yard exit + bus stop
  fill(1, 23, MAP_COLS - 2, 2, T.SIDEWALK);        // south sidewalk

  // Bus stop on the sidewalk near the yard entrance
  m[18][38] = T.COUNTER; // bus stop bench
  m[18][39] = T.COUNTER;
  m[17][39] = T.BUS_SIGN; // yellow bus stop sign

  // Streetlights along both sidewalks. Cols avoid building doors (5-6, 16-17, 27-28),
  // crosswalk landing (33-34), bus stop (38-39), and dog park gate (35-36).
  const streetlightCols = [3, 12, 20, 25, 31, 44];
  for (const c of streetlightCols) {
    m[18][c] = T.STREETLIGHT; // north sidewalk
    m[24][c] = T.STREETLIGHT; // south sidewalk
  }

  // ========== ACROSS THE STREET — Gym / Groceries / Cinema ==========
  // 3 wall-to-wall buildings within cols 0-32 (same width as office above).
  // Outer wall col 0 (existing) is the gym's left wall.
  // Shared walls at col 11 and col 22. Cinema's right wall: col 33.
  // Interior rows 26-32 (7 tall). Tops at row 25 (with doors), bottoms at row 33.
  hWall(1, 25, 32);                                 // top wall row 25, cols 1-32
  hWall(1, 33, 32);                                 // bottom wall row 33, cols 1-32
  vWall(11, 25, 9);                                 // shared wall: gym/grocery
  vWall(22, 25, 9);                                 // shared wall: grocery/cinema
  vWall(33, 25, 9);                                 // cinema right wall

  // ---- Gym (interior cols 1-10, rows 26-32) ----
  m[25][5] = T.DOOR; m[25][6] = T.DOOR;
  fill(1, 26, 10, 7, T.GYM_FLOOR);                  // dark rubber floor
  // Treadmills along back wall (row 32)
  m[32][2] = T.TREADMILL; m[32][4] = T.TREADMILL; m[32][7] = T.TREADMILL; m[32][9] = T.TREADMILL;
  // Weight benches in middle
  m[29][3] = T.WEIGHT_BENCH; m[29][8] = T.WEIGHT_BENCH;
  // Dumbbell racks against side walls
  m[27][1] = T.DUMBBELL; m[28][1] = T.DUMBBELL;
  m[27][10] = T.DUMBBELL; m[28][10] = T.DUMBBELL;

  // ---- Groceries Store (interior cols 12-21, rows 26-32) ----
  m[25][16] = T.DOOR; m[25][17] = T.DOOR;
  fill(12, 26, 10, 7, T.GROCERY_FLOOR);             // white tile floor
  // Cashier counter near the door (with person)
  m[27][13] = T.CASHIER;
  m[27][14] = T.CASHIER;
  // Vertical shelf aisles
  fill(14, 29, 1, 3, T.SHELF);                      // shelf 1
  fill(17, 29, 1, 3, T.SHELF);                      // shelf 2
  fill(20, 29, 1, 3, T.SHELF);                      // shelf 3
  // End-cap displays
  m[32][13] = T.SHELF; m[32][14] = T.SHELF; m[32][15] = T.SHELF;
  m[32][19] = T.SHELF; m[32][20] = T.SHELF; m[32][21] = T.SHELF;

  // ---- Cinema (interior cols 23-32, rows 26-32) ----
  m[25][27] = T.DOOR; m[25][28] = T.DOOR;
  fill(23, 26, 10, 7, T.CINEMA_FLOOR);              // black floor
  // Screen on back wall + drapes flanking it
  m[32][26] = T.DRAPE; m[32][27] = T.DRAPE;
  m[32][28] = T.CINEMA_SCREEN; m[32][29] = T.CINEMA_SCREEN;
  m[32][30] = T.DRAPE; m[32][31] = T.DRAPE;
  // 2 rows of cinema seats facing the screen (with center aisle at col 27-28)
  m[29][24] = T.CINEMA_SEAT; m[29][25] = T.CINEMA_SEAT; m[29][26] = T.CINEMA_SEAT;
  m[29][29] = T.CINEMA_SEAT; m[29][30] = T.CINEMA_SEAT; m[29][31] = T.CINEMA_SEAT;
  m[30][24] = T.CINEMA_SEAT; m[30][25] = T.CINEMA_SEAT; m[30][26] = T.CINEMA_SEAT;
  m[30][29] = T.CINEMA_SEAT; m[30][30] = T.CINEMA_SEAT; m[30][31] = T.CINEMA_SEAT;

  // ========== EAST DOG PARK (cols 34-48, rows 25-33) ==========
  // Fully grass — bounded by cinema right wall (col 33), outer wall (col 49 + row 34),
  // and a wooden fence row along row 25 with a gate-opening at col 35 from the south sidewalk.
  fill(34, 25, 15, 9, T.GRASS);
  // North fence (row 25) — gate gap at cols 35-36 to enter from the sidewalk
  for (let c = 34; c <= 48; c++) {
    if (c === 35 || c === 36) continue;
    m[25][c] = T.PARK_FENCE;
  }
  // Agility gear arranged across the lawn (walkable hoop, walkable jump, solid tunnel)
  m[28][37] = T.AGILITY_HOOP;
  m[31][38] = T.AGILITY_JUMP;
  m[29][41] = T.AGILITY_TUNNEL; m[29][42] = T.AGILITY_TUNNEL;
  m[32][45] = T.AGILITY_HOOP;
  m[27][45] = T.AGILITY_JUMP;
  // Toys on the grass
  m[30][36] = T.DOG_BONE;
  m[27][43] = T.FRISBEE;
  m[33 - 1][47] = T.DOG_BONE; // m[32][47]
  // A couple of trees for shade
  m[26][39] = T.PLANT; m[33 - 1][40] = T.PLANT; // m[32][40]
  // Park bench for the watchers (grill moved to the yard east of the office)
  m[28][47] = T.PARK_BENCH;

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

      // If this tile is an overlay (bus sign, streetlight, agility gear, grill, bench, bone…),
      // paint the natural ground first so the item visibly sits on grass/sidewalk.
      const baseTile = OVERLAY_BASE[tile];
      if (baseTile) {
        const base = TILE_COLORS[baseTile];
        ctx.fillStyle = base.fill;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        // Replicate the base tile's detail (grass tufts / sidewalk grid) so it blends in.
        if (baseTile === T.GRASS) {
          ctx.fillStyle = base.dark;
          const seed = (c * 7 + r * 13) % 5;
          if (seed < 3) ctx.fillRect(x + 8 + seed * 4, y + 10, 2, 6);
          if (seed < 2) ctx.fillRect(x + 20, y + 16, 2, 5);
        } else if (baseTile === T.SIDEWALK) {
          ctx.strokeStyle = base.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      } else {
        ctx.fillStyle = colors.fill;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      }

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
        case T.TV: {
          // Bezel
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          // Animated "live picture" — colorful horizontal bands sliding, with
          // a moving bright highlight and a scanline overlay for that CRT feel.
          const tvT = Date.now() * 0.0025 + (c * 1.3 + r * 0.7);
          const tvX = x + 3, tvY = y + 3, tvW = TILE_SIZE - 6, tvH = TILE_SIZE - 6;
          const bandH = tvH / 4;
          for (let i = 0; i < 4; i++) {
            const hue = (tvT * 40 + i * 70) % 360;
            ctx.fillStyle = `hsl(${hue}, 60%, 45%)`;
            ctx.fillRect(tvX, tvY + i * bandH, tvW, Math.ceil(bandH));
          }
          // Moving bright vertical highlight (simulated "motion")
          const hlX = tvX + ((tvT * 8) % (tvW + 6)) - 3;
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(hlX, tvY, 2, tvH);
          // Scanlines
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          for (let sy2 = 0; sy2 < tvH; sy2 += 2) ctx.fillRect(tvX, tvY + sy2, tvW, 1);
          // Standby LED in the corner
          ctx.fillStyle = '#ff3333';
          ctx.fillRect(x + TILE_SIZE - 8, y + TILE_SIZE - 8, 3, 3);
          break;
        }
        case T.COMPUTER: {
          // Monitor bezel
          ctx.fillStyle = '#2a2a2a';
          ctx.fillRect(x + 6, y + 4, TILE_SIZE - 12, TILE_SIZE - 12);
          // Animated screen content — subtle hue pulse + blinking cursor
          const compT = Date.now() * 0.002 + (c * 0.5 + r * 0.9);
          const scX = x + 8, scY = y + 6, scW = TILE_SIZE - 16, scH = TILE_SIZE - 16;
          const hue = (Math.sin(compT) * 30 + 210) | 0; // blues with slight variation
          ctx.fillStyle = `hsl(${hue}, 70%, 45%)`;
          ctx.fillRect(scX, scY, scW, scH);
          // "Code lines"
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(scX + 1, scY + 2, 5, 1);
          ctx.fillRect(scX + 1, scY + 5, 9, 1);
          ctx.fillRect(scX + 3, scY + 8, 6, 1);
          ctx.fillRect(scX + 1, scY + 11, 4, 1);
          // Blinking cursor
          if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(scX + 8, scY + 11, 2, 2);
          }
          // Stand
          ctx.fillStyle = '#444';
          ctx.fillRect(x + 10, y + TILE_SIZE - 10, TILE_SIZE - 20, 6);
          break;
        }
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
        case T.CROSSWALK:
          // Zebra crossing — 4 white horizontal stripes on dark street
          ctx.fillStyle = colors.stripe;
          ctx.fillRect(x, y + 2, TILE_SIZE, 5);
          ctx.fillRect(x, y + 10, TILE_SIZE, 5);
          ctx.fillRect(x, y + 18, TILE_SIZE, 5);
          ctx.fillRect(x, y + 26, TILE_SIZE, 5);
          break;
        case T.GYM_FLOOR:
          ctx.strokeStyle = colors.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          break;
        case T.TREADMILL: {
          // base belt
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(x + 6, y + 4, TILE_SIZE - 12, TILE_SIZE - 6);
          // belt tread lines
          ctx.strokeStyle = '#2a2a2a';
          ctx.lineWidth = 1;
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(x + 7, y + 8 + i * 4);
            ctx.lineTo(x + TILE_SIZE - 7, y + 8 + i * 4);
            ctx.stroke();
          }
          // Display screen at top
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 5, y + 1, TILE_SIZE - 10, 4);
          ctx.fillStyle = colors.screen;
          ctx.fillRect(x + 12, y + 1, 8, 3);
          // Side handles
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 4, y + 5, 2, 8);
          ctx.fillRect(x + TILE_SIZE - 6, y + 5, 2, 8);
          break;
        }
        case T.WEIGHT_BENCH: {
          // Bench pad
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 4, y + 12, TILE_SIZE - 8, 8);
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 4, y + 19, TILE_SIZE - 8, 1);
          // Bar with weights at top
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 2, y + 6, TILE_SIZE - 4, 2);
          // Weight plates
          ctx.fillStyle = colors.accent;
          ctx.fillRect(x + 2, y + 4, 4, 6);
          ctx.fillRect(x + TILE_SIZE - 6, y + 4, 4, 6);
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(x + 1, y + 3, 3, 8);
          ctx.fillRect(x + TILE_SIZE - 4, y + 3, 3, 8);
          // Bench legs
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 6, y + 20, 3, 8);
          ctx.fillRect(x + TILE_SIZE - 9, y + 20, 3, 8);
          break;
        }
        case T.DUMBBELL: {
          // Two dumbbell rows
          for (let row = 0; row < 2; row++) {
            const dy = y + 8 + row * 12;
            ctx.fillStyle = colors.accent;
            ctx.fillRect(x + 4, dy + 3, TILE_SIZE - 8, 2); // bar
            ctx.fillStyle = colors.fill;
            ctx.fillRect(x + 2, dy, 5, 8);                  // left weight
            ctx.fillRect(x + TILE_SIZE - 7, dy, 5, 8);      // right weight
            ctx.fillRect(x + 8, dy + 1, 4, 6);
            ctx.fillRect(x + TILE_SIZE - 12, dy + 1, 4, 6);
          }
          break;
        }
        case T.GROCERY_FLOOR:
          // White tile with subtle grout lines
          ctx.strokeStyle = colors.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.beginPath();
          ctx.moveTo(x + TILE_SIZE / 2, y);
          ctx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y + TILE_SIZE / 2);
          ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2);
          ctx.stroke();
          break;
        case T.SHELF: {
          // Wooden shelf body
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 1, y + 2, TILE_SIZE - 2, TILE_SIZE - 4);
          // Shelf surface lines
          ctx.fillStyle = colors.surface;
          ctx.fillRect(x + 1, y + 10, TILE_SIZE - 2, 2);
          ctx.fillRect(x + 1, y + 20, TILE_SIZE - 2, 2);
          // Items on shelves (use seeded color)
          const seed = (c * 7 + r * 13);
          for (let i = 0; i < 3; i++) {
            const itemColor = colors.items[(seed + i) % colors.items.length];
            ctx.fillStyle = itemColor;
            ctx.fillRect(x + 4 + i * 8, y + 4, 5, 5);
            ctx.fillRect(x + 4 + i * 8, y + 14, 5, 5);
            ctx.fillRect(x + 4 + i * 8, y + 24, 5, 4);
          }
          break;
        }
        case T.CASHIER: {
          // Counter base
          ctx.fillStyle = colors.counter;
          ctx.fillRect(x + 1, y + 18, TILE_SIZE - 2, TILE_SIZE - 18);
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 1, y + 16, TILE_SIZE - 2, 3);  // counter top trim
          // Person behind counter (head + shoulders peeking up)
          const cx = x + TILE_SIZE / 2;
          // Hair / head back
          ctx.fillStyle = colors.hair;
          ctx.fillRect(cx - 5, y + 2, 10, 4);
          // Skin face
          ctx.fillStyle = colors.skin;
          ctx.fillRect(cx - 4, y + 5, 8, 7);
          // Eyes
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(cx - 3, y + 8, 1, 1);
          ctx.fillRect(cx + 2, y + 8, 1, 1);
          // Shirt / shoulders
          ctx.fillStyle = colors.shirt;
          ctx.fillRect(cx - 6, y + 12, 12, 5);
          break;
        }
        case T.CINEMA_FLOOR:
          // Very dark floor — barely-there grid
          ctx.strokeStyle = colors.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          break;
        case T.CINEMA_SEAT: {
          // Plush red theater seat — backrest + seat cushion + armrests
          ctx.fillStyle = colors.accent;
          ctx.fillRect(x + 3, y + 4, TILE_SIZE - 6, TILE_SIZE - 6); // shadow base
          // Backrest (top half)
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 4, y + 3, TILE_SIZE - 8, 14);
          // Seat cushion
          ctx.fillStyle = colors.cushion;
          ctx.fillRect(x + 5, y + 14, TILE_SIZE - 10, 12);
          // Armrests
          ctx.fillStyle = colors.accent;
          ctx.fillRect(x + 2, y + 12, 3, 14);
          ctx.fillRect(x + TILE_SIZE - 5, y + 12, 3, 14);
          // Seat highlight
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + 6, y + 5, TILE_SIZE - 12, 3);
          break;
        }
        case T.CINEMA_SCREEN: {
          // Bright screen with frame
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x, y + 2, TILE_SIZE, TILE_SIZE - 4);
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 1, y + 4, TILE_SIZE - 2, TILE_SIZE - 8);
          // Glow spilling forward (drawn into the tile above; safe at row 32 — row 31 is visible)
          const grad = ctx.createRadialGradient(
            x + TILE_SIZE / 2, y + TILE_SIZE / 2, 4,
            x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE
          );
          grad.addColorStop(0, colors.glow);
          grad.addColorStop(1, 'rgba(220,230,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x - TILE_SIZE / 2, y - TILE_SIZE, TILE_SIZE * 2, TILE_SIZE * 2);
          break;
        }
        case T.DRAPE: {
          // Vertical pleated red curtain
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = colors.shadow;
          for (let i = 0; i < TILE_SIZE; i += 6) {
            ctx.fillRect(x + i, y, 2, TILE_SIZE);
          }
          ctx.fillStyle = colors.highlight;
          for (let i = 3; i < TILE_SIZE; i += 6) {
            ctx.fillRect(x + i, y, 1, TILE_SIZE);
          }
          // Top valence
          ctx.fillStyle = colors.shadow;
          ctx.fillRect(x, y, TILE_SIZE, 4);
          break;
        }
        case T.DONUT_BOX_TILE: {
          // Table base first
          ctx.fillStyle = '#a0522d';
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.strokeStyle = '#8b4513'; ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          // Pink open box on top
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 6, y + 12, 20, 14);
          ctx.fillStyle = '#c43377';
          ctx.fillRect(x + 6, y + 24, 20, 2);
          // Lid in back
          ctx.fillStyle = colors.fill;
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 12); ctx.lineTo(x + 9, y + 6);
          ctx.lineTo(x + 23, y + 6); ctx.lineTo(x + 26, y + 12);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.moveTo(x + 7, y + 11); ctx.lineTo(x + 10, y + 7);
          ctx.lineTo(x + 22, y + 7); ctx.lineTo(x + 25, y + 11);
          ctx.closePath(); ctx.fill();
          // 3 donuts
          const dColors = ['#f5d59c', '#fbb', '#6b3a1a'];
          for (let i = 0; i < 3; i++) {
            const dx = x + 10 + i * 6;
            const dy = y + 18;
            ctx.fillStyle = '#d4a574';
            ctx.beginPath(); ctx.arc(dx, dy, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = dColors[i];
            ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#5a3a1a';
            ctx.beginPath(); ctx.arc(dx, dy, 0.7, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case T.PIZZA_BOX_TILE: {
          // Table base first
          ctx.fillStyle = '#a0522d';
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.strokeStyle = '#8b4513'; ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          // Open red pizza box
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 4, y + 6, 24, 22);
          ctx.fillStyle = '#8b1f15';
          ctx.fillRect(x + 4, y + 6, 24, 2);
          ctx.fillRect(x + 4, y + 26, 24, 2);
          // Pizza inside
          ctx.fillStyle = colors.crust;
          ctx.beginPath(); ctx.arc(x + 16, y + 17, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = colors.cheese;
          ctx.beginPath(); ctx.arc(x + 16, y + 17, 7.5, 0, Math.PI * 2); ctx.fill();
          // Pepperoni slices
          ctx.fillStyle = colors.pepperoni;
          ctx.beginPath(); ctx.arc(x + 13, y + 14, 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 19, y + 13, 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 17, y + 18, 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 13, y + 20, 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 19, y + 21, 1.5, 0, Math.PI * 2); ctx.fill();
          // Slice cuts
          ctx.strokeStyle = colors.fill; ctx.lineWidth = 0.5;
          for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(x + 16, y + 17);
            ctx.lineTo(x + 16 + Math.cos(a) * 7.5, y + 17 + Math.sin(a) * 7.5);
            ctx.stroke();
          }
          break;
        }
        case T.PARK_BENCH: {
          // Slatted wooden bench seen from above
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 2, y + 8, TILE_SIZE - 4, 16);
          // 3 plank highlights
          ctx.fillStyle = colors.plank;
          ctx.fillRect(x + 3, y + 10, TILE_SIZE - 6, 3);
          ctx.fillRect(x + 3, y + 14, TILE_SIZE - 6, 3);
          ctx.fillRect(x + 3, y + 18, TILE_SIZE - 6, 3);
          // Iron legs on each side
          ctx.fillStyle = colors.leg;
          ctx.fillRect(x + 3, y + 24, 3, 5);
          ctx.fillRect(x + TILE_SIZE - 6, y + 24, 3, 5);
          // Backrest line
          ctx.fillStyle = colors.leg;
          ctx.fillRect(x + 2, y + 6, TILE_SIZE - 4, 2);
          break;
        }
        case T.BBQ_GRILL: {
          // Black kettle grill on legs with flickering coals
          // Legs
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 6, y + 22, 2, 8);
          ctx.fillRect(x + 24, y + 22, 2, 8);
          ctx.fillRect(x + 14, y + 24, 4, 6);
          // Wheels
          ctx.beginPath(); ctx.arc(x + 7, y + 30, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 25, y + 30, 2, 0, Math.PI * 2); ctx.fill();
          // Kettle bowl
          ctx.fillStyle = colors.fill;
          ctx.beginPath();
          ctx.ellipse(x + 16, y + 18, 11, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          // Grate
          ctx.strokeStyle = colors.grate; ctx.lineWidth = 0.6;
          for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(x + 7 + i * 3, y + 13);
            ctx.lineTo(x + 7 + i * 3, y + 22);
            ctx.stroke();
          }
          ctx.beginPath(); ctx.moveTo(x + 6, y + 15); ctx.lineTo(x + 26, y + 15); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 6, y + 18); ctx.lineTo(x + 26, y + 18); ctx.stroke();
          // Animated flames
          const t = Date.now() * 0.008 + (c * 7 + r * 3);
          for (let i = 0; i < 3; i++) {
            const fx = x + 11 + i * 5;
            const fh = 5 + Math.sin(t + i) * 2;
            ctx.fillStyle = colors.flame;
            ctx.beginPath();
            ctx.moveTo(fx - 2, y + 14);
            ctx.quadraticCurveTo(fx, y + 14 - fh, fx + 2, y + 14);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = colors.flameHot;
            ctx.beginPath();
            ctx.moveTo(fx - 1, y + 14);
            ctx.quadraticCurveTo(fx, y + 14 - fh * 0.6, fx + 1, y + 14);
            ctx.closePath(); ctx.fill();
          }
          // Smoke
          ctx.fillStyle = `rgba(180,180,180,${0.3 + Math.sin(t * 0.5) * 0.1})`;
          ctx.beginPath();
          ctx.arc(x + 16 + Math.sin(t * 0.6) * 2, y + 4, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case T.STREETLIGHT: {
          // Tall lamp post with curved arm and a glowing bulb
          ctx.fillStyle = colors.post;
          ctx.fillRect(x + 14, y + 4, 4, 26);     // pole
          ctx.fillRect(x + 11, y + 28, 10, 3);    // base
          // Curved arm bending right
          ctx.strokeStyle = colors.post; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + 16, y + 6);
          ctx.quadraticCurveTo(x + 22, y + 4, x + 24, y + 8);
          ctx.stroke();
          // Lamp head
          ctx.fillStyle = colors.fill;
          ctx.beginPath();
          ctx.moveTo(x + 21, y + 8);
          ctx.lineTo(x + 27, y + 8);
          ctx.lineTo(x + 26, y + 13);
          ctx.lineTo(x + 22, y + 13);
          ctx.closePath();
          ctx.fill();
          // Bulb glow
          ctx.fillStyle = colors.glow;
          ctx.fillRect(x + 22.5, y + 11, 3, 2);
          // Soft halo on the ground
          const grad = ctx.createRadialGradient(x + 24, y + 12, 1, x + 24, y + 12, 14);
          grad.addColorStop(0, 'rgba(255,225,140,0.45)');
          grad.addColorStop(1, 'rgba(255,225,140,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x + 10, y, TILE_SIZE, TILE_SIZE);
          break;
        }
        case T.WARDROBE: {
          // Wooden armoire with two doors, brass handles, and a small mirror panel
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 3, y + 2, TILE_SIZE - 6, TILE_SIZE - 4);
          // Door split down the middle
          ctx.fillStyle = colors.door;
          ctx.fillRect(x + 4, y + 4, 11, TILE_SIZE - 8);
          ctx.fillRect(x + TILE_SIZE - 15, y + 4, 11, TILE_SIZE - 8);
          // Mirror on the left door
          ctx.fillStyle = colors.mirror;
          ctx.fillRect(x + 6, y + 6, 7, 10);
          ctx.fillStyle = colors.mirrorShadow;
          ctx.fillRect(x + 6, y + 13, 7, 3);
          // Door handles
          ctx.fillStyle = colors.handle;
          ctx.fillRect(x + 13, y + 16, 2, 3);
          ctx.fillRect(x + TILE_SIZE - 15, y + 16, 2, 3);
          // Shadow at the base
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x + 3, y + TILE_SIZE - 3, TILE_SIZE - 6, 1);
          break;
        }
        case T.GAMING_FLOOR: {
          // Dark purple carpet — subtle grid hint
          ctx.strokeStyle = colors.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          break;
        }
        case T.GAMING_PC: {
          // Desk surface
          ctx.fillStyle = colors.desk;
          ctx.fillRect(x + 2, y + 22, TILE_SIZE - 4, 8);
          // Tower (stands beside the monitor)
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 2, y + 8, 4, 18);
          // Tower vent LED
          const towerLedT = Date.now() * 0.004 + (c * 2 + r * 3);
          const towerHue = (towerLedT * 30) % 360;
          ctx.fillStyle = `hsl(${towerHue}, 95%, 60%)`;
          ctx.fillRect(x + 3, y + 10, 2, 8);
          // Monitor frame
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 7, y + 3, TILE_SIZE - 12, 18);
          // Animated screen — each PC has a different seed so the 4 side-by-side look alive together
          const screenX = x + 9, screenY = y + 5, sw = TILE_SIZE - 16, sh = 14;
          const t = Date.now() * 0.003 + (c * 1.7 + r * 2.3);
          // Base hue-shifting gradient
          const grad = ctx.createLinearGradient(screenX, screenY, screenX, screenY + sh);
          const hue1 = (Math.sin(t) * 60 + 200) | 0;
          const hue2 = (Math.cos(t * 0.7) * 60 + 300) | 0;
          grad.addColorStop(0, `hsl(${hue1}, 85%, 55%)`);
          grad.addColorStop(1, `hsl(${hue2}, 85%, 30%)`);
          ctx.fillStyle = grad;
          ctx.fillRect(screenX, screenY, sw, sh);
          // Bouncing sprite (pretend-player) + moving enemy
          const spriteX = screenX + Math.round(((Math.sin(t * 1.3) + 1) / 2) * (sw - 3));
          const spriteY = screenY + sh - 3;
          ctx.fillStyle = '#fff';
          ctx.fillRect(spriteX, spriteY, 3, 2);
          ctx.fillStyle = '#ffeb3b';
          ctx.fillRect(spriteX, spriteY - 1, 3, 1);
          const enemyX = screenX + Math.round(((Math.cos(t * 0.9) + 1) / 2) * (sw - 3));
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(enemyX, screenY + 2, 3, 2);
          // Scanlines
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          for (let sy2 = 0; sy2 < sh; sy2 += 2) ctx.fillRect(screenX, screenY + sy2, sw, 1);
          // Small HUD corner indicator
          ctx.fillStyle = 'rgba(0,255,200,0.9)';
          ctx.fillRect(screenX + 1, screenY + 1, 2, 1);
          // Keyboard with RGB key LEDs
          ctx.fillStyle = colors.keyboard;
          ctx.fillRect(x + 6, y + 26, TILE_SIZE - 12, 4);
          for (let k = 0; k < 8; k++) {
            const kh = (t * 60 + k * 45) % 360;
            ctx.fillStyle = `hsl(${kh}, 95%, 60%)`;
            ctx.fillRect(x + 7 + k * 2.2, y + 27, 1.6, 2);
          }
          // Glow bleeding out the front of the monitor onto the desk
          const glow = ctx.createRadialGradient(x + TILE_SIZE / 2, y + 14, 2, x + TILE_SIZE / 2, y + 14, 22);
          glow.addColorStop(0, `hsla(${hue1}, 90%, 60%, 0.35)`);
          glow.addColorStop(1, 'hsla(0,0%,0%,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(x - 4, y + 8, TILE_SIZE + 8, 24);
          break;
        }
        case T.GAMING_CONSOLE: {
          // Media stand
          ctx.fillStyle = colors.stand;
          ctx.fillRect(x + 2, y + 10, TILE_SIZE - 4, 18);
          ctx.fillStyle = '#1a1624';
          ctx.fillRect(x + 2, y + 26, TILE_SIZE - 4, 2);
          // Console box — slim black slab
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 4, y + 12, TILE_SIZE - 8, 6);
          // Pulsing LED strip along the console
          const pulse = (Math.sin(Date.now() * 0.005) + 1) / 2;
          ctx.fillStyle = colors.accent;
          ctx.globalAlpha = 0.6 + pulse * 0.4;
          ctx.fillRect(x + 4, y + 17, TILE_SIZE - 8, 1);
          ctx.globalAlpha = 1;
          // Controller on top — dark body with a little light bar
          ctx.fillStyle = '#161616';
          ctx.fillRect(x + 10, y + 6, 12, 4);
          ctx.fillStyle = colors.accent;
          ctx.fillRect(x + 13, y + 6, 6, 1);
          // D-pad + face buttons
          ctx.fillStyle = '#666';
          ctx.fillRect(x + 11, y + 8, 2, 1);
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(x + 18, y + 8, 1, 1);
          ctx.fillStyle = '#3498db';
          ctx.fillRect(x + 20, y + 8, 1, 1);
          // Small reflection on the stand
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(x + 4, y + 11, TILE_SIZE - 8, 1);
          break;
        }
        case T.PARK_FENCE: {
          // Wooden picket fence
          ctx.fillStyle = colors.post;
          ctx.fillRect(x, y + 8, TILE_SIZE, 3);
          ctx.fillRect(x, y + 20, TILE_SIZE, 3);
          ctx.fillStyle = colors.fill;
          for (let i = 2; i < TILE_SIZE; i += 6) {
            ctx.fillRect(x + i, y + 4, 4, TILE_SIZE - 8);
            // Pointed top
            ctx.beginPath();
            ctx.moveTo(x + i, y + 4);
            ctx.lineTo(x + i + 2, y);
            ctx.lineTo(x + i + 4, y + 4);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case T.AGILITY_HOOP: {
          // Stand + ring (jumping hoop)
          ctx.fillStyle = colors.frame;
          ctx.fillRect(x + 6, y + 18, 4, 12);
          ctx.fillRect(x + TILE_SIZE - 10, y + 18, 4, 12);
          // Ring
          ctx.strokeStyle = colors.fill;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + 14, 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + 14, 10, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case T.AGILITY_TUNNEL: {
          // Striped agility tunnel — half cylinder
          ctx.fillStyle = colors.shadow;
          ctx.beginPath();
          ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 4, TILE_SIZE / 2 - 1, TILE_SIZE / 2, 0, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = colors.fill;
          ctx.beginPath();
          ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 4, TILE_SIZE / 2 - 3, TILE_SIZE / 2 - 2, 0, Math.PI, 0);
          ctx.fill();
          // Stripes
          ctx.strokeStyle = colors.stripe;
          ctx.lineWidth = 2;
          for (let i = -2; i < 3; i++) {
            const sxk = x + TILE_SIZE / 2 + i * 7;
            ctx.beginPath();
            ctx.moveTo(sxk, y + TILE_SIZE - 4);
            ctx.quadraticCurveTo(sxk, y + 2, sxk + 1, y + 2);
            ctx.stroke();
          }
          // Dark mouth
          ctx.fillStyle = '#0a0a0a';
          ctx.beginPath();
          ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 6, 7, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case T.AGILITY_JUMP: {
          // Two posts + horizontal bar
          ctx.fillStyle = colors.post;
          ctx.fillRect(x + 4, y + 6, 3, TILE_SIZE - 10);
          ctx.fillRect(x + TILE_SIZE - 7, y + 6, 3, TILE_SIZE - 10);
          // Striped bar
          ctx.fillStyle = colors.fill;
          ctx.fillRect(x + 4, y + 14, TILE_SIZE - 8, 4);
          ctx.fillStyle = colors.accent;
          for (let i = 6; i < TILE_SIZE - 6; i += 6) {
            ctx.fillRect(x + i, y + 14, 3, 4);
          }
          // Base feet
          ctx.fillStyle = colors.post;
          ctx.fillRect(x + 2, y + TILE_SIZE - 5, 7, 3);
          ctx.fillRect(x + TILE_SIZE - 9, y + TILE_SIZE - 5, 7, 3);
          break;
        }
        case T.DOG_BONE: {
          // Cartoon bone shape
          ctx.fillStyle = colors.shadow;
          ctx.beginPath();
          ctx.arc(x + 8, y + 14, 4, 0, Math.PI * 2);
          ctx.arc(x + 8, y + 22, 4, 0, Math.PI * 2);
          ctx.arc(x + 24, y + 14, 4, 0, Math.PI * 2);
          ctx.arc(x + 24, y + 22, 4, 0, Math.PI * 2);
          ctx.fillRect(x + 8, y + 16, 16, 4);
          ctx.fill();
          ctx.fillStyle = colors.fill;
          ctx.beginPath();
          ctx.arc(x + 8, y + 13, 3.5, 0, Math.PI * 2);
          ctx.arc(x + 8, y + 21, 3.5, 0, Math.PI * 2);
          ctx.arc(x + 24, y + 13, 3.5, 0, Math.PI * 2);
          ctx.arc(x + 24, y + 21, 3.5, 0, Math.PI * 2);
          ctx.fillRect(x + 8, y + 15, 16, 4);
          ctx.fill();
          break;
        }
        case T.FRISBEE: {
          // Top-down disc
          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 2, 11, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = colors.fill;
          ctx.beginPath();
          ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 11, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          ctx.ellipse(x + TILE_SIZE / 2 - 3, y + TILE_SIZE / 2 - 1, 4, 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
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

// Player-next-to-wardrobe check — used by main.js to show the interact hint and wire the E key.
export function isWardrobeNearby(px, py) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (getTile(col + dc, row + dr) === T.WARDROBE) return true;
    }
  }
  return false;
}
