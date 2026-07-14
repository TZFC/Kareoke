import { useState, useRef, useEffect } from 'react';
import { GlobalConfig, SongConfig, SongItem } from '../types';

export const useConfigSync = (
  defaultSongConfig: SongConfig,
  setLocale: (l: any) => void,
  selectedSong: SongItem | null,
  setSelectedSong: React.Dispatch<React.SetStateAction<SongItem | null>>,
  setSongs: React.Dispatch<React.SetStateAction<SongItem[]>>,
  onGlobalConfigSaved: (config: GlobalConfig) => void,
  onSongConfigChanged: (changes: Partial<SongConfig>) => void
) => {
  const isLoadedRef = useRef(false);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({
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
    routeMicToAudience: true,
    routeMicToMonitor: false,
    language: 'en-US'
  });
  const [songConfig, setSongConfig] = useState<SongConfig>(defaultSongConfig);
  const savePendingRef = useRef<NodeJS.Timeout | null>(null);

  const saveGlobal = async (config: GlobalConfig) => {
    setGlobalConfig(config);
    await window.electronAPI.saveGlobalConfig(config);
  };

  const saveSongConfig = async (config: SongConfig, songName: string) => {
    await window.electronAPI.saveSongConfig(songName, config);
  };

  const loadGlobalConfig = async () => {
    const config = await window.electronAPI.loadGlobalConfig();
    setGlobalConfig(config);
    setLocale(config.language || 'en-US');
    isLoadedRef.current = true;
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
    window.electronAPI.log('info', `User input: Updated config keys: ${Object.keys(changes).map(k => `${k}=${(changes as any)[k]}`).join(', ')}`);
    const next = { ...songConfig, ...changes };
    setSongConfig(next);
    if (selectedSong) {
      if (savePendingRef.current) clearTimeout(savePendingRef.current);
      savePendingRef.current = setTimeout(() => saveSongConfig(next, selectedSong.name), 250);
    }
    onSongConfigChanged(changes);
  };

  useEffect(() => {
    if (selectedSong) restoreConfig(selectedSong);
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
    if (isLoadedRef.current) {
      onGlobalConfigSaved(globalConfig);
      saveGlobal(globalConfig);
    }
  }, [globalConfig]);

  return {
    globalConfig,
    songConfig,
    setSongConfig,
    saveGlobal,
    loadGlobalConfig,
    updateConfig
  };
};
