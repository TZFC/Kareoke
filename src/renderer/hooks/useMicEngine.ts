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
    audienceReverb?: Tone.Freeverb;
    monitorReverb?: Tone.Freeverb;
    audienceCompressor?: DynamicsCompressorNode;
    monitorCompressor?: DynamicsCompressorNode;
    audPitchShift?: any;
    monPitchShift?: any;
    micAutoTuneEnabled?: boolean;
    detectLoop?: number;
  }>({});

  const updateMicParams = (gConfig: GlobalConfig) => {
    const nodes = micNodesRef.current;
    nodes.micAutoTuneEnabled = gConfig.micAutoTune;
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
    if (nodes.audienceReverb) {
      nodes.audienceReverb.wet.value = gConfig.micReverb;
      nodes.audienceReverb.roomSize.value = gConfig.micRoomSize;
      nodes.audienceReverb.dampening = gConfig.micDampening;
    }
    if (nodes.monitorReverb) {
      nodes.monitorReverb.wet.value = gConfig.micReverb;
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

      // Reverb for Audience
      const audReverb = new Tone.Freeverb({
        context: new Tone.Context(audienceCtx),
        roomSize: gConfig.micRoomSize ?? 0.8,
        dampening: gConfig.micDampening ?? 3000,
        wet: gConfig.micReverb
      });

      // Compressor for Audience
      const audCompressor = audienceCtx.createDynamicsCompressor();
      audCompressor.threshold.value = -5;
      audCompressor.knee.value = 15;
      audCompressor.ratio.value = 10;
      audCompressor.attack.value = 0.005;
      audCompressor.release.value = 0.25;

      audSource.connect(audPitchShift);
      audPitchShift.connect(audBass);
      audBass.connect(audTreble);
      audTreble.connect(audGain);

      if (gConfig.routeMicToAudience) {
        audGain.connect(audCompressor);
        audGain.connect(audReverb.input as unknown as AudioNode);
        audReverb.connect(audCompressor);
        audCompressor.connect(audienceCtx.destination);
      }

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

      // Reverb for Monitor
      const monReverb = new Tone.Freeverb({
        context: new Tone.Context(monitorCtx),
        roomSize: gConfig.micRoomSize ?? 0.8,
        dampening: gConfig.micDampening ?? 3000,
        wet: gConfig.micReverb
      });

      // Compressor for Monitor
      const monCompressor = monitorCtx.createDynamicsCompressor();
      monCompressor.threshold.value = -5;
      monCompressor.knee.value = 15;
      monCompressor.ratio.value = 10;
      monCompressor.attack.value = 0.005;
      monCompressor.release.value = 0.25;

      monSource.connect(monPitchShift);
      monPitchShift.connect(monBass);
      monBass.connect(monTreble);
      monTreble.connect(monGain);

      if (gConfig.routeMicToMonitor) {
        monGain.connect(monCompressor);
        monGain.connect(monReverb.input as unknown as AudioNode);
        monReverb.connect(monCompressor);
        monCompressor.connect(monitorCtx.destination);
      }

      micNodesRef.current = {
        audienceGain: audGain,
        monitorGain: monGain,
        audienceBassFilter: audBass,
        audienceTrebleFilter: audTreble,
        monitorBassFilter: monBass,
        monitorTrebleFilter: monTreble,
        audienceReverb: audReverb,
        monitorReverb: monReverb,
        audienceCompressor: audCompressor,
        monitorCompressor: monCompressor,
        audPitchShift,
        monPitchShift,
        micAutoTuneEnabled: gConfig.micAutoTune
      };

      // Set up Pitch Detection Loop
      const analyser = audienceCtx.createAnalyser();
      analyser.fftSize = 2048;
      audSource.connect(analyser);

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
