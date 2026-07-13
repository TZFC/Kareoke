import React from 'react';
import { t } from '../i18n';
import { formatTime } from '../utils/helpers';
import { EditableNumber } from './EditableNumber';

interface PlaybackControlsProps {
  locale: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  offsetMs: number;
  startPlayback: () => void;
  pausePlayback: () => void;
  seekTo: (time: number) => void;
  updateConfig: (changes: { offsetMs: number }) => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  locale,
  playing,
  currentTime,
  duration,
  offsetMs,
  startPlayback,
  pausePlayback,
  seekTo,
  updateConfig
}) => {
  const selectedSongDuration = formatTime(duration);

  return (
    <div className="timeline">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span>{t(locale, 'timelineHint')}</span>
        <span>{formatTime(currentTime)} / {selectedSongDuration}</span>
      </div>
      <div 
        className="timeline-bar" 
        onClick={(event) => {
          const rect = (event.target as HTMLElement).getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          seekTo(ratio * duration);
        }}
      >
        <div 
          className="timeline-progress" 
          style={{ width: `${(duration > 0 ? (currentTime / duration) * 100 : 0)}%` }} 
        />
        <div 
          className="playhead" 
          style={{ left: `${(duration > 0 ? (currentTime / duration) * 100 : 0)}%` }} 
        />
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: 10 }}>
        <button onClick={() => (playing ? pausePlayback() : startPlayback())}>
          {playing ? t(locale, 'pause') : t(locale, 'play')}
        </button>
        <button onClick={() => seekTo(0)}>{t(locale, 'reset')}</button>
      </div>
      <label className="range-label" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span>
            {t(locale, 'offsetMs')}: 
            <EditableNumber 
              value={offsetMs} 
              onChange={val => updateConfig({ offsetMs: Math.round(val) })} 
              toFixed={0} suffix=" ms" 
              min={-1000} max={0} 
            />
            {offsetMs < 0 ? ` (${t(locale, 'early')})` : ` (${t(locale, 'inSync')})`}
          </span>
          <button onClick={() => updateConfig({ offsetMs: 0 })} style={{ fontSize: '0.75rem', padding: '2px 6px', opacity: 0.8 }}>
            {t(locale, 'reset')}
          </button>
        </div>
        <input 
          type="range" 
          min="-1000" 
          max="0" 
          step="10" 
          value={offsetMs} 
          onChange={(e) => updateConfig({ offsetMs: Number(e.target.value) })} 
        />
      </label>
    </div>
  );
};
