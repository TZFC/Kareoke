import React, { useEffect, useMemo, useState } from 'react';
import { t, Locale } from './i18n';
import { SongConfig, SongItem, DeviceItem, GlobalConfig } from './types';
import { parseLrc } from './utils/helpers';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useSongLibrary } from './hooks/useSongLibrary';
import { useConfigSync } from './hooks/useConfigSync';

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
  routeBackingToAudience: true,
  routeBackingToMonitor: true,
  routeVocalToAudience: false,
  routeVocalToMonitor: true
};

function App() {
  const [locale, setLocale] = useState<Locale>('en-US');
  const [selectedSong, setSelectedSong] = useState<SongItem | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState(t('en-US', 'statusReady'));
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'lyrics' | 'notes'>('lyrics');
  const [editingLrc, setEditingLrc] = useState(false);

  // Hook 1: Song Library Management
  const {
    songs,
    setSongs,
    searchTerm,
    setSearchTerm,
    refreshSongList,
    handleDeleteSong,
    handleRenameSong,
    onDrop
  } = useSongLibrary(
    locale,
    setStatusMessage,
    defaultSongConfig,
    selectedSong,
    setSelectedSong,
    (config) => setSongConfig(config)
  );

  // Hook 2: Config Syncing
  const {
    globalConfig,
    songConfig,
    setSongConfig,
    saveGlobal,
    loadGlobalConfig,
    updateConfig
  } = useConfigSync(
    defaultSongConfig,
    setLocale,
    selectedSong,
    setSelectedSong,
    setSongs,
    () => { updateMicParams(); },
    (changes) => {
      if (playing && changes.offsetMs !== undefined) {
        window.electronAPI.log('info', `Live playback parameter changed. Triggering audio graph rebuild via seekTo().`);
        seekTo(currentTimeRef.current);
      }
    }
  );

  // Hook 3: Audio Engine
  const {
    playing,
    currentTimeRef,
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

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return songs.slice(0, 5);
    const lower = searchTerm.toLowerCase();
    return songs.filter((song) => {
      const display = (song.config?.displayName || song.name).toLowerCase();
      return display.includes(lower) || song.name.toLowerCase().includes(lower);
    }).slice(0, 5);
  }, [searchTerm, songs]);

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
    if (selectedSong) {
      loadBuffers(selectedSong).catch(() => setStatusMessage(t(locale, 'unableToLoadAudioBuffers')));
    }
  }, [selectedSong?.name]);

  useEffect(() => {
    setStatusMessage(t(locale, 'statusReady'));
  }, [locale]);

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
            currentTimeRef={currentTimeRef}
            duration={duration}
            offsetMs={songConfig.offsetMs}
            startPlayback={startPlayback}
            pausePlayback={pausePlayback}
            seekTo={seekTo}
            updateConfig={updateConfig}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <DeviceSelector
            locale={locale}
            globalConfig={globalConfig}
            songConfig={songConfig}
            devices={devices}
            saveGlobal={saveGlobal}
            updateConfig={updateConfig}
          />

          <div className="panel">
            <MixerPanel
              locale={locale}
              songConfig={songConfig}
              updateConfig={updateConfig}
            />
          </div>
        </div>

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
            currentTimeRef={currentTimeRef}
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
