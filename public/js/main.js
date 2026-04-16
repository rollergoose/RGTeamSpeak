import { SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, HAIR_STYLES, SPAWN_X, SPAWN_Y, ZONE_TYPES, BANDWIDTH_OPTIONS, DEFAULT_BANDWIDTH, HATS, OUTFITS, FACES, LEVEL_CATEGORIES } from './constants.js';
import { Player } from './player.js';
import { initGame, setCallbacks, setInputFocused, getCamera, triggerRemoteDeath } from './game.js';
import { setLockedDoorChecker, setFurnitureCollider } from './player.js';
import { initChat } from './chat.js';
import { initVoice, joinVoice, leaveVoice, toggleMute, setVoiceStateCallback, getIsMuted } from './voice.js';
import { initScreenShare, startScreenShare, stopScreenShare, setBitrate, setScreenStateCallback, getIsSharing, getActiveSharer } from './screenshare.js';
import { initYouTube, enterChillZone, leaveChillZone } from './youtube.js';
import { onZoneEnter, onZoneLeave, getCurrentZone } from './zones.js';
import * as network from './network.js';
import { RemotePlayer } from './network.js';
import { drawCharacter } from './characters.js';
import { initBoard, openBoard, closeBoard, loadBoard, isOpen_ as isBoardOpen, setLocalStats as setBoardLocalStats } from './board.js';
import { initPets, handlePetCommand, PET_TYPES } from './pets.js';
import { initDogPark } from './dogpark.js';

let localPlayer = null;
const remotePlayers = new Map();

// Global shared office furniture. Populated from auth:ok and kept in sync via furniture:update
// broadcasts. Any player can place, move, or remove any item.
let globalFurniture = [];

// === Login / Character Customization ===
const loginScreen = document.getElementById('login-screen');
const gameContainer = document.getElementById('game-container');
const chatSidebar = document.getElementById('chat-sidebar');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');

// Customization state — load from localStorage if available
const SAVE_KEY = 'rgteamspeak_prefs';
let appearance = loadPreferences().appearance || {
  skinTone: SKIN_TONES[0],
  hairStyle: 'short',
  hairColor: HAIR_COLORS[0],
  shirtColor: SHIRT_COLORS[5],
  pantsColor: PANTS_COLORS[0],
  hat: 'none',
  face: 'none',
  outfit: 'none',
};
// Ensure cosmetic fields exist (for old saves)
if (!appearance.hat) appearance.hat = 'none';
if (!appearance.face) appearance.face = 'none';
if (!appearance.outfit) appearance.outfit = 'none';

let playerMaxLevel = 0; // highest level across all categories

// Load saved username
const savedPrefs = loadPreferences();
if (savedPrefs.username) {
  usernameInput.value = savedPrefs.username;
}

function loadPreferences() {
  try {
    const data = localStorage.getItem(SAVE_KEY);
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function savePreferences() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      username: usernameInput.value.trim(),
      appearance: { ...appearance },
    }));
  } catch { /* storage full or disabled */ }
}

function buildCustomization() {
  buildPalette('skin-options', SKIN_TONES, 'skinTone');
  buildPalette('hair-color-options', HAIR_COLORS, 'hairColor');
  buildPalette('shirt-options', SHIRT_COLORS, 'shirtColor');
  buildPalette('pants-options', PANTS_COLORS, 'pantsColor');
  buildHairStyles();
  buildCosmeticOptions('hat-options', HATS, 'hat');
  buildCosmeticOptions('face-options', FACES, 'face');
  buildCosmeticOptions('outfit-options', OUTFITS, 'outfit');
  updatePreview();
}

function buildCosmeticOptions(containerId, items, key) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  // Derive current max level from saved stats — always authoritative, unlike
  // prefs.maxLevel which is only written on in-session level-ups.
  const liveLevel = getPlayerLevel(getLevels(loadStats()));
  const saved = loadPreferences();
  const maxLvl = Math.max(liveLevel, saved.maxLevel || 0, playerMaxLevel || 0);

  items.forEach(item => {
    const btn = document.createElement('button');
    const locked = item.level > maxLvl;
    btn.className = 'hair-style-btn' + (appearance[key] === item.id ? ' selected' : '') + (locked ? ' locked' : '');
    btn.textContent = item.name;
    btn.title = locked ? `Unlock at level ${item.level}` : item.name;
    btn.addEventListener('click', () => {
      if (locked) return;
      appearance[key] = item.id;
      container.querySelectorAll('.hair-style-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updatePreview();
    });
    container.appendChild(btn);
  });
}

function buildPalette(containerId, colors, key) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  colors.forEach((color) => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (appearance[key] === color ? ' selected' : '');
    swatch.style.backgroundColor = color;
    swatch.addEventListener('click', () => {
      appearance[key] = color;
      container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      updatePreview();
    });
    container.appendChild(swatch);
  });
}

function buildHairStyles() {
  const container = document.getElementById('hair-style-options');
  container.innerHTML = '';
  HAIR_STYLES.forEach(style => {
    const btn = document.createElement('button');
    btn.className = 'hair-style-btn' + (appearance.hairStyle === style ? ' selected' : '');
    btn.textContent = style;
    btn.addEventListener('click', () => {
      appearance.hairStyle = style;
      container.querySelectorAll('.hair-style-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updatePreview();
    });
    container.appendChild(btn);
  });
}

function updatePreview() {
  const canvas = document.getElementById('char-preview');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCharacter(ctx, canvas.width / 2, canvas.height - 10, appearance, 'down', false, 0, '', {});
  savePreferences();
}

// === Join Button ===
joinBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (username.length < 1 || username.length > 20) return;
  savePreferences();
  startApp(username);
});

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

async function startApp(username) {
  loginScreen.style.display = 'none';
  gameContainer.style.display = 'flex';
  // Chat starts minimized by default — user opens it via the top-right 💬 button.
  chatSidebar.style.display = 'none';
  const chatToggle = document.getElementById('chat-toggle-btn');
  if (chatToggle) chatToggle.style.display = 'flex';

  // Connect first, then register handlers (socket is ready)
  await network.connect();

  network.on('auth:ok', (data) => {
    try {
      localPlayer = new Player(data.x || SPAWN_X, data.y || SPAWN_Y, appearance);
      localPlayer.username = username;
      localPlayer.status = { inMeeting: false, muted: false };
      localPlayer.workStatus = null;
      localPlayer.level = 0; // seeded below via applyServerStats

      for (const p of (data.players || [])) {
        remotePlayers.set(p.id, new RemotePlayer(p));
      }

      const canvas = document.getElementById('game-canvas');
      initGame(canvas, localPlayer, remotePlayers);
      initChat();
      initVoice();
      initScreenShare();
      initYouTube();
      initBoard();
      initPets();
      initDogPark();
      if (data.planningBoard) loadBoard(data.planningBoard);
      // Seed server-authoritative stats before setupLevelSystem() runs
      if (data.stats || data.levels) {
        applyServerStats({ stats: data.stats, levels: data.levels });
      }
      setupZoneCallbacks();
      setupMeetingControls();
      setupNetworkHandlers();
      setupStatusPanel();
      setupKnockUI();
      setupGameCallbacks();
      setupOnlineHud();
      setupChatMinimize();
      setupFurnitureMenu();
      setupOfficeLocks();
      setupLevelSystem();
      setupNoticeBoard();
      setupYouTubeControls();

      // Seed from server — single shared list for the whole office.
      globalFurniture = Array.isArray(data.furniture) ? data.furniture : [];

      // Furniture collision checker — every item affects everyone.
      setFurnitureCollider(() => globalFurniture);
    } catch (err) {
      console.error('AUTH:OK HANDLER ERROR:', err);
    }
  });

  network.on('auth:error', (data) => {
    loginScreen.style.display = 'flex';
    gameContainer.style.display = 'none';
    chatSidebar.style.display = 'none';
    alert(data.message || 'Failed to join');
  });

  // Socket is connected, send auth
  network.emit('auth', { username, appearance });
}

// === Network Handlers ===
function setupNetworkHandlers() {
  network.on('player:join', (data) => {
    remotePlayers.set(data.id, new RemotePlayer(data));
  });

  network.on('player:leave', (data) => {
    remotePlayers.delete(data.id);
  });

  network.on('player:moved', (data) => {
    const rp = remotePlayers.get(data.id);
    if (rp) {
      // If this move arrives while the remote is in a death animation, clear it so the
      // respawn position snaps into place instead of interpolating weirdly across the map.
      if (rp.isDead) {
        rp.x = data.x; rp.y = data.y;
        rp.clearDeath();
      }
      rp.setTarget(data.x, data.y, data.direction, data.isMoving);
    }
  });

  // Easter egg: a remote player was just hit by a car — animate their death locally.
  network.on('player:died', ({ id }) => {
    triggerRemoteDeath(id);
    playMarioDeathSound();
  });

  network.on('voice:muted', ({ playerId, muted }) => {
    const rp = remotePlayers.get(playerId);
    if (rp) rp.muted = muted;
  });

  network.on('zone:changed', ({ playerId, zoneId }) => {
    const rp = remotePlayers.get(playerId);
    if (rp) {
      rp.zone = zoneId;
      rp.inMeeting = zoneId === 'meeting';
    }
  });

  // Status updates from other players
  network.on('status:update', ({ playerId, status }) => {
    const rp = remotePlayers.get(playerId);
    if (rp) rp.workStatus = status;
  });

  // Knock notifications
  network.on('knock:receive', ({ fromUsername, message }) => {
    showKnockNotification(fromUsername, message);
  });
}

// === Zone Callbacks ===
function setupZoneCallbacks() {
  const zoneLabel = document.getElementById('zone-label');
  const meetingControls = document.getElementById('meeting-controls');
  const statusPanel = document.getElementById('status-panel');

  onZoneEnter((zone) => {
    zoneLabel.textContent = zone.name;
    zoneLabel.style.display = 'block';
    network.emit('zone:change', { zoneId: zone.id });

    if (zone.type === ZONE_TYPES.MEETING) {
      meetingControls.classList.add('visible');
      localPlayer.status.inMeeting = true;
      joinVoice();
      showArchives();
      startMeetingTimer();
    }

    if (zone.type === ZONE_TYPES.CHILL) {
      enterChillZone();
    }

    if (zone.type === ZONE_TYPES.OFFICE) {
      document.getElementById('status-toggle-btn').style.display = 'flex';
      document.getElementById('furn-toggle-btn').style.display = 'flex';
    }

    if (zone.type === ZONE_TYPES.ARCHIVES) {
      showArchives();
    }
  });

  onZoneLeave((zone) => {
    if (zone.type === ZONE_TYPES.MEETING) {
      meetingControls.classList.remove('visible');
      localPlayer.status.inMeeting = false;
      localPlayer.status.muted = false;
      leaveVoice();
      if (getIsSharing()) stopScreenShare();
      hideArchives();
      stopMeetingTimer();
    }

    if (zone.type === ZONE_TYPES.CHILL) {
      leaveChillZone();
    }

    if (zone.type === ZONE_TYPES.ARCHIVES) {
      hideArchives();
    }

    if (zone.type === ZONE_TYPES.OFFICE) {
      document.getElementById('status-panel').classList.remove('visible');
      document.getElementById('status-toggle-btn').style.display = 'none';
      document.getElementById('notice-board-overlay').classList.remove('visible');
      document.getElementById('furniture-menu').classList.remove('visible');
      document.getElementById('furn-toggle-btn').style.display = 'none';
    }
  });
}

// === Meeting Room Controls ===
function setupMeetingControls() {
  const muteBtn = document.getElementById('btn-mute');
  const shareBtn = document.getElementById('btn-screenshare');
  const bwSelect = document.getElementById('bw-select');

  bwSelect.innerHTML = '';
  for (const bw of BANDWIDTH_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = bw;
    opt.textContent = bw >= 1000 ? `${bw / 1000} Mbps` : `${bw} kbps`;
    if (bw === DEFAULT_BANDWIDTH) opt.selected = true;
    bwSelect.appendChild(opt);
  }

  muteBtn.addEventListener('click', () => { toggleMute(); });
  shareBtn.addEventListener('click', () => {
    if (getIsSharing()) stopScreenShare();
    else startScreenShare();
  });
  bwSelect.addEventListener('change', () => { setBitrate(parseInt(bwSelect.value)); });

  setVoiceStateCallback(({ isInVoice, isMuted }) => {
    muteBtn.textContent = isMuted ? '🔇 Unmute' : '🎙️ Mute';
    muteBtn.classList.toggle('active', !isMuted);
    localPlayer.status.muted = isMuted;
  });

  setScreenStateCallback(({ isSharing, activeSharerSocket }) => {
    shareBtn.textContent = isSharing ? '⬛ Stop Share' : '🖥️ Share Screen';
    shareBtn.classList.toggle('sharing', isSharing);
    bwSelect.style.display = isSharing ? 'inline-block' : 'none';

    const viewer = document.getElementById('screenshare-overlay');
    if (activeSharerSocket && !isSharing) viewer.classList.add('visible');
    else if (!activeSharerSocket) viewer.classList.remove('visible');
  });
}

// === Status Panel ===
function setupStatusPanel() {
  const statusInput = document.getElementById('status-input');
  const statusLink = document.getElementById('status-link');
  const statusSetBtn = document.getElementById('status-set-btn');
  const statusClearBtn = document.getElementById('status-clear-btn');
  const statusPanel = document.getElementById('status-panel');
  const statusToggleBtn = document.getElementById('status-toggle-btn');
  const statusCloseBtn = document.getElementById('status-panel-close');

  // Toggle via button
  statusToggleBtn.addEventListener('click', () => {
    statusPanel.classList.toggle('visible');
  });
  statusCloseBtn.addEventListener('click', () => {
    statusPanel.classList.remove('visible');
  });

  [statusInput, statusLink].forEach(el => {
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('focus', () => setInputFocused(true));
    el.addEventListener('blur', () => setInputFocused(false));
  });

  statusSetBtn.addEventListener('click', () => {
    const text = statusInput.value.trim();
    const link = statusLink.value.trim();
    if (!text) return;
    localPlayer.workStatus = { text, link };
    network.emit('status:set', { text, link });
  });

  statusClearBtn.addEventListener('click', () => {
    statusInput.value = '';
    statusLink.value = '';
    localPlayer.workStatus = null;
    network.emit('status:clear', {});
  });
}

// === Knock UI ===
let currentKnockTarget = null;

function setupKnockUI() {
  const popup = document.getElementById('knock-popup-send');
  const knockInput = document.getElementById('knock-input');
  const knockSendBtn = document.getElementById('knock-send-btn');
  const knockCancel = document.getElementById('knock-cancel');
  const knockTarget = document.getElementById('knock-send-target');

  knockInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') knockSendBtn.click();
    if (e.key === 'Escape') closeKnockPopup();
  });
  knockInput.addEventListener('focus', () => setInputFocused(true));
  knockInput.addEventListener('blur', () => setInputFocused(false));

  knockCancel.addEventListener('click', closeKnockPopup);

  knockSendBtn.addEventListener('click', () => {
    if (!currentKnockTarget) return;
    const message = knockInput.value.trim() || 'Knock knock!';
    network.emit('knock:send', { targetZoneId: currentKnockTarget.zoneId, message });
    knockInput.value = '';
    closeKnockPopup();

    // Confirmation
    const conf = document.createElement('div');
    conf.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(46,204,113,0.9);color:#fff;padding:14px 28px;border-radius:12px;font-weight:600;font-size:15px;z-index:999;pointer-events:none;animation:knockBounce 0.4s ease;';
    conf.textContent = `✅ Knock sent to ${currentKnockTarget.zoneName}!`;
    document.body.appendChild(conf);
    setTimeout(() => conf.remove(), 2000);
  });
}

function openKnockPopup() {
  const popup = document.getElementById('knock-popup-send');
  const target = document.getElementById('knock-send-target');
  const input = document.getElementById('knock-input');
  target.textContent = currentKnockTarget?.zoneName || 'Office';
  popup.classList.add('visible');
  setTimeout(() => input.focus(), 100);
}

function closeKnockPopup() {
  document.getElementById('knock-popup-send').classList.remove('visible');
  document.getElementById('knock-input').value = '';
  setInputFocused(false);
}

function showKnockNotification(fromUsername, message) {
  // === 1. Play knock sound ===
  playKnockSound();

  // === 2. Big center-screen popup ===
  const overlay = document.getElementById('knock-popup-overlay');
  const popupName = document.getElementById('knock-popup-name');
  const popupMsg = document.getElementById('knock-popup-msg');
  const popupDismiss = document.getElementById('knock-popup-dismiss');

  popupName.textContent = fromUsername;
  popupMsg.textContent = message;
  overlay.classList.add('visible');

  const dismiss = () => { overlay.classList.remove('visible'); };
  popupDismiss.onclick = dismiss;
  // Auto dismiss after 15s
  setTimeout(dismiss, 15000);

  // === 3. Flash the taskbar / window title ===
  flashWindow(fromUsername, message);

  // === 3b. Electron taskbar flash (orange blink on Windows) ===
  if (window.electronAPI && window.electronAPI.flashWindow) {
    window.electronAPI.flashWindow();
  }

  // === 4. OS native notification ===
  sendNativeNotification(fromUsername, message);

  // === 5. Also add to the small notification list ===
  const container = document.getElementById('knock-notifications');
  const notif = document.createElement('div');
  notif.className = 'knock-notif';
  notif.innerHTML = `
    <div class="knock-notif-header">🚪 ${escapeHtml(fromUsername)} knocked</div>
    <div class="knock-notif-msg">${escapeHtml(message)}</div>
  `;
  container.appendChild(notif);
  setTimeout(() => { if (notif.parentElement) notif.remove(); }, 10000);
}

// Generate a knock sound using Web Audio API (no external file needed)
function playKnockSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Three quick knocks
    [0, 0.15, 0.3].forEach(delay => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + delay + 0.08);

      gain.gain.setValueAtTime(0.4, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.1);

      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.1);
    });
  } catch (e) { /* audio not available */ }
}

// Flash the window title bar to get attention
let flashInterval = null;
function flashWindow(fromUsername, message) {
  const originalTitle = document.title;
  let isFlash = false;
  let count = 0;

  if (flashInterval) clearInterval(flashInterval);

  flashInterval = setInterval(() => {
    isFlash = !isFlash;
    document.title = isFlash ? `🚪 ${fromUsername} knocked!` : originalTitle;
    count++;
    if (count > 20) {
      clearInterval(flashInterval);
      flashInterval = null;
      document.title = originalTitle;
    }
  }, 500);

  // If window regains focus, stop flashing
  const stopFlash = () => {
    if (flashInterval) {
      clearInterval(flashInterval);
      flashInterval = null;
      document.title = originalTitle;
    }
    window.removeEventListener('focus', stopFlash);
  };
  window.addEventListener('focus', stopFlash);
}

// Send a native OS notification (Windows toast)
function sendNativeNotification(fromUsername, message) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(`🚪 ${fromUsername} knocked`, {
      body: message,
      icon: '/assets/logo.png',
      tag: 'knock',
      requireInteraction: true,
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification(`🚪 ${fromUsername} knocked`, {
          body: message,
          icon: '/assets/logo.png',
          tag: 'knock',
          requireInteraction: true,
        });
      }
    });
  }
}

// === Game Callbacks ===
function setupGameCallbacks() {
  let boardHintShown = false;

  setCallbacks({
    boardProximity: (nearBoard) => {
      boardHintShown = nearBoard;
    },
    knockProximity: (target) => {
      currentKnockTarget = target;
      const knockArea = document.getElementById('knock-area');
      if (target) {
        knockArea.classList.add('visible');
        document.getElementById('knock-target-name').textContent = target.zoneName;
        // Show Space=Knock hint whenever standing outside near a door (regardless of occupancy)
        const knockHintE = document.getElementById('knock-hint-e');
        knockHintE.style.display = !target.isInside ? 'inline' : 'none';
        // Update lock hint
        const lockHint = document.getElementById('lock-hint-text');
        const isLocked = officeLocks[target.zoneId]?.locked;
        lockHint.textContent = isLocked ? 'Unlock' : 'Lock';
        updateLockUI();
      } else {
        knockArea.classList.remove('visible');
      }
    },
    keyAction: (action) => {
      if (action === 'interact') {
        // E key: Check office feedback board FIRST, then planning board, then knock
        const mapMod = requireMap();
        let handled = false;

        // 1. Office feedback board (inside offices)
        if (mapMod.getOfficeBoardNearby) {
          const officeBoard = mapMod.getOfficeBoardNearby(localPlayer.x, localPlayer.y);
          if (officeBoard) {
            const overlay = document.getElementById('notice-board-overlay');
            if (overlay.classList.contains('visible')) {
              overlay.classList.remove('visible');
            } else {
              openNoticeBoard(officeBoard.officeId, officeBoard.zoneName);
            }
            handled = true;
          }
        }

        // 2. Planning board (hallway)
        if (!handled && mapMod.isBoardNearby && mapMod.isBoardNearby(localPlayer.x, localPlayer.y)) {
          if (isBoardOpen()) closeBoard();
          else openBoard();
          handled = true;
        }

        // (Knock is now on Space key, not E)
      }
      if (action === 'knock') {
        // Space key: Open knock popup
        if (currentKnockTarget && !currentKnockTarget.isInside) {
          openKnockPopup();
        }
      }
      if (action === 'lock') {
        // Q key: Lock/unlock nearest office
        if (currentKnockTarget) {
          const officeId = currentKnockTarget.zoneId;
          const isLocked = officeLocks[officeId]?.locked;
          if (isLocked) {
            network.emit('office:unlock', { officeId });
          } else {
            network.emit('office:lock', { officeId });
          }
        }
      }
    },
    speechBubbles: () => {
      // Clean expired bubbles
      const now = Date.now();
      for (const [key, val] of speechBubbles) {
        if (now > val.expiresAt) speechBubbles.delete(key);
      }
      return speechBubbles;
    },
    localDeath: () => {
      // Car just hit us — Mario death sound + small notice. Camera/respawn handled in game.js.
      playMarioDeathSound();
    },
    allFurniture: () => globalFurniture,
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Lazy import
let _mapModule = null;
function requireMap() {
  return _mapModule || {};
}
import('./map.js').then(m => { _mapModule = m; });

// === Screenshare window: drag, resize, maximize ===
// === Archives Chat ===
let archivesInitialized = false;

function showArchives() {
  const panel = document.getElementById('archives-panel');
  panel.classList.add('visible');

  if (!archivesInitialized) {
    archivesInitialized = true;

    // Make archives draggable by header
    const header = panel.querySelector('.archives-header');
    let dragging = false, dragX = 0, dragY = 0;
    header.style.cursor = 'grab';
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      dragging = true;
      dragX = e.clientX - panel.offsetLeft;
      dragY = e.clientY - panel.offsetTop;
      header.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = (e.clientX - dragX) + 'px';
      panel.style.top = (e.clientY - dragY) + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; header.style.cursor = 'grab'; });
    const input = document.getElementById('archives-input');
    const sendBtn = document.getElementById('archives-send');
    const messages = document.getElementById('archives-messages');

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') sendBtn.click();
      if (e.key === 'Escape') input.blur();
    });
    input.addEventListener('focus', () => setInputFocused(true));
    input.addEventListener('blur', () => setInputFocused(false));

    sendBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return;
      network.emit('archive:send', { message: text });
      input.value = '';
    });

    network.on('archive:message', (msg) => {
      appendArchiveMessage(msg);
    });

    network.on('archive:history', ({ messages: msgs }) => {
      // History comes newest-first, reverse for display
      const container = document.getElementById('archives-messages');
      for (const msg of msgs.reverse()) {
        appendArchiveMessage(msg, true);
      }
    });
  }

  // Request history each time we open
  network.emit('archive:history', {});
}

function hideArchives() {
  document.getElementById('archives-panel').classList.remove('visible');
}

function appendArchiveMessage(msg, prepend = false) {
  const container = document.getElementById('archives-messages');

  // Avoid duplicates
  if (container.querySelector(`[data-id="${msg.id}"]`)) return;

  const el = document.createElement('div');
  el.className = 'archive-msg';
  el.dataset.id = msg.id;

  const time = document.createElement('span');
  time.className = 'chat-time';
  const d = new Date(msg.timestamp);
  time.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const name = document.createElement('span');
  name.className = 'chat-name';
  name.textContent = msg.username;
  if (msg.color) name.style.color = msg.color;

  const text = document.createElement('span');
  text.className = 'chat-text';
  text.textContent = ' ' + msg.message;

  el.appendChild(time);
  el.appendChild(document.createTextNode(' '));
  el.appendChild(name);
  el.appendChild(text);

  if (prepend) {
    container.prepend(el);
  } else {
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }
}

// === Notice Board UI ===
let currentNoticeOffice = null;

function setupNoticeBoard() {
  const overlay = document.getElementById('notice-board-overlay');
  const board = document.getElementById('notice-notes');
  const closeBtn = document.getElementById('notice-close');
  const addToggle = document.getElementById('notice-add-toggle');
  const addForm = document.getElementById('nb-add-form');
  const addBtn = document.getElementById('notice-add-btn');
  const msgInput = document.getElementById('notice-msg');
  const linkInput = document.getElementById('notice-link');

  [msgInput, linkInput].forEach(el => {
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('focus', () => setInputFocused(true));
    el.addEventListener('blur', () => setInputFocused(false));
  });

  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    currentNoticeOffice = null;
  });

  addToggle.addEventListener('click', () => {
    addForm.style.display = addForm.style.display === 'none' ? 'flex' : 'none';
    if (addForm.style.display !== 'none') msgInput.focus();
  });

  addBtn.addEventListener('click', () => {
    if (!currentNoticeOffice) return;
    const message = msgInput.value.trim();
    if (!message) return;
    network.emit('notice:add', {
      officeId: currentNoticeOffice,
      message,
      link: linkInput.value.trim(),
      status: 'review',
    });
    msgInput.value = '';
    linkInput.value = '';
    addForm.style.display = 'none';
    trackFeedback();
  });

  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  network.on('notice:sync', ({ officeId, notes }) => {
    // Track counts for all offices so we can draw badges on the map
    window._officeNoticeCounts = window._officeNoticeCounts || {};
    window._officeNoticeCounts[officeId] = notes.length;
    if (officeId !== currentNoticeOffice) return;
    renderNotes(notes);
  });

  // Request counts for all offices on startup (server broadcasts to everyone)
  for (const officeId of ['henrik', 'alice', 'leo']) {
    network.emit('notice:get', { officeId });
  }

  function renderNotes(notes) {
    board.innerHTML = '';
    if (notes.length === 0) {
      board.innerHTML = '<div class="nb-empty">No notices pinned yet.<br>Click "+ Add Notice" to post one.</div>';
      return;
    }
    for (const note of notes) {
      const el = document.createElement('div');
      el.className = 'nb-note status-' + (note.status || 'review');
      el.innerHTML = `
        <div class="nb-note-author">${escapeHtml(note.author)}</div>
        <div class="nb-note-msg">${escapeHtml(note.message)}</div>
        ${note.link ? `<a class="nb-note-link" href="${escapeHtml(note.link)}" target="_blank">🔗 ${escapeHtml(note.link.length > 40 ? note.link.slice(0, 38) + '...' : note.link)}</a>` : ''}
        <div class="nb-note-footer">
          <select data-id="${note.id}" class="nb-status-select">
            <option value="review" ${note.status === 'review' ? 'selected' : ''}>📋 Review</option>
            <option value="done" ${note.status === 'done' ? 'selected' : ''}>✅ Done</option>
            <option value="redo" ${note.status === 'redo' ? 'selected' : ''}>🔄 Redo</option>
          </select>
          <button data-action="remove" data-id="${note.id}">🗑️</button>
        </div>
      `;

      // Status change
      el.querySelector('.nb-status-select').addEventListener('change', (e) => {
        network.emit('notice:update', { officeId: currentNoticeOffice, noteId: e.target.dataset.id, status: e.target.value });
      });

      // Remove
      el.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
        network.emit('notice:remove', { officeId: currentNoticeOffice, noteId: e.target.dataset.id });
      });

      board.appendChild(el);
    }
  }
}

function openNoticeBoard(officeId, officeName) {
  currentNoticeOffice = officeId;
  document.getElementById('notice-title').textContent = `📌 ${officeName}`;
  document.getElementById('notice-board-overlay').classList.add('visible');
  document.getElementById('nb-add-form').style.display = 'none';
  network.emit('notice:get', { officeId });
}

// === YouTube Controls ===
function setupYouTubeControls() {
  const pauseBtn = document.getElementById('yt-pause');
  const playBtn = document.getElementById('yt-play');
  const backBtn = document.getElementById('yt-back');
  const fwdBtn = document.getElementById('yt-fwd');
  const controls = document.getElementById('youtube-controls');
  const iframe = document.getElementById('youtube-iframe');
  const timeDisplay = document.getElementById('yt-time');
  let ytStartedAt = 0;
  let ytPaused = false;
  let ytPausedAt = 0;

  // Track time
  setInterval(() => {
    if (!ytStartedAt || ytPaused) return;
    const elapsed = Math.floor((Date.now() - ytStartedAt) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    timeDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);

  pauseBtn.addEventListener('click', () => {
    ytPaused = true;
    ytPausedAt = (Date.now() - ytStartedAt) / 1000;
    iframe.src = ''; // Stop playback
    network.emit('youtube:pause', {});
  });

  playBtn.addEventListener('click', () => {
    ytPaused = false;
    const time = ytPausedAt || 0;
    network.emit('youtube:play', { time });
  });

  backBtn.addEventListener('click', () => {
    const elapsed = (Date.now() - ytStartedAt) / 1000;
    const newTime = Math.max(0, elapsed - 10);
    network.emit('youtube:seek', { time: newTime });
  });

  fwdBtn.addEventListener('click', () => {
    const elapsed = (Date.now() - ytStartedAt) / 1000;
    network.emit('youtube:seek', { time: elapsed + 10 });
  });

  network.on('youtube:update', (data) => {
    ytStartedAt = data.startedAt;
    ytPaused = false;
    controls.style.display = 'flex';
  });

  network.on('youtube:cleared', () => {
    controls.style.display = 'none';
    ytStartedAt = 0;
  });

  network.on('youtube:pause', () => {
    ytPaused = true;
    ytPausedAt = (Date.now() - ytStartedAt) / 1000;
    iframe.src = '';
  });

  network.on('youtube:play', ({ time }) => {
    ytPaused = false;
    ytStartedAt = Date.now() - time * 1000;
    // Reload with new time
    const videoId = iframe.src.match(/embed\/([^?]+)/)?.[1];
    if (videoId) {
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${Math.floor(time)}`;
    }
  });

  // Make YouTube overlay draggable
  const overlay = document.getElementById('youtube-overlay');
  const handle = document.getElementById('youtube-drag-handle');
  let dragging = false, dx = 0, dy = 0;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    dx = e.clientX - overlay.offsetLeft;
    dy = e.clientY - overlay.offsetTop;
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    overlay.style.left = (e.clientX - dx) + 'px';
    overlay.style.top = (e.clientY - dy) + 'px';
    overlay.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}

function setupScreenShareWindow() {
  const overlay = document.getElementById('screenshare-overlay');
  const handle = document.getElementById('screenshare-drag-handle');
  const resizeHandle = document.getElementById('screenshare-resize');
  const maxBtn = document.getElementById('screenshare-maximize');
  const minBtn = document.getElementById('screenshare-minimize');
  const closeBtn = document.getElementById('screenshare-close');

  let isDragging = false;
  let isResizing = false;
  let dragOffsetX = 0, dragOffsetY = 0;
  let savedBounds = null;

  // --- Drag ---
  handle.addEventListener('mousedown', (e) => {
    if (overlay.classList.contains('maximized')) return;
    if (e.target.closest('.screenshare-btns')) return; // don't drag from buttons
    isDragging = true;
    dragOffsetX = e.clientX - overlay.offsetLeft;
    dragOffsetY = e.clientY - overlay.offsetTop;
    e.preventDefault();
  });

  // --- Resize ---
  resizeHandle.addEventListener('mousedown', (e) => {
    if (overlay.classList.contains('maximized')) return;
    isResizing = true;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const container = overlay.parentElement;
      let x = e.clientX - dragOffsetX;
      let y = e.clientY - dragOffsetY;
      // Clamp to container
      x = Math.max(0, Math.min(container.clientWidth - 100, x));
      y = Math.max(0, Math.min(container.clientHeight - 40, y));
      overlay.style.left = x + 'px';
      overlay.style.top = y + 'px';
    }
    if (isResizing) {
      const rect = overlay.getBoundingClientRect();
      const containerRect = overlay.parentElement.getBoundingClientRect();
      let w = e.clientX - rect.left;
      let h = e.clientY - rect.top;
      w = Math.max(320, Math.min(containerRect.width - overlay.offsetLeft, w));
      h = Math.max(200, Math.min(containerRect.height - overlay.offsetTop, h));
      overlay.style.width = w + 'px';
      overlay.style.height = h + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
  });

  // --- Maximize ---
  maxBtn.addEventListener('click', () => {
    savedBounds = {
      left: overlay.style.left,
      top: overlay.style.top,
      width: overlay.style.width,
      height: overlay.style.height,
    };
    overlay.classList.add('maximized');
    maxBtn.style.display = 'none';
    minBtn.style.display = 'flex';
  });

  // --- Restore ---
  minBtn.addEventListener('click', () => {
    overlay.classList.remove('maximized');
    if (savedBounds) {
      overlay.style.left = savedBounds.left;
      overlay.style.top = savedBounds.top;
      overlay.style.width = savedBounds.width;
      overlay.style.height = savedBounds.height;
    }
    maxBtn.style.display = 'flex';
    minBtn.style.display = 'none';
  });

  // --- Close ---
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    overlay.classList.remove('maximized');
    maxBtn.style.display = 'flex';
    minBtn.style.display = 'none';
  });

  // --- Double-click header to toggle maximize ---
  handle.addEventListener('dblclick', () => {
    if (overlay.classList.contains('maximized')) {
      minBtn.click();
    } else {
      maxBtn.click();
    }
  });
}

// === Online Players HUD ===
function setupOnlineHud() {
  const hud = document.getElementById('online-hud');
  const list = document.getElementById('online-hud-list');
  const count = document.getElementById('online-count');
  const btn = document.getElementById('online-btn');

  btn.addEventListener('click', () => { hud.classList.toggle('visible'); });

  // Poll for player list every 3 seconds
  function updateOnlineList() {
    network.emit('players:list', {});
  }

  network.on('players:list', ({ players }) => {
    count.textContent = players.length;
    list.innerHTML = '';
    const now = Date.now();
    for (const p of players) {
      const elapsed = now - p.joinedAt;
      const h = Math.floor(elapsed / 3600000);
      const m = Math.floor((elapsed % 3600000) / 60000);
      const timeStr = h > 0 ? `${h}h${m}m` : `${m}m`;
      const zoneName = p.zone || 'Lobby';

      const el = document.createElement('div');
      el.innerHTML = `
        <div class="online-player">
          <span class="online-dot" style="background:${escapeHtml(p.color)}"></span>
          <span class="online-name">${escapeHtml(p.username)}</span>
          <span class="online-time">${timeStr}</span>
        </div>
        <div class="online-zone">${escapeHtml(zoneName)}</div>
      `;
      list.appendChild(el);
    }
  });

  setInterval(updateOnlineList, 3000);
  updateOnlineList();
}

// === Chat Minimize + Badge + Speech Bubbles ===
// Chat starts minimized on login (startApp hides the sidebar and shows the toggle button).
let chatMinimized = true;
let unreadCount = 0;

function setupChatMinimize() {
  const sidebar = document.getElementById('chat-sidebar');
  const toggleBtn = document.getElementById('chat-toggle-btn');
  const minBtn = document.getElementById('chat-minimize-btn');
  const badge = document.getElementById('chat-badge');
  const topRight = document.getElementById('top-right-buttons');

  function updateTopRightOffset() {
    if (sidebar.style.display === 'none' || getComputedStyle(sidebar).display === 'none') {
      topRight.style.right = '8px';
    } else {
      topRight.style.right = (sidebar.offsetWidth + 8) + 'px';
    }
  }

  minBtn.addEventListener('click', () => {
    chatMinimized = true;
    sidebar.style.display = 'none';
    toggleBtn.style.display = 'flex';
    unreadCount = 0;
    badge.style.display = 'none';
    updateTopRightOffset();
  });

  toggleBtn.addEventListener('click', () => {
    chatMinimized = false;
    sidebar.style.display = 'flex';
    toggleBtn.style.display = 'none';
    unreadCount = 0;
    badge.style.display = 'none';
    updateTopRightOffset();
  });

  // Chat sidebar resize
  const resizeHandle = document.getElementById('chat-resize-handle');
  let isResizingChat = false;
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizingChat = true;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isResizingChat) return;
    const newWidth = window.innerWidth - e.clientX;
    sidebar.style.width = Math.max(200, Math.min(600, newWidth)) + 'px';
    sidebar.style.minWidth = sidebar.style.width;
    updateTopRightOffset();
  });
  document.addEventListener('mouseup', () => { isResizingChat = false; });

  // Initial offset — chat starts minimized, so the top-right row sits flush.
  updateTopRightOffset();

  // Listen for chat messages to show red-dot notification + speech bubble
  network.on('chat:message', (msg) => {
    if (chatMinimized && msg.username !== localPlayer?.username) {
      unreadCount++;
      badge.style.display = 'block';
      // Re-trigger pulse animation so each incoming message gives a visual nudge
      badge.style.animation = 'none';
      badge.offsetHeight; // force reflow
      badge.style.animation = '';
    }

    // Show speech bubble over the sender's character
    showSpeechBubble(msg.username, msg.message);
  });
}

// Speech bubbles — store active bubbles, drawn by game.js
const speechBubbles = new Map(); // username -> { text, expiresAt }

function showSpeechBubble(username, message) {
  const displayText = message.length > 30 ? message.slice(0, 28) + '..' : message;
  speechBubbles.set(username, {
    text: displayText,
    expiresAt: Date.now() + 5000, // show for 5 seconds
  });
}

// Export for game.js to read
export function getSpeechBubbles() {
  const now = Date.now();
  for (const [key, val] of speechBubbles) {
    if (now > val.expiresAt) speechBubbles.delete(key);
  }
  return speechBubbles;
}

// === Furniture Placement Menu ===
let selectedFurniture = null;

function setupFurnitureMenu() {
  const menu = document.getElementById('furniture-menu');
  const allBtns = document.querySelectorAll('#furniture-items .furn-btn');
  const tabs = document.querySelectorAll('.furn-tab');
  const canvas = document.getElementById('game-canvas');

  // Toggle button opens/closes the panel
  const toggleBtn = document.getElementById('furn-toggle-btn');
  toggleBtn.addEventListener('click', () => {
    menu.classList.toggle('visible');
  });

  // Category tab filtering
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.dataset.cat;
      allBtns.forEach(btn => {
        btn.style.display = (cat === 'all' || btn.dataset.cat === cat) ? 'flex' : 'none';
      });
    });
  });

  // Item selection (furniture only, not pets)
  allBtns.forEach(btn => {
    if (btn.classList.contains('pet-btn')) return; // pets handled separately
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (selectedFurniture === type) {
        selectedFurniture = null;
        btn.classList.remove('selected');
      } else {
        allBtns.forEach(b => b.classList.remove('selected'));
        selectedFurniture = type;
        btn.classList.add('selected');
      }
    });
  });

  // Click on canvas to place furniture
  canvas.addEventListener('click', (e) => {
    if (!selectedFurniture) return;
    if (!localPlayer) return;

    const cam = getCamera();
    if (!cam) { console.warn('No camera'); return; }

    // Get world position from click
    const rect = canvas.getBoundingClientRect();
    const worldX = e.clientX - rect.left + cam.x;
    const worldY = e.clientY - rect.top + cam.y;

    network.emit('furniture:place', {
      type: selectedFurniture,
      x: worldX,
      y: worldY,
    });

    // Keep selection so the player can spam-place the same item.
    // Click the highlighted button again (or press Esc) to deselect.
  });

  // Right-click to remove furniture (find nearest placed item — any player's)
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!localPlayer || globalFurniture.length === 0) return;
    const cam = getCamera();
    if (!cam) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = e.clientX - rect.left + cam.x;
    const worldY = e.clientY - rect.top + cam.y;

    // Find the closest item within 32px — furniture is shared, anyone can remove anything
    let closest = null;
    let closestDist = 32;
    for (const item of globalFurniture) {
      const dist = Math.sqrt((item.x - worldX) ** 2 + (item.y - worldY) ** 2);
      if (dist < closestDist) {
        closest = item;
        closestDist = dist;
      }
    }
    if (closest) {
      network.emit('furniture:remove', { itemId: closest.id });
    }
  });

  // Esc key clears the current furniture selection (since clicks no longer auto-deselect).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!selectedFurniture) return;
    selectedFurniture = null;
    document.querySelectorAll('.furn-btn.selected').forEach(b => b.classList.remove('selected'));
  });

  // Server is authoritative — just replace our local cache when the canonical list changes.
  network.on('furniture:update', ({ furniture }) => {
    globalFurniture = Array.isArray(furniture) ? furniture : [];
  });

  // Pet placement buttons
  const petButtons = document.querySelectorAll('.pet-btn');
  petButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const petType = btn.dataset.pet;
      const currentZone = getCurrentZone();
      if (!currentZone || currentZone.type !== ZONE_TYPES.OFFICE) {
        return; // Can only place pets in offices
      }
      const petName = prompt('Name your pet:') || 'Buddy';
      network.emit('pet:place', { type: petType, name: petName, zone: currentZone.id });
    });
  });
}

// Zone helpers — import from zones.js
function getCurrentZoneFromZones() {
  return getCurrentZone();
}

// Camera helper for furniture placement
function getCameraFromGame() { return getCamera(); }

// === Office Locks ===
let officeLocks = {};

function setupOfficeLocks() {
  network.on('office:lock-sync', ({ locks }) => {
    officeLocks = locks;
    window._officeLocks = locks; // expose for game.js locked door rendering
    updateLockUI();
  });

  network.emit('office:get-locks', {});

  // Set up the locked door collision checker for player.js
  // Maps door tile positions to office IDs
  const doorToOffice = {
    '3,9': 'henrik', '4,9': 'henrik',
    '10,9': 'alice', '11,9': 'alice',
    '17,9': 'leo', '18,9': 'leo',
  };

  setLockedDoorChecker((col, row) => {
    const key = col + ',' + row;
    const officeId = doorToOffice[key];
    if (!officeId) return false;
    return !!(officeLocks[officeId]?.locked);
  });
}

function updateLockUI() {
  const lockStatus = document.getElementById('knock-lock-status');
  if (!currentKnockTarget || !lockStatus) return;
  const lock = officeLocks[currentKnockTarget.zoneId];
  if (lock && lock.locked) {
    lockStatus.textContent = `🔒 Busy (${lock.lockedBy})`;
    lockStatus.className = 'lock-locked';
    lockStatus.style.display = 'inline';
  } else {
    lockStatus.style.display = 'none';
  }
}

// === Player Levels & Step Tracking ===
let stepCount = 0;
let lastStepX = 0, lastStepY = 0;
let meetingSeconds = 0;
let meetingInterval = null;

// Clear any legacy localStorage furniture entry — server is the single source of truth now.
try { localStorage.removeItem('rgteamspeak_furniture'); } catch {}

// === Player Stats & Levels (server-authoritative) ===
// The server is the single source of truth for stats (persisted per username
// in data/player-stats.json). Stats follow the username anywhere — only the
// appearance/username prefs live in localStorage. See server.js bumpStat().
let currentStats = { steps: 0, meetingTime: 0, feedbackGiven: 0, chatMessages: 0, tasksCompleted: 0 };
let currentLevels = { explorer: 0, communicator: 0, feedback: 0, chatter: 0, achiever: 0 };

function loadStats() { return currentStats; }

function getLevel(stat, perLevel) {
  return Math.min(10, Math.floor(stat / perLevel));
}

function getLevels(stats) {
  const levels = {};
  for (const cat of LEVEL_CATEGORIES) {
    levels[cat.id] = getLevel(stats[cat.stat] || 0, cat.perLevel);
  }
  return levels;
}

function getPlayerLevel(levels) {
  let total = 0;
  for (const cat of LEVEL_CATEGORIES) {
    total += levels[cat.id] || 0;
  }
  return total; // max 50
}

// Apply a server stats payload (shape: { stats, levels }) — unlock cosmetics if
// player-level went up, refresh the stats panel + board XP strip.
function applyServerStats({ stats, levels }) {
  if (stats) currentStats = { ...currentStats, ...stats };
  currentLevels = levels || getLevels(currentStats);
  const playerLevel = getPlayerLevel(currentLevels);
  // Keep the local Player's total level in sync so hover nametags show the right number.
  if (localPlayer) localPlayer.level = playerLevel;
  if (playerLevel > playerMaxLevel) {
    playerMaxLevel = playerLevel;
    try {
      const prefs = loadPreferences();
      prefs.maxLevel = playerMaxLevel;
      localStorage.setItem(SAVE_KEY, JSON.stringify(prefs));
    } catch {}
    buildCosmeticOptions('hat-options', HATS, 'hat');
    buildCosmeticOptions('face-options', FACES, 'face');
    buildCosmeticOptions('outfit-options', OUTFITS, 'outfit');
  }
  updateStatsPanel(currentStats, currentLevels);
  setBoardLocalStats(currentStats, currentLevels);
}

// Emit a stat delta to the server. Server applies, persists, detects level-ups,
// and broadcasts celebrate:levelup. Local UI updates optimistically for snappiness.
function bumpServerStat(delta) {
  if (!delta) return;
  for (const [k, v] of Object.entries(delta)) {
    if (typeof currentStats[k] !== 'number') currentStats[k] = 0;
    currentStats[k] += v;
  }
  currentLevels = getLevels(currentStats);
  updateStatsPanel(currentStats, currentLevels);
  setBoardLocalStats(currentStats, currentLevels);
  network.emit('stats:bump', { delta });
}

function setupLevelSystem() {
  // auth:ok already seeded currentStats via applyServerStats — render once more.
  updateStatsPanel(currentStats, currentLevels);
  setBoardLocalStats(currentStats, currentLevels);

  // Server pushes full stats on request or after bumps.
  network.on('stats:sync', applyServerStats);

  // Level-up broadcasts — server detects & broadcasts to everyone.
  network.on('celebrate:levelup', ({ username, category, level, totalLevel, color }) => {
    // Keep remote players' total level in sync for hover nametags.
    if (typeof totalLevel === 'number' && username !== localPlayer?.username) {
      for (const rp of remotePlayers.values()) {
        if (rp.username === username) { rp.level = totalLevel; break; }
      }
    }
    if (username === localPlayer?.username) {
      // Me — fire the big popup + fanfare (existing UX)
      showLevelUp(category, level);
    } else {
      showAchievementToast(`🎉 ${username} reached ${category} Lv ${level}!`, color);
      playDingSound();
    }
  });

  // Task-completion broadcast — mini celebration on every screen.
  network.on('celebrate:task-done', ({ completer, color }) => {
    spawnConfetti(document.body, 14, color ? [color, '#2ecc71', '#f1c40f'] : null);
    playDingSound();
  });

  // Track steps — delta sent to server each tick if player moved.
  setInterval(() => {
    if (!localPlayer) return;
    const dx = localPlayer.x - lastStepX;
    const dy = localPlayer.y - lastStepY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) {
      const steps = Math.floor(dist / 16);
      lastStepX = localPlayer.x;
      lastStepY = localPlayer.y;
      if (steps > 0) bumpServerStat({ steps });
    }
  }, 1000);

  // Track chat messages — count only our own.
  network.on('chat:message', (msg) => {
    if (msg.username === localPlayer?.username) {
      bumpServerStat({ chatMessages: 1 });
    }
  });

  // Stats button
  const statsBtn = document.getElementById('stats-btn');
  const statsPanel = document.getElementById('stats-panel');
  const statsClose = document.getElementById('stats-close');
  statsBtn.addEventListener('click', () => {
    const visible = statsPanel.style.display !== 'none';
    statsPanel.style.display = visible ? 'none' : 'block';
    if (!visible) network.emit('stats:get', {});
  });
  statsClose.addEventListener('click', () => { statsPanel.style.display = 'none'; });
}

function trackFeedback() { bumpServerStat({ feedbackGiven: 1 }); }

function startMeetingTimer() {
  if (meetingInterval) return;
  meetingInterval = setInterval(() => bumpServerStat({ meetingTime: 1 }), 60000);
}

function stopMeetingTimer() {
  if (meetingInterval) { clearInterval(meetingInterval); meetingInterval = null; }
}

function updateStatsPanel(stats, levels) {
  for (const cat of LEVEL_CATEGORIES) {
    const bar = document.getElementById('stats-' + cat.id);
    const lvl = document.getElementById('stats-' + cat.id + '-lvl');
    if (bar) bar.style.width = ((levels[cat.id] || 0) / 10 * 100) + '%';
    if (lvl) lvl.textContent = `${levels[cat.id] || 0}/10`;
  }

  const plvl = document.getElementById('stats-player-level');
  if (plvl) plvl.textContent = getPlayerLevel(levels);

  const detail = document.getElementById('stats-detail');
  if (detail) {
    detail.textContent = `Steps: ${stats.steps || 0} | Meetings: ${stats.meetingTime || 0}m | Feedback: ${stats.feedbackGiven || 0} | Chats: ${stats.chatMessages || 0} | Tasks: ${stats.tasksCompleted || 0}`;
  }
}

const CONFETTI_COLORS = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'];

// Spawn `count` confetti pieces inside `target`. Colors defaults to the rainbow palette.
// Pieces self-remove via animationend so we don't leak DOM.
function spawnConfetti(target, count = 30, colors) {
  if (!target) return;
  const palette = (Array.isArray(colors) && colors.length) ? colors : CONFETTI_COLORS;
  // For the fullscreen levelup container we clear first; for ad-hoc targets we append.
  const isLevelupContainer = target.id === 'levelup-confetti';
  if (isLevelupContainer) target.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = palette[Math.floor(Math.random() * palette.length)];
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.width = (4 + Math.random() * 8) + 'px';
    piece.style.height = (4 + Math.random() * 8) + 'px';
    if (!isLevelupContainer) {
      piece.style.position = 'fixed';
      piece.style.top = '20%';
      piece.style.zIndex = '1200';
      piece.addEventListener('animationend', () => piece.remove(), { once: true });
    }
    target.appendChild(piece);
  }
}

function showLevelUp(category, level) {
  const popup = document.getElementById('levelup-popup');
  const detail = document.getElementById('levelup-detail');
  const levelEl = document.getElementById('levelup-level');
  const confettiEl = document.getElementById('levelup-confetti');

  detail.textContent = category;
  levelEl.textContent = `Level ${level} / 10`;
  popup.style.display = 'flex';

  playLevelUpSound();
  spawnConfetti(confettiEl, 30);

  // Auto dismiss after 5s
  setTimeout(() => { popup.style.display = 'none'; }, 5000);
}

// Short celebratory ding for task completions (and observer level-up toasts).
// Intentionally subtle — not the full orchestral fanfare.
function playDingSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    const playNote = (freq, start, dur, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start); osc.stop(t + start + dur);
    };
    playNote(784, 0,    0.18, 0.12); // G5
    playNote(1047, 0.09, 0.22, 0.10); // C6
  } catch (e) { /* audio not available */ }
}

// Classic Mario-death jingle: a quick dip-down, then descending arpeggio, then a deep
// stinger — plays locally when a car flattens you.
function playMarioDeathSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    const playNote = (freq, start, dur, vol, type = 'square') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start); osc.stop(t + start + dur);
    };
    // "Oof" dip at impact
    playNote(392, 0.00, 0.12, 0.12);  // G4
    playNote(294, 0.08, 0.14, 0.10);  // D4
    // Descending arpeggio — the iconic death melody
    playNote(523, 0.18, 0.10, 0.12);  // C5
    playNote(494, 0.28, 0.10, 0.12);  // B4
    playNote(440, 0.38, 0.10, 0.12);  // A4
    playNote(392, 0.48, 0.10, 0.12);  // G4
    playNote(349, 0.58, 0.10, 0.12);  // F4
    playNote(330, 0.68, 0.10, 0.12);  // E4
    playNote(294, 0.78, 0.18, 0.14);  // D4 longer
    // Deep thud
    playNote(98,  1.00, 0.35, 0.18, 'sine');   // G2 low bass
    playNote(65,  1.05, 0.35, 0.14, 'triangle'); // C2
  } catch (e) { /* audio not available */ }
}

// Small achievement toast for celebrating someone ELSE's level-up.
// Stacks if multiple arrive; auto-dismisses after ~3s.
let toastContainerEl = null;
function showAchievementToast(text, color) {
  if (!toastContainerEl) {
    toastContainerEl = document.createElement('div');
    toastContainerEl.id = 'achievement-toasts';
    document.body.appendChild(toastContainerEl);
  }
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.style.borderLeftColor = color || '#f1c40f';
  toast.textContent = text;
  toastContainerEl.appendChild(toast);
  // Slide in, then after a delay slide out + remove
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function playLevelUpSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // Helper to create an oscillator note
    function playNote(freq, type, start, dur, vol) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start);
      osc.stop(t + start + dur);
    }

    // === Deep brass fanfare (trombone/horn) ===
    playNote(131, 'sawtooth', 0, 0.6, 0.15);      // C3 low brass hit
    playNote(165, 'sawtooth', 0, 0.6, 0.12);       // E3 harmony
    playNote(196, 'sawtooth', 0.05, 0.55, 0.10);   // G3

    // === Rising trumpet melody ===
    playNote(262, 'square', 0.15, 0.25, 0.12);     // C4
    playNote(330, 'square', 0.3, 0.25, 0.12);      // E4
    playNote(392, 'square', 0.45, 0.25, 0.14);     // G4
    playNote(523, 'square', 0.6, 0.5, 0.16);       // C5 — big hit!

    // === Strings swell ===
    playNote(523, 'sine', 0.6, 0.8, 0.10);         // C5
    playNote(659, 'sine', 0.65, 0.75, 0.08);       // E5
    playNote(784, 'sine', 0.7, 0.7, 0.08);         // G5

    // === Second brass chord (the big payoff) ===
    playNote(262, 'sawtooth', 0.6, 0.8, 0.12);     // C4
    playNote(330, 'sawtooth', 0.6, 0.8, 0.10);     // E4
    playNote(392, 'sawtooth', 0.6, 0.8, 0.10);     // G4
    playNote(523, 'sawtooth', 0.6, 0.8, 0.08);     // C5

    // === High sparkle / chime ===
    playNote(1047, 'sine', 0.8, 0.4, 0.06);        // C6
    playNote(1319, 'sine', 0.9, 0.3, 0.04);        // E6
    playNote(1568, 'sine', 1.0, 0.3, 0.03);        // G6

    // === Timpani / bass drum hits ===
    playNote(65, 'sine', 0, 0.3, 0.2);             // deep boom
    playNote(65, 'sine', 0.6, 0.4, 0.25);          // big boom on payoff

    // === Applause (white noise bursts) ===
    for (let i = 0; i < 8; i++) {
      const bufferSize = 4096;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) data[j] = (Math.random() * 2 - 1) * 0.3;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      const start = 0.8 + i * 0.15 + Math.random() * 0.1;
      noiseGain.gain.setValueAtTime(0.03, t + start);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + start + 0.12);
      noise.start(t + start);
      noise.stop(t + start + 0.12);
    }
  } catch (e) { /* audio not available */ }
}

// Run setup immediately (doesn't need auth — UI only, no network)
setupScreenShareWindow();

// === Initialize customization on load ===
buildCustomization();
