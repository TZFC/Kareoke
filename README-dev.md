# PeachyKareoke — Developer Documentation

This document outlines the architecture, code layout, and setup guide for developers working on the **PeachyKareoke** desktop client.

## 🛠️ Tech Stack

* **Shell & Native Windowing:** Electron 28
* **Frontend View Layer:** React 18 with TypeScript 5
* **Bundler & Dev Server:** Vite 5
* **Audio Processing Engine:** Web Audio API (native browser thread)
* **CSS Styling:** Custom Vanilla CSS

---

## 🏗️ Architectural Overview

### 1. Zero-Copy Local Audio Streaming
Instead of transferring entire audio buffers over IPC, which blocks the Electron main process and leaks memory, we register a custom protocol `local-media://` in [main.ts](file:///f:/Kareoke/Kareoke/src/main.ts). The frontend requests audio files directly via standard `fetch()`, which reads streams directly from disk under a secure sandboxed origin.

### 2. Multi-Context Audio Device Routing
Chromium does not support independent sub-device routing within a single `AudioContext`. To route instrumental stems to the audience speaker and vocals/mic-return to the monitor headphones, we initialize two separate contexts:
* `audienceContext`: Bound to the audience output `sinkId`.
* `monitorContext`: Bound to the performer monitor `sinkId`.

Both contexts load and play the identical, context-neutral `AudioBuffer` objects, triggered at the same hardware epoch timestamp (`AudioContext.currentTime`) to prevent sample drift.

### 3. Real-Time Time-Domain Pitch Shifting
We implement a custom Overlap-Add (OLA) time-stretching algorithm in [App.tsx](file:///f:/Kareoke/Kareoke/src/renderer/App.tsx#L70-L144). Unlike standard `playbackRate` tweaks that speed up or slow down playback, this divides the signal into short overlapping windows (1024 samples) and crossfades them to shift the pitch (frequency) while preserving the tempo (duration).

### 4. Low-Latency Mic Capture & Live FX
We capture raw audio by turning off default browser filters (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`). The stream is routed to standard Biquad Filters (Low Shelf for Bass, High Shelf for Treble) and a high-performance feedback Delay node to simulate natural reverb with sub-15ms round-trip latency.

---

* `src/main.ts`: Main process source file. Compiles to `dist/main.js`, which is the entry point defined in `package.json`.
* `src/preload.ts`: Preload script exposing safe Electron IPC bindings.
* `src/renderer/main.tsx`: React frontend entry point.
* `src/renderer/App.tsx`: Main React application component containing UI layouts and Web Audio graphs.
* `src/renderer/i18n.ts`: Localization dictionaries and helper functions.
* `src/renderer/styles.css`: Dark mode layout tokens, sliders, custom buttons, and page animations.

---

## 💻 Get Started

### Prerequisites
* **Node.js:** v18.0.0 or later
* **Package Manager:** npm

### Development Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application in development mode (with hot-reload):
   ```bash
   npm run dev
   ```

### Packaging & Distribution
To compile assets and package the application into a standalone Windows installer (`.exe`):
```bash
npm run dist
```
Output files will be generated in the `/release` directory.
