"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    loadSongList: () => electron_1.ipcRenderer.invoke('load-song-list'),
    loadGlobalConfig: () => electron_1.ipcRenderer.invoke('load-global-config'),
    saveGlobalConfig: (config) => electron_1.ipcRenderer.invoke('save-global-config', config),
    saveSongConfig: (name, config) => electron_1.ipcRenderer.invoke('save-song-config', name, config),
    processFile: (filePath) => electron_1.ipcRenderer.invoke('process-file', filePath),
    deleteSong: (name) => electron_1.ipcRenderer.invoke('delete-song', name),
    onProgress: (callback) => electron_1.ipcRenderer.on('processing-progress', callback),
    onStatus: (callback) => electron_1.ipcRenderer.on('processing-status', callback),
    log: (level, message) => electron_1.ipcRenderer.sendSync('log-message', level, message)
});
