export const parseWavToAudioBuffer = (arrayBuffer: ArrayBuffer, context: AudioContext): AudioBuffer => {
  const view = new DataView(arrayBuffer);
  // Read WAV header
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  // Find 'data' chunk
  let dataOffset = 12;
  let dataSize = 0;
  while (dataOffset < view.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(dataOffset), view.getUint8(dataOffset + 1),
      view.getUint8(dataOffset + 2), view.getUint8(dataOffset + 3)
    );
    const chunkSize = view.getUint32(dataOffset + 4, true);
    if (chunkId === 'data') {
      dataSize = chunkSize;
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = dataSize / bytesPerSample;
  const samplesPerChannel = totalSamples / numChannels;

  window.electronAPI.log('info', `parseWav: channels=${numChannels}, sampleRate=${sampleRate}, bits=${bitsPerSample}, samples/ch=${samplesPerChannel}`);

  const audioBuffer = context.createBuffer(numChannels, samplesPerChannel, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < samplesPerChannel; i++) {
      const byteIndex = dataOffset + (i * numChannels + ch) * bytesPerSample;
      if (bitsPerSample === 16) {
        channelData[i] = view.getInt16(byteIndex, true) / 32768;
      } else if (bitsPerSample === 32) {
        channelData[i] = view.getFloat32(byteIndex, true);
      } else if (bitsPerSample === 24) {
        const s = (view.getUint8(byteIndex) | (view.getUint8(byteIndex + 1) << 8) | (view.getInt8(byteIndex + 2) << 16));
        channelData[i] = s / 8388608;
      }
    }
  }

  return audioBuffer;
};

export const loadAudioBuffer = async (filePath: string, context: AudioContext): Promise<AudioBuffer> => {
  const url = `http://127.0.0.1:42899/?path=${encodeURIComponent(filePath)}`;
  window.electronAPI.log('info', `loadAudioBuffer: Fetching ${filePath}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error ${response.status} for ${filePath}`);
  window.electronAPI.log('info', `loadAudioBuffer: HTTP OK, reading arrayBuffer for ${filePath}`);
  const arrayBuffer = await response.arrayBuffer();
  window.electronAPI.log('info', `loadAudioBuffer: ArrayBuffer received, size=${arrayBuffer.byteLength} bytes. Parsing WAV...`);
  const audioBuffer = parseWavToAudioBuffer(arrayBuffer, context);
  window.electronAPI.log('info', `loadAudioBuffer: Parsed successfully for ${filePath}, duration=${audioBuffer.duration.toFixed(2)}s`);
  return audioBuffer;
};

// Simple OLA-based Time-Stretching in time-domain
export const stretchChannel = (input: Float32Array, ratio: number): Float32Array => {
  const N = 1024;
  const Hs = 256;
  const Ha = Hs * ratio;
  
  const numFrames = Math.floor((input.length - N) / Ha);
  if (numFrames <= 0) return input;
  
  const outputLen = Math.floor(numFrames * Hs + N);
  const output = new Float32Array(outputLen);
  const norm = new Float32Array(outputLen);
  
  const window = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  
  for (let f = 0; f < numFrames; f++) {
    const pin = f * Ha;
    const pout = f * Hs;
    
    for (let n = 0; n < N; n++) {
      const idxIn = Math.floor(pin + n);
      if (idxIn >= input.length) break;
      const val = input[idxIn];
      const w = window[n];
      
      output[pout + n] += val * w;
      norm[pout + n] += w * w;
    }
  }
  
  for (let i = 0; i < outputLen; i++) {
    if (norm[i] > 1e-4) {
      output[i] /= norm[i];
    }
  }
  return output;
};

export const resampleChannel = (input: Float32Array, targetLength: number): Float32Array => {
  const output = new Float32Array(targetLength);
  const factor = input.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const pos = i * factor;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    if (idx + 1 < input.length) {
      output[i] = input[idx] * (1 - frac) + input[idx + 1] * frac;
    } else if (idx < input.length) {
      output[i] = input[idx];
    }
  }
  return output;
};

export const pitchShiftBuffer = (buffer: AudioBuffer, semitones: number, context: AudioContext): AudioBuffer => {
  if (semitones === 0) return buffer;
  const ratio = Math.pow(2, semitones / 12);
  const shiftedBuffer = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const inputData = buffer.getChannelData(ch);
    const stretched = stretchChannel(inputData, ratio);
    const shiftedData = resampleChannel(stretched, buffer.length);
    shiftedBuffer.copyToChannel(shiftedData as any, ch);
  }
  return shiftedBuffer;
};
