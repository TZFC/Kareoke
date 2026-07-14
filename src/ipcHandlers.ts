import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { existsSync, promises as fs } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import log from 'electron-log';

export interface IpcHandlerOptions {
  sourceDir: string;
  vocalDir: string;
  instrumentalDir: string;
  configDir: string;
  globalConfigPath: string;
  ensureDirectories: () => Promise<void>;
}

export function registerIpcHandlers(options: IpcHandlerOptions) {
  const { sourceDir, vocalDir, instrumentalDir, configDir, globalConfigPath, ensureDirectories } = options;

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
        micReverb: 0,
        micRoomSize: 0.8,
        micDampening: 3000,
        micAutoTune: false,
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
        micReverb: 0,
        micRoomSize: 0.8,
        micDampening: 3000,
        micAutoTune: false,
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
    
    let generatedLrc = '';
    let generatedNmn = '';
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

    // Progress Dispatcher for UI Updates
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
      const { separateStems } = await import('./ai/separateStems');
      const { finalVocalPath } = await separateStems(
        tempWavPath,
        targetName,
        vocalDir,
        instrumentalDir,
        sendProgress,
        log
      );

      try {
        sendProgress(96, 'Generating lyrics from vocals (AI)...');
        const { generateLRC } = await import('./ai/generateLRC');
        generatedLrc = await generateLRC(finalVocalPath, sendProgress);
      } catch (e: any) {
        log.error('LRC Generation failed: ' + e.message);
      }

      try {
        sendProgress(98, 'Extracting musical notation (AI)...');
        const { generateNMN } = await import('./ai/generateNMN');
        
        const f32leRawPath = path.join(app.getPath('temp'), `peachy_nmn_${Date.now()}.raw`);
        await new Promise<void>((resolve, reject) => {
          ffmpeg(finalVocalPath)
            .toFormat('f32le')
            .audioFrequency(22050)
            .audioChannels(1)
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
            .save(f32leRawPath);
        });
        
        generatedNmn = await generateNMN(f32leRawPath, sendProgress);
        await fs.unlink(f32leRawPath).catch(() => {});
      } catch (e: any) {
        log.error('NMN Generation failed: ' + e.message);
      }

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

    const configPath = path.join(configDir, `${targetName}.json`);
    let existingConfig: any = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      } catch (error: any) {
        log.error(`Failed to parse existing config for ${targetName}`);
      }
    }

    const finalConfig = {
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
      autoScroll: true,
      routeBackingToMonitor: true,
      ...existingConfig,
      notes: existingConfig.notes || generatedNmn,
      lrcText: existingConfig.lrcText || generatedLrc,
    };
    
    await fs.writeFile(configPath, JSON.stringify(finalConfig, null, 2), 'utf-8');

    return {
      name: targetName,
      sourcePath: targetPath,
      vocalPath: path.join(vocalDir, `${targetName}.wav`),
      instrumentalPath: path.join(instrumentalDir, `${targetName}.wav`),
      config: finalConfig
    };
  });
}
