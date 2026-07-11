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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs_1 = require("fs");
const http = __importStar(require("http"));
const electron_log_1 = __importDefault(require("electron-log"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const loadESM = async (modulePath) => {
    return await new Function('modulePath', 'return import(modulePath)')(modulePath);
};
// Clear old logs on startup
try {
    (0, fs_1.writeFileSync)(path.join(process.cwd(), 'peachy-kareoke.log'), '');
}
catch { }
try {
    (0, fs_1.writeFileSync)(path.join(process.cwd(), 'error.log'), '');
}
catch { }
// Setup Logging
electron_log_1.default.transports.file.resolvePathFn = () => path.join(process.cwd(), 'peachy-kareoke.log');
Object.assign(console, electron_log_1.default.functions);
electron_log_1.default.info('Application Starting...');
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
else {
    electron_log_1.default.error('ffmpeg-static path is null!');
}
// Increase renderer memory limit for large audio file decoding
electron_1.app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
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
    const mediaServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        try {
            const url = new URL(req.url || '/', `http://localhost:42899`);
            const filePath = url.searchParams.get('path');
            if (!filePath) {
                res.writeHead(400);
                res.end('Missing path');
                return;
            }
            const absolutePath = decodeURIComponent(filePath);
            const stat = (0, fs_1.statSync)(absolutePath);
            if (!stat.isFile()) {
                res.writeHead(404);
                res.end('Not a file');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'audio/wav',
                'Content-Length': stat.size
            });
            (0, fs_1.createReadStream)(absolutePath).pipe(res);
        }
        catch (err) {
            electron_log_1.default.error(`Local HTTP media fetch failed for ${req.url}: ${err.message}`);
            res.writeHead(404);
            res.end('File not found');
        }
    });
    mediaServer.listen(42899, '127.0.0.1', () => {
        electron_log_1.default.info('Local media HTTP server started on port 42899');
    });
    electron_1.nativeTheme.themeSource = 'system';
    await ensureDirectories();
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
    electron_1.ipcMain.on('log-message', (event, level, message) => {
        if (level === 'error')
            electron_log_1.default.error(`[Renderer Error] ${message}`);
        else if (level === 'warn')
            electron_log_1.default.warn(`[Renderer Warn] ${message}`);
        else
            electron_log_1.default.info(`[Renderer Info] ${message}`);
        event.returnValue = true;
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.ipcMain.handle('load-song-list', async () => {
    electron_log_1.default.info('Backend: Loading song list');
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
    electron_log_1.default.info('Backend: Loading global config');
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
    electron_log_1.default.info('Backend: Saving global config');
    await ensureDirectories();
    await fs_1.promises.writeFile(globalConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
});
electron_1.ipcMain.handle('save-song-config', async (_, name, config) => {
    electron_log_1.default.info(`Backend: Saving song config for "${name}"`);
    await ensureDirectories();
    const configPath = path.join(configDir, `${name}.json`);
    await fs_1.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
});
electron_1.ipcMain.on('log-message', (event, level, message) => {
    if (level === 'error')
        electron_log_1.default.error(message);
    else if (level === 'warn')
        electron_log_1.default.warn(message);
    else
        electron_log_1.default.info(message);
    event.returnValue = true;
});
electron_1.ipcMain.handle('delete-song', async (_, name) => {
    electron_log_1.default.info(`Deleting song: ${name}`);
    await ensureDirectories();
    const configPath = path.join(configDir, `${name}.json`);
    const vocalFilePath = path.join(vocalDir, `${name}.wav`);
    const instFilePath = path.join(instrumentalDir, `${name}.wav`);
    const sourceFiles = await fs_1.promises.readdir(sourceDir);
    const sourceFile = sourceFiles.find(f => path.basename(f, path.extname(f)) === name);
    if (sourceFile) {
        await fs_1.promises.unlink(path.join(sourceDir, sourceFile)).catch(() => { });
    }
    await fs_1.promises.unlink(configPath).catch(() => { });
    await fs_1.promises.unlink(vocalFilePath).catch(() => { });
    await fs_1.promises.unlink(instFilePath).catch(() => { });
    electron_log_1.default.info(`Deleted song completely: ${name}`);
    return true;
});
electron_1.ipcMain.handle('process-file', async (_, originalPath) => {
    electron_log_1.default.info(`New song dragged in: ${originalPath}`);
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
    const tempWavPath = path.join(electron_1.app.getPath('temp'), `peachy_${Date.now()}.wav`);
    sendProgress(5, 'Normalizing audio format...');
    await new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(targetPath)
            .toFormat('wav')
            .audioFrequency(44100)
            .audioChannels(2)
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
            .save(tempWavPath);
    });
    try {
        const { ONNXHTDemucs } = await loadESM('demucs/dist/onnx-htdemucs.js');
        const { separateTracks } = await loadESM('demucs/dist/apply.js');
        const { wavToSamples, samplesToWav } = await loadESM('demucs/dist/wav-utils.js');
        sendProgress(15, 'Loading AI model...');
        const modelPath = electron_1.app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'demucs', 'htdemucs.onnx')
            : path.join(process.cwd(), 'node_modules', 'demucs', 'htdemucs.onnx');
        // In some packaging setups, it might be inside the ASAR directly or just node_modules.
        // Try multiple paths just in case:
        const possibleModelPaths = [
            modelPath,
            path.join(electron_1.app.getAppPath(), 'node_modules', 'demucs', 'htdemucs.onnx'),
            path.join(__dirname, '..', 'node_modules', 'demucs', 'htdemucs.onnx')
        ];
        let actualModelPath = '';
        for (const p of possibleModelPaths) {
            if ((0, fs_1.existsSync)(p)) {
                actualModelPath = p;
                break;
            }
        }
        if (!actualModelPath) {
            throw new Error("Could not locate ONNX model file (htdemucs.onnx).");
        }
        const modelBuffer = await fs_1.promises.readFile(actualModelPath);
        const model = await ONNXHTDemucs.init(modelBuffer.buffer);
        sendProgress(25, 'Loading audio into memory...');
        const wavBuffer = await fs_1.promises.readFile(tempWavPath);
        const rawAudio = wavToSamples(wavBuffer);
        electron_log_1.default.info(`Starting stem separation for ${targetName}...`);
        sendProgress(30, 'Running AI separation (this will take a while)...');
        const separated = await separateTracks(model, rawAudio, (step, total) => {
            const progress = 30 + Math.floor((step / total) * 60);
            sendProgress(progress, `Running AI separation... (${Math.floor((step / total) * 100)}%)`);
        });
        sendProgress(92, 'Generating vocal track...');
        const vocalRaw = separated['vocals'];
        const vocalWav = samplesToWav(vocalRaw.channelData, vocalRaw.sampleRate);
        const finalVocalPath = path.join(vocalDir, `${targetName}.wav`);
        await fs_1.promises.writeFile(finalVocalPath, vocalWav);
        sendProgress(95, 'Mixing backing track...');
        // Sum drums, bass, and other
        const drums = separated['drums'].channelData;
        const bass = separated['bass'].channelData;
        const other = separated['other'].channelData;
        const instChannels = [];
        for (let c = 0; c < model.audioChannels; c++) {
            const len = drums[c].length;
            const combined = new Float32Array(len);
            for (let i = 0; i < len; i++) {
                combined[i] = drums[c][i] + bass[c][i] + other[c][i];
            }
            instChannels.push(combined);
        }
        const instWav = samplesToWav(instChannels, vocalRaw.sampleRate);
        const finalInstPath = path.join(instrumentalDir, `${targetName}.wav`);
        await fs_1.promises.writeFile(finalInstPath, instWav);
        electron_log_1.default.info(`Stored stems for ${targetName} successfully.`);
        sendProgress(100, 'Separation complete');
    }
    catch (err) {
        electron_log_1.default.error(`Separation failed: ${err.message}\n${err.stack}`);
        throw err;
    }
    finally {
        if ((0, fs_1.existsSync)(tempWavPath)) {
            await fs_1.promises.unlink(tempWavPath).catch(() => { });
        }
    }
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
