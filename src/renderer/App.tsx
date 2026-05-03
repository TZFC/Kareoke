import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, Locale } from './i18n';

type SongConfig = {
  instrumentalVolume: number;
  instrumentalPitch: number;
  vocalVolume: number;
  vocalPitch: number;
  reverb: {
    dry: number;
    wet: number;
    roomSize: number;
    damping: number;
  };
  reverbBypass: boolean;
  offsetMs: number;
  notes: string;
  autoScroll: boolean;
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
  reverb: {
    dry: 0.4,
    wet: 0.18,
    roomSize: 0.55,
    damping: 0.45
  },
  reverbBypass: false,
  offsetMs: 0,
  notes: '',
  autoScroll: false
};

const loadAudioBuffer = async (path: string, context: AudioContext): Promise<AudioBuffer> => {
  const base64 = await window.electronAPI.readAudioFile(path);
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return await context.decodeAudioData(data.buffer.slice(0));
};

const formatTime = (seconds: number) => {
  if (Number.isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [selectedSong, setSelectedSong] = useState<SongItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState(t(locale, 'statusReady'));
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({ inputDevices: [], outputDevices: [], language: 'en' });
  const [songConfig, setSongConfig] = useState<SongConfig>(defaultSongConfig);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const instrumentBufferRef = useRef<AudioBuffer | null>(null);
  const vocalBufferRef = useRef<AudioBuffer | null>(null);
  const stemRefs = useRef<{ source?: AudioBufferSourceNode; gain?: GainNode; reverbNode?: ConvolverNode; outputDestinations: MediaStreamAudioDestinationNode[] }>({ outputDestinations: [] });
  const updateTimestampRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const autoScrollFrame = useRef<number | null>(null);
  const savePendingRef = useRef<NodeJS.Timeout | null>(null);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return songs.slice(0, 5);
    const lower = searchTerm.toLowerCase();
    return songs.filter((song) => song.name.toLowerCase().includes(lower)).slice(0, 5);
  }, [searchTerm, songs]);

  const selectedOutputs = useMemo(() => devices.filter((d) => d.kind === 'audiooutput' && globalConfig.outputDevices.includes(d.deviceId)), [devices, globalConfig.outputDevices]);
  const selectedInputs = useMemo(() => devices.filter((d) => d.kind === 'audioinput' && globalConfig.inputDevices.includes(d.deviceId)), [devices, globalConfig.inputDevices]);

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
    setLocale(config.language || 'en');
  };

  const restoreConfig = (song: SongItem | null) => {
    if (!song) return;
    setSongConfig(song.config || defaultSongConfig);
  };

  const needBuildAudioContext = () => {
    const audio = audioContextRef.current;
    if (!audio) {
      audioContextRef.current = new AudioContext();
    }
  };

  const loadBuffers = async (song: SongItem) => {
    needBuildAudioContext();
    const context = audioContextRef.current!;
    const [instrumental, vocal] = await Promise.all([loadAudioBuffer(song.instrumentalPath, context), loadAudioBuffer(song.vocalPath, context)]);
    instrumentBufferRef.current = instrumental;
    vocalBufferRef.current = vocal;
    setDuration(Math.max(instrumental.duration, vocal.duration));
  };

  const stopPlayback = () => {
    setPlaying(false);
    if (stemRefs.current.source) {
      try {
        stemRefs.current.source.stop();
      } catch {}
    }
    if (stemRefs.current.outputDestinations.length) {
      stemRefs.current.outputDestinations.forEach(() => undefined);
    }
    pauseOffsetRef.current = currentTime;
    if (autoScrollFrame.current) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  };

  const syncProgress = () => {
    if (!playing || !audioContextRef.current) return;
    const elapsed = audioContextRef.current.currentTime - playStartRef.current;
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

  const createOutputAudio = async (deviceId: string, stream: MediaStream) => {
    const audio = new Audio();
    audio.srcObject = stream;
    if (typeof (audio as any).setSinkId === 'function') {
      try {
        await (audio as any).setSinkId(deviceId);
      } catch (error) {
        console.warn('Unable to set sinkId', error);
      }
    }
    audio.muted = false;
    await audio.play().catch(() => undefined);
    return audio;
  };

  const startPlayback = async () => {
    if (!selectedSong || !instrumentBufferRef.current || !vocalBufferRef.current) {
      setStatusMessage(t(locale, 'errorNoSong'));
      return;
    }
    needBuildAudioContext();
    const context = audioContextRef.current!;
    const instrumentBuffer = instrumentBufferRef.current;
    const vocalBuffer = vocalBufferRef.current;
    const now = context.currentTime;

    const instrumentSource = context.createBufferSource();
    instrumentSource.buffer = instrumentBuffer;
    instrumentSource.playbackRate.value = 2 ** (songConfig.instrumentalPitch / 12);
    const instrumentGain = context.createGain();
    instrumentGain.gain.value = songConfig.instrumentalVolume;
    instrumentSource.connect(instrumentGain);

    const vocalSource = context.createBufferSource();
    vocalSource.buffer = vocalBuffer;
    vocalSource.playbackRate.value = 2 ** (songConfig.vocalPitch / 12);
    const vocalGain = context.createGain();
    vocalGain.gain.value = songConfig.vocalVolume;
    let finalVocalNode: AudioNode = vocalGain;

    if (!songConfig.reverbBypass) {
      const convolver = context.createConvolver();
      const impulse = context.createBuffer(2, context.sampleRate * 2, context.sampleRate);
      for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < channelData.length; i += 1) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / channelData.length, songConfig.reverb.roomSize);
        }
      }
      convolver.buffer = impulse;
      const dryGain = context.createGain();
      dryGain.gain.value = songConfig.reverb.dry;
      const wetGain = context.createGain();
      wetGain.gain.value = songConfig.reverb.wet;
      vocalGain.connect(dryGain);
      vocalGain.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(context.destination);
      wetGain.connect(context.destination);
      finalVocalNode = context.createGain();
      dryGain.connect(finalVocalNode);
      wetGain.connect(finalVocalNode);
    }

    const outputDestinations: MediaStreamAudioDestinationNode[] = [];
    const instrumentElements: HTMLAudioElement[] = [];
    const vocalElements: HTMLAudioElement[] = [];

    selectedOutputs.forEach(async (device) => {
      const instrumentDest = context.createMediaStreamDestination();
      instrumentGain.connect(instrumentDest);
      outputDestinations.push(instrumentDest);
      instrumentElements.push(await createOutputAudio(device.deviceId, instrumentDest.stream));
    });

    selectedOutputs.forEach(async (device) => {
      const vocalDest = context.createMediaStreamDestination();
      finalVocalNode.connect(vocalDest);
      outputDestinations.push(vocalDest);
      vocalElements.push(await createOutputAudio(device.deviceId, vocalDest.stream));
    });

    const offsetSeconds = songConfig.offsetMs / 1000;
    const instrumentStartAt = now + Math.max(0, -offsetSeconds);
    const vocalStartAt = now + Math.max(0, offsetSeconds);
    const instrumentOffset = pauseOffsetRef.current;
    const vocalOffset = pauseOffsetRef.current + Math.max(0, offsetSeconds) - Math.max(0, -offsetSeconds);

    instrumentSource.start(instrumentStartAt, instrumentOffset);
    vocalSource.start(vocalStartAt, Math.max(0, -offsetSeconds) + pauseOffsetRef.current);

    stemRefs.current = { source: instrumentSource, gain: instrumentGain, outputDestinations };
    playStartRef.current = now;
    setPlaying(true);
    setStatusMessage(`${t(locale, 'playback')} · ${formatTime(pauseOffsetRef.current)}`);
    if (autoScrollFrame.current) cancelAnimationFrame(autoScrollFrame.current);
    autoScrollFrame.current = requestAnimationFrame(syncProgress);
  };

  const pausePlayback = () => {
    stopPlayback();
  };

  const seekTo = (time: number) => {
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
    const next = { ...songConfig, ...changes };
    if (changes.reverb) {
      next.reverb = { ...songConfig.reverb, ...changes.reverb };
    }
    setSongConfig(next);
    if (selectedSong) {
      if (savePendingRef.current) clearTimeout(savePendingRef.current);
      savePendingRef.current = setTimeout(() => saveSongConfig(next, selectedSong.name), 250);
    }
  };

  useEffect(() => {
    loadGlobalConfig();
    refreshSongList();
    initializeDevices();
    window.electronAPI.onProgress((_, data) => setProgress(data.percent));
    window.electronAPI.onStatus((_, data) => setStatusMessage(data.message));
  }, []);

  useEffect(() => {
    if (selectedSong) restoreConfig(selectedSong);
  }, [selectedSong]);

  useEffect(() => {
    if (selectedSong) {
      loadBuffers(selectedSong).catch(() => setStatusMessage('Unable to load audio buffers.'));
    }
  }, [selectedSong]);

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
    saveGlobal(globalConfig);
  }, [globalConfig]);

  useEffect(() => {
    setStatusMessage(t(locale, 'statusReady'));
  }, [locale]);

  const selectedSongDuration = formatTime(duration);
  const suggestionElements = searchResults.map((song) => (
    <div key={song.name} className={`suggestion ${selectedSong?.name === song.name ? 'active' : ''}`} onClick={() => setSelectedSong(song)}>
      <span>{song.name}</span>
      <span>{song.config ? t(locale, 'statusReady') : t(locale, 'processing')}</span>
    </div>
  ));

  return (
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
        </div>

        <div className="control-group">
          <h3 className="panel-title">{t(locale, 'instrumental')}</h3>
          <label>{t(locale, 'volume')}<input type="range" min="0" max="1" step="0.01" value={songConfig.instrumentalVolume} onChange={(e) => updateConfig({ instrumentalVolume: Number(e.target.value) })} /></label>
          <div className="control-grid">
            <button onClick={() => updateConfig({ instrumentalPitch: songConfig.instrumentalPitch + 1 })}>{t(locale, 'pitchUp')}</button>
            <button onClick={() => updateConfig({ instrumentalPitch: songConfig.instrumentalPitch - 1 })}>{t(locale, 'pitchDown')}</button>
            <div />
          </div>
        </div>

        <div className="control-group">
          <h3 className="panel-title">{t(locale, 'vocal')}</h3>
          <label>{t(locale, 'volume')}<input type="range" min="0" max="1" step="0.01" value={songConfig.vocalVolume} onChange={(e) => updateConfig({ vocalVolume: Number(e.target.value) })} /></label>
          <div className="control-grid">
            <button onClick={() => updateConfig({ vocalPitch: songConfig.vocalPitch + 1 })}>{t(locale, 'pitchUp')}</button>
            <button onClick={() => updateConfig({ vocalPitch: songConfig.vocalPitch - 1 })}>{t(locale, 'pitchDown')}</button>
            <button onClick={() => updateConfig({ reverbBypass: !songConfig.reverbBypass })}>{songConfig.reverbBypass ? t(locale, 'bypassReverb') : t(locale, 'bypassReverb')}</button>
          </div>
          <div className="control-group">
            <label>{t(locale, 'dryness')}<input type="range" min="0" max="1" step="0.01" value={songConfig.reverb.dry} onChange={(e) => updateConfig({ reverb: { ...songConfig.reverb, dry: Number(e.target.value) } })} /></label>
            <label>{t(locale, 'wetness')}<input type="range" min="0" max="1" step="0.01" value={songConfig.reverb.wet} onChange={(e) => updateConfig({ reverb: { ...songConfig.reverb, wet: Number(e.target.value) } })} /></label>
            <label>{t(locale, 'roomSize')}<input type="range" min="0" max="1" step="0.01" value={songConfig.reverb.roomSize} onChange={(e) => updateConfig({ reverb: { ...songConfig.reverb, roomSize: Number(e.target.value) } })} /></label>
            <label>{t(locale, 'damping')}<input type="range" min="0" max="1" step="0.01" value={songConfig.reverb.damping} onChange={(e) => updateConfig({ reverb: { ...songConfig.reverb, damping: Number(e.target.value) } })} /></label>
          </div>
          <label>{t(locale, 'offsetMs')}<input type="number" value={songConfig.offsetMs} onChange={(e) => updateConfig({ offsetMs: Number(e.target.value) })} /></label>
        </div>
      </div>

      <div className="panel">
        <div className="control-group">
          <h3 className="panel-title">{t(locale, 'inputDevices')}</h3>
          <div className="device-list">
            {devices.filter((device) => device.kind === 'audioinput').map((device) => (
              <label key={device.deviceId} className="device-item">
                <input type="checkbox" checked={globalConfig.inputDevices.includes(device.deviceId)} onChange={(e) => {
                  const next = e.target.checked ? [...globalConfig.inputDevices, device.deviceId] : globalConfig.inputDevices.filter((id) => id !== device.deviceId);
                  saveGlobal({ ...globalConfig, inputDevices: next });
                }} />
                <span>{device.label || 'Input'}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="control-group">
          <h3 className="panel-title">{t(locale, 'outputDevices')}</h3>
          <div className="device-list">
            {devices.filter((device) => device.kind === 'audiooutput').map((device) => (
              <label key={device.deviceId} className="device-item">
                <input type="checkbox" checked={globalConfig.outputDevices.includes(device.deviceId)} onChange={(e) => {
                  const next = e.target.checked ? [...globalConfig.outputDevices, device.deviceId] : globalConfig.outputDevices.filter((id) => id !== device.deviceId);
                  saveGlobal({ ...globalConfig, outputDevices: next });
                }} />
                <span>{device.label || 'Output'}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="footer">
          <div>{t(locale, 'selectDevices')}</div>
          <div>{t(locale, 'language')}:
            <select value={locale} onChange={(e) => {
              const language = e.target.value as Locale;
              setLocale(language);
              saveGlobal({ ...globalConfig, language });
            }}>
              <option value="en">{t(locale, 'english')}</option>
              <option value="zh">{t(locale, 'chinese')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel note-panel">
        <h3 className="panel-title">{t(locale, 'notes')}</h3>
        <textarea ref={noteRef} value={songConfig.notes} onChange={(event) => updateConfig({ notes: event.target.value })} placeholder={t(locale, 'notes')} />
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
  );
}

export default App;
