import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, Locale } from './i18n';
import { SongConfig, SongItem, GlobalConfig, DeviceItem } from './types';
import { parseLrc } from './utils/helpers';
import { useAudioEngine } from './hooks/useAudioEngine';

// Components
import { DeviceSelector } from './components/DeviceSelector';
import { SongSelector } from './components/SongSelector';
import { PlaybackControls } from './components/PlaybackControls';
import { MixerPanel } from './components/MixerPanel';
import { MicMixerPanel } from './components/MicMixerPanel';
import { LyricsNotesPanel } from './components/LyricsNotesPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

// Global error/rejection catchers
window.addEventListener('error', (event) => {
  window.electronAPI?.log('error', `Global Error: ${event.message} at ${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  window.electronAPI?.log('error', `Unhandled Promise Rejection: ${event.reason}`);
});
window.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const btn = target.closest('button');
  if (btn) {
    const btnText = btn.innerText?.trim() || btn.title?.trim() || 'Unknown Button';
    window.electronAPI?.log('info', `User input: Clicked button "${btnText}"`);
  }
});

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
  const [activeTab, setActiveTab] = useState<'lyrics' | 'notes'>('lyrics');
  const [editingLrc, setEditingLrc] = useState(false);
  const savePendingRef = useRef<NodeJS.Timeout | null>(null);

  const {
    playing,
    currentTime,
    duration,
    startPlayback,
    pausePlayback,
    stopPlayback,
    seekTo,
    loadBuffers,
    updateMicParams
  } = useAudioEngine(locale, globalConfig, songConfig, selectedSong, setStatusMessage);

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

  const handleDeleteSong = async (e: React.MouseEvent, songName: string) => {
    e.stopPropagation();
    if (window.confirm(t(locale, 'deleteConfirm').replace('{name}', songName))) {
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
    const newName = window.prompt(t(locale, 'renamePrompt'), currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      window.electronAPI.log('info', `User input: Renamed song "${song.name}" to "${newName.trim()}"`);
      const updatedConfig = { ...(song.config || defaultSongConfig), displayName: newName.trim() };
      await window.electronAPI.saveSongConfig(song.name, updatedConfig);
      await refreshSongList();
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
    } catch (e: any) {
      setStatusMessage(e.message || 'Error occurred');
    }
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

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
          <SongSelector
            locale={locale}
            progress={progress}
            statusMessage={statusMessage}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            searchResults={searchResults}
            selectedSong={selectedSong}
            setSelectedSong={setSelectedSong}
            onDrop={onDrop}
            onDragOver={onDragOver}
            handleRenameSong={handleRenameSong}
            handleDeleteSong={handleDeleteSong}
          />
          
          <PlaybackControls
            locale={locale}
            playing={playing}
            currentTime={currentTime}
            duration={duration}
            offsetMs={songConfig.offsetMs}
            startPlayback={startPlayback}
            pausePlayback={pausePlayback}
            seekTo={seekTo}
            updateConfig={updateConfig}
          />

          <MixerPanel
            locale={locale}
            songConfig={songConfig}
            updateConfig={updateConfig}
          />
        </div>

        <DeviceSelector
          locale={locale}
          globalConfig={globalConfig}
          devices={devices}
          saveGlobal={saveGlobal}
        />

        <div className="panel note-panel" style={{ flexGrow: 1, minHeight: 0 }}>
          <MicMixerPanel
            locale={locale}
            globalConfig={globalConfig}
            saveGlobal={saveGlobal}
          />
          
          <LyricsNotesPanel
            locale={locale}
            songConfig={songConfig}
            updateConfig={updateConfig}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            editingLrc={editingLrc}
            setEditingLrc={setEditingLrc}
            parsedLyrics={parsedLyrics}
            currentLyricIndex={currentLyricIndex}
            currentTime={currentTime}
            duration={duration}
          />
          
          <div className="footer">
            <span>{t(locale, 'feedback')}</span>
            <span>{selectedSong ? (selectedSong.config?.displayName || selectedSong.name) : t(locale, 'noSongs')}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default function WrappedApp() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}
