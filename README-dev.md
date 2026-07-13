# Peachy Karaoke - Developer Documentation

Welcome to the developer documentation for Peachy Karaoke. This project is a desktop application built with Electron, React, and TypeScript that provides advanced AI-driven audio separation, lyrics transcription, and notation generation entirely offline.

## Architecture

The application is structured into two main processes:

### 1. Main Process (`src/main.ts`)
The Node.js backend handles heavy lifting, file processing, and AI inference.
- **IPC Bridge:** Listens for commands from the Renderer via `src/preload.ts`.
- **FFmpeg:** Normalizes user audio to standard WAV format.
- **AI Stems (`src/ai/separateStems.ts`):** Uses the `demucs` package to load the ONNX HTDemucs model and separate the audio into Instrumental and Vocal stems.
- **AI Lyrics (`src/ai/generateLRC.ts`):** Uses `@xenova/transformers` (Whisper-tiny) to transcribe the vocal stem into time-synced `.lrc` text.
- **AI Notation (`src/ai/generateNMN.ts`):** Uses `@spotify/basic-pitch` to evaluate a 22050Hz mono representation of the vocal stem to extract MIDI pitches, which are mapped to Jianpu notation.

### 2. Renderer Process (`src/renderer/App.tsx`)
The React frontend handles the UI and real-time Web Audio API processing. The logic is cleanly modularized into custom hooks:
- **`useAudioContexts`:** Manages the primary AudioContext and sub-contexts for routing (Monitor/Audience).
- **`useMicEngine`:** Processes microphone input with a live DSP chain (BiquadFilter EQ, Freeverb).
- **`usePlaybackEngine`:** Manages the playback of the split stems (Vocals & Backing), applying pitch-shifting and offset calculations.
- **`useConfigSync`:** Debounces and persists user configuration overrides to disk.
- **`useSongLibrary`:** Manages the file system state and library catalog.

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
npm install
```

### Running Locally
To start the Electron application in development mode with Hot-Module Replacement (HMR) for React:
```bash
npm run dev
```

### Building for Production
To package the application into a standalone executable for Windows:
```bash
npm run build
```

## AI Models
All AI dependencies are loaded locally.
- **Demucs**: Stored in `node_modules/demucs/htdemucs.onnx`
- **Whisper**: Fetched or loaded from cache via `transformers.js`
- **Basic Pitch**: Stored in `node_modules/@spotify/basic-pitch/model/model.json`
