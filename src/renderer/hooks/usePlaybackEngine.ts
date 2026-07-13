import { useRef, useState, MutableRefObject } from 'react';
import { SongItem, SongConfig, GlobalConfig } from '../types';
import { loadAudioBuffer } from '../utils/audio';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { t } from '../i18n';

export const usePlaybackEngine = (
  locale: string,
  globalConfigRef: MutableRefObject<GlobalConfig>,
  songConfigRef: MutableRefObject<SongConfig>,
  selectedSongRef: MutableRefObject<SongItem | null>,
  setStatusMessage: (msg: string) => void,
  audienceContextRef: MutableRefObject<AudioContext | null>,
  monitorContextRef: MutableRefObject<AudioContext | null>,
  needBuildAudioContext: (gConfig: GlobalConfig) => Promise<void>,
  startMicInput: (aud: AudioContext, mon: AudioContext, gConfig: GlobalConfig) => Promise<void>,
  stopMicInput: () => void
) => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playingRef = useRef(false);
  const playStartRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const autoScrollFrame = useRef<number | null>(null);

  const instrumentBufferRef = useRef<AudioBuffer | null>(null);
  const vocalBufferRef = useRef<AudioBuffer | null>(null);
  const playSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playbackNodesRef = useRef<{
    audInstGain?: GainNode;
    monInstGain?: GainNode;
    audVocGain?: GainNode;
    monVocGain?: GainNode;
    stNodeAudInst?: SoundTouchNode;
    stNodeMonInst?: SoundTouchNode;
    stNodeAudVoc?: SoundTouchNode;
    stNodeMonVoc?: SoundTouchNode;
  }>({});

  const syncProgress = () => {
    if (!playingRef.current || !audienceContextRef.current) return;
    const elapsed = audienceContextRef.current.currentTime - playStartRef.current;
    const target = pauseOffsetRef.current + elapsed;
    const clamped = Math.min(target, duration);
    setCurrentTime(clamped);
    
    if (clamped >= duration) {
      stopPlayback();
    } else {
      autoScrollFrame.current = requestAnimationFrame(syncProgress);
    }
  };

  const stopPlayback = () => {
    playingRef.current = false;
    setPlaying(false);
    playSourcesRef.current.forEach(src => {
      try { src.stop(); } catch {}
    });
    playSourcesRef.current = [];
    stopMicInput();
    pauseOffsetRef.current = currentTime;
    if (autoScrollFrame.current) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  };

  const startPlayback = async () => {
    try {
      window.electronAPI.log('info', 'startPlayback: Initiated');
      const selSong = selectedSongRef.current;
      if (!selSong || !instrumentBufferRef.current || !vocalBufferRef.current) {
        window.electronAPI.log('warn', 'startPlayback: Missing song or buffers');
        setStatusMessage(t(locale, 'errorNoSong'));
        return;
      }

      const gConfig = globalConfigRef.current;
      const sConfig = songConfigRef.current;

      const missingDevices: string[] = [];
      if (!gConfig.microphoneDevice) missingDevices.push(t(locale, 'microphoneDevice'));
      if (!gConfig.audienceDevice) missingDevices.push(t(locale, 'audienceDevice'));
      if (!gConfig.monitorDevice) missingDevices.push(t(locale, 'monitorDevice'));
      if (missingDevices.length > 0) {
        const msg = t(locale, 'selectDevicesBeforePlay').replace('{devices}', missingDevices.join(', '));
        window.electronAPI.log('warn', `startPlayback: ${msg}`);
        setStatusMessage(msg);
        return;
      }
      
      window.electronAPI.log('info', 'startPlayback: Ensuring AudioContexts are built');
      await needBuildAudioContext(gConfig);
      const audienceCtx = audienceContextRef.current!;
      const monitorCtx = monitorContextRef.current!;

      if (audienceCtx.state === 'suspended') {
        window.electronAPI.log('info', 'startPlayback: Resuming Audience Context');
        await audienceCtx.resume();
      }
      if (monitorCtx.state === 'suspended') {
        window.electronAPI.log('info', 'startPlayback: Resuming Monitor Context');
        await monitorCtx.resume();
      }

      const instBuffer = instrumentBufferRef.current!;
      const vocBuffer = vocalBufferRef.current!;

      const audienceNow = audienceCtx.currentTime;
      const monitorNow = monitorCtx.currentTime;

      window.electronAPI.log('info', 'startPlayback: Stopping existing sources');
      playSourcesRef.current.forEach(src => {
        try { src.stop(); } catch {}
      });
      playSourcesRef.current = [];

      let audInstSource: AudioBufferSourceNode | null = null;
      let audInstGain: GainNode | null = null;
      let stNodeAudInst: SoundTouchNode | null = null;
      if (sConfig.routeBackingToAudience) {
        window.electronAPI.log('info', 'startPlayback: Connecting backing track to audience');
        audInstSource = audienceCtx.createBufferSource();
        audInstSource.buffer = instBuffer;
        stNodeAudInst = new SoundTouchNode({ context: audienceCtx });
        stNodeAudInst.pitchSemitones.value = sConfig.instrumentalPitch;
        audInstGain = audienceCtx.createGain();
        audInstGain.gain.value = sConfig.instrumentalVolume;
        audInstSource.connect(stNodeAudInst);
        stNodeAudInst.connect(audInstGain);
        audInstGain.connect(audienceCtx.destination);
      }

      let monInstSource: AudioBufferSourceNode | null = null;
      let monInstGain: GainNode | null = null;
      let stNodeMonInst: SoundTouchNode | null = null;
      if (sConfig.routeBackingToMonitor) {
        window.electronAPI.log('info', 'startPlayback: Connecting backing track to monitor');
        monInstSource = monitorCtx.createBufferSource();
        monInstSource.buffer = instBuffer;
        stNodeMonInst = new SoundTouchNode({ context: monitorCtx });
        stNodeMonInst.pitchSemitones.value = sConfig.instrumentalPitch;
        monInstGain = monitorCtx.createGain();
        monInstGain.gain.value = sConfig.instrumentalVolume;
        monInstSource.connect(stNodeMonInst);
        stNodeMonInst.connect(monInstGain);
        monInstGain.connect(monitorCtx.destination);
      }

      let audVocSource: AudioBufferSourceNode | null = null;
      let audVocGain: GainNode | null = null;
      let stNodeAudVoc: SoundTouchNode | null = null;
      if (sConfig.routeVocalToAudience) {
        window.electronAPI.log('info', 'startPlayback: Connecting vocal track to audience');
        audVocSource = audienceCtx.createBufferSource();
        audVocSource.buffer = vocBuffer;
        stNodeAudVoc = new SoundTouchNode({ context: audienceCtx });
        stNodeAudVoc.pitchSemitones.value = sConfig.vocalPitch;
        audVocGain = audienceCtx.createGain();
        audVocGain.gain.value = sConfig.vocalVolume;
        audVocSource.connect(stNodeAudVoc);
        stNodeAudVoc.connect(audVocGain);
        audVocGain.connect(audienceCtx.destination);
      }

      let monVocSource: AudioBufferSourceNode | null = null;
      let monVocGain: GainNode | null = null;
      let stNodeMonVoc: SoundTouchNode | null = null;
      if (sConfig.routeVocalToMonitor) {
        window.electronAPI.log('info', 'startPlayback: Connecting vocal track to monitor');
        monVocSource = monitorCtx.createBufferSource();
        monVocSource.buffer = vocBuffer;
        stNodeMonVoc = new SoundTouchNode({ context: monitorCtx });
        stNodeMonVoc.pitchSemitones.value = sConfig.vocalPitch;
        monVocGain = monitorCtx.createGain();
        monVocGain.gain.value = sConfig.vocalVolume;
        monVocSource.connect(stNodeMonVoc);
        stNodeMonVoc.connect(monVocGain);
        monVocGain.connect(monitorCtx.destination);
      }

      playbackNodesRef.current = {
        audInstGain: audInstGain || undefined,
        monInstGain: monInstGain || undefined,
        audVocGain: audVocGain || undefined,
        monVocGain: monVocGain || undefined,
        stNodeAudInst: stNodeAudInst || undefined,
        stNodeMonInst: stNodeMonInst || undefined,
        stNodeAudVoc: stNodeAudVoc || undefined,
        stNodeMonVoc: stNodeMonVoc || undefined
      };

      window.electronAPI.log('info', 'startPlayback: Starting Mic Input');
      await startMicInput(audienceCtx, monitorCtx, gConfig);

      const offsetSeconds = sConfig.offsetMs / 1000;
      const startOffset = pauseOffsetRef.current;

      const audInstStartAt = audienceNow + Math.max(0, -offsetSeconds);
      const audVocStartAt = audienceNow + Math.max(0, offsetSeconds);

      const monInstStartAt = monitorNow + Math.max(0, -offsetSeconds);
      const monVocStartAt = monitorNow + Math.max(0, offsetSeconds);

      const instOffset = startOffset;
      const vocOffset = startOffset + Math.max(0, offsetSeconds) - Math.max(0, -offsetSeconds);

      window.electronAPI.log(
        'info',
        `startPlayback: Executing audio source start commands. audInstStartAt=${audInstStartAt}, monInstStartAt=${monInstStartAt}, instOffset=${instOffset}, audVocStartAt=${audVocStartAt}, monVocStartAt=${monVocStartAt}, vocOffset=${vocOffset}`
      );
      
      if (audInstSource) audInstSource.start(audInstStartAt, Math.max(0, instOffset));
      if (monInstSource) monInstSource.start(monInstStartAt, Math.max(0, instOffset));
      if (audVocSource) audVocSource.start(audVocStartAt, Math.max(0, vocOffset));
      if (monVocSource) monVocSource.start(monVocStartAt, Math.max(0, vocOffset));

      window.electronAPI.log('info', 'startPlayback: Success');
      playSourcesRef.current = [];
      if (audInstSource) playSourcesRef.current.push(audInstSource);
      if (monInstSource) playSourcesRef.current.push(monInstSource);
      if (audVocSource) playSourcesRef.current.push(audVocSource);
      if (monVocSource) playSourcesRef.current.push(monVocSource);

      playStartRef.current = audienceNow;
      playingRef.current = true;
      setPlaying(true);
      setStatusMessage(t(locale, 'playback'));
      if (autoScrollFrame.current) cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = requestAnimationFrame(syncProgress);
    } catch (err: any) {
      window.electronAPI.log('error', `startPlayback crashed: ${err.message}\n${err.stack}`);
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const pausePlayback = () => {
    window.electronAPI.log('info', 'User input: pausePlayback');
    stopPlayback();
  };

  const seekTo = (time: number) => {
    window.electronAPI.log('info', `User input: seekTo ${time.toFixed(2)}s`);
    const clamped = Math.max(0, Math.min(time, duration));
    setCurrentTime(clamped);
    pauseOffsetRef.current = clamped;
    if (playingRef.current) {
      stopPlayback();
      startPlayback();
    }
  };

  const loadBuffers = async (song: SongItem) => {
    try {
      stopPlayback();
      setCurrentTime(0);
      pauseOffsetRef.current = 0;
      window.electronAPI.log('info', `loadBuffers: Starting for "${song.name}"`);

      window.electronAPI.log('info', 'loadBuffers: Building AudioContext');
      await needBuildAudioContext(globalConfigRef.current);
      const context = audienceContextRef.current!;

      window.electronAPI.log('info', 'loadBuffers: Fetching instrumental buffer');
      const instrumental = await loadAudioBuffer(song.instrumentalPath, context);
      
      window.electronAPI.log('info', 'loadBuffers: Fetching vocal buffer');
      const vocal = await loadAudioBuffer(song.vocalPath, context);

      instrumentBufferRef.current = instrumental;
      vocalBufferRef.current = vocal;
      
      setDuration(Math.max(instrumental.duration, vocal.duration));
      window.electronAPI.log('info', `loadBuffers: Complete for "${song.name}"`);
    } catch (err: any) {
      window.electronAPI.log('error', `loadBuffers CRASHED: ${err.message}\n${err.stack}`);
      setStatusMessage(t(locale, 'failedToLoadAudio').replace('{error}', err.message));
    }
  };

  return {
    playing,
    playingRef,
    currentTime,
    duration,
    playbackNodesRef,
    startPlayback,
    pausePlayback,
    stopPlayback,
    seekTo,
    loadBuffers
  };
};
