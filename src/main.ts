import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron';
import * as path from 'path';
import { existsSync, promises as fs, statSync, createReadStream, writeFileSync } from 'fs';
import * as http from 'http';
import { pathToFileURL } from 'url';
import log from 'electron-log';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

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

ipcMain.handle('load-song-list', async () => {
  log.info('Backend: Loading song list');
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
  log.info('Backend: Loading global config');
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
      routeMicToMonitor: false,
      language: 'en-US',
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
      routeMicToMonitor: false,
      language: 'en-US'
    };
  }
});

ipcMain.handle('save-global-config', async (_, config) => {
  log.info('Backend: Saving global config');
  await ensureDirectories();
  await fs.writeFile(globalConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('save-song-config', async (_, name: string, config: any) => {
  log.info(`Backend: Saving song config for "${name}"`);
  await ensureDirectories();
  const configPath = path.join(configDir, `${name}.json`);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

ipcMain.on('log-message', (event, level: string, message: string) => {
  if (level === 'error') log.error(message);
  else if (level === 'warn') log.warn(message);
  else log.info(message);
  event.returnValue = true;
});

ipcMain.handle('delete-song', async (_, name: string) => {
  log.info(`Deleting song: ${name}`);
  await ensureDirectories();
  const configPath = path.join(configDir, `${name}.json`);
  const vocalFilePath = path.join(vocalDir, `${name}.wav`);
  const instFilePath = path.join(instrumentalDir, `${name}.wav`);
  const sourceFiles = await fs.readdir(sourceDir);
  const sourceFile = sourceFiles.find(f => path.basename(f, path.extname(f)) === name);
  
  if (sourceFile) {
    await fs.unlink(path.join(sourceDir, sourceFile)).catch(() => {});
  }
  await fs.unlink(configPath).catch(() => {});
  await fs.unlink(vocalFilePath).catch(() => {});
  await fs.unlink(instFilePath).catch(() => {});
  log.info(`Deleted song completely: ${name}`);
  return true;
});

ipcMain.handle('process-file', async (_, originalPath: string) => {
  log.info(`New song dragged in: ${originalPath}`);
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

  const tempWavPath = path.join(app.getPath('temp'), `peachy_${Date.now()}.wav`);
  sendProgress(5, 'Normalizing audio format...');
  
  await new Promise<void>((resolve, reject) => {
    ffmpeg(targetPath)
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
    const modelPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'demucs', 'htdemucs.onnx')
      : path.join(process.cwd(), 'node_modules', 'demucs', 'htdemucs.onnx');
    
    // In some packaging setups, it might be inside the ASAR directly or just node_modules.
    // Try multiple paths just in case:
    const possibleModelPaths = [
      modelPath,
      path.join(app.getAppPath(), 'node_modules', 'demucs', 'htdemucs.onnx'),
      path.join(__dirname, '..', 'node_modules', 'demucs', 'htdemucs.onnx')
    ];

    let actualModelPath = '';
    for (const p of possibleModelPaths) {
      if (existsSync(p)) {
        actualModelPath = p;
        break;
      }
    }

    if (!actualModelPath) {
      throw new Error("Could not locate ONNX model file (htdemucs.onnx).");
    }

    const modelBuffer = await fs.readFile(actualModelPath);
    const model = await ONNXHTDemucs.init(modelBuffer.buffer);

    sendProgress(25, 'Loading audio into memory...');
    const wavBuffer = await fs.readFile(tempWavPath);
    const rawAudio = wavToSamples(wavBuffer);

    log.info(`Starting stem separation for ${targetName}...`);
    sendProgress(30, 'Running AI separation (this will take a while)...');
    
    const separated = await separateTracks(model, rawAudio, (step: number, total: number) => {
      const progress = 30 + Math.floor((step / total) * 60);
      sendProgress(progress, `Running AI separation... (${Math.floor((step/total)*100)}%)`);
    });

    sendProgress(92, 'Generating vocal track...');
    const vocalRaw = separated['vocals'];
    const vocalWav = samplesToWav(vocalRaw.channelData, vocalRaw.sampleRate);
    const finalVocalPath = path.join(vocalDir, `${targetName}.wav`);
    await fs.writeFile(finalVocalPath, vocalWav);

    sendProgress(95, 'Mixing backing track...');
    // Sum drums, bass, and other
    const drums = separated['drums'].channelData;
    const bass = separated['bass'].channelData;
    const other = separated['other'].channelData;

    const instChannels: Float32Array[] = [];
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
    await fs.writeFile(finalInstPath, instWav);

    log.info(`Stored stems for ${targetName} successfully.`);
    sendProgress(100, 'Separation complete');

  } catch (err: any) {
    log.error(`Separation failed: ${err.message}\n${err.stack}`);
    throw err;
  } finally {
    if (existsSync(tempWavPath)) {
      await fs.unlink(tempWavPath).catch(() => {});
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
  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');

  return {
    name: targetName,
    sourcePath: targetPath,
    vocalPath: path.join(vocalDir, `${targetName}.wav`),
    instrumentalPath: path.join(instrumentalDir, `${targetName}.wav`),
    config: defaultConfig
  };
});
