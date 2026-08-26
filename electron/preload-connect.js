const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getLastUrl: () => ipcRenderer.invoke('get-last-url'),
  connect: (url) => ipcRenderer.send('connect', url),
});
