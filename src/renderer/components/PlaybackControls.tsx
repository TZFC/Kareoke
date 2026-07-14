import React from 'react';
import { t } from '../i18n';
import { formatTime } from '../utils/helpers';
import { EditableNumber } from './EditableNumber';

interface PlaybackControlsProps {
  locale: string;
  playing: boolean;
  currentTimeRef: React.MutableRefObject<number>;
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
  currentTimeRef,
  duration,
  offsetMs,
  startPlayback,
  pausePlayback,
  seekTo,
  updateConfig
}) => {
  const selectedSongDuration = formatTime(duration);

  const progressRef = React.useRef<HTMLDivElement | null>(null);
  const playheadRef = React.useRef<HTMLDivElement | null>(null);
  const timeTextRef = React.useRef<HTMLSpanElement | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const updateLoop = () => {
      const current = currentTimeRef.current;
      if (progressRef.current) {
        progressRef.current.style.width = `${(duration > 0 ? (current / duration) * 100 : 0)}%`;
      }
      if (playheadRef.current) {
        playheadRef.current.style.left = `${(duration > 0 ? (current / duration) * 100 : 0)}%`;
      }
      if (timeTextRef.current) {
        timeTextRef.current.innerText = `${formatTime(current)} / ${selectedSongDuration}`;
      }
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };
    animationFrameRef.current = requestAnimationFrame(updateLoop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [duration, selectedSongDuration, currentTimeRef]);

  return (
    <div className="timeline">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span>{t(locale, 'timelineHint')}</span>
        <span ref={timeTextRef}>0:00 / {selectedSongDuration}</span>
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
          ref={progressRef}
          className="timeline-progress" 
          style={{ width: '0%' }} 
        />
        <div 
          ref={playheadRef}
          className="playhead" 
          style={{ left: '0%' }} 
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
