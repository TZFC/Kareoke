# Peachy Karaoke

Welcome to **Peachy Karaoke**, the ultimate completely offline, AI-powered karaoke application. Simply drag and drop your favorite songs into the app, and Peachy will automatically separate the vocals, extract the lyrics, and generate musical notation—all right on your machine!

![Peachy Karaoke](media/screenshot.png)

## Features

### 🎙️ AI Audio Separation
Peachy Karaoke features the state-of-the-art **Demucs** AI model built right in.
When you drop an MP3 or WAV file into the app, it automatically separates the instrumental backing track from the vocals, giving you the perfect karaoke track every time.

### 📜 AI Lyrics Generation
No lyrics? No problem. Peachy automatically generates perfectly timed `.lrc` lyrics from the extracted vocal stem using **Whisper**, OpenAI's powerful Automatic Speech Recognition AI, optimized to run natively in your app.

### 🎵 AI Musical Notation (Jianpu)
Whether you are practicing pitch or learning a song, Peachy uses **Spotify Basic Pitch** to track the pitch of the vocal stem and automatically converts it into **Numbered Musical Notation (Jianpu)**.

### 🎛️ Real-time Audio DSP & Routing
- **Hardware Routing Matrix:** Route your microphone independently to your headphones (Monitor) or your main speakers (Audience).
- **Live Reverb & EQ:** Apply professional-grade studio reverb, bass, and treble adjustments to your microphone in real-time.
- **Pitch & Volume Control:** Independently pitch-shift and volume-control the instrumental and vocal tracks to match your vocal range.

### 💾 Persistent Configuration
Once you dial in the perfect pitch shift, reverb setting, or lyric offset for a song, Peachy remembers it! All configurations are saved automatically per-song.

## Getting Started

1. **Launch the App:** Open Peachy Karaoke.
2. **Add Music:** Drag and drop any `.mp3` or `.wav` file directly into the application window.
3. **Wait for AI:** The app will display a progress bar while it separates stems, transcribes lyrics, and calculates pitch notation.
4. **Sing!:** Select your Microphone from the dropdown menu, adjust your reverb, and enjoy!

## System Requirements
- Windows 10 / 11
- At least 4GB of RAM (8GB+ recommended for faster AI processing)
- No internet connection required! All AI processing is 100% offline.
