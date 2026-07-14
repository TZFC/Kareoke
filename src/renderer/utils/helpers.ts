export type LyricLine = {
  time: number;
  text: string;
};

import { Lrc } from 'lrc-kit';

export const parseLrc = (lrcText: string): LyricLine[] => {
  if (!lrcText) return [];
  try {
    const parsed = Lrc.parse(lrcText);
    return parsed.lyrics.map(lyric => ({
      time: lyric.timestamp,
      text: lyric.content
    }));
  } catch (err) {
    console.error('Failed to parse LRC:', err);
    return [];
  }
};

export const formatTime = (seconds: number) => {
  if (Number.isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secondsRem = Math.floor(seconds % 60);
  return `${minutes}:${secondsRem.toString().padStart(2, '0')}`;
};
