import React from 'react';
import { t } from '../i18n';
import { SongItem } from '../types';

interface SongSelectorProps {
  locale: string;
  progress: number;
  statusMessage: string;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: SongItem[];
  selectedSong: SongItem | null;
  setSelectedSong: (song: SongItem | null) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleRenameSong: (e: React.MouseEvent, song: SongItem) => void;
  handleDeleteSong: (e: React.MouseEvent, songName: string) => void;
}

export const SongSelector: React.FC<SongSelectorProps> = ({
  locale,
  progress,
  statusMessage,
  searchTerm,
  setSearchTerm,
  searchResults,
  selectedSong,
  setSelectedSong,
  onDrop,
  onDragOver,
  handleRenameSong,
  handleDeleteSong
}) => {
  return (
    <div className="panel">
      <h2 className="panel-title">{t(locale, 'appTitle')}</h2>
      <div className="drop-zone" onDrop={onDrop} onDragOver={onDragOver}>
        <div>
          <strong>{t(locale, 'dropHint')}</strong>
          <div className="status-badge">
            {progress > 0 ? `${t(locale, 'processing')} ${progress}%` : statusMessage}
          </div>
        </div>
      </div>

      <div className="search-area">
        <input 
          value={searchTerm} 
          placeholder={t(locale, 'searchPlaceholder')} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
        <div className="suggestions">
          {searchResults.length ? (
            searchResults.map((song) => (
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
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                    {song.config ? t(locale, 'statusReady') : t(locale, 'processing')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button 
                    onClick={(e) => handleRenameSong(e, song)}
                    style={{ padding: '4px 8px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.5)', borderRadius: 4, cursor: 'pointer', zIndex: 10 }}
                  >
                    {t(locale, 'rename')}
                  </button>
                  <button 
                    onClick={(e) => handleDeleteSong(e, song.name)}
                    style={{ padding: '4px 8px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.5)', borderRadius: 4, cursor: 'pointer', zIndex: 10 }}
                  >
                    {t(locale, 'delete')}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="suggestion">{t(locale, 'noSongs')}</div>
          )}
        </div>
      </div>
    </div>
  );
};
