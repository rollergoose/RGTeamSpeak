const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DB_PATH = path.join(DATA_DIR, 'rgteamspeak.db');

let db = null;

// Initialize database (async, must be called before use)
async function initDb() {
  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      color TEXT,
      message TEXT NOT NULL,
      timestamp INTEGER
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp
      ON messages(timestamp)
  `);

  // Save periodically (every 30 seconds)
  setInterval(saveDb, 30000);

  return db;
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('Failed to save database:', e.message);
  }
}

module.exports = {
  initDb,
  saveDb,

  addMessage(id, username, color, message) {
    if (!db) return { id, username, color, message, timestamp: Date.now() };
    const timestamp = Date.now();
    db.run('INSERT INTO messages (id, username, color, message, timestamp) VALUES (?, ?, ?, ?, ?)',
      [id, username, color, message, timestamp]);
    saveDb(); // Save immediately on new message
    return { id, username, color, message, timestamp };
  },

  getHistory(limit = 100) {
    if (!db) return [];
    const stmt = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  },

  getHistoryBefore(before, limit = 50) {
    if (!db) return [];
    const stmt = db.prepare('SELECT * FROM messages WHERE timestamp < ? ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([before, limit]);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  },
};
