import { pipeline, env } from '@xenova/transformers';

// Optional: configure environment to avoid polluting local caches if needed
env.allowLocalModels = false;
env.useBrowserCache = false;

function formatTimeLRC(seconds: number): string {
  if (seconds === null || seconds === undefined) return '[00:00.00]';
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const minStr = min.toString().padStart(2, '0');
  const secStr = sec.toFixed(2).padStart(5, '0');
  return `[${minStr}:${secStr}]`;
}

export async function generateLRC(
  vocalWavPath: string, 
  progressCallback: (percent: number, message: string) => void
): Promise<string> {
  try {
    progressCallback(80, 'Loading Whisper AI model...');
    
    // We use Xenova/whisper-tiny as it's the fastest and smallest for local execution.
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      progress_callback: (info: any) => {
        if (info.status === 'progress' || info.status === 'downloading') {
          const p = typeof info.progress === 'number' ? info.progress : 0;
          progressCallback(80 + Math.floor(p * 0.05), `Downloading Whisper model... ${Math.floor(p)}%`);
        } else if (info.status === 'ready') {
          progressCallback(85, 'Whisper model ready.');
        }
      }
    });

    progressCallback(85, 'Transcribing vocals (this will take a while)...');

    // Transcribe with chunking for long audio and timestamps enabled
    const output = await transcriber(vocalWavPath, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });

    progressCallback(90, 'Formatting LRC...');

    let lrcContent = '';
    if (output && Array.isArray((output as any).chunks)) {
      for (const chunk of (output as any).chunks) {
        const startTime = chunk.timestamp[0];
        if (startTime !== null && startTime !== undefined) {
          lrcContent += `${formatTimeLRC(startTime)}${chunk.text}\n`;
        }
      }
    } else if (output && (output as any).text) {
      lrcContent = `[00:00.00]${(output as any).text}\n`;
    }

    return lrcContent;
  } catch (error: any) {
    console.error("LRC Generation Error:", error);
    throw new Error(`LRC generation failed: ${error.message}`);
  }
}
