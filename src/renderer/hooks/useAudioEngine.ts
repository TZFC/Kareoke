import { useRef, useState, useEffect } from 'react';
import { SongItem, SongConfig, GlobalConfig } from '../types';
import { loadAudioBuffer } from '../utils/audio';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import soundtouchWorkletUrl from '@soundtouchjs/audio-worklet/processor?url';
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

  useEffect(() => {
    if (audienceContextRef.current && globalConfig.audienceDevice) {
      window.electronAPI.log('info', `Routing: Applying Audience device sinkId: ${globalConfig.audienceDevice}`);
      (audienceContextRef.current as any).setSinkId(globalConfig.audienceDevice).catch((e: Error) => {
        window.electronAPI.log('error', `Failed to set audience sinkId: ${e.message}`);
      });
    }
  }, [globalConfig.audienceDevice]);

  useEffect(() => {
    if (monitorContextRef.current && globalConfig.monitorDevice) {
      window.electronAPI.log('info', `Routing: Applying Monitor device sinkId: ${globalConfig.monitorDevice}`);
      (monitorContextRef.current as any).setSinkId(globalConfig.monitorDevice).catch((e: Error) => {
        window.electronAPI.log('error', `Failed to set monitor sinkId: ${e.message}`);
      });
    }
  }, [globalConfig.monitorDevice]);

  // Apply live volume and pitch changes instantly
  useEffect(() => {
    const nodes = playbackNodesRef.current;
    if (nodes.audInstGain) nodes.audInstGain.gain.value = songConfig.instrumentalVolume;
    if (nodes.monInstGain) nodes.monInstGain.gain.value = songConfig.instrumentalVolume;
    if (nodes.audVocGain) nodes.audVocGain.gain.value = songConfig.vocalVolume;
    if (nodes.monVocGain) nodes.monVocGain.gain.value = songConfig.vocalVolume;

    if (nodes.stNodeAudInst) nodes.stNodeAudInst.pitchSemitones.value = songConfig.instrumentalPitch;
    if (nodes.stNodeMonInst) nodes.stNodeMonInst.pitchSemitones.value = songConfig.instrumentalPitch;
    if (nodes.stNodeAudVoc) nodes.stNodeAudVoc.pitchSemitones.value = songConfig.vocalPitch;
    if (nodes.stNodeMonVoc) nodes.stNodeMonVoc.pitchSemitones.value = songConfig.vocalPitch;
    
    if (playingRef.current) {
      window.electronAPI.log('info', `Live audio param updated: InstVol=${songConfig.instrumentalVolume.toFixed(2)}, VocVol=${songConfig.vocalVolume.toFixed(2)}, InstPitch=${songConfig.instrumentalPitch}, VocPitch=${songConfig.vocalPitch}`);
    }
  }, [songConfig.instrumentalVolume, songConfig.vocalVolume, songConfig.instrumentalPitch, songConfig.vocalPitch]);

  const audienceContextRef = useRef<AudioContext | null>(null);
  const monitorContextRef = useRef<AudioContext | null>(null);
  const instrumentBufferRef = useRef<AudioBuffer | null>(null);
  const vocalBufferRef = useRef<AudioBuffer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
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
  const currentShiftedInstPitchRef = useRef<number>(999);
  const currentShiftedVocPitchRef = useRef<number>(999);
  const autoScrollFrame = useRef<number | null>(null);

  const needBuildAudioContext = async () => {
    if (!audienceContextRef.current) {
      audienceContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      try { await SoundTouchNode.register(audienceContextRef.current, soundtouchWorkletUrl); } catch (e) { window.electronAPI.log('warn', `Failed to register SoundTouchNode on audienceCtx`); }
      if (globalConfigRef.current.audienceDevice) {
        try {
          await (audienceContextRef.current as any).setSinkId(globalConfigRef.current.audienceDevice);
        } catch (e: any) {
          window.electronAPI.log('error', `Failed to set audience device sinkId to ${globalConfigRef.current.audienceDevice}: ${e.message}`);
        }
      }
    }
    if (!monitorContextRef.current) {
      monitorContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      try { await SoundTouchNode.register(monitorContextRef.current, soundtouchWorkletUrl); } catch (e) { window.electronAPI.log('warn', `Failed to register SoundTouchNode on monitorCtx`); }
      if (globalConfigRef.current.monitorDevice) {
        try {
          await (monitorContextRef.current as any).setSinkId(globalConfigRef.current.monitorDevice);
        } catch (e: any) {
          window.electronAPI.log('error', `Failed to set monitor device sinkId to ${globalConfigRef.current.monitorDevice}: ${e.message}`);
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

      if (gConfig.routeMicToAudience) {
        audGain.connect(audienceCtx.destination);
        audGain.connect(audDelay);
        audDelay.connect(audFeedback);
        audFeedback.connect(audDelay);
        audDelay.connect(audDelayGain);
        audDelayGain.connect(audienceCtx.destination);
      }

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
      await startMicInput(audienceCtx, monitorCtx);

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
      currentShiftedInstPitchRef.current = 999;
      currentShiftedVocPitchRef.current = 999;
      setDuration(Math.max(instrumental.duration, vocal.duration));
      window.electronAPI.log('info', `loadBuffers: Complete for "${song.name}"`);
    } catch (err: any) {
      window.electronAPI.log('error', `loadBuffers CRASHED: ${err.message}\n${err.stack}`);
      setStatusMessage(t(locale, 'failedToLoadAudio').replace('{error}', err.message));
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
