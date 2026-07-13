# PeachyKareoke Developer Guide

This document outlines how to setup, build, and contribute to the PeachyKareoke codebase.

## Tech Stack
- **Electron**: Application framework
- **React 18**: UI rendering
- **Vite**: Frontend bundler and dev server
- **TypeScript**: Static typing for both Main and Renderer processes
- **Web Audio API**: Advanced audio processing and routing matrix
- **SoundTouchJS**: State-of-the-art AudioWorklet for real-time pitch shifting
- **Demucs**: Local automated vocal/instrumental audio separation

## Project Structure
```text
PeachyKareoke/
├── src/
│   ├── main.ts              # Electron Main Process (System integration, HTTP server)
│   ├── preload.ts           # Context Bridge API (window.electronAPI)
│   └── renderer/            # React UI (Renderer Process)
│       ├── components/      # UI component modules (DeviceSelector, PlaybackControls, etc.)
│       ├── hooks/           # Core audio and logic hooks (useAudioEngine.ts)
│       ├── utils/           # Helper scripts (audio processing, LRC parsing)
│       └── App.tsx          # Main React Application entry point
├── dist/                    # Compiled source output
├── package.json             # NPM dependencies and scripts
└── vite.config.ts           # Vite bundler config
```

## Setup & Running

1. **Install Node.js & NPM**
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run in Development Mode**:
   ```bash
   npm run dev
   ```
   This will concurrently run Vite, compile the TypeScript main process, and launch Electron with Hot Module Replacement (HMR) enabled for the React components.

## Building for Production
To package the app for distribution (generates `.exe` via NSIS by default on Windows):
```bash
npm run dist
```

## Architecture Notes
- **Audio Routing**: The application uses separate Web `AudioContext`s for the "Audience" and "Monitor" output streams. This allows discrete physical device targets and isolated gain/filter chains.
- **Pitch Shifting**: Avoid typical time-domain or delay-node methods. PeachyKareoke injects a custom `SoundTouchNode` into the graph to process phase-locked WSOLA pitch shifting dynamically on an independent audio thread.
- **Local Data Storage**: During development, songs, configuration, and separated stems are saved in the `PeachyKareoke` folder at the root. In production, these are placed in the OS standard `app.getPath('userData')`.
