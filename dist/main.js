"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs_1 = require("fs");
const url_1 = require("url");
electron_1.protocol.registerSchemesAsPrivileged([
    { scheme: 'local-media', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
]);
const storeRoot = path.join(electron_1.app.isPackaged ? electron_1.app.getPath('userData') : process.cwd(), 'PeachyKareoke');
const sourceDir = path.join(storeRoot, 'source');
const vocalDir = path.join(storeRoot, 'vocal');
const instrumentalDir = path.join(storeRoot, 'instrumental');
const configDir = path.join(storeRoot, 'config');
const globalConfigPath = path.join(storeRoot, 'global-config.json');
async function ensureDirectories() {
    await fs_1.promises.mkdir(sourceDir, { recursive: true });
    await fs_1.promises.mkdir(vocalDir, { recursive: true });
    await fs_1.promises.mkdir(instrumentalDir, { recursive: true });
    await fs_1.promises.mkdir(configDir, { recursive: true });
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 760,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    const productionIndex = path.join(__dirname, 'renderer', 'index.html');
    if ((0, fs_1.existsSync)(productionIndex)) {
        win.loadFile(productionIndex);
    }
    else {
        win.loadURL('http://localhost:5173');
    }
    win.on('ready-to-show', () => win.show());
}
electron_1.app.whenReady().then(async () => {
    electron_1.protocol.handle('local-media', (request) => {
        const urlPath = request.url.slice('local-media://'.length);
        const decodedPath = decodeURIComponent(urlPath);
        return electron_1.net.fetch((0, url_1.pathToFileURL)(decodedPath).toString());
    });
    electron_1.nativeTheme.themeSource = 'system';
    await ensureDirectories();
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.ipcMain.handle('load-song-list', async () => {
    await ensureDirectories();
    const files = await fs_1.promises.readdir(sourceDir);
    const songs = await Promise.all(files
        .filter((file) => ['.mp3', '.wav'].includes(path.extname(file).toLowerCase()))
        .map(async (file) => {
        const name = path.basename(file, path.extname(file));
        const configPath = path.join(configDir, `${name}.json`);
        let config = {};
        try {
            config = JSON.parse(await fs_1.promises.readFile(configPath, 'utf-8'));
        }
        catch {
            config = null;
        }
        return {
            name,
            file,
            sourcePath: path.join(sourceDir, file),
            vocalPath: path.join(vocalDir, `${name}.wav`),
            instrumentalPath: path.join(instrumentalDir, `${name}.wav`),
            config
        };
    }));
    return songs;
});
electron_1.ipcMain.handle('load-global-config', async () => {
    await ensureDirectories();
    try {
        const raw = await fs_1.promises.readFile(globalConfigPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            inputDevices: [],
            outputDevices: [],
            microphoneDevice: '',
            audienceDevice: '',
            monitorDevice: '',
            micVolume: 0.8,
            micBass: 0,
            micTreble: 0,
            micReverb: 0.3,
            routeMicToMonitor: false,
            language: 'en-US',
            ...parsed
        };
    }
    catch {
        return {
            inputDevices: [],
            outputDevices: [],
            microphoneDevice: '',
            audienceDevice: '',
            monitorDevice: '',
            micVolume: 0.8,
            micBass: 0,
            micTreble: 0,
            micReverb: 0.3,
            routeMicToMonitor: false,
            language: 'en-US'
        };
    }
});
electron_1.ipcMain.handle('save-global-config', async (_, config) => {
    await ensureDirectories();
    await fs_1.promises.writeFile(globalConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
});
electron_1.ipcMain.handle('save-song-config', async (_, name, config) => {
    await ensureDirectories();
    const configPath = path.join(configDir, `${name}.json`);
    await fs_1.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
});
electron_1.ipcMain.handle('process-file', async (_, originalPath) => {
    await ensureDirectories();
    const extension = path.extname(originalPath).toLowerCase();
    if (!['.mp3', '.wav'].includes(extension)) {
        throw new Error('只支持 WAV 和 MP3 文件 / Only WAV and MP3 files are supported.');
    }
    const fileName = path.basename(originalPath);
    let targetName = path.basename(originalPath, extension);
    const sourcePath = path.join(sourceDir, fileName);
    const exists = await fs_1.promises
        .access(sourcePath)
        .then(() => true)
        .catch(() => false);
    if (exists) {
        const response = await electron_1.dialog.showMessageBox({
            type: 'question',
            title: 'Duplicate file name',
            message: `Song name "${targetName}" exists. Overwrite or rename current file?`,
            buttons: ['Overwrite', 'Rename', 'Cancel'],
            cancelId: 2,
            defaultId: 1
        });
        if (response.response === 2) {
            throw new Error('Cancelled');
        }
        if (response.response === 1) {
            let suffix = 1;
            let candidate = `${targetName}-${suffix}${extension}`;
            let candidatePath = path.join(sourceDir, candidate);
            while (await fs_1.promises.access(candidatePath).then(() => true).catch(() => false)) {
                suffix += 1;
                candidate = `${targetName}-${suffix}${extension}`;
                candidatePath = path.join(sourceDir, candidate);
            }
            targetName = `${targetName}-${suffix}`;
        }
    }
    const targetFileName = `${targetName}${extension}`;
    const targetPath = path.join(sourceDir, targetFileName);
    await fs_1.promises.copyFile(originalPath, targetPath);
    // Mock Separation Progress
    const sendProgress = (percent, message) => {
        electron_1.BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('processing-progress', { percent });
            win.webContents.send('processing-status', { type: 'status', message });
        });
    };
    sendProgress(10, 'Initializing stem separation engine...');
    await new Promise((resolve) => setTimeout(resolve, 400));
    sendProgress(40, 'Separating vocal track...');
    await fs_1.promises.copyFile(targetPath, path.join(vocalDir, `${targetName}.wav`));
    await new Promise((resolve) => setTimeout(resolve, 400));
    sendProgress(80, 'Separating instrumental track...');
    await fs_1.promises.copyFile(targetPath, path.join(instrumentalDir, `${targetName}.wav`));
    await new Promise((resolve) => setTimeout(resolve, 400));
    sendProgress(100, 'Separation complete');
    const defaultConfig = {
        instrumentalVolume: 0.85,
        instrumentalPitch: 0,
        vocalVolume: 0.95,
        vocalPitch: 0,
        reverb: {
            dry: 0.4,
            wet: 0.18,
            roomSize: 0.55,
            damping: 0.45
        },
        reverbBypass: false,
        offsetMs: 0,
        notes: '',
        lrcText: '',
        autoScroll: true,
        routeBackingToMonitor: true
    };
    const configPath = path.join(configDir, `${targetName}.json`);
    await fs_1.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    return {
        name: targetName,
        sourcePath: targetPath,
        vocalPath: path.join(vocalDir, `${targetName}.wav`),
        instrumentalPath: path.join(instrumentalDir, `${targetName}.wav`),
        config: defaultConfig
    };
});
