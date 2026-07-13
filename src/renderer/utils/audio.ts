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


