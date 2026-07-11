import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  loadSongList: () => ipcRenderer.invoke('load-song-list'),
  loadGlobalConfig: () => ipcRenderer.invoke('load-global-config'),
  saveGlobalConfig: (config: any) => ipcRenderer.invoke('save-global-config', config),
  saveSongConfig: (name: string, config: any) => ipcRenderer.invoke('save-song-config', name, config),
  processFile: (filePath: string) => ipcRenderer.invoke('process-file', filePath),
  onProgress: (callback: (event: any, data: any) => void) => ipcRenderer.on('processing-progress', callback),
  onStatus: (callback: (event: any, data: any) => void) => ipcRenderer.on('processing-status', callback)
});
