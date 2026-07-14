import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron';
import * as path from 'path';
import { existsSync, promises as fs, statSync, createReadStream, writeFileSync } from 'fs';
import * as http from 'http';
import { pathToFileURL } from 'url';
import log from 'electron-log';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { autoUpdater } from 'electron-updater';
import { registerIpcHandlers } from './ipcHandlers';

const loadESM = async (modulePath: string) => {
  return await new Function('modulePath', 'return import(modulePath)')(modulePath);
};

// Clear old logs on startup
try { writeFileSync(path.join(process.cwd(), 'peachy-kareoke.log'), ''); } catch {}
try { writeFileSync(path.join(process.cwd(), 'error.log'), ''); } catch {}

// Setup Logging
log.transports.file.resolvePathFn = () => path.join(process.cwd(), 'peachy-kareoke.log');
Object.assign(console, log.functions);
log.info('Application Starting...');

// Setup Auto Updater Logging
autoUpdater.logger = log;
(autoUpdater.logger as any).transports.file.level = 'info';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
} else {
  log.error('ffmpeg-static path is null!');
}

// Increase renderer memory limit for large audio file decoding
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');


const storeRoot = path.join(app.isPackaged ? app.getPath('userData') : process.cwd(), 'PeachyKareoke');
const sourceDir = path.join(storeRoot, 'source');
const vocalDir = path.join(storeRoot, 'vocal');
const instrumentalDir = path.join(storeRoot, 'instrumental');
const configDir = path.join(storeRoot, 'config');
const globalConfigPath = path.join(storeRoot, 'global-config.json');

async function ensureDirectories() {
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(vocalDir, { recursive: true });
  await fs.mkdir(instrumentalDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
}

function createWindow() {
  const win = new BrowserWindow({
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
  if (existsSync(productionIndex)) {
    win.loadFile(productionIndex);
  } else {
    win.loadURL('http://localhost:5173');
  }
  win.on('ready-to-show', () => win.show());
}

app.whenReady().then(async () => {
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
        res.writeHead(400); res.end('Missing path'); return;
      }
      const absolutePath = decodeURIComponent(filePath);
      const stat = statSync(absolutePath);
      if (!stat.isFile()) {
        res.writeHead(404); res.end('Not a file'); return;
      }
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': stat.size
      });
      createReadStream(absolutePath).pipe(res);
    } catch (err: any) {
      log.error(`Local HTTP media fetch failed for ${req.url}: ${err.message}`);
      res.writeHead(404);
      res.end('File not found');
    }
  });
  
  mediaServer.listen(42899, '127.0.0.1', () => {
    log.info('Local media HTTP server started on port 42899');
  });

  nativeTheme.themeSource = 'system';
  await ensureDirectories();
  createWindow();

  // Check for updates
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      log.error(`Auto-update error: ${err}`);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.on('log-message', (event, level, message) => {
    if (level === 'error') log.error(`[Renderer Error] ${message}`);
    else if (level === 'warn') log.warn(`[Renderer Warn] ${message}`);
    else log.info(`[Renderer Info] ${message}`);
    event.returnValue = true;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

registerIpcHandlers({
  sourceDir,
  vocalDir,
  instrumentalDir,
  configDir,
  globalConfigPath,
  ensureDirectories
});
