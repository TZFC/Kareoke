import { BasicPitch, outputToNotesPoly, addPitchBendsToNoteEvents, noteFramesToTime } from '@spotify/basic-pitch';
import * as tf from '@tensorflow/tfjs';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Helper to convert MIDI note (0-127) to Jianpu representation
// Assuming C Major scale, C4 = MIDI 60
function midiToJianpu(midiPitch: number): string {
  const roundedPitch = Math.round(midiPitch);
  const octave = Math.floor(roundedPitch / 12) - 1;
  const semitone = roundedPitch % 12;
  
  const notes = ['1', '1#', '2', '2#', '3', '4', '4#', '5', '5#', '6', '6#', '7'];
  const noteName = notes[semitone];
  
  let modifier = '';
  if (octave > 4) {
    modifier = "'".repeat(octave - 4); // high octave
  } else if (octave < 4) {
    modifier = ",".repeat(4 - octave); // low octave
  }
  
  return `${noteName}${modifier}`;
}

export async function generateNMN(
  f32leRawPath: string, 
  progressCallback: (percent: number, message: string) => void
): Promise<string> {
  try {
    progressCallback(35, 'Initializing Basic Pitch ML...');

    // Setup TF backend
    await tf.ready();
    
    // Locate model
    const possiblePaths = [
      path.join(__dirname, '..', 'node_modules', '@spotify', 'basic-pitch', 'model', 'model.json'),
      path.join(process.cwd(), 'node_modules', '@spotify', 'basic-pitch', 'model', 'model.json')
    ];
    
    let modelPath = '';
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        modelPath = p;
        break;
      }
    }

    if (!modelPath) {
      throw new Error('Basic Pitch model.json not found!');
    }

    // Load model (BasicPitch takes a string URL, but in node we pass file:// path)
    const basicPitch = new BasicPitch(`file://${modelPath}`);

    progressCallback(50, 'Loading audio into ML tensors...');

    // Read the raw f32le file directly into a Float32Array
    const buffer = await fs.readFile(f32leRawPath);
    const float32Samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);

    progressCallback(60, 'Running Audio-to-MIDI transcription...');
    
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const contours: number[][] = [];

    await basicPitch.evaluateModel(
      float32Samples,
      (f: number[][], o: number[][], c: number[][]) => {
        frames.push(...f);
        onsets.push(...o);
        contours.push(...c);
      },
      (p: number) => {
        progressCallback(60 + Math.floor(p * 30), `Transcribing notes... ${Math.floor(p * 100)}%`);
      }
    );

    progressCallback(95, 'Translating MIDI to Jianpu...');

    const notes = outputToNotesPoly(frames, onsets, 0.5, 0.3, 11);
    const notesWithBends = addPitchBendsToNoteEvents(contours, notes);
    const timedNotes = noteFramesToTime(notesWithBends);

    let nmnOutput = '';
    for (const note of timedNotes) {
      const jianpuNote = midiToJianpu(note.pitchMidi);
      const timeStart = note.startTimeSeconds.toFixed(2);
      const duration = note.durationSeconds.toFixed(2);
      nmnOutput += `[${timeStart}s -> ${duration}s] ${jianpuNote}\n`;
    }

    return nmnOutput;
  } catch (error: any) {
    console.error("NMN Generation Error:", error);
    throw new Error(`Numbered Musical Notation generation failed: ${error.message}`);
  }
}
