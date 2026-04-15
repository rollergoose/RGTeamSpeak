const btnToggle = document.getElementById('btn-toggle');
const btnToggleText = document.getElementById('btn-toggle-text');
const btnToggleIcon = document.getElementById('btn-toggle-icon');
const btnOffice = document.getElementById('btn-office');
const statusBar = document.getElementById('status-bar');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const infoCard = document.getElementById('info-card');
const ipDisplay = document.getElementById('ip-display');
const linkDisplay = document.getElementById('link-display');
const linkRow = document.getElementById('link-row');
const copyToast = document.getElementById('copy-toast');
const userList = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const serverNameInput = document.getElementById('server-name');
const portInput = document.getElementById('port-input');
const connectCard = document.getElementById('connect-card');
const connectBtn = document.getElementById('btn-connect');
const connectHostInput = document.getElementById('connect-host');

const isElectron = !!window.electronAPI;
let isRunning = false;
let pollInterval = null;

// === Tab switching ===
const tabHost = document.getElementById('tab-host');
const tabJoin = document.getElementById('tab-join');
const modeHost = document.getElementById('mode-host');
const modeJoin = document.getElementById('mode-join');

tabHost.addEventListener('click', () => {
  tabHost.classList.add('active');
  tabJoin.classList.remove('active');
  modeHost.style.display = '';
  modeJoin.style.display = 'none';
});

tabJoin.addEventListener('click', () => {
  tabJoin.classList.add('active');
  tabHost.classList.remove('active');
  modeHost.style.display = 'none';
  modeJoin.style.display = '';
});

// === Init ===
function init() {
  // Electron or browser — tabs work in both
}

// === Start/Stop Server (Host mode) ===
btnToggle.addEventListener('click', async () => {
  if (!isElectron) return;

  btnToggle.classList.add('loading');

  if (!isRunning) {
    const port = parseInt(portInput.value) || 4000;
    try {
      const result = await window.electronAPI.startServer(port);
      if (result.success) {
        setRunningState(true, result.port, result.ip);
      } else {
        showError('Failed to start: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      showError('Failed to start server');
    }
  } else {
    try {
      const result = await window.electronAPI.stopServer();
      if (result.success) {
        setRunningState(false);
      }
    } catch (e) {
      showError('Failed to stop server');
    }
  }

  btnToggle.classList.remove('loading');
});

// === Open Office (Host mode) ===
btnOffice.addEventListener('click', async () => {
  if (!isElectron) return;
  await window.electronAPI.openOffice();
});

// === Copy Link ===
if (linkRow) {
  linkRow.addEventListener('click', async () => {
    if (!isElectron) return;
    const result = await window.electronAPI.copyLink();
    if (result.success) {
      copyToast.classList.add('show');
      setTimeout(() => copyToast.classList.remove('show'), 1500);
    }
  });
}

// === Connect button (Join mode) ===
if (connectBtn) {
  connectBtn.addEventListener('click', async () => {
    const host = connectHostInput.value.trim();
    if (!host) return;
    const url = host.startsWith('http') ? host : 'http://' + host;

    if (isElectron) {
      // Open office window pointed at remote server
      await window.electronAPI.joinServer(url);
    } else {
      window.location.href = url;
    }
  });
  connectHostInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectBtn.click();
  });
}

// === State Management ===
function setRunningState(running, port, ip) {
  isRunning = running;

  if (running) {
    btnToggleText.textContent = 'Stop Server';
    btnToggleIcon.innerHTML = '&#9724;';
    btnToggle.classList.add('running');

    statusBar.className = 'status-bar online';
    statusText.textContent = 'Server Online — Port ' + port;

    infoCard.style.display = '';
    ipDisplay.textContent = ip || '—';
    linkDisplay.textContent = `http://${ip}:${port}`;

    btnOffice.disabled = false;
    serverNameInput.disabled = true;
    portInput.disabled = true;

    startPolling();
  } else {
    btnToggleText.textContent = 'Start Server';
    btnToggleIcon.innerHTML = '&#9654;';
    btnToggle.classList.remove('running');

    statusBar.className = 'status-bar offline';
    statusText.textContent = 'Server Offline';

    infoCard.style.display = 'none';
    btnOffice.disabled = true;
    serverNameInput.disabled = false;
    portInput.disabled = false;

    userList.innerHTML = '<div class="empty-state">No one is in the office yet</div>';
    userCount.textContent = '0';

    stopPolling();
  }
}

function showError(msg) {
  statusBar.className = 'status-bar offline';
  statusText.textContent = msg;
  setTimeout(() => {
    if (!isRunning) statusText.textContent = 'Server Offline';
  }, 3000);
}

// === Polling ===
function startPolling() {
  stopPolling();
  pollStatus();
  pollInterval = setInterval(pollStatus, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function pollStatus() {
  if (!isElectron) return;
  try {
    const status = await window.electronAPI.getStatus();
    userCount.textContent = status.playerCount || 0;
    renderUsers(status.players || []);
  } catch (e) { /* server may have stopped */ }
}

function startClientPolling() {
  // In browser mode, poll the HTTP API
  async function poll() {
    try {
      const res = await fetch('/api/status');
      const status = await res.json();
      userCount.textContent = status.playerCount || 0;
      renderUsers(status.players || []);
    } catch (e) { /* offline */ }
  }
  poll();
  setInterval(poll, 3000);
}

function renderUsers(players) {
  if (players.length === 0) {
    userList.innerHTML = '<div class="empty-state">No one is in the office yet</div>';
    return;
  }
  userList.innerHTML = '';
  for (const player of players) {
    const item = document.createElement('div');
    item.className = 'user-item';
    const initials = (player.username || '?')[0].toUpperCase();
    item.innerHTML = `
      <div class="user-avatar">${escapeHtml(initials)}</div>
      <span class="user-name">${escapeHtml(player.username)}</span>
      <span class="user-zone">${escapeHtml(player.zone || 'Lobby')}</span>
    `;
    userList.appendChild(item);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === Listen for tray state changes ===
if (isElectron) {
  window.electronAPI.onServerState((data) => {
    setRunningState(data.running, data.port, data.ip);
  });
}

init();
