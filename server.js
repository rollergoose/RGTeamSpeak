const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { initDb } = db;

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
let planningBoard = [];          // [{ id, assignee, task, duration, column, color }]
const officePets = new Map();    // petId -> { id, type, name, x, y, ownerId, zone }
const sessionChat = [];          // in-memory chat messages (cleared on restart)
// Notice boards: keyed by office zone id → array of notes
const noticeBoards = { henrik: [], alice: [], leo: [] };
// Office locks: keyed by office zone id → { locked, lockedBy }
const officeLocks = { henrik: null, alice: null, leo: null };
// Player levels: keyed by socketId → { steps, meetingTime, tasksCompleted }
const playerStats = new Map();

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
      officeFurniture: [], // [{ id, type, x, y }] - placed items in their office
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

  // --- Zone changes ---
  socket.on('zone:change', ({ zoneId }) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.zone = zoneId;
    socket.broadcast.emit('zone:changed', { playerId: socket.id, zoneId });
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

  socket.on('board:add', ({ assignee, task, duration, column }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const card = {
      id: crypto.randomUUID(),
      assignee: (assignee || '').slice(0, 30),
      task: (task || '').slice(0, 200),
      duration: (duration || '').slice(0, 30),
      column: column === 'next' ? 'next' : 'now',
      color: player.appearance.shirtColor || '#e94560',
    };
    planningBoard.push(card);
    io.emit('board:sync', { board: planningBoard });
  });

  socket.on('board:update', ({ id, assignee, task, duration, column }) => {
    const card = planningBoard.find(c => c.id === id);
    if (!card) return;
    if (assignee !== undefined) card.assignee = (assignee || '').slice(0, 30);
    if (task !== undefined) card.task = (task || '').slice(0, 200);
    if (duration !== undefined) card.duration = (duration || '').slice(0, 30);
    if (column !== undefined) card.column = column === 'next' ? 'next' : 'now';
    io.emit('board:sync', { board: planningBoard });
  });

  socket.on('board:remove', ({ id }) => {
    planningBoard = planningBoard.filter(c => c.id !== id);
    io.emit('board:sync', { board: planningBoard });
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

  // --- Player Stats / Levels ---
  socket.on('stats:update', ({ steps, meetingTime }) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!playerStats.has(socket.id)) {
      playerStats.set(socket.id, { steps: 0, meetingTime: 0, tasksCompleted: 0 });
    }
    const stats = playerStats.get(socket.id);
    const oldStepLevel = getLevel(stats.steps, 5000);
    const oldMeetLevel = getLevel(stats.meetingTime, 60);

    if (steps) stats.steps += steps;
    if (meetingTime) stats.meetingTime += meetingTime;

    const newStepLevel = getLevel(stats.steps, 5000);
    const newMeetLevel = getLevel(stats.meetingTime, 60);

    // Check for level ups
    if (newStepLevel > oldStepLevel) {
      socket.emit('level:up', { category: 'Explorer', level: newStepLevel, stat: 'steps' });
    }
    if (newMeetLevel > oldMeetLevel) {
      socket.emit('level:up', { category: 'Communicator', level: newMeetLevel, stat: 'meetingTime' });
    }

    socket.emit('stats:sync', { stats, levels: {
      explorer: newStepLevel,
      communicator: newMeetLevel,
      achiever: getLevel(stats.tasksCompleted, 10),
    }});
  });

  socket.on('stats:get', () => {
    const stats = playerStats.get(socket.id) || { steps: 0, meetingTime: 0, tasksCompleted: 0 };
    socket.emit('stats:sync', { stats, levels: {
      explorer: getLevel(stats.steps, 5000),
      communicator: getLevel(stats.meetingTime, 60),
      achiever: getLevel(stats.tasksCompleted, 10),
    }});
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

  // --- Office Furniture ---
  // Upload saved furniture layout from localStorage on connect
  socket.on('furniture:upload', ({ furniture }) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!Array.isArray(furniture)) return;
    // Validate and sanitize
    player.officeFurniture = furniture.slice(0, 50).map(f => ({
      id: f.id || crypto.randomUUID(),
      type: (f.type || '').slice(0, 20),
      x: Math.round(f.x || 0),
      y: Math.round(f.y || 0),
      owner: socket.id,
    }));
    io.emit('furniture:update', { playerId: socket.id, furniture: player.officeFurniture });
  });

  socket.on('furniture:place', ({ type, x, y }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const item = {
      id: crypto.randomUUID(),
      type: (type || '').slice(0, 20),
      x: Math.round(x),
      y: Math.round(y),
      owner: socket.id,
    };
    player.officeFurniture.push(item);
    io.emit('furniture:update', { playerId: socket.id, furniture: player.officeFurniture });
  });

  socket.on('furniture:remove', ({ itemId }) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.officeFurniture = player.officeFurniture.filter(f => f.id !== itemId);
    io.emit('furniture:update', { playerId: socket.id, furniture: player.officeFurniture });
  });

  socket.on('furniture:move', ({ itemId, x, y }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const item = player.officeFurniture.find(f => f.id === itemId);
    if (!item) return;
    item.x = Math.round(x);
    item.y = Math.round(y);
    io.emit('furniture:update', { playerId: socket.id, furniture: player.officeFurniture });
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

// Level calculation: each level requires progressively more
// Max level 10. thresholdPerLevel = amount of stat per level
function getLevel(stat, thresholdPerLevel) {
  return Math.min(10, Math.floor(stat / thresholdPerLevel));
}

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
