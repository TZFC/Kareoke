import { useState } from 'react';
import { SongItem, SongConfig } from '../types';
import { t } from '../i18n';

export const useSongLibrary = (
  locale: string,
  setStatusMessage: (msg: string) => void,
  defaultSongConfig: SongConfig,
  selectedSong: SongItem | null,
  setSelectedSong: (song: SongItem | null) => void,
  setSongConfig: (config: SongConfig) => void
) => {
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

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
      setStatusMessage(e.message || t(locale, 'errorOccurred'));
    }
  };

  return {
    songs,
    setSongs,
    searchTerm,
    setSearchTerm,
    refreshSongList,
    handleDeleteSong,
    handleRenameSong,
    onDrop
  };
};
