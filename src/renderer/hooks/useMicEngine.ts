import { useRef } from 'react';
import { GlobalConfig } from '../types';
import * as Tone from 'tone';
import { PitchDetector } from 'pitchy';
// @ts-ignore
import PitchShift from 'soundbank-pitch-shift';

export const useMicEngine = () => {
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodesRef = useRef<{
    audienceGain?: GainNode;
    monitorGain?: GainNode;
    audienceBassFilter?: BiquadFilterNode;
    audienceTrebleFilter?: BiquadFilterNode;
    monitorBassFilter?: BiquadFilterNode;
    monitorTrebleFilter?: BiquadFilterNode;
    audiencePreDelay?: DelayNode;
    monitorPreDelay?: DelayNode;
    audienceReverb?: Tone.Freeverb;
    monitorReverb?: Tone.Freeverb;
    audienceReverbGain?: GainNode;
    monitorReverbGain?: GainNode;
    audienceCompressor?: DynamicsCompressorNode;
    monitorCompressor?: DynamicsCompressorNode;
    audPitchShift?: any;
    monPitchShift?: any;
    monPitchShift?: any;
    micAutoTuneEnabled?: boolean;
    detectLoop?: number;
    rebuildRouting?: (gConfig: GlobalConfig) => void;
    lastRoutingState?: string;
  }>({});

  const updateMicParams = (gConfig: GlobalConfig) => {
    const nodes = micNodesRef.current;
    nodes.micAutoTuneEnabled = gConfig.micAutoTune;

    const newRoutingState = JSON.stringify({
      micAutoTune: gConfig.micAutoTune,
      micBassActive: gConfig.micBass !== 0,
      micTrebleActive: gConfig.micTreble !== 0,
      micReverbActive: gConfig.micReverb > 0,
      routeMicToAudience: gConfig.routeMicToAudience,
      routeMicToMonitor: gConfig.routeMicToMonitor
    });

    if (nodes.lastRoutingState !== newRoutingState && nodes.rebuildRouting) {
      nodes.rebuildRouting(gConfig);
      nodes.lastRoutingState = newRoutingState;
    }
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
    if (nodes.audienceReverbGain) {
      nodes.audienceReverbGain.gain.value = gConfig.micReverb;
    }
    if (nodes.audienceReverb) {
      nodes.audienceReverb.roomSize.value = gConfig.micRoomSize;
      nodes.audienceReverb.dampening = gConfig.micDampening;
    }
    if (nodes.monitorReverbGain) {
      nodes.monitorReverbGain.gain.value = gConfig.micReverb;
    }
    if (nodes.monitorReverb) {
      nodes.monitorReverb.roomSize.value = gConfig.micRoomSize;
      nodes.monitorReverb.dampening = gConfig.micDampening;
    }
    if (nodes.audPitchShift) {
      nodes.audPitchShift.wet.value = gConfig.micAutoTune ? 1 : 0;
      nodes.audPitchShift.dry.value = gConfig.micAutoTune ? 0 : 1;
    }
    if (nodes.monPitchShift) {
      nodes.monPitchShift.wet.value = gConfig.micAutoTune ? 1 : 0;
      nodes.monPitchShift.dry.value = gConfig.micAutoTune ? 0 : 1;
    }
  };

  const stopMicInput = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (micNodesRef.current.detectLoop) {
      cancelAnimationFrame(micNodesRef.current.detectLoop);
    }
    micNodesRef.current = {};
  };

  const startMicInput = async (audienceCtx: AudioContext, monitorCtx: AudioContext, gConfig: GlobalConfig) => {
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
      
      const audPitchShift = PitchShift(audienceCtx);
      audPitchShift.wet.value = gConfig.micAutoTune ? 1 : 0;
      audPitchShift.dry.value = gConfig.micAutoTune ? 0 : 1;
      
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

      // Reverb & Pre-Delay for Audience
      const audPreDelay = audienceCtx.createDelay(1.0);
      audPreDelay.delayTime.value = 0.04;

      const audReverb = new Tone.Freeverb({
        context: new Tone.Context(audienceCtx),
        roomSize: gConfig.micRoomSize ?? 0.8,
        dampening: gConfig.micDampening ?? 3000,
        wet: 1
      });

      const audReverbGain = audienceCtx.createGain();
      audReverbGain.gain.value = gConfig.micReverb;

      const audCompressor = audienceCtx.createDynamicsCompressor();
      audCompressor.threshold.value = -5;
      audCompressor.knee.value = 15;
      audCompressor.ratio.value = 10;
      audCompressor.attack.value = 0.005;
      audCompressor.release.value = 0.25;

      // 2. Monitor Context Mic Chain
      const monSource = monitorCtx.createMediaStreamSource(stream);
      
      const monPitchShift = PitchShift(monitorCtx);
      monPitchShift.wet.value = gConfig.micAutoTune ? 1 : 0;
      monPitchShift.dry.value = gConfig.micAutoTune ? 0 : 1;
      
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

      // Reverb & Pre-Delay for Monitor
      const monPreDelay = monitorCtx.createDelay(1.0);
      monPreDelay.delayTime.value = 0.04;

      const monReverb = new Tone.Freeverb({
        context: new Tone.Context(monitorCtx),
        roomSize: gConfig.micRoomSize ?? 0.8,
        dampening: gConfig.micDampening ?? 3000,
        wet: 1
      });

      const monReverbGain = monitorCtx.createGain();
      monReverbGain.gain.value = gConfig.micReverb;

      const monCompressor = monitorCtx.createDynamicsCompressor();
      monCompressor.threshold.value = -5;
      monCompressor.knee.value = 15;
      monCompressor.ratio.value = 10;
      monCompressor.attack.value = 0.005;
      monCompressor.release.value = 0.25;

      const analyser = audienceCtx.createAnalyser();
      analyser.fftSize = 2048;

      const rebuildRouting = (config: GlobalConfig) => {
        try { audSource.disconnect(); } catch (e) {}
        try { audPitchShift.disconnect(); } catch (e) {}
        try { audBass.disconnect(); } catch (e) {}
        try { audTreble.disconnect(); } catch (e) {}
        try { audGain.disconnect(); } catch (e) {}
        try { audPreDelay.disconnect(); } catch (e) {}
        try { audReverb.disconnect(); } catch (e) {}
        try { audReverbGain.disconnect(); } catch (e) {}
        try { audCompressor.disconnect(); } catch (e) {}

        try { monSource.disconnect(); } catch (e) {}
        try { monPitchShift.disconnect(); } catch (e) {}
        try { monBass.disconnect(); } catch (e) {}
        try { monTreble.disconnect(); } catch (e) {}
        try { monGain.disconnect(); } catch (e) {}
        try { monPreDelay.disconnect(); } catch (e) {}
        try { monReverb.disconnect(); } catch (e) {}
        try { monReverbGain.disconnect(); } catch (e) {}
        try { monCompressor.disconnect(); } catch (e) {}

        // Audience Chain
        let audCurrent: AudioNode = audSource;
        if (config.micAutoTune) {
          audCurrent.connect(audPitchShift);
          audCurrent = audPitchShift;
        }
        if (config.micBass !== 0) {
          audCurrent.connect(audBass);
          audCurrent = audBass;
        }
        if (config.micTreble !== 0) {
          audCurrent.connect(audTreble);
          audCurrent = audTreble;
        }
        audCurrent.connect(audGain);

        if (config.routeMicToAudience) {
          audGain.connect(audCompressor);
          if (config.micReverb > 0) {
            audGain.connect(audPreDelay);
            audPreDelay.connect(audReverb.input as unknown as AudioNode);
            audReverb.connect(audReverbGain);
            audReverbGain.connect(audCompressor);
          }
          audCompressor.connect(audienceCtx.destination);
        }

        // Monitor Chain
        let monCurrent: AudioNode = monSource;
        if (config.micAutoTune) {
          monCurrent.connect(monPitchShift);
          monCurrent = monPitchShift;
        }
        if (config.micBass !== 0) {
          monCurrent.connect(monBass);
          monCurrent = monBass;
        }
        if (config.micTreble !== 0) {
          monCurrent.connect(monTreble);
          monCurrent = monTreble;
        }
        monCurrent.connect(monGain);

        if (config.routeMicToMonitor) {
          monGain.connect(monCompressor);
          if (config.micReverb > 0) {
            monGain.connect(monPreDelay);
            monPreDelay.connect(monReverb.input as unknown as AudioNode);
            monReverb.connect(monReverbGain);
            monReverbGain.connect(monCompressor);
          }
          monCompressor.connect(monitorCtx.destination);
        }

        audSource.connect(analyser);
      };

      // Initial routing
      rebuildRouting(gConfig);

      micNodesRef.current = {
        audienceGain: audGain,
        monitorGain: monGain,
        audienceBassFilter: audBass,
        audienceTrebleFilter: audTreble,
        monitorBassFilter: monBass,
        monitorTrebleFilter: monTreble,
        audiencePreDelay: audPreDelay,
        monitorPreDelay: monPreDelay,
        audienceReverb: audReverb,
        monitorReverb: monReverb,
        audienceReverbGain: audReverbGain,
        monitorReverbGain: monReverbGain,
        audienceCompressor: audCompressor,
        monitorCompressor: monCompressor,
        audPitchShift,
        monPitchShift,
        micAutoTuneEnabled: gConfig.micAutoTune,
        rebuildRouting,
        lastRoutingState: JSON.stringify({
          micAutoTune: gConfig.micAutoTune,
          micBassActive: gConfig.micBass !== 0,
          micTrebleActive: gConfig.micTreble !== 0,
          micReverbActive: gConfig.micReverb > 0,
          routeMicToAudience: gConfig.routeMicToAudience,
          routeMicToMonitor: gConfig.routeMicToMonitor
        })
      };

      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const inputBuffer = new Float32Array(analyser.fftSize);

      const updatePitch = () => {
        if (!micNodesRef.current.audPitchShift) return; // stopped
        if (micNodesRef.current.micAutoTuneEnabled) {
          analyser.getFloatTimeDomainData(inputBuffer);
          const [pitch, clarity] = detector.findPitch(inputBuffer, audienceCtx.sampleRate);
          
          if (clarity > 0.8 && pitch > 60 && pitch < 1000) {
            const semitone = 12 * Math.log2(pitch / 440);
            const nearestSemitone = Math.round(semitone);
            const shiftAmount = nearestSemitone - semitone;
            
            // Smoothly approach the target to avoid pops
            const currentShift = micNodesRef.current.audPitchShift.transpose;
            const smoothShift = currentShift + (shiftAmount - currentShift) * 0.5;

            micNodesRef.current.audPitchShift.transpose = smoothShift;
            if (micNodesRef.current.monPitchShift) {
              micNodesRef.current.monPitchShift.transpose = smoothShift;
            }
          } else {
            // Decay to 0 transpose if no pitch detected
            const currentShift = micNodesRef.current.audPitchShift.transpose;
            const decayShift = currentShift * 0.9;
            micNodesRef.current.audPitchShift.transpose = decayShift;
            if (micNodesRef.current.monPitchShift) {
              micNodesRef.current.monPitchShift.transpose = decayShift;
            }
          }
        } else {
          micNodesRef.current.audPitchShift.transpose = 0;
          if (micNodesRef.current.monPitchShift) {
            micNodesRef.current.monPitchShift.transpose = 0;
          }
        }
        micNodesRef.current.detectLoop = requestAnimationFrame(updatePitch);
      };
      
      micNodesRef.current.detectLoop = requestAnimationFrame(updatePitch);
    } catch (error: any) {
      console.error("Failed to start mic input", error);
    }
  };

  return { startMicInput, stopMicInput, updateMicParams, micNodesRef, micStreamRef };
};
