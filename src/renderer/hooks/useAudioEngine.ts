import { useRef, useState, useEffect } from 'react';
import { SongItem, SongConfig, GlobalConfig } from '../types';
import { loadAudioBuffer, pitchShiftBuffer } from '../utils/audio';
import { formatTime } from '../utils/helpers';
import { t } from '../i18n';

export const useAudioEngine = (
  locale: string,
  globalConfig: GlobalConfig,
  songConfig: SongConfig,
  selectedSong: SongItem | null,
  setStatusMessage: (msg: string) => void
) => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playingRef = useRef(false);
  const globalConfigRef = useRef(globalConfig);
  const songConfigRef = useRef(songConfig);
  const selectedSongRef = useRef(selectedSong);

  // Sync refs to avoid stale closures in requestAnimationFrame loops
  useEffect(() => {
    globalConfigRef.current = globalConfig;
  }, [globalConfig]);

  useEffect(() => {
    songConfigRef.current = songConfig;
  }, [songConfig]);

  useEffect(() => {
    selectedSongRef.current = selectedSong;
  }, [selectedSong]);

  const audienceContextRef = useRef<AudioContext | null>(null);
  const monitorContextRef = useRef<AudioContext | null>(null);
  const instrumentBufferRef = useRef<AudioBuffer | null>(null);
  const vocalBufferRef = useRef<AudioBuffer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const playSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  
  const micNodesRef = useRef<{
    audienceGain?: GainNode;
    monitorGain?: GainNode;
    audienceBassFilter?: BiquadFilterNode;
    audienceTrebleFilter?: BiquadFilterNode;
    monitorBassFilter?: BiquadFilterNode;
    monitorTrebleFilter?: BiquadFilterNode;
    audienceDelayGain?: GainNode;
    monitorDelayGain?: GainNode;
  }>({});

  const playStartRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const shiftedInstrumentRef = useRef<AudioBuffer | null>(null);
  const shiftedVocalRef = useRef<AudioBuffer | null>(null);
  const currentShiftedPitchRef = useRef<number>(999);
  const autoScrollFrame = useRef<number | null>(null);

  const needBuildAudioContext = async () => {
    if (!audienceContextRef.current) {
      audienceContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      if (globalConfigRef.current.audienceDevice) {
        try {
          await (audienceContextRef.current as any).setSinkId(globalConfigRef.current.audienceDevice);
        } catch (e) {
          console.error("Failed to set audience device sinkId", e);
        }
      }
    }
    if (!monitorContextRef.current) {
      monitorContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      if (globalConfigRef.current.monitorDevice) {
        try {
          await (monitorContextRef.current as any).setSinkId(globalConfigRef.current.monitorDevice);
        } catch (e) {
          console.error("Failed to set monitor device sinkId", e);
        }
      }
    }
  };

  const updateMicParams = () => {
    const nodes = micNodesRef.current;
    const gConfig = globalConfigRef.current;
    if (nodes.audienceGain) {
      nodes.audienceGain.gain.setValueAtTime(gConfig.micVolume, 0);
    }
    if (nodes.monitorGain) {
      nodes.monitorGain.gain.setValueAtTime(gConfig.micVolume, 0);
    }
    if (nodes.audienceBassFilter) {
      nodes.audienceBassFilter.gain.setValueAtTime(gConfig.micBass, 0);
    }
    if (nodes.monitorBassFilter) {
      nodes.monitorBassFilter.gain.setValueAtTime(gConfig.micBass, 0);
    }
    if (nodes.audienceTrebleFilter) {
      nodes.audienceTrebleFilter.gain.setValueAtTime(gConfig.micTreble, 0);
    }
    if (nodes.monitorTrebleFilter) {
      nodes.monitorTrebleFilter.gain.setValueAtTime(gConfig.micTreble, 0);
    }
    if (nodes.audienceDelayGain) {
      nodes.audienceDelayGain.gain.setValueAtTime(gConfig.micReverb, 0);
    }
    if (nodes.monitorDelayGain) {
      nodes.monitorDelayGain.gain.setValueAtTime(gConfig.micReverb, 0);
    }
  };

  const startMicInput = async (audienceCtx: AudioContext, monitorCtx: AudioContext) => {
    const gConfig = globalConfigRef.current;
    if (!gConfig.microphoneDevice) return;
    stopMicInput();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: gConfig.microphoneDevice },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0
        } as any
      });
      micStreamRef.current = stream;

      // 1. Audience Context Mic Chain
      const audSource = audienceCtx.createMediaStreamSource(stream);
      const audGain = audienceCtx.createGain();
      audGain.gain.value = gConfig.micVolume;
      const audBass = audienceCtx.createBiquadFilter();
      audBass.type = 'lowshelf';
      audBass.frequency.value = 150;
      audBass.gain.value = gConfig.micBass;
      const audTreble = audienceCtx.createBiquadFilter();
      audTreble.type = 'highshelf';
      audTreble.frequency.value = 8000;
      audTreble.gain.value = gConfig.micTreble;

      // Reverb/Delay for Audience
      const audDelay = audienceCtx.createDelay();
      audDelay.delayTime.value = 0.25;
      const audFeedback = audienceCtx.createGain();
      audFeedback.gain.value = 0.45;
      const audDelayGain = audienceCtx.createGain();
      audDelayGain.gain.value = gConfig.micReverb;

      audSource.connect(audBass);
      audBass.connect(audTreble);
      audTreble.connect(audGain);
      audGain.connect(audienceCtx.destination);

      audGain.connect(audDelay);
      audDelay.connect(audFeedback);
      audFeedback.connect(audDelay);
      audDelay.connect(audDelayGain);
      audDelayGain.connect(audienceCtx.destination);

      // 2. Monitor Context Mic Chain
      const monSource = monitorCtx.createMediaStreamSource(stream);
      const monGain = monitorCtx.createGain();
      monGain.gain.value = gConfig.micVolume;
      const monBass = monitorCtx.createBiquadFilter();
      monBass.type = 'lowshelf';
      monBass.frequency.value = 150;
      monBass.gain.value = gConfig.micBass;
      const monTreble = monitorCtx.createBiquadFilter();
      monTreble.type = 'highshelf';
      monTreble.frequency.value = 8000;
      monTreble.gain.value = gConfig.micTreble;

      // Reverb/Delay for Monitor
      const monDelay = monitorCtx.createDelay();
      monDelay.delayTime.value = 0.25;
      const monFeedback = monitorCtx.createGain();
      monFeedback.gain.value = 0.45;
      const monDelayGain = monitorCtx.createGain();
      monDelayGain.gain.value = gConfig.micReverb;

      monSource.connect(monBass);
      monBass.connect(monTreble);
      monTreble.connect(monGain);

      if (gConfig.routeMicToMonitor) {
        monGain.connect(monitorCtx.destination);
        monGain.connect(monDelay);
        monDelay.connect(monFeedback);
        monFeedback.connect(monDelay);
        monDelay.connect(monDelayGain);
        monDelayGain.connect(monitorCtx.destination);
      }

      micNodesRef.current = {
        audienceGain: audGain,
        monitorGain: monGain,
        audienceBassFilter: audBass,
        audienceTrebleFilter: audTreble,
        monitorBassFilter: monBass,
        monitorTrebleFilter: monTreble,
        audienceDelayGain: audDelayGain,
        monitorDelayGain: monDelayGain
      };
    } catch (e) {
      console.error("Failed to start mic input", e);
    }
  };

  const stopMicInput = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    micNodesRef.current = {};
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
      if (!gConfig.microphoneDevice) missingDevices.push('Microphone');
      if (!gConfig.audienceDevice) missingDevices.push('Audience Speaker');
      if (!gConfig.monitorDevice) missingDevices.push('Monitor Headphones');
      if (missingDevices.length > 0) {
        const msg = `Please select the following device(s) before playing: ${missingDevices.join(', ')}`;
        window.electronAPI.log('warn', `startPlayback: ${msg}`);
        setStatusMessage(msg);
        return;
      }
      
      window.electronAPI.log('info', 'startPlayback: Ensuring AudioContexts are built');
      await needBuildAudioContext();
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

      const keyShift = sConfig.instrumentalPitch;

      if (currentShiftedPitchRef.current !== keyShift || !shiftedInstrumentRef.current || !shiftedVocalRef.current) {
        window.electronAPI.log('info', `startPlayback: Pitch shifting to ${keyShift}`);
        setStatusMessage("Pitch shifting audio...");
        await new Promise(resolve => setTimeout(resolve, 50));
        shiftedInstrumentRef.current = pitchShiftBuffer(instrumentBufferRef.current!, keyShift, audienceCtx);
        shiftedVocalRef.current = pitchShiftBuffer(vocalBufferRef.current!, keyShift, audienceCtx);
        currentShiftedPitchRef.current = keyShift;
        setStatusMessage("Ready");
      }

      const instBuffer = shiftedInstrumentRef.current!;
      const vocBuffer = shiftedVocalRef.current!;
      const now = audienceCtx.currentTime;

      window.electronAPI.log('info', 'startPlayback: Stopping existing sources');
      playSourcesRef.current.forEach(src => {
        try { src.stop(); } catch {}
      });
      playSourcesRef.current = [];

      window.electronAPI.log('info', 'startPlayback: Connecting backing track to audience');
      const audInstSource = audienceCtx.createBufferSource();
      audInstSource.buffer = instBuffer;
      const audInstGain = audienceCtx.createGain();
      audInstGain.gain.value = sConfig.instrumentalVolume;
      audInstSource.connect(audInstGain);
      audInstGain.connect(audienceCtx.destination);

      let monInstSource: AudioBufferSourceNode | null = null;
      if (sConfig.routeBackingToMonitor) {
        window.electronAPI.log('info', 'startPlayback: Connecting backing track to monitor');
        monInstSource = monitorCtx.createBufferSource();
        monInstSource.buffer = instBuffer;
        const monInstGain = monitorCtx.createGain();
        monInstGain.gain.value = sConfig.instrumentalVolume;
        monInstSource.connect(monInstGain);
        monInstGain.connect(monitorCtx.destination);
      }

      window.electronAPI.log('info', 'startPlayback: Connecting vocal track to monitor');
      const monVocSource = monitorCtx.createBufferSource();
      monVocSource.buffer = vocBuffer;
      const monVocGain = monitorCtx.createGain();
      monVocGain.gain.value = sConfig.vocalVolume;
      monVocSource.connect(monVocGain);
      monVocGain.connect(monitorCtx.destination);

      window.electronAPI.log('info', 'startPlayback: Starting Mic Input');
      await startMicInput(audienceCtx, monitorCtx);

      const offsetSeconds = sConfig.offsetMs / 1000;
      const startOffset = pauseOffsetRef.current;

      const instStartAt = now + Math.max(0, -offsetSeconds);
      const vocStartAt = now + Math.max(0, offsetSeconds);

      const instOffset = startOffset;
      const vocOffset = startOffset + Math.max(0, offsetSeconds) - Math.max(0, -offsetSeconds);

      window.electronAPI.log('info', `startPlayback: Executing audio source start commands. instStartAt=${instStartAt}, instOffset=${instOffset}, vocStartAt=${vocStartAt}, vocOffset=${vocOffset}`);
      
      audInstSource.start(instStartAt, Math.max(0, instOffset));
      if (monInstSource) {
        monInstSource.start(instStartAt, Math.max(0, instOffset));
      }
      monVocSource.start(vocStartAt, Math.max(0, vocOffset));

      window.electronAPI.log('info', 'startPlayback: Success');
      playSourcesRef.current = [audInstSource, monVocSource];
      if (monInstSource) {
        playSourcesRef.current.push(monInstSource);
      }
      playStartRef.current = now;
      playingRef.current = true;
      setPlaying(true);
      setStatusMessage(`${t(locale, 'playback')} · ${formatTime(pauseOffsetRef.current)}`);
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
      window.electronAPI.log('info', `loadBuffers: Starting for "${song.name}"`);
      window.electronAPI.log('info', `loadBuffers: Instrumental path: ${song.instrumentalPath}`);
      window.electronAPI.log('info', `loadBuffers: Vocal path: ${song.vocalPath}`);

      window.electronAPI.log('info', 'loadBuffers: Building AudioContext');
      await needBuildAudioContext();
      const context = audienceContextRef.current!;
      window.electronAPI.log('info', `loadBuffers: AudioContext state=${context.state}, sampleRate=${context.sampleRate}`);

      window.electronAPI.log('info', 'loadBuffers: Fetching instrumental buffer');
      const instrumental = await loadAudioBuffer(song.instrumentalPath, context);
      window.electronAPI.log('info', `loadBuffers: Instrumental loaded. duration=${instrumental.duration.toFixed(2)}s, channels=${instrumental.numberOfChannels}`);

      window.electronAPI.log('info', 'loadBuffers: Fetching vocal buffer');
      const vocal = await loadAudioBuffer(song.vocalPath, context);
      window.electronAPI.log('info', `loadBuffers: Vocal loaded. duration=${vocal.duration.toFixed(2)}s, channels=${vocal.numberOfChannels}`);

      instrumentBufferRef.current = instrumental;
      vocalBufferRef.current = vocal;
      shiftedInstrumentRef.current = null;
      shiftedVocalRef.current = null;
      currentShiftedPitchRef.current = 999;
      setDuration(Math.max(instrumental.duration, vocal.duration));
      window.electronAPI.log('info', `loadBuffers: Complete for "${song.name}"`);
    } catch (err: any) {
      window.electronAPI.log('error', `loadBuffers CRASHED: ${err.message}\n${err.stack}`);
      setStatusMessage(`Failed to load audio: ${err.message}`);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audienceContextRef.current) {
        audienceContextRef.current.close().catch(() => {});
      }
      if (monitorContextRef.current) {
        monitorContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    playing,
    currentTime,
    duration,
    startPlayback,
    pausePlayback,
    stopPlayback,
    seekTo,
    loadBuffers,
    updateMicParams,
    needBuildAudioContext
  };
};
