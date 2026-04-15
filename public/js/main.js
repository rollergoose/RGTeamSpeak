import { SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, HAIR_STYLES, SPAWN_X, SPAWN_Y, ZONE_TYPES, BANDWIDTH_OPTIONS, DEFAULT_BANDWIDTH } from './constants.js';
import { Player } from './player.js';
import { initGame, setCallbacks, setInputFocused } from './game.js';
import { initChat } from './chat.js';
import { initVoice, joinVoice, leaveVoice, toggleMute, setVoiceStateCallback, getIsMuted } from './voice.js';
import { initScreenShare, startScreenShare, stopScreenShare, setBitrate, setScreenStateCallback, getIsSharing, getActiveSharer } from './screenshare.js';
import { initYouTube, enterChillZone, leaveChillZone } from './youtube.js';
import { onZoneEnter, onZoneLeave, getCurrentZone } from './zones.js';
import * as network from './network.js';
import { RemotePlayer } from './network.js';
import { drawCharacter } from './characters.js';
import { initBoard, openBoard, closeBoard, loadBoard, isOpen_ as isBoardOpen } from './board.js';

let localPlayer = null;
const remotePlayers = new Map();

// === Login / Character Customization ===
const loginScreen = document.getElementById('login-screen');
const gameContainer = document.getElementById('game-container');
const chatSidebar = document.getElementById('chat-sidebar');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');

// Customization state
let appearance = {
  skinTone: SKIN_TONES[0],
  hairStyle: 'short',
  hairColor: HAIR_COLORS[0],
  shirtColor: SHIRT_COLORS[5],
  pantsColor: PANTS_COLORS[0],
};

function buildCustomization() {
  buildPalette('skin-options', SKIN_TONES, 'skinTone');
  buildPalette('hair-color-options', HAIR_COLORS, 'hairColor');
  buildPalette('shirt-options', SHIRT_COLORS, 'shirtColor');
  buildPalette('pants-options', PANTS_COLORS, 'pantsColor');
  buildHairStyles();
  updatePreview();
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
}

// === Join Button ===
joinBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (username.length < 1 || username.length > 20) return;
  startApp(username);
});

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

function startApp(username) {
  loginScreen.style.display = 'none';
  gameContainer.style.display = 'flex';
  chatSidebar.style.display = 'flex';

  network.connect();

  network.emit('auth', { username, appearance });

  network.on('auth:ok', (data) => {
    localPlayer = new Player(data.x || SPAWN_X, data.y || SPAWN_Y, appearance);
    localPlayer.username = username;
    localPlayer.status = { inMeeting: false, muted: false };
    localPlayer.workStatus = null;

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
    if (data.planningBoard) loadBoard(data.planningBoard);
    setupZoneCallbacks();
    setupMeetingControls();
    setupNetworkHandlers();
    setupStatusPanel();
    setupKnockUI();
    setupGameCallbacks();
  });

  network.on('auth:error', (data) => {
    loginScreen.style.display = 'flex';
    gameContainer.style.display = 'none';
    chatSidebar.style.display = 'none';
    alert(data.message || 'Failed to join');
  });
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
    if (rp) rp.setTarget(data.x, data.y, data.direction, data.isMoving);
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
    }

    if (zone.type === ZONE_TYPES.CHILL) {
      enterChillZone();
    }

    if (zone.type === ZONE_TYPES.OFFICE) {
      statusPanel.classList.add('visible');
    }
  });

  onZoneLeave((zone) => {
    if (zone.type === ZONE_TYPES.MEETING) {
      meetingControls.classList.remove('visible');
      localPlayer.status.inMeeting = false;
      localPlayer.status.muted = false;
      leaveVoice();
      if (getIsSharing()) stopScreenShare();
    }

    if (zone.type === ZONE_TYPES.CHILL) {
      leaveChillZone();
    }

    if (zone.type === ZONE_TYPES.OFFICE) {
      statusPanel.classList.remove('visible');
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
  const knockBtn = document.getElementById('knock-btn');
  const knockInput = document.getElementById('knock-input');
  const knockSendBtn = document.getElementById('knock-send-btn');
  const knockOverlay = document.getElementById('knock-overlay');

  knockBtn.addEventListener('click', () => {
    knockOverlay.classList.toggle('visible');
    if (knockOverlay.classList.contains('visible')) {
      knockInput.focus();
    }
  });

  knockInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') knockSendBtn.click();
    if (e.key === 'Escape') knockOverlay.classList.remove('visible');
  });
  knockInput.addEventListener('focus', () => setInputFocused(true));
  knockInput.addEventListener('blur', () => setInputFocused(false));

  knockSendBtn.addEventListener('click', () => {
    if (!currentKnockTarget) return;
    const message = knockInput.value.trim() || 'Knock knock!';
    network.emit('knock:send', { targetZoneId: currentKnockTarget.zoneId, message });
    knockInput.value = '';
    knockOverlay.classList.remove('visible');
  });
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
      // Just track state — hint drawn by game.js
      boardHintShown = nearBoard;
    },
    knockProximity: (target) => {
      currentKnockTarget = target;
      const knockArea = document.getElementById('knock-area');
      if (target) {
        knockArea.classList.add('visible');
        document.getElementById('knock-target-name').textContent = `Knock on ${target.zoneName}`;
      } else {
        knockArea.classList.remove('visible');
        document.getElementById('knock-overlay').classList.remove('visible');
      }
    },
    keyAction: (action) => {
      if (action === 'interact') {
        // Check if near board
        const { isBoardNearby } = requireMap();
        if (isBoardNearby && isBoardNearby(localPlayer.x, localPlayer.y)) {
          if (isBoardOpen()) closeBoard();
          else openBoard();
        }
      }
    },
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

// Run setup immediately (doesn't need auth)
setupScreenShareWindow();

// === Initialize customization on load ===
buildCustomization();
