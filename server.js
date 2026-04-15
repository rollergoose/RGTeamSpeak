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

const SPAWN_X = 25 * 32;
const SPAWN_Y = 8 * 32;

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

    const chatHistory = db.getHistory(100);

    socket.emit('auth:ok', {
      id: socket.id,
      x: SPAWN_X,
      y: SPAWN_Y,
      players: existingPlayers,
      youtubeState,
      planningBoard,
    });

    // Send chat history
    socket.emit('chat:history', { messages: chatHistory });

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

  // --- Chat ---
  socket.on('chat:send', ({ message }) => {
    const player = players.get(socket.id);
    if (!player || !message || message.length > 500) return;

    const id = crypto.randomUUID();
    const msg = db.addMessage(id, player.username, player.appearance.shirtColor || '#e94560', message);
    io.emit('chat:message', msg);
  });

  socket.on('chat:history-before', ({ before }) => {
    const messages = db.getHistoryBefore(before, 50);
    socket.emit('chat:history', { messages, hasMore: messages.length === 50 });
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
    if (!pet || pet.ownerId !== socket.id) return;
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

// Zone bounds helper for pet spawning
const ZONE_BOUNDS = {
  henrik: { x: 5 * 32, y: 21 * 32, w: 8 * 32, h: 6 * 32 },
  alice:  { x: 16 * 32, y: 21 * 32, w: 8 * 32, h: 6 * 32 },
  leo:    { x: 27 * 32, y: 21 * 32, w: 8 * 32, h: 6 * 32 },
};

function getZoneBounds(zoneId) {
  const z = ZONE_BOUNDS[zoneId];
  if (!z) return null;
  return { ...z, cx: z.x + z.w / 2, cy: z.y + z.h / 2 };
}

// Pet wander — move pets randomly every 3-6 seconds
setInterval(() => {
  for (const pet of officePets.values()) {
    const z = ZONE_BOUNDS[pet.zone];
    if (!z) continue;
    // Random position within the zone (with margin)
    const margin = 40;
    pet.x = z.x + margin + Math.random() * (z.w - margin * 2);
    pet.y = z.y + margin + Math.random() * (z.h - margin * 2);
    io.emit('pet:update', { petId: pet.id, x: pet.x, y: pet.y, action: 'walk' });
  }
}, 4000 + Math.random() * 2000);

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
