export type LyricLine = {
  time: number;
  text: string;
};

export const parseLrc = (lrcText: string): LyricLine[] => {
  if (!lrcText) return [];
  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d+):(\d+)[.:](\d+)\]/g;
  
  for (const line of lines) {
    const text = line.replace(/\[\d+:\d+[.:]\d+\]/g, '').trim();
    let match;
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msVal = match[3];
      const ms = parseInt(msVal, 10);
      const msFactor = msVal.length === 2 ? 10 : 1;
      const time = min * 60 + sec + (ms * msFactor) / 1000;
      result.push({ time, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
};

export const formatTime = (seconds: number) => {
  if (Number.isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};
