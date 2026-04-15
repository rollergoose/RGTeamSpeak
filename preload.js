const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startServer: (port) => ipcRenderer.invoke('start-server', { port }),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  openOffice: () => ipcRenderer.invoke('open-office'),
  copyLink: () => ipcRenderer.invoke('copy-link'),
  joinServer: (url) => ipcRenderer.invoke('join-server', { url }),
  flashWindow: () => ipcRenderer.invoke('flash-window'),
  onServerState: (callback) => ipcRenderer.on('server-state', (event, data) => callback(data)),
});
