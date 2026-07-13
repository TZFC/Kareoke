import path from 'path';
import { app } from 'electron';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Helper to dynamically load ESM modules inside CommonJS Electron Main process
const loadESM = (modulePath: string) => {
  return import(path.join(process.cwd(), 'node_modules', modulePath).replace(/\\/g, '/'));
};

export async function separateStems(
  tempWavPath: string,
  targetName: string,
  vocalDir: string,
  instrumentalDir: string,
  sendProgress: (percent: number, message: string) => void,
  log: any
): Promise<{ finalVocalPath: string; finalInstPath: string }> {
  const { ONNXHTDemucs } = await loadESM('demucs/dist/onnx-htdemucs.js');
  const { separateTracks } = await loadESM('demucs/dist/apply.js');
  const { wavToSamples, samplesToWav } = await loadESM('demucs/dist/wav-utils.js');

  sendProgress(15, 'Loading Demucs AI model...');
  const modelPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'demucs', 'htdemucs.onnx')
    : path.join(process.cwd(), 'node_modules', 'demucs', 'htdemucs.onnx');
  
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

  return { finalVocalPath, finalInstPath };
}
