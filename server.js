const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const db = require('./db');
const { initDb } = db;

// === Server-authoritative persistence ===
const DATA_DIR = path.join(__dirname, 'data');
const BOARD_FILE = path.join(DATA_DIR, 'planning-board.json');
const STATS_FILE = path.join(DATA_DIR, 'player-stats.json');

// Level system — mirrored from public/js/constants.js LEVEL_CATEGORIES
// id, display name, perLevel threshold, stat key
const LEVEL_CATEGORIES = [
  { id: 'explorer',     name: 'Explorer',     perLevel: 500, stat: 'steps' },
  { id: 'communicator', name: 'Communicator', perLevel: 5,   stat: 'meetingTime' },
  { id: 'feedback',     name: 'Feedback',     perLevel: 3,   stat: 'feedbackGiven' },
  { id: 'chatter',      name: 'Chatter',      perLevel: 50,  stat: 'chatMessages' },
  { id: 'achiever',     name: 'Achiever',     perLevel: 5,   stat: 'tasksCompleted' },
];
const STAT_KEYS = LEVEL_CATEGORIES.map(c => c.stat);

function emptyStats() {
  const s = {};
  for (const k of STAT_KEYS) s[k] = 0;
  return s;
}

function computeLevels(stats) {
  const levels = {};
  for (const cat of LEVEL_CATEGORIES) {
    const val = stats[cat.stat] || 0;
    levels[cat.id] = Math.min(10, Math.floor(val / cat.perLevel));
  }
  return levels;
}

// Sum of all category levels (max 50 across 5 categories × 10 each). Shown on hover nametags.
function computeTotalLevel(statsOrLevels) {
  // Accepts either a stats object (with stat keys) or an already-computed levels object
  const levels = (statsOrLevels && typeof statsOrLevels === 'object' && 'achiever' in statsOrLevels)
    ? statsOrLevels : computeLevels(statsOrLevels || {});
  let total = 0;
  for (const cat of LEVEL_CATEGORIES) total += levels[cat.id] || 0;
  return total;
}

function atomicWriteJsonSync(target, payload) {
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}
async function atomicWriteJson(target, payload) {
  const tmp = target + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
  await fsp.rename(tmp, target);
}

function loadBoardFromDisk() {
  try {
    if (!fs.existsSync(BOARD_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to load planning board:', e.message);
    return [];
  }
}

function loadStatsFromDisk() {
  try {
    if (!fs.existsSync(STATS_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    console.error('Failed to load player stats:', e.message);
    return {};
  }
}

let boardSaveTimer = null;
function scheduleBoardSave() {
  if (boardSaveTimer) clearTimeout(boardSaveTimer);
  boardSaveTimer = setTimeout(async () => {
    boardSaveTimer = null;
    try {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      await atomicWriteJson(BOARD_FILE, planningBoard);
    } catch (e) { console.error('Failed to save planning board:', e.message); }
  }, 1000);
}

let statsSaveTimer = null;
function scheduleStatsSave() {
  if (statsSaveTimer) clearTimeout(statsSaveTimer);
  statsSaveTimer = setTimeout(async () => {
    statsSaveTimer = null;
    try {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      await atomicWriteJson(STATS_FILE, persistentStats);
    } catch (e) { console.error('Failed to save player stats:', e.message); }
  }, 1000);
}

// In-memory mirror of stats file, keyed by username (lowercased for lookup, original case preserved in player obj)
// Shape: { [username]: { steps, meetingTime, feedbackGiven, chatMessages, tasksCompleted } }
const persistentStats = loadStatsFromDisk();

// Furniture persistence — single shared list. Anyone can place, move, or remove any item.
// Shape: [{ id, type, x, y }, ...] capped at MAX_FURNITURE items.
const FURNITURE_FILE = path.join(DATA_DIR, 'office-furniture.json');
const LEGACY_FURNITURE_FILE = path.join(DATA_DIR, 'player-furniture.json');
const MAX_FURNITURE = 300;

function loadFurnitureFromDisk() {
  try {
    if (fs.existsSync(FURNITURE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FURNITURE_FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    }
    // Migrate legacy per-username format into a flat list.
    if (fs.existsSync(LEGACY_FURNITURE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LEGACY_FURNITURE_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        const flat = [];
        for (const items of Object.values(parsed)) {
          if (Array.isArray(items)) flat.push(...items);
        }
        console.log(`Migrated ${flat.length} furniture items from per-user → global storage.`);
        return flat;
      }
    }
    return [];
  } catch (e) {
    console.error('Failed to load furniture:', e.message);
    return [];
  }
}

let persistentFurniture = loadFurnitureFromDisk();

let furnitureSaveTimer = null;
function scheduleFurnitureSave() {
  if (furnitureSaveTimer) clearTimeout(furnitureSaveTimer);
  furnitureSaveTimer = setTimeout(async () => {
    furnitureSaveTimer = null;
    try {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      await atomicWriteJson(FURNITURE_FILE, persistentFurniture);
      // Best-effort cleanup of the legacy file after first successful save of the new format.
      if (fs.existsSync(LEGACY_FURNITURE_FILE)) {
        try { await fsp.unlink(LEGACY_FURNITURE_FILE); } catch {}
      }
    } catch (e) { console.error('Failed to save furniture:', e.message); }
  }, 1000);
}

function sanitizeFurnitureItem(raw) {
  return {
    id: raw.id || crypto.randomUUID(),
    type: String(raw.type || '').slice(0, 20),
    x: Math.round(Number(raw.x) || 0),
    y: Math.round(Number(raw.y) || 0),
  };
}

function getStatsFor(username) {
  if (!persistentStats[username]) {
    persistentStats[username] = emptyStats();
  } else {
    // Backfill any new stat keys that didn't exist in older saves
    for (const k of STAT_KEYS) {
      if (typeof persistentStats[username][k] !== 'number') persistentStats[username][k] = 0;
    }
  }
  return persistentStats[username];
}

// Apply a stat delta and broadcast level-up events to all clients.
// Returns the updated stats + levels for the caller.
function bumpStat(username, deltas, opts = {}) {
  if (!username) return null;
  const stats = getStatsFor(username);
  const oldLevels = computeLevels(stats);

  for (const [key, value] of Object.entries(deltas || {})) {
    if (!STAT_KEYS.includes(key)) continue;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) continue;
    // Cap per-event bumps to prevent spam-abuse
    const capped = Math.min(num, opts.maxPerCall || 1000);
    stats[key] = (stats[key] || 0) + capped;
  }

  const newLevels = computeLevels(stats);
  const newTotal = computeTotalLevel(newLevels);

  // If this username is currently online, keep their player-object level in sync so the
  // hover nametag reflects the new value.
  for (const p of players.values()) {
    if (p.username === username) { p.level = newTotal; break; }
  }

  // Broadcast level-ups (one per category that crossed) — include totalLevel so clients can
  // update the remote player's nametag without a separate round-trip.
  const color = opts.color || '#e94560';
  for (const cat of LEVEL_CATEGORIES) {
    if (newLevels[cat.id] > oldLevels[cat.id]) {
      io.emit('celebrate:levelup', {
        username,
        category: cat.name,
        categoryId: cat.id,
        level: newLevels[cat.id],
        totalLevel: newTotal,
        color,
      });
    }
  }

  scheduleStatsSave();
  return { stats, levels: newLevels };
}

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// === In-memory state ===
const players = new Map();       // socketId -> { id, username, appearance, x, y, direction, zone }
const voicePeers = new Set();    // socketIds currently in voice (meeting room)
let screenSharer = null;         // socketId of current screen sharer
let youtubeState = null;         // { url, videoId, startedAt, setBy }
let serverRunning = false;
let planningBoard = loadBoardFromDisk();  // [{ id, assignee, task, duration, column, color, completedBy?, completedAt? }]
const officePets = new Map();    // petId -> { id, type, name, x, y, ownerId, zone }
const sessionChat = [];          // in-memory chat messages (cleared on restart)
// Notice boards: keyed by office zone id → array of notes
const noticeBoards = { henrik: [], alice: [], leo: [] };
// Office locks: keyed by office zone id → { locked, lockedBy }
const officeLocks = { henrik: null, alice: null, leo: null };
const SPAWN_X = 36 * 32;
const SPAWN_Y = 18 * 32;

// === API endpoint for launcher status ===
app.get('/api/status', (req, res) => {
  const userList = [];
  for (const p of players.values()) {
    userList.push({ username: p.username, zone: p.zone });
  }
  res.json({ running: true, players: userList, playerCount: players.size });
});

// === Socket.IO ===
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // --- Auth ---
  socket.on('auth', ({ username, appearance }) => {
    if (!username || username.length < 1 || username.length > 20) {
      socket.emit('auth:error', { message: 'Username must be 1-20 characters' });
      return;
    }

    // Check uniqueness
    for (const p of players.values()) {
      if (p.username.toLowerCase() === username.toLowerCase()) {
        socket.emit('auth:error', { message: 'Username already taken' });
        return;
      }
    }

    const initialStats = getStatsFor(username);
    const player = {
      id: socket.id,
      username,
      appearance: appearance || {},
      x: SPAWN_X,
      y: SPAWN_Y,
      direction: 'down',
      zone: null,
      status: null, // { text, link }
      joinedAt: Date.now(),
      level: computeTotalLevel(initialStats), // 0-50; shown on hover nametag
      holdingCakeUntil: 0, // ms epoch — player-holding-a-cake easter egg after finishing a task
    };

    players.set(socket.id, player);

    // Send current state to new player
    const existingPlayers = [];
    for (const [id, p] of players) {
      if (id !== socket.id) {
        existingPlayers.push(p);
      }
    }

    socket.emit('auth:ok', {
      id: socket.id,
      x: SPAWN_X,
      y: SPAWN_Y,
      players: existingPlayers,
      youtubeState,
      planningBoard,
      stats: initialStats,
      levels: computeLevels(initialStats),
      furniture: persistentFurniture,
    });

    // Send session chat (in-memory only)
    socket.emit('chat:history', { messages: sessionChat });

    // Send existing pets
    socket.emit('pet:sync', { allPets: [...officePets.values()] });

    // Notify others
    socket.broadcast.emit('player:join', player);

    console.log(`${username} joined the office`);
  });

  // --- Movement ---
  socket.on('player:move', ({ x, y, direction, isMoving }) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.x = x;
    player.y = y;
    player.direction = direction;
    socket.broadcast.emit('player:moved', { id: socket.id, x, y, direction, isMoving });
  });

  // --- Easter egg: hit-by-car death animation (relay only — respawn is client-driven) ---
  socket.on('player:died', ({ x, y }) => {
    const player = players.get(socket.id);
    if (!player) return;
    socket.broadcast.emit('player:died', { id: socket.id, x, y });
  });

  // --- Zone changes ---
  socket.on('zone:change', ({ zoneId }) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.zone = zoneId;
    socket.broadcast.emit('zone:changed', { playerId: socket.id, zoneId });
  });

  // --- Wardrobe: appearance change while in-game (relay to everyone else) ---
  socket.on('appearance:update', ({ appearance }) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!appearance || typeof appearance !== 'object') return;
    // Only allow known keys — ignore anything weird a client might send.
    const allowed = ['skinTone', 'hairStyle', 'hairColor', 'shirtColor', 'pantsColor', 'hat', 'face', 'outfit'];
    const clean = {};
    for (const k of allowed) {
      const v = appearance[k];
      if (typeof v === 'string' && v.length <= 30) clean[k] = v;
    }
    player.appearance = { ...player.appearance, ...clean };
    socket.broadcast.emit('appearance:update', { id: socket.id, appearance: player.appearance });
  });

  // --- Main Chat (session-only, in-memory) ---
  socket.on('chat:send', ({ message, zone }) => {
    const player = players.get(socket.id);
    if (!player || !message || message.length > 500) return;

    const msg = {
      id: crypto.randomUUID(),
      username: player.username,
      color: player.appearance.shirtColor || '#e94560',
      message,
      timestamp: Date.now(),
      zone: zone || null, // null = global, string = local to that zone
    };
    sessionChat.push(msg);
    if (sessionChat.length > 200) sessionChat.shift();

    if (zone) {
      // Local chat — only send to players in the same zone
      for (const [id, p] of players) {
        if (p.zone === zone) {
          io.to(id).emit('chat:message', msg);
        }
      }
    } else {
      io.emit('chat:message', msg);
    }
  });

  // --- Archives Chat (persistent, stored in SQLite) ---
  socket.on('archive:send', ({ message }) => {
    const player = players.get(socket.id);
    if (!player || !message || message.length > 500) return;

    const id = crypto.randomUUID();
    const msg = db.addMessage(id, player.username, player.appearance.shirtColor || '#e94560', message);
    io.emit('archive:message', msg);
  });

  socket.on('archive:history', () => {
    const messages = db.getHistory(200);
    socket.emit('archive:history', { messages });
  });

  socket.on('archive:history-before', ({ before }) => {
    const messages = db.getHistoryBefore(before, 50);
    socket.emit('archive:history', { messages, hasMore: messages.length === 50 });
  });

  // --- Voice signaling ---
  socket.on('voice:join', () => {
    voicePeers.add(socket.id);
    const peerIds = [...voicePeers].filter(id => id !== socket.id);
    socket.emit('voice:peers', { peerIds });
    for (const peerId of peerIds) {
      io.to(peerId).emit('voice:peer-joined', { peerId: socket.id });
    }

    if (screenSharer && screenSharer !== socket.id) {
      socket.emit('screen:active', { playerId: screenSharer });
      io.to(screenSharer).emit('screen:new-viewer', { peerId: socket.id });
    }
  });

  socket.on('voice:leave', () => {
    voicePeers.delete(socket.id);
    for (const peerId of voicePeers) {
      io.to(peerId).emit('voice:peer-left', { peerId: socket.id });
    }

    if (screenSharer === socket.id) {
      screenSharer = null;
      for (const peerId of voicePeers) {
        io.to(peerId).emit('screen:ended', { playerId: socket.id });
      }
    }
  });

  socket.on('voice:offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('voice:offer', { fromId: socket.id, sdp });
  });

  socket.on('voice:answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('voice:answer', { fromId: socket.id, sdp });
  });

  socket.on('voice:ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('voice:ice', { fromId: socket.id, candidate });
  });

  socket.on('voice:mute', ({ muted }) => {
    for (const peerId of voicePeers) {
      if (peerId !== socket.id) {
        io.to(peerId).emit('voice:muted', { playerId: socket.id, muted });
      }
    }
  });

  // --- Screen sharing ---
  socket.on('screen:start', () => {
    if (screenSharer && screenSharer !== socket.id) {
      socket.emit('error', { message: 'Someone is already sharing' });
      return;
    }
    screenSharer = socket.id;

    const viewerIds = [...voicePeers].filter(id => id !== socket.id);
    for (const peerId of viewerIds) {
      io.to(peerId).emit('screen:active', { playerId: socket.id });
    }

    socket.emit('screen:send-to', { peerIds: viewerIds });
  });

  socket.on('screen:stop', () => {
    if (screenSharer !== socket.id) return;
    screenSharer = null;
    for (const peerId of voicePeers) {
      if (peerId !== socket.id) {
        io.to(peerId).emit('screen:ended', { playerId: socket.id });
      }
    }
  });

  socket.on('screen:offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('screen:offer', { fromId: socket.id, sdp });
  });

  socket.on('screen:answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('screen:answer', { fromId: socket.id, sdp });
  });

  socket.on('screen:ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('screen:ice', { fromId: socket.id, candidate });
  });

  // --- YouTube ---
  socket.on('youtube:set', ({ url, videoId }) => {
    const player = players.get(socket.id);
    youtubeState = {
      url,
      videoId,
      startedAt: Date.now(),
      setBy: player ? player.username : 'Unknown',
    };
    io.emit('youtube:update', youtubeState);
  });

  socket.on('youtube:clear', () => {
    youtubeState = null;
    io.emit('youtube:cleared');
  });

  socket.on('youtube:seek', ({ time }) => {
    // Update the server's startedAt to reflect the new position
    if (youtubeState) {
      youtubeState.startedAt = Date.now() - (time || 0) * 1000;
    }
    // Broadcast to all OTHER players
    socket.broadcast.emit('youtube:seek', { time: time || 0 });
  });

  // --- Status ---
  socket.on('status:set', ({ text, link }) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.status = { text: (text || '').slice(0, 100), link: (link || '').slice(0, 500) };
    socket.broadcast.emit('status:update', { playerId: socket.id, status: player.status });
  });

  socket.on('status:clear', () => {
    const player = players.get(socket.id);
    if (!player) return;
    player.status = null;
    socket.broadcast.emit('status:update', { playerId: socket.id, status: null });
  });

  // --- Knocking ---
  socket.on('knock:send', ({ targetZoneId, message }) => {
    const knocker = players.get(socket.id);
    if (!knocker) return;
    // Find players in the target zone and send them the knock
    for (const [id, p] of players) {
      if (id !== socket.id && p.zone === targetZoneId) {
        io.to(id).emit('knock:receive', {
          fromUsername: knocker.username,
          fromId: socket.id,
          message: (message || '').slice(0, 200),
        });
      }
    }
  });

  // --- Planning Board ---
  socket.on('board:get', () => {
    socket.emit('board:sync', { board: planningBoard });
  });

  // Validates an ISO YYYY-MM-DD date string; returns '' (unset) for anything else.
  const sanitizeDate = (v) => {
    if (v === null || v === '') return '';
    if (typeof v !== 'string') return '';
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  };
  const sanitizeProgress = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  };

  socket.on('board:add', ({ assignee, task, duration, column, startDate, endDate, description, link, progress }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const validColumns = ['now', 'next', 'done'];
    const card = {
      id: crypto.randomUUID(),
      assignee: (assignee || '').slice(0, 30),
      task: (task || '').slice(0, 200),
      duration: (duration || '').slice(0, 30),
      column: validColumns.includes(column) ? column : 'next',
      color: player.appearance.shirtColor || '#e94560',
      startDate: sanitizeDate(startDate),
      endDate: sanitizeDate(endDate),
      description: (description || '').slice(0, 2000),
      link: (link || '').slice(0, 500),
      progress: sanitizeProgress(progress),
    };
    planningBoard.push(card);
    io.emit('board:sync', { board: planningBoard });
    scheduleBoardSave();
  });

  socket.on('board:update', ({ id, assignee, task, duration, column, startDate, endDate, description, link, progress }) => {
    const card = planningBoard.find(c => c.id === id);
    if (!card) return;
    const validColumns = ['now', 'next', 'done'];
    if (assignee !== undefined)   card.assignee = (assignee || '').slice(0, 30);
    if (task !== undefined)        card.task = (task || '').slice(0, 200);
    if (duration !== undefined)    card.duration = (duration || '').slice(0, 30);
    if (column !== undefined && validColumns.includes(column)) card.column = column;
    if (startDate !== undefined)   card.startDate = sanitizeDate(startDate);
    if (endDate !== undefined)     card.endDate = sanitizeDate(endDate);
    if (description !== undefined) card.description = (description || '').slice(0, 2000);
    if (link !== undefined)        card.link = (link || '').slice(0, 500);
    if (progress !== undefined)    card.progress = sanitizeProgress(progress);
    // If being moved out of 'done', clear completion metadata and reset progress to 99 (so user can finish it fresh)
    if (column !== undefined && column !== 'done') {
      delete card.completedBy;
      delete card.completedAt;
    }
    io.emit('board:sync', { board: planningBoard });
    scheduleBoardSave();
  });

  socket.on('board:complete', ({ id }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const card = planningBoard.find(c => c.id === id);
    if (!card) return;
    // Only fire a celebration if this is a real state change (not already done)
    if (card.column === 'done') return;
    card.column = 'done';
    card.completedBy = player.username;
    card.completedAt = Date.now();
    const color = player.appearance.shirtColor || '#e94560';
    // Pixel-cake easter egg — completer holds a cake for 5 minutes.
    const cakeUntil = Date.now() + 5 * 60 * 1000;
    player.holdingCakeUntil = cakeUntil;
    io.emit('board:sync', { board: planningBoard });
    io.emit('celebrate:task-done', {
      completer: player.username,
      task: card.task,
      color,
    });
    io.emit('player:hold-cake', { id: socket.id, username: player.username, untilTs: cakeUntil });
    // Award XP to the completer — level-ups (if any) are auto-broadcast by bumpStat
    const result = bumpStat(player.username, { tasksCompleted: 1 }, { color });
    if (result) {
      socket.emit('stats:sync', { stats: result.stats, levels: result.levels });
    }
    scheduleBoardSave();
  });

  socket.on('board:remove', ({ id }) => {
    planningBoard = planningBoard.filter(c => c.id !== id);
    io.emit('board:sync', { board: planningBoard });
    scheduleBoardSave();
  });

  // --- Pets ---
  socket.on('pet:place', ({ type, name, zone }) => {
    const player = players.get(socket.id);
    if (!player) return;
    // Find the zone to get spawn coords
    const zoneData = getZoneBounds(zone);
    if (!zoneData) return;

    const pet = {
      id: crypto.randomUUID(),
      type: type || 'dog_golden',
      name: (name || 'Dog').slice(0, 20),
      x: zoneData.cx,
      y: zoneData.cy,
      ownerId: socket.id,
      zone: zone,
    };
    officePets.set(pet.id, pet);
    io.emit('pet:spawn', pet);
  });

  socket.on('pet:remove-pet', ({ petId }) => {
    const pet = officePets.get(petId);
    if (!pet) return; // Allow anyone to remove pets
    officePets.delete(petId);
    io.emit('pet:remove', { petId });
  });

  socket.on('pet:pet-it', ({ petId }) => {
    if (!officePets.has(petId)) return;
    io.emit('pet:heart', { petId });
  });

  socket.on('pet:command', ({ petId, command }) => {
    const pet = officePets.get(petId);
    if (!pet) return;

    if (command === 'sit' || command === 'spin' || command === 'bark' || command === 'goodboy') {
      io.emit('pet:action', { petId, action: command });
      if (command === 'goodboy') {
        io.emit('pet:heart', { petId });
      }
    } else if (command === 'come') {
      // Move pet to the player who issued the command
      const player = players.get(socket.id);
      if (player) {
        pet.x = player.x + 20;
        pet.y = player.y + 20;
        io.emit('pet:update', { petId, x: pet.x, y: pet.y, action: 'walk' });
      }
    }
  });

  // Pet wander timer — move pets randomly within their zone
  // (handled per-socket but only needs to run once, using setInterval on server)

  // --- Notice Boards ---
  socket.on('notice:get', ({ officeId }) => {
    const board = noticeBoards[officeId] || [];
    socket.emit('notice:sync', { officeId, notes: board });
  });

  socket.on('notice:add', ({ officeId, message, link, status }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const note = {
      id: crypto.randomUUID(),
      author: player.username,
      message: (message || '').slice(0, 200),
      link: (link || '').slice(0, 500),
      status: status || 'review', // review, done, redo
      color: player.appearance.shirtColor || '#e94560',
      timestamp: Date.now(),
    };
    if (!noticeBoards[officeId]) noticeBoards[officeId] = [];
    noticeBoards[officeId].push(note);
    io.emit('notice:sync', { officeId, notes: noticeBoards[officeId] });
  });

  socket.on('notice:update', ({ officeId, noteId, status, note }) => {
    const board = noticeBoards[officeId];
    if (!board) return;
    const item = board.find(n => n.id === noteId);
    if (!item) return;
    if (status) item.status = status;
    if (note !== undefined) item.message = (note || '').slice(0, 200);
    io.emit('notice:sync', { officeId, notes: board });
  });

  socket.on('notice:remove', ({ officeId, noteId }) => {
    if (!noticeBoards[officeId]) return;
    noticeBoards[officeId] = noticeBoards[officeId].filter(n => n.id !== noteId);
    io.emit('notice:sync', { officeId, notes: noticeBoards[officeId] });
  });

  socket.on('notice:move', ({ fromOffice, toOffice, noteId, status, note }) => {
    // Move a note from one office board to another
    if (!noticeBoards[fromOffice]) return;
    const idx = noticeBoards[fromOffice].findIndex(n => n.id === noteId);
    if (idx === -1) return;
    const [item] = noticeBoards[fromOffice].splice(idx, 1);
    if (status) item.status = status;
    if (note !== undefined) item.message = (note || '').slice(0, 200);
    if (!noticeBoards[toOffice]) noticeBoards[toOffice] = [];
    noticeBoards[toOffice].push(item);
    io.emit('notice:sync', { officeId: fromOffice, notes: noticeBoards[fromOffice] });
    io.emit('notice:sync', { officeId: toOffice, notes: noticeBoards[toOffice] });
  });

  // --- Office Locks ---
  socket.on('office:lock', ({ officeId }) => {
    const player = players.get(socket.id);
    if (!player) return;
    officeLocks[officeId] = { locked: true, lockedBy: player.username };
    io.emit('office:lock-sync', { locks: officeLocks });
  });

  socket.on('office:unlock', ({ officeId }) => {
    officeLocks[officeId] = null;
    io.emit('office:lock-sync', { locks: officeLocks });
  });

  socket.on('office:get-locks', () => {
    socket.emit('office:lock-sync', { locks: officeLocks });
  });

  // --- Player Stats / Levels (server-authoritative, persistent by username) ---
  // Client sends a delta for one or more stat keys; server applies, detects level-ups, broadcasts.
  socket.on('stats:bump', ({ delta }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const color = player.appearance.shirtColor || '#e94560';
    const result = bumpStat(player.username, delta || {}, { color });
    if (result) {
      socket.emit('stats:sync', { stats: result.stats, levels: result.levels });
    }
  });

  socket.on('stats:get', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const stats = getStatsFor(player.username);
    socket.emit('stats:sync', { stats, levels: computeLevels(stats) });
  });

  // --- YouTube sync controls ---
  socket.on('youtube:pause', () => {
    socket.broadcast.emit('youtube:pause', {});
  });
  socket.on('youtube:play', ({ time }) => {
    if (youtubeState) youtubeState.startedAt = Date.now() - (time || 0) * 1000;
    socket.broadcast.emit('youtube:play', { time: time || 0 });
  });

  // --- Online Players List ---
  socket.on('players:list', () => {
    const list = [];
    for (const p of players.values()) {
      list.push({
        id: p.id,
        username: p.username,
        zone: p.zone,
        joinedAt: p.joinedAt,
        color: p.appearance.shirtColor || '#e94560',
      });
    }
    socket.emit('players:list', { players: list });
  });

  // --- Office Furniture (global, shared — anyone can place, move, or remove any item) ---
  socket.on('furniture:place', ({ type, x, y }) => {
    if (!players.get(socket.id)) return;
    if (persistentFurniture.length >= MAX_FURNITURE) return;
    const item = sanitizeFurnitureItem({ type, x, y });
    persistentFurniture.push(item);
    io.emit('furniture:update', { furniture: persistentFurniture });
    scheduleFurnitureSave();
  });

  socket.on('furniture:remove', ({ itemId }) => {
    if (!players.get(socket.id)) return;
    const idx = persistentFurniture.findIndex(f => f.id === itemId);
    if (idx === -1) return;
    persistentFurniture.splice(idx, 1);
    io.emit('furniture:update', { furniture: persistentFurniture });
    scheduleFurnitureSave();
  });

  socket.on('furniture:move', ({ itemId, x, y }) => {
    if (!players.get(socket.id)) return;
    const item = persistentFurniture.find(f => f.id === itemId);
    if (!item) return;
    item.x = Math.round(Number(x) || 0);
    item.y = Math.round(Number(y) || 0);
    io.emit('furniture:update', { furniture: persistentFurniture });
    scheduleFurnitureSave();
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const player = players.get(socket.id);

    if (voicePeers.has(socket.id)) {
      voicePeers.delete(socket.id);
      for (const peerId of voicePeers) {
        io.to(peerId).emit('voice:peer-left', { peerId: socket.id });
      }
    }

    if (screenSharer === socket.id) {
      screenSharer = null;
      for (const peerId of voicePeers) {
        io.to(peerId).emit('screen:ended', { playerId: socket.id });
      }
    }

    if (player) {
      socket.broadcast.emit('player:leave', { id: socket.id, username: player.username });
      console.log(`${player.username} left the office`);
    }

    players.delete(socket.id);
  });
});

// === Exported API for Electron ===
async function startServer(port = 4000) {
  if (serverRunning) return { port };
  await initDb();
  return new Promise((resolve, reject) => {
    httpServer.listen(port, () => {
      serverRunning = true;
      console.log(`Server running on port ${port}`);
      resolve({ port });
    }).on('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverRunning) {
      resolve();
      return;
    }
    // Disconnect all sockets
    for (const [id, socket] of io.sockets.sockets) {
      socket.disconnect(true);
    }
    players.clear();
    voicePeers.clear();
    screenSharer = null;

    httpServer.close(() => {
      serverRunning = false;
      console.log('Server stopped');
      resolve();
    });
  });
}

function getState() {
  const userList = [];
  for (const p of players.values()) {
    userList.push({ username: p.username, zone: p.zone });
  }
  return { running: serverRunning, players: userList, playerCount: players.size };
}

// Zone bounds helper for pet spawning — must match map.js ZONES
const ZONE_BOUNDS = {
  henrik: { x: 1 * 32, y: 10 * 32, w: 6 * 32, h: 6 * 32 },
  alice:  { x: 8 * 32, y: 10 * 32, w: 6 * 32, h: 6 * 32 },
  leo:    { x: 15 * 32, y: 10 * 32, w: 6 * 32, h: 6 * 32 },
};

function getZoneBounds(zoneId) {
  const z = ZONE_BOUNDS[zoneId];
  if (!z) return null;
  return { ...z, cx: z.x + z.w / 2, cy: z.y + z.h / 2 };
}

// Pet wander — dogs slowly stroll around their office
setInterval(() => {
  for (const pet of officePets.values()) {
    const z = ZONE_BOUNDS[pet.zone];
    if (!z) continue;
    // Small random movement (30-60px) from current position, clamped to zone
    const margin = 48;
    const moveRange = 50;
    const newX = Math.max(z.x + margin, Math.min(z.x + z.w - margin, pet.x + (Math.random() - 0.5) * moveRange * 2));
    const newY = Math.max(z.y + margin, Math.min(z.y + z.h - margin, pet.y + (Math.random() - 0.5) * moveRange * 2));
    pet.x = newX;
    pet.y = newY;
    io.emit('pet:update', { petId: pet.id, x: pet.x, y: pet.y, action: 'walk' });
  }
}, 8000 + Math.random() * 7000);

module.exports = { startServer, stopServer, getState };

// === CLI mode: if run directly (not required by Electron) ===
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  startServer(PORT).then(() => {
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║   RGTeamSpeak — Virtual Office        ║`);
    console.log(`  ║   Running on http://localhost:${PORT}    ║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);
  });
}
