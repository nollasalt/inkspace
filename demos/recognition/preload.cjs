const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('recognitionDemo', {
  status: () => ipcRenderer.invoke('recognition:status'),
  recognize: request => ipcRenderer.invoke('recognition:run', request),
  cancel: () => ipcRenderer.invoke('recognition:cancel'),
  copyImage: png => ipcRenderer.invoke('recognition:copy-image', png),
  openImage: () => ipcRenderer.invoke('recognition:open-image'),
  pasteImage: () => ipcRenderer.invoke('recognition:paste-image'),
  save: document => ipcRenderer.invoke('recognition:save', document),
});
