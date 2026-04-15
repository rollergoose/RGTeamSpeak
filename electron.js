const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const os = require('os');
const server = require('./server');

let mainWindow = null;
let officeWindow = null;
let tray = null;
let currentPort = 4000;
let isServerRunning = false;

// Get LAN IP address
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    resizable: false,
    icon: path.join(__dirname, 'Resources', 'logo_v3_black.png'),
    title: 'RGTeamSpeak',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'launcher.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', async () => {
    mainWindow = null;
    // Stop server and quit when launcher window is closed
    if (isServerRunning) {
      await server.stopServer();
      isServerRunning = false;
    }
    if (officeWindow && !officeWindow.isDestroyed()) {
      officeWindow.close();
    }
    app.quit();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'Resources', 'logo_v3_black.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const updateTrayMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show RGTeamSpeak', click: () => { if (mainWindow) mainWindow.show(); else createMainWindow(); } },
      { type: 'separator' },
      {
        label: isServerRunning ? 'Stop Server' : 'Start Server',
        click: async () => {
          if (isServerRunning) {
            await server.stopServer();
            isServerRunning = false;
          } else {
            await server.startServer(currentPort);
            isServerRunning = true;
          }
          updateTrayMenu();
          if (mainWindow) mainWindow.webContents.send('server-state', { running: isServerRunning, port: currentPort, ip: getLanIP() });
        },
      },
      {
        label: 'Open Office',
        enabled: isServerRunning,
        click: () => openOfficeWindow(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: async () => {
          if (isServerRunning) await server.stopServer();
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(isServerRunning ? `RGTeamSpeak — Running on port ${currentPort}` : 'RGTeamSpeak — Stopped');
  };

  updateTrayMenu();
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
    else createMainWindow();
  });

  // Store updater for later use
  tray._updateMenu = updateTrayMenu;
}

function openOfficeWindow() {
  if (officeWindow && !officeWindow.isDestroyed()) {
    officeWindow.focus();
    return;
  }

  officeWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    icon: path.join(__dirname, 'Resources', 'logo_v3_black.png'),
    title: 'RGTeamSpeak — Virtual Office',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  officeWindow.loadURL(`http://localhost:${currentPort}`);
  officeWindow.setMenuBarVisibility(false);

  officeWindow.on('closed', () => {
    officeWindow = null;
  });
}

// === IPC Handlers ===
ipcMain.handle('start-server', async (event, { port }) => {
  try {
    currentPort = port || 4000;
    await server.startServer(currentPort);
    isServerRunning = true;
    if (tray && tray._updateMenu) tray._updateMenu();
    return { success: true, port: currentPort, ip: getLanIP() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-server', async () => {
  try {
    await server.stopServer();
    isServerRunning = false;
    if (tray && tray._updateMenu) tray._updateMenu();
    if (officeWindow && !officeWindow.isDestroyed()) {
      officeWindow.close();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-status', () => {
  const state = server.getState();
  return { ...state, port: currentPort, ip: getLanIP() };
});

ipcMain.handle('open-office', () => {
  if (!isServerRunning) return { success: false, error: 'Server not running' };
  openOfficeWindow();
  return { success: true };
});

ipcMain.handle('copy-link', () => {
  const link = `http://${getLanIP()}:${currentPort}`;
  require('electron').clipboard.writeText(link);
  return { success: true, link };
});

ipcMain.handle('flash-window', () => {
  // Flash the taskbar icon on Windows
  if (officeWindow && !officeWindow.isDestroyed()) {
    officeWindow.flashFrame(true);
    setTimeout(() => {
      if (officeWindow && !officeWindow.isDestroyed()) officeWindow.flashFrame(false);
    }, 5000);
  }
  return { success: true };
});

ipcMain.handle('join-server', (event, { url }) => {
  // Open office window pointing at a remote server
  if (officeWindow && !officeWindow.isDestroyed()) {
    officeWindow.loadURL(url);
    officeWindow.focus();
  } else {
    officeWindow = new BrowserWindow({
      width: 1280,
      height: 900,
      icon: path.join(__dirname, 'Resources', 'logo_v3_black.png'),
      title: 'RGTeamSpeak — Virtual Office',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    officeWindow.loadURL(url);
    officeWindow.setMenuBarVisibility(false);
    officeWindow.on('closed', () => { officeWindow = null; });
  }
  return { success: true };
});

// === App lifecycle ===
app.whenReady().then(() => {
  createTray();
  createMainWindow();
});

app.on('window-all-closed', async () => {
  if (isServerRunning) {
    await server.stopServer();
    isServerRunning = false;
  }
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});

app.on('before-quit', async () => {
  if (isServerRunning) {
    await server.stopServer();
  }
});
