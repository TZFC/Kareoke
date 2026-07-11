import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, Locale } from './i18n';

// Global Error Catching
window.addEventListener('error', (event) => {
  window.electronAPI.log('error', `Global Error: ${event.message} at ${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  window.electronAPI.log('error', `Unhandled Promise Rejection: ${event.reason}`);
});
window.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const btn = target.closest('button');
  if (btn) {
    const btnText = btn.innerText?.trim() || btn.title?.trim() || 'Unknown Button';
    window.electronAPI.log('info', `User input: Clicked button "${btnText}"`);
  }
});

type SongConfig = {
  displayName?: string;
  instrumentalVolume: number;
  instrumentalPitch: number;
  vocalVolume: number;
  vocalPitch: number;
  offsetMs: number;
  notes: string;
  lrcText?: string;
  autoScroll: boolean;
  routeBackingToMonitor: boolean;
};

type SongItem = {
  name: string;
  file: string;
  sourcePath: string;
  vocalPath: string;
  instrumentalPath: string;
  config: SongConfig | null;
};

type GlobalConfig = {
  inputDevices: string[];
  outputDevices: string[];
  microphoneDevice: string;
  audienceDevice: string;
  monitorDevice: string;
  micVolume: number;
  micBass: number;
  micTreble: number;
  micReverb: number;
  routeMicToMonitor: boolean;
  language: Locale;
};

type DeviceItem = {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
};

const defaultSongConfig: SongConfig = {
  instrumentalVolume: 0.85,
  instrumentalPitch: 0,
  vocalVolume: 0.95,
  vocalPitch: 0,
  offsetMs: 0,
  notes: '',
  lrcText: '',
  autoScroll: true,
  routeBackingToMonitor: true
};

const parseWavToAudioBuffer = (arrayBuffer: ArrayBuffer, context: AudioContext): AudioBuffer => {
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

const loadAudioBuffer = async (filePath: string, context: AudioContext): Promise<AudioBuffer> => {
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
const stretchChannel = (input: Float32Array, ratio: number): Float32Array => {
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

const resampleChannel = (input: Float32Array, targetLength: number): Float32Array => {
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

const pitchShiftBuffer = (buffer: AudioBuffer, semitones: number, context: AudioContext): AudioBuffer => {
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

type LyricLine = {
  time: number;
  text: string;
};

const parseLrc = (lrcText: string): LyricLine[] => {
  if (!lrcText) return [];
  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d+):(\d+)[.:](\d+)\]/g;
  
  for (const line of lines) {
    const text = line.replace(/\[\d+:\d+[.:]\d+\]/g, '').trim();
    let match;
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msVal = match[3];
      const ms = parseInt(msVal, 10);
      const msFactor = msVal.length === 2 ? 10 : 1;
      const time = min * 60 + sec + (ms * msFactor) / 1000;
      result.push({ time, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
};

const formatTime = (seconds: number) => {
  if (Number.isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};


function App() {
  const [locale, setLocale] = useState<Locale>('en-US');
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [selectedSong, setSelectedSong] = useState<SongItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState(t(locale, 'statusReady'));
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({
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
  });
  const [songConfig, setSongConfig] = useState<SongConfig>(defaultSongConfig);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'lyrics' | 'notes'>('lyrics');
  const [editingLrc, setEditingLrc] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  const parsedLyrics = useMemo(() => {
    return parseLrc(songConfig.lrcText || '');
  }, [songConfig.lrcText]);

  const currentLyricIndex = useMemo(() => {
    if (!parsedLyrics.length) return -1;
    let index = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (currentTime >= parsedLyrics[i].time) {
        index = i;
      } else {
        break;
      }
    }
    return index;
  }, [parsedLyrics, currentTime]);

  useEffect(() => {
    if (activeTab === 'lyrics' && songConfig.autoScroll && lyricsContainerRef.current && currentLyricIndex !== -1) {
      const container = lyricsContainerRef.current;
      const activeElement = container.children[currentLyricIndex] as HTMLElement;
      if (activeElement) {
        const top = activeElement.offsetTop - container.clientHeight / 2 + activeElement.clientHeight / 2;
        container.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }, [currentLyricIndex, activeTab, songConfig.autoScroll]);

  const audienceContextRef = useRef<AudioContext | null>(null);
  const monitorContextRef = useRef<AudioContext | null>(null);
  const instrumentBufferRef = useRef<AudioBuffer | null>(null);
  const vocalBufferRef = useRef<AudioBuffer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const playSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const micNodesRef = useRef<{
    audienceGain?: GainNode;
    monitorGain?: GainNode;
    audienceBassFilter?: BiquadFilterNode;
    audienceTrebleFilter?: BiquadFilterNode;
    monitorBassFilter?: BiquadFilterNode;
    monitorTrebleFilter?: BiquadFilterNode;
    audienceDelayGain?: GainNode;
    monitorDelayGain?: GainNode;
  }>({});

  const updateTimestampRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const autoScrollFrame = useRef<number | null>(null);
  const savePendingRef = useRef<NodeJS.Timeout | null>(null);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return songs.slice(0, 5);
    const lower = searchTerm.toLowerCase();
    return songs.filter((song) => {
      const display = (song.config?.displayName || song.name).toLowerCase();
      return display.includes(lower) || song.name.toLowerCase().includes(lower);
    }).slice(0, 5);
  }, [searchTerm, songs]);


  const saveGlobal = async (config: GlobalConfig) => {
    setGlobalConfig(config);
    await window.electronAPI.saveGlobalConfig(config);
  };

  const saveSongConfig = async (config: SongConfig, songName: string) => {
    await window.electronAPI.saveSongConfig(songName, config);
  };

  const refreshSongList = async () => {
    const list = await window.electronAPI.loadSongList();
    setSongs(list);
    if (selectedSong) {
      const matched = list.find((song) => song.name === selectedSong.name);
      if (matched) {
        setSelectedSong(matched);
        setSongConfig(matched.config || defaultSongConfig);
      }
    }
  };

  const initializeDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // permission denied or not available
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    const formatted = all
      .filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
      .map((device) => ({ deviceId: device.deviceId, label: device.label || device.kind, kind: device.kind as 'audioinput' | 'audiooutput' }));
    setDevices(formatted);
  };

  const loadGlobalConfig = async () => {
    const config = await window.electronAPI.loadGlobalConfig();
    setGlobalConfig(config);
    setLocale(config.language || 'en-US');
  };

  const restoreConfig = (song: SongItem | null) => {
    if (!song) return;
    const incoming = song.config || {};
    const safeConfig: SongConfig = {
      ...defaultSongConfig,
      ...incoming
    };
    setSongConfig(safeConfig);
  };

  const shiftedInstrumentRef = useRef<AudioBuffer | null>(null);
  const shiftedVocalRef = useRef<AudioBuffer | null>(null);
  const currentShiftedPitchRef = useRef<number>(999);

  const needBuildAudioContext = async () => {
    if (!audienceContextRef.current) {
      audienceContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      if (globalConfig.audienceDevice) {
        try {
          await (audienceContextRef.current as any).setSinkId(globalConfig.audienceDevice);
        } catch (e) {
          console.error("Failed to set audience device sinkId", e);
        }
      }
    }
    if (!monitorContextRef.current) {
      monitorContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      if (globalConfig.monitorDevice) {
        try {
          await (monitorContextRef.current as any).setSinkId(globalConfig.monitorDevice);
        } catch (e) {
          console.error("Failed to set monitor device sinkId", e);
        }
      }
    }
  };

  const loadBuffers = async (song: SongItem) => {
    try {
      window.electronAPI.log('info', `loadBuffers: Starting for "${song.name}"`);
      window.electronAPI.log('info', `loadBuffers: Instrumental path: ${song.instrumentalPath}`);
      window.electronAPI.log('info', `loadBuffers: Vocal path: ${song.vocalPath}`);

      window.electronAPI.log('info', 'loadBuffers: Building AudioContext');
      await needBuildAudioContext();
      const context = audienceContextRef.current!;
      window.electronAPI.log('info', `loadBuffers: AudioContext state=${context.state}, sampleRate=${context.sampleRate}`);

      window.electronAPI.log('info', 'loadBuffers: Fetching instrumental buffer');
      const instrumental = await loadAudioBuffer(song.instrumentalPath, context);
      window.electronAPI.log('info', `loadBuffers: Instrumental loaded. duration=${instrumental.duration.toFixed(2)}s, channels=${instrumental.numberOfChannels}`);

      window.electronAPI.log('info', 'loadBuffers: Fetching vocal buffer');
      const vocal = await loadAudioBuffer(song.vocalPath, context);
      window.electronAPI.log('info', `loadBuffers: Vocal loaded. duration=${vocal.duration.toFixed(2)}s, channels=${vocal.numberOfChannels}`);

      instrumentBufferRef.current = instrumental;
      vocalBufferRef.current = vocal;
      shiftedInstrumentRef.current = null;
      shiftedVocalRef.current = null;
      currentShiftedPitchRef.current = 999;
      setDuration(Math.max(instrumental.duration, vocal.duration));
      window.electronAPI.log('info', `loadBuffers: Complete for "${song.name}"`);
    } catch (err: any) {
      window.electronAPI.log('error', `loadBuffers CRASHED: ${err.message}\n${err.stack}`);
      setStatusMessage(`Failed to load audio: ${err.message}`);
    }
  };

  const updateMicParams = () => {
    const nodes = micNodesRef.current;
    if (nodes.audienceGain) {
      nodes.audienceGain.gain.setValueAtTime(globalConfig.micVolume, 0);
    }
    if (nodes.monitorGain) {
      nodes.monitorGain.gain.setValueAtTime(globalConfig.micVolume, 0);
    }
    if (nodes.audienceBassFilter) {
      nodes.audienceBassFilter.gain.setValueAtTime(globalConfig.micBass, 0);
    }
    if (nodes.monitorBassFilter) {
      nodes.monitorBassFilter.gain.setValueAtTime(globalConfig.micBass, 0);
    }
    if (nodes.audienceTrebleFilter) {
      nodes.audienceTrebleFilter.gain.setValueAtTime(globalConfig.micTreble, 0);
    }
    if (nodes.monitorTrebleFilter) {
      nodes.monitorTrebleFilter.gain.setValueAtTime(globalConfig.micTreble, 0);
    }
    if (nodes.audienceDelayGain) {
      nodes.audienceDelayGain.gain.setValueAtTime(globalConfig.micReverb, 0);
    }
    if (nodes.monitorDelayGain) {
      nodes.monitorDelayGain.gain.setValueAtTime(globalConfig.micReverb, 0);
    }
  };

  const startMicInput = async (audienceCtx: AudioContext, monitorCtx: AudioContext) => {
    if (!globalConfig.microphoneDevice) return;
    stopMicInput();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: globalConfig.microphoneDevice },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0
        } as any
      });
      micStreamRef.current = stream;

      // 1. Audience Context Mic Chain
      const audSource = audienceCtx.createMediaStreamSource(stream);
      const audGain = audienceCtx.createGain();
      audGain.gain.value = globalConfig.micVolume;
      const audBass = audienceCtx.createBiquadFilter();
      audBass.type = 'lowshelf';
      audBass.frequency.value = 150;
      audBass.gain.value = globalConfig.micBass;
      const audTreble = audienceCtx.createBiquadFilter();
      audTreble.type = 'highshelf';
      audTreble.frequency.value = 8000;
      audTreble.gain.value = globalConfig.micTreble;

      // Reverb/Delay for Audience
      const audDelay = audienceCtx.createDelay();
      audDelay.delayTime.value = 0.25;
      const audFeedback = audienceCtx.createGain();
      audFeedback.gain.value = 0.45;
      const audDelayGain = audienceCtx.createGain();
      audDelayGain.gain.value = globalConfig.micReverb;

      audSource.connect(audBass);
      audBass.connect(audTreble);
      audTreble.connect(audGain);
      audGain.connect(audienceCtx.destination);

      audGain.connect(audDelay);
      audDelay.connect(audFeedback);
      audFeedback.connect(audDelay);
      audDelay.connect(audDelayGain);
      audDelayGain.connect(audienceCtx.destination);

      // 2. Monitor Context Mic Chain
      const monSource = monitorCtx.createMediaStreamSource(stream);
      const monGain = monitorCtx.createGain();
      monGain.gain.value = globalConfig.micVolume;
      const monBass = monitorCtx.createBiquadFilter();
      monBass.type = 'lowshelf';
      monBass.frequency.value = 150;
      monBass.gain.value = globalConfig.micBass;
      const monTreble = monitorCtx.createBiquadFilter();
      monTreble.type = 'highshelf';
      monTreble.frequency.value = 8000;
      monTreble.gain.value = globalConfig.micTreble;

      // Reverb/Delay for Monitor
      const monDelay = monitorCtx.createDelay();
      monDelay.delayTime.value = 0.25;
      const monFeedback = monitorCtx.createGain();
      monFeedback.gain.value = 0.45;
      const monDelayGain = monitorCtx.createGain();
      monDelayGain.gain.value = globalConfig.micReverb;

      monSource.connect(monBass);
      monBass.connect(monTreble);
      monTreble.connect(monGain);

      if (globalConfig.routeMicToMonitor) {
        monGain.connect(monitorCtx.destination);
        monGain.connect(monDelay);
        monDelay.connect(monFeedback);
        monFeedback.connect(monDelay);
        monDelay.connect(monDelayGain);
        monDelayGain.connect(monitorCtx.destination);
      }

      micNodesRef.current = {
        audienceGain: audGain,
        monitorGain: monGain,
        audienceBassFilter: audBass,
        audienceTrebleFilter: audTreble,
        monitorBassFilter: monBass,
        monitorTrebleFilter: monTreble,
        audienceDelayGain: audDelayGain,
        monitorDelayGain: monDelayGain
      };
    } catch (e) {
      console.error("Failed to start mic input", e);
    }
  };

  const stopMicInput = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    micNodesRef.current = {};
  };

  const stopPlayback = () => {
    setPlaying(false);
    playSourcesRef.current.forEach(src => {
      try { src.stop(); } catch {}
    });
    playSourcesRef.current = [];
    stopMicInput();
    pauseOffsetRef.current = currentTime;
    if (autoScrollFrame.current) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  };

  const syncProgress = () => {
    if (!playing || !audienceContextRef.current) return;
    const elapsed = audienceContextRef.current.currentTime - playStartRef.current;
    const target = pauseOffsetRef.current + elapsed;
    const clamped = Math.min(target, duration);
    setCurrentTime(clamped);
    if (selectedSong?.config?.autoScroll && noteRef.current) {
      const ratio = duration > 0 ? clamped / duration : 0;
      const tot = noteRef.current.scrollHeight - noteRef.current.clientHeight;
      noteRef.current.scrollTop = tot * ratio;
    }
    if (clamped >= duration) {
      stopPlayback();
    } else {
      autoScrollFrame.current = requestAnimationFrame(syncProgress);
    }
  };

  const startPlayback = async () => {
    try {
      window.electronAPI.log('info', 'startPlayback: Initiated');
      if (!selectedSong || !instrumentBufferRef.current || !vocalBufferRef.current) {
        window.electronAPI.log('warn', 'startPlayback: Missing song or buffers');
        setStatusMessage(t(locale, 'errorNoSong'));
        return;
      }

      const missingDevices: string[] = [];
      if (!globalConfig.microphoneDevice) missingDevices.push('Microphone');
      if (!globalConfig.audienceDevice) missingDevices.push('Audience Speaker');
      if (!globalConfig.monitorDevice) missingDevices.push('Monitor Headphones');
      if (missingDevices.length > 0) {
        const msg = `Please select the following device(s) before playing: ${missingDevices.join(', ')}`;
        window.electronAPI.log('warn', `startPlayback: ${msg}`);
        setStatusMessage(msg);
        return;
      }
      
      window.electronAPI.log('info', 'startPlayback: Ensuring AudioContexts are built');
      await needBuildAudioContext();
      const audienceCtx = audienceContextRef.current!;
      const monitorCtx = monitorContextRef.current!;

      if (audienceCtx.state === 'suspended') {
        window.electronAPI.log('info', 'startPlayback: Resuming Audience Context');
        await audienceCtx.resume();
      }
      if (monitorCtx.state === 'suspended') {
        window.electronAPI.log('info', 'startPlayback: Resuming Monitor Context');
        await monitorCtx.resume();
      }

      const keyShift = songConfig.instrumentalPitch;

      if (currentShiftedPitchRef.current !== keyShift || !shiftedInstrumentRef.current || !shiftedVocalRef.current) {
        window.electronAPI.log('info', `startPlayback: Pitch shifting to ${keyShift}`);
        setStatusMessage("Pitch shifting audio...");
        await new Promise(resolve => setTimeout(resolve, 50));
        shiftedInstrumentRef.current = pitchShiftBuffer(instrumentBufferRef.current!, keyShift, audienceCtx);
        shiftedVocalRef.current = pitchShiftBuffer(vocalBufferRef.current!, keyShift, audienceCtx);
        currentShiftedPitchRef.current = keyShift;
        setStatusMessage("Ready");
      }

      const instBuffer = shiftedInstrumentRef.current!;
      const vocBuffer = shiftedVocalRef.current!;
      const now = audienceCtx.currentTime;

      window.electronAPI.log('info', 'startPlayback: Stopping existing sources');
      playSourcesRef.current.forEach(src => {
        try { src.stop(); } catch {}
      });
      playSourcesRef.current = [];

      window.electronAPI.log('info', 'startPlayback: Connecting backing track to audience');
      const audInstSource = audienceCtx.createBufferSource();
      audInstSource.buffer = instBuffer;
      const audInstGain = audienceCtx.createGain();
      audInstGain.gain.value = songConfig.instrumentalVolume;
      audInstSource.connect(audInstGain);
      audInstGain.connect(audienceCtx.destination);

      let monInstSource: AudioBufferSourceNode | null = null;
      if (songConfig.routeBackingToMonitor) {
        window.electronAPI.log('info', 'startPlayback: Connecting backing track to monitor');
        monInstSource = monitorCtx.createBufferSource();
        monInstSource.buffer = instBuffer;
        const monInstGain = monitorCtx.createGain();
        monInstGain.gain.value = songConfig.instrumentalVolume;
        monInstSource.connect(monInstGain);
        monInstGain.connect(monitorCtx.destination);
      }

      window.electronAPI.log('info', 'startPlayback: Connecting vocal track to monitor');
      const monVocSource = monitorCtx.createBufferSource();
      monVocSource.buffer = vocBuffer;
      const monVocGain = monitorCtx.createGain();
      monVocGain.gain.value = songConfig.vocalVolume;
      monVocSource.connect(monVocGain);
      monVocGain.connect(monitorCtx.destination);

      window.electronAPI.log('info', 'startPlayback: Starting Mic Input');
      await startMicInput(audienceCtx, monitorCtx);

      const offsetSeconds = songConfig.offsetMs / 1000;
      const startOffset = pauseOffsetRef.current;

      const instStartAt = now + Math.max(0, -offsetSeconds);
      const vocStartAt = now + Math.max(0, offsetSeconds);

      const instOffset = startOffset;
      const vocOffset = startOffset + Math.max(0, offsetSeconds) - Math.max(0, -offsetSeconds);

      window.electronAPI.log('info', `startPlayback: Executing audio source start commands. instStartAt=${instStartAt}, instOffset=${instOffset}, vocStartAt=${vocStartAt}, vocOffset=${vocOffset}`);
      
      audInstSource.start(instStartAt, Math.max(0, instOffset));
      if (monInstSource) {
        monInstSource.start(instStartAt, Math.max(0, instOffset));
      }
      monVocSource.start(vocStartAt, Math.max(0, vocOffset));

      window.electronAPI.log('info', 'startPlayback: Success');
      playSourcesRef.current = [audInstSource, monVocSource];
      if (monInstSource) {
        playSourcesRef.current.push(monInstSource);
      }
      playStartRef.current = now;
      setPlaying(true);
      setStatusMessage(`${t(locale, 'playback')} · ${formatTime(pauseOffsetRef.current)}`);
      if (autoScrollFrame.current) cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = requestAnimationFrame(syncProgress);
    } catch (err: any) {
      window.electronAPI.log('error', `startPlayback crashed: ${err.message}\n${err.stack}`);
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const pausePlayback = () => {
    window.electronAPI.log('info', 'User input: pausePlayback');
    stopPlayback();
  };

  const seekTo = (time: number) => {
    window.electronAPI.log('info', `User input: seekTo ${time.toFixed(2)}s`);
    const clamped = Math.max(0, Math.min(time, duration));
    setCurrentTime(clamped);
    pauseOffsetRef.current = clamped;
    if (playing) {
      stopPlayback();
      startPlayback();
    }
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length === 0) return;
    setStatusMessage(t(locale, 'processing'));
    const file = event.dataTransfer.files[0];
    try {
      await window.electronAPI.processFile(file.path);
      await refreshSongList();
      window.electronAPI.log('info', `UI successfully updated for newly processed song: ${file.name}`);
      setProgress(100);
      setStatusMessage('Completed');
    } catch (error) {
      setStatusMessage((error as Error).message || 'Error');
    } finally {
      setTimeout(() => setProgress(0), 800);
    }
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const updateConfig = (changes: Partial<SongConfig>) => {
    window.electronAPI.log('info', `User input: Updated config keys: ${Object.keys(changes).join(', ')}`);
    const next = { ...songConfig, ...changes };
    setSongConfig(next);
    if (selectedSong) {
      if (savePendingRef.current) clearTimeout(savePendingRef.current);
      savePendingRef.current = setTimeout(() => saveSongConfig(next, selectedSong.name), 250);
    }
  };

  useEffect(() => {
    const init = async () => {
      await initializeDevices();
      await loadGlobalConfig();
      await refreshSongList();
    };
    init();
    window.electronAPI.onProgress((_, data) => setProgress(data.percent));
    window.electronAPI.onStatus((_, data) => setStatusMessage(data.message));
  }, []);

  useEffect(() => {
    if (selectedSong) restoreConfig(selectedSong);
  }, [selectedSong?.name]);

  useEffect(() => {
    if (selectedSong) {
      loadBuffers(selectedSong).catch(() => setStatusMessage('Unable to load audio buffers.'));
    }
  }, [selectedSong?.name]);

  useEffect(() => {
    if (!selectedSong) return;
    saveSongConfig(songConfig, selectedSong.name);
    if (selectedSong.config !== songConfig) {
      const updated = { ...selectedSong, config: songConfig };
      setSelectedSong(updated);
      setSongs((prev) => prev.map((song) => (song.name === updated.name ? updated : song)));
    }
  }, [songConfig]);

  useEffect(() => {
    updateMicParams();
    saveGlobal(globalConfig);
  }, [globalConfig]);

  useEffect(() => {
    setStatusMessage(t(locale, 'statusReady'));
  }, [locale]);

  const selectedSongDuration = formatTime(duration);

  const handleDeleteSong = async (e: React.MouseEvent, songName: string) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${songName}"?`)) {
      await window.electronAPI.deleteSong(songName);
      const newSongs = await window.electronAPI.loadSongList();
      setSongs(newSongs);
      if (selectedSong?.name === songName) {
        setSelectedSong(null);
      }
    }
  };

  const handleRenameSong = async (e: React.MouseEvent, song: SongItem) => {
    e.stopPropagation();
    const currentName = song.config?.displayName || song.name;
    const newName = window.prompt('Rename song:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      window.electronAPI.log('info', `User input: Renamed song "${song.name}" to "${newName.trim()}"`);
      const updatedConfig = { ...(song.config || defaultSongConfig), displayName: newName.trim() };
      await window.electronAPI.saveSongConfig(song.name, updatedConfig);
      await refreshSongList();
    }
  };

  const suggestionElements = searchResults.map((song) => (
    <div 
      key={song.name} 
      className={`suggestion ${selectedSong?.name === song.name ? 'active' : ''}`} 
      onClick={() => {
        window.electronAPI.log('info', `User input: Selected song "${song.name}"`);
        setSelectedSong(song);
      }}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span>{song.config?.displayName || song.name}</span>
        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{song.config ? t(locale, 'statusReady') : t(locale, 'processing')}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button 
          onClick={(e) => handleRenameSong(e, song)}
          style={{ padding: '4px 8px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.5)', borderRadius: 4, cursor: 'pointer', zIndex: 10 }}
        >
          Rename
        </button>
        <button 
          onClick={(e) => handleDeleteSong(e, song.name)}
          style={{ padding: '4px 8px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.5)', borderRadius: 4, cursor: 'pointer', zIndex: 10 }}
        >
          Delete
        </button>
      </div>
    </div>
  ));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'appTitle')}</h1>
          <p className="subtext">{t(locale, 'feedback')}</p>
        </div>
        <div className="language-switcher">
          <label>{t(locale, 'language')}</label>
          <select value={locale} onChange={(e) => {
            const language = e.target.value as Locale;
            setLocale(language);
            saveGlobal({ ...globalConfig, language });
          }}>
            <option value="en-US">{t(locale, 'english')}</option>
            <option value="zh-CN">{t(locale, 'chinese')}</option>
          </select>
        </div>
      </div>
      <div className="container">
      <div className="panel">
        <h2 className="panel-title">{t(locale, 'appTitle')}</h2>
        <div className="drop-zone" onDrop={onDrop} onDragOver={onDragOver}>
          <div>
            <strong>{t(locale, 'dropHint')}</strong>
            <div className="status-badge">{progress > 0 ? `${t(locale, 'processing')} ${progress}%` : statusMessage}</div>
          </div>
        </div>

        <div className="search-area">
          <input value={searchTerm} placeholder={t(locale, 'searchPlaceholder')} onChange={(e) => setSearchTerm(e.target.value)} />
          <div className="suggestions">{suggestionElements.length ? suggestionElements : <div className="suggestion">{t(locale, 'noSongs')}</div>}</div>
        </div>

        <div className="timeline">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span>{t(locale, 'timelineHint')}</span>
            <span>{formatTime(currentTime)} / {selectedSongDuration}</span>
          </div>
          <div className="timeline-bar" onClick={(event) => {
            const rect = (event.target as HTMLElement).getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            seekTo(ratio * duration);
          }}>
            <div className="timeline-progress" style={{ width: `${(duration > 0 ? (currentTime / duration) * 100 : 0)}%` }} />
            <div className="playhead" style={{ left: `${(duration > 0 ? (currentTime / duration) * 100 : 0)}%` }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: 10 }}>
            <button onClick={() => (playing ? pausePlayback() : startPlayback())}>{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => seekTo(0)}>Reset</button>
          </div>
          <label className="range-label" style={{ marginTop: 10 }}>
            <span>{t(locale, 'offsetMs')}: {songConfig.offsetMs} ms {songConfig.offsetMs < 0 ? `(${t(locale, 'early')})` : `(${t(locale, 'inSync')})`}</span>
            <input type="range" min="-1000" max="0" step="10" value={songConfig.offsetMs} onChange={(e) => updateConfig({ offsetMs: Number(e.target.value) })} />
          </label>
        </div>

        <div className="control-group">
          <h3 className="panel-title">{t(locale, 'instrumental')}</h3>
          <label className="range-label">
            <span>{t(locale, 'volume')}: {songConfig.instrumentalVolume.toFixed(2)}</span>
            <input type="range" min="0" max="1" step="0.01" value={songConfig.instrumentalVolume} onChange={(e) => updateConfig({ instrumentalVolume: Number(e.target.value) })} />
          </label>
          <div className="control-grid">
            <button onClick={() => updateConfig({ instrumentalPitch: songConfig.instrumentalPitch + 1 })}>{t(locale, 'pitchUp')}</button>
            <button onClick={() => updateConfig({ instrumentalPitch: songConfig.instrumentalPitch - 1 })}>{t(locale, 'pitchDown')}</button>
            <div className="value-label">{songConfig.instrumentalPitch} st</div>
          </div>
        </div>

        <div className="control-group">
          <h3 className="panel-title">{t(locale, 'vocal')}</h3>
          <label className="range-label">
            <span>{t(locale, 'volume')}: {songConfig.vocalVolume.toFixed(2)}</span>
            <input type="range" min="0" max="1" step="0.01" value={songConfig.vocalVolume} onChange={(e) => updateConfig({ vocalVolume: Number(e.target.value) })} />
          </label>
          <div className="control-grid">
            <button onClick={() => updateConfig({ vocalPitch: songConfig.vocalPitch + 1 })}>{t(locale, 'pitchUp')}</button>
            <button onClick={() => updateConfig({ vocalPitch: songConfig.vocalPitch - 1 })}>{t(locale, 'pitchDown')}</button>
            <div className="value-label">{songConfig.vocalPitch} st</div>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={songConfig.routeBackingToMonitor} onChange={(e) => updateConfig({ routeBackingToMonitor: e.target.checked })} />
            <span>{t(locale, 'routeBackingToMonitor')}</span>
          </label>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title">{t(locale, 'inputDevices')}</h3>
        <div className="control-group">
          <label className="range-label">
            <span>{t(locale, 'microphoneDevice')}</span>
            <select 
              value={globalConfig.microphoneDevice} 
              onClick={() => window.electronAPI.log('info', 'User input: Clicked microphone device dropdown')}
              onChange={(e) => {
                window.electronAPI.log('info', `User input: Selected microphone device: ${e.target.value || 'none'}`);
                saveGlobal({ ...globalConfig, microphoneDevice: e.target.value });
              }}
            >
              <option value="">-- Select Microphone --</option>
              {devices.filter((device) => device.kind === 'audioinput').map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={globalConfig.routeMicToMonitor} onChange={(e) => {
              saveGlobal({ ...globalConfig, routeMicToMonitor: e.target.checked });
            }} />
            <span>{t(locale, 'routeMicToMonitor')}</span>
          </label>
        </div>

        <h3 className="panel-title">{t(locale, 'outputDevices')}</h3>
        <div className="control-group">
          <label className="range-label">
            <span>{t(locale, 'audienceDevice')}</span>
            <select 
              value={globalConfig.audienceDevice} 
              onClick={() => window.electronAPI.log('info', 'User input: Clicked audience device dropdown')}
              onChange={(e) => {
                window.electronAPI.log('info', `User input: Selected audience device: ${e.target.value || 'none'}`);
                saveGlobal({ ...globalConfig, audienceDevice: e.target.value });
              }}
            >
              <option value="">-- Select Audience Speaker --</option>
              {devices.filter((device) => device.kind === 'audiooutput').map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || 'Output Device'}</option>
              ))}
            </select>
          </label>

          <label className="range-label" style={{ marginTop: 12 }}>
            <span>{t(locale, 'monitorDevice')}</span>
            <select 
              value={globalConfig.monitorDevice} 
              onClick={() => window.electronAPI.log('info', 'User input: Clicked monitor device dropdown')}
              onChange={(e) => {
                window.electronAPI.log('info', `User input: Selected monitor device: ${e.target.value || 'none'}`);
                saveGlobal({ ...globalConfig, monitorDevice: e.target.value });
              }}
            >
              <option value="">-- Select Monitor Headphones --</option>
              {devices.filter((device) => device.kind === 'audiooutput').map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || 'Output Device'}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="panel note-panel" style={{ flexGrow: 1, minHeight: 0 }}>
        <h3 className="panel-title">Microphone Live Mix</h3>
        <div className="control-group">
          <label className="range-label">
            <span>{t(locale, 'micVolume')}: {globalConfig.micVolume.toFixed(2)}</span>
            <input type="range" min="0" max="1" step="0.01" value={globalConfig.micVolume} onChange={(e) => {
              saveGlobal({ ...globalConfig, micVolume: Number(e.target.value) });
            }} />
          </label>
          <label className="range-label">
            <span>{t(locale, 'micBass')}: {globalConfig.micBass} dB</span>
            <input type="range" min="-12" max="12" step="1" value={globalConfig.micBass} onChange={(e) => {
              saveGlobal({ ...globalConfig, micBass: Number(e.target.value) });
            }} />
          </label>
          <label className="range-label">
            <span>{t(locale, 'micTreble')}: {globalConfig.micTreble} dB</span>
            <input type="range" min="-12" max="12" step="1" value={globalConfig.micTreble} onChange={(e) => {
              saveGlobal({ ...globalConfig, micTreble: Number(e.target.value) });
            }} />
          </label>
          <label className="range-label">
            <span>{t(locale, 'micReverb')}: {globalConfig.micReverb.toFixed(2)}</span>
            <input type="range" min="0" max="1" step="0.01" value={globalConfig.micReverb} onChange={(e) => {
              saveGlobal({ ...globalConfig, micReverb: Number(e.target.value) });
            }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          <button 
            style={{ flex: 1, background: activeTab === 'lyrics' ? 'var(--accent)' : 'transparent', borderColor: activeTab === 'lyrics' ? 'var(--accent)' : 'var(--border)' }}
            onClick={() => setActiveTab('lyrics')}
          >
            Lyrics (.lrc)
          </button>
          <button 
            style={{ flex: 1, background: activeTab === 'notes' ? 'var(--accent)' : 'transparent', borderColor: activeTab === 'notes' ? 'var(--accent)' : 'var(--border)' }}
            onClick={() => setActiveTab('notes')}
          >
            Notes / Score
          </button>
        </div>

        {activeTab === 'lyrics' ? (
          (!songConfig.lrcText || editingLrc) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <textarea 
                style={{ flex: 1, minHeight: 280 }}
                value={songConfig.lrcText || ''} 
                onChange={(e) => updateConfig({ lrcText: e.target.value })} 
                placeholder="[00:12.34] Paste standard LRC lyrics here..."
              />
              <button onClick={() => setEditingLrc(false)}>Done Editing</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
              <div 
                ref={lyricsContainerRef}
                style={{ 
                  flex: 1, 
                  overflowY: 'auto', 
                  padding: 10, 
                  background: '#0a0d12', 
                  borderRadius: 12, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 12,
                  scrollBehavior: 'smooth'
                }}
              >
                {parsedLyrics.map((line, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      textAlign: 'center', 
                      fontSize: idx === currentLyricIndex ? '1.25rem' : '1rem', 
                      fontWeight: idx === currentLyricIndex ? 'bold' : 'normal',
                      color: idx === currentLyricIndex ? '#a78bfa' : 'var(--muted)',
                      transition: 'all 0.2s ease',
                      padding: '4px 0'
                    }}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
              <button onClick={() => setEditingLrc(true)}>Edit Lyrics</button>
            </div>
          )
        ) : (
          <textarea 
            ref={noteRef} 
            value={songConfig.notes} 
            onChange={(event) => updateConfig({ notes: event.target.value })} 
            placeholder={t(locale, 'notes')} 
            style={{ flex: 1, minHeight: 320 }}
          />
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={songConfig.autoScroll} onChange={(e) => updateConfig({ autoScroll: e.target.checked })} />
          {t(locale, 'autoScroll')}
        </label>
        <div className="footer">
          <span>{t(locale, 'feedback')}</span>
          <span>{selectedSong?.name || t(locale, 'noSongs')}</span>
        </div>
      </div>
    </div>
  </>
  );
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (window.electronAPI) {
      window.electronAPI.log('error', `React Render Error: ${error.message}\n${error.stack}\n${info.componentStack}`);
    } else {
      console.error(error);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0d12' }}>
          <h2>UI Crash Recovered</h2>
          <pre style={{ color: '#ef4444', maxWidth: '80%', overflowX: 'auto', background: '#1e1e1e', padding: 15, borderRadius: 8 }}>{this.state.error?.message}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '10px 20px', fontSize: '1.1rem' }}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WrappedApp() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}
