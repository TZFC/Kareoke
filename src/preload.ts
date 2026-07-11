import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  loadSongList: () => ipcRenderer.invoke('load-song-list'),
  loadGlobalConfig: () => ipcRenderer.invoke('load-global-config'),
  saveGlobalConfig: (config: any) => ipcRenderer.invoke('save-global-config', config),
  saveSongConfig: (name: string, config: any) => ipcRenderer.invoke('save-song-config', name, config),
  processFile: (filePath: string) => ipcRenderer.invoke('process-file', filePath),
  deleteSong: (name: string) => ipcRenderer.invoke('delete-song', name),
  onProgress: (callback: (event: any, data: any) => void) => ipcRenderer.on('processing-progress', callback),
  onStatus: (callback: (event: any, data: any) => void) => ipcRenderer.on('processing-status', callback),
  log: (level: string, message: string) => ipcRenderer.sendSync('log-message', level, message)
});
