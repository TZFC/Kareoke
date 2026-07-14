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
const electron_updater_1 = require("electron-updater");
const ipcHandlers_1 = require("./ipcHandlers");
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
// Setup Auto Updater Logging
electron_updater_1.autoUpdater.logger = electron_log_1.default;
electron_updater_1.autoUpdater.logger.transports.file.level = 'info';
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
    // Check for updates
    if (electron_1.app.isPackaged) {
        electron_updater_1.autoUpdater.checkForUpdatesAndNotify().catch(err => {
            electron_log_1.default.error(`Auto-update error: ${err}`);
        });
    }
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
(0, ipcHandlers_1.registerIpcHandlers)({
    sourceDir,
    vocalDir,
    instrumentalDir,
    configDir,
    globalConfigPath,
    ensureDirectories
});
