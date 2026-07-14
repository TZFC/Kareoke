import React, { useRef, useEffect } from 'react';
import { t } from '../i18n';
import { SongConfig } from '../types';
import { LyricLine } from '../utils/helpers';

interface LyricsNotesPanelProps {
  locale: string;
  songConfig: SongConfig;
  updateConfig: (changes: Partial<SongConfig>) => void;
  activeTab: 'lyrics' | 'notes';
  setActiveTab: (tab: 'lyrics' | 'notes') => void;
  editingLrc: boolean;
  setEditingLrc: (editing: boolean) => void;
  parsedLyrics: LyricLine[];
  currentTimeRef: React.MutableRefObject<number>;
  duration: number;
}

export const LyricsNotesPanel: React.FC<LyricsNotesPanelProps> = ({
  locale,
  songConfig,
  updateConfig,
  activeTab,
  setActiveTab,
  editingLrc,
  setEditingLrc,
  parsedLyrics,
  currentTimeRef,
  duration
}) => {
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const updateLoop = () => {
      const current = currentTimeRef.current;
      
      // Auto-scroll note
      if (songConfig.autoScroll && noteRef.current && duration > 0) {
        const ratio = current / duration;
        const tot = noteRef.current.scrollHeight - noteRef.current.clientHeight;
        noteRef.current.scrollTop = tot * ratio;
      }

      // Sync Lyrics
      if (activeTab === 'lyrics' && lyricsContainerRef.current) {
        const container = lyricsContainerRef.current;
        let activeIdx = -1;
        for (let i = 0; i < parsedLyrics.length; i++) {
          if (current >= parsedLyrics[i].time) {
            activeIdx = i;
          } else {
            break;
          }
        }
        
        for (let i = 0; i < container.children.length; i++) {
          const el = container.children[i] as HTMLElement;
          if (i === activeIdx) {
            el.style.fontSize = '1.25rem';
            el.style.fontWeight = 'bold';
            el.style.color = '#a78bfa';
          } else {
            el.style.fontSize = '1rem';
            el.style.fontWeight = 'normal';
            el.style.color = 'var(--muted)';
          }
        }

        if (songConfig.autoScroll && activeIdx !== -1) {
          const activeElement = container.children[activeIdx] as HTMLElement;
          if (activeElement) {
            const top = activeElement.offsetTop - container.clientHeight / 2 + activeElement.clientHeight / 2;
            container.scrollTo({ top, behavior: 'smooth' });
          }
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateLoop);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateLoop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [songConfig.autoScroll, duration, activeTab, parsedLyrics, currentTimeRef]);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button 
          style={{ flex: 1, background: activeTab === 'lyrics' ? 'var(--accent)' : 'transparent', borderColor: activeTab === 'lyrics' ? 'var(--accent)' : 'var(--border)' }}
          onClick={() => setActiveTab('lyrics')}
        >
          {t(locale, 'lyricsTab')}
        </button>
        <button 
          style={{ flex: 1, background: activeTab === 'notes' ? 'var(--accent)' : 'transparent', borderColor: activeTab === 'notes' ? 'var(--accent)' : 'var(--border)' }}
          onClick={() => setActiveTab('notes')}
        >
          {t(locale, 'notesTab')}
        </button>
      </div>

      {activeTab === 'lyrics' ? (
        (!songConfig.lrcText || editingLrc) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            <textarea 
              style={{ flex: 1, minHeight: 280 }}
              value={songConfig.lrcText || ''} 
              onChange={(e) => updateConfig({ lrcText: e.target.value })} 
              placeholder={t(locale, 'lrcPlaceholder')}
            />
            <button onClick={() => setEditingLrc(false)}>{t(locale, 'doneEditing')}</button>
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
                    fontSize: '1rem', 
                    fontWeight: 'normal',
                    color: 'var(--muted)',
                    transition: 'all 0.2s ease',
                    padding: '4px 0'
                  }}
                >
                  {line.text}
                </div>
              ))}
            </div>
            <button onClick={() => setEditingLrc(true)}>{t(locale, 'editLyrics')}</button>
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <input 
          type="checkbox" 
          checked={songConfig.autoScroll} 
          onChange={(e) => updateConfig({ autoScroll: e.target.checked })} 
        />
        {t(locale, 'autoScroll')}
      </label>
    </>
  );
};
