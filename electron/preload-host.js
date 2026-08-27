const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronHost', {
  startDrag: (imageUrl) => ipcRenderer.send('ondragstart', imageUrl),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
});
