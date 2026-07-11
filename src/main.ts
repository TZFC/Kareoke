import { app, BrowserWindow, ipcMain, dialog, nativeTheme, protocol, net } from 'electron';
import * as path from 'path';
import { existsSync, promises as fs } from 'fs';
import { pathToFileURL } from 'url';

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-media', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
]);

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
  protocol.handle('local-media', (request) => {
    const urlPath = request.url.slice('local-media://'.length);
    const decodedPath = decodeURIComponent(urlPath);
    return net.fetch(pathToFileURL(decodedPath).toString());
  });

  nativeTheme.themeSource = 'system';
  await ensureDirectories();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('load-song-list', async () => {
  await ensureDirectories();
  const files = await fs.readdir(sourceDir);
  const songs = await Promise.all(
    files
      .filter((file) => ['.mp3', '.wav'].includes(path.extname(file).toLowerCase()))
      .map(async (file) => {
        const name = path.basename(file, path.extname(file));
        const configPath = path.join(configDir, `${name}.json`);
        let config: any = {};
        try {
          config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        } catch {
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
      })
  );
  return songs;
});

ipcMain.handle('load-global-config', async () => {
  await ensureDirectories();
  try {
    const raw = await fs.readFile(globalConfigPath, 'utf-8');
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
      language: 'en',
      ...parsed
    };
  } catch {
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
      language: 'en'
    };
  }
});

ipcMain.handle('save-global-config', async (_, config) => {
  await ensureDirectories();
  await fs.writeFile(globalConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('save-song-config', async (_, name: string, config: any) => {
  await ensureDirectories();
  const configPath = path.join(configDir, `${name}.json`);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('process-file', async (_, originalPath: string) => {
  await ensureDirectories();
  const extension = path.extname(originalPath).toLowerCase();
  if (!['.mp3', '.wav'].includes(extension)) {
    throw new Error('只支持 WAV 和 MP3 文件 / Only WAV and MP3 files are supported.');
  }
  const fileName = path.basename(originalPath);
  let targetName = path.basename(originalPath, extension);
  const sourcePath = path.join(sourceDir, fileName);
  const exists = await fs
    .access(sourcePath)
    .then(() => true)
    .catch(() => false);

  if (exists) {
    const response = await dialog.showMessageBox({
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
      while (await fs.access(candidatePath).then(() => true).catch(() => false)) {
        suffix += 1;
        candidate = `${targetName}-${suffix}${extension}`;
        candidatePath = path.join(sourceDir, candidate);
      }
      targetName = `${targetName}-${suffix}`;
    }
  }

  const targetFileName = `${targetName}${extension}`;
  const targetPath = path.join(sourceDir, targetFileName);
  await fs.copyFile(originalPath, targetPath);

  // Mock Separation Progress
  const sendProgress = (percent: number, message: string) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('processing-progress', { percent });
      win.webContents.send('processing-status', { type: 'status', message });
    });
  };

  sendProgress(10, 'Initializing stem separation engine...');
  await new Promise((resolve) => setTimeout(resolve, 400));
  sendProgress(40, 'Separating vocal track...');
  await fs.copyFile(targetPath, path.join(vocalDir, `${targetName}.wav`));
  await new Promise((resolve) => setTimeout(resolve, 400));
  
  sendProgress(80, 'Separating instrumental track...');
  await fs.copyFile(targetPath, path.join(instrumentalDir, `${targetName}.wav`));
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
  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');

  return {
    name: targetName,
    sourcePath: targetPath,
    vocalPath: path.join(vocalDir, `${targetName}.wav`),
    instrumentalPath: path.join(instrumentalDir, `${targetName}.wav`),
    config: defaultConfig
  };
});
