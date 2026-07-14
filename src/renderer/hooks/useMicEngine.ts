import { useRef } from 'react';
import { GlobalConfig } from '../types';
import * as Tone from 'tone';

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
  }>({});

  const updateMicParams = (gConfig: GlobalConfig) => {
    const nodes = micNodesRef.current;
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
    }
    if (nodes.monitorReverb) {
      nodes.monitorReverb.wet.value = gConfig.micReverb;
    }
  };

  const stopMicInput = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
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
        roomSize: 0.8,
        dampening: 3000,
        wet: gConfig.micReverb
      });

      // Compressor for Audience
      const audCompressor = audienceCtx.createDynamicsCompressor();
      audCompressor.threshold.value = -5;
      audCompressor.knee.value = 15;
      audCompressor.ratio.value = 10;
      audCompressor.attack.value = 0.005;
      audCompressor.release.value = 0.25;

      audSource.connect(audBass);
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
        roomSize: 0.8,
        dampening: 3000,
        wet: gConfig.micReverb
      });

      // Compressor for Monitor
      const monCompressor = monitorCtx.createDynamicsCompressor();
      monCompressor.threshold.value = -5;
      monCompressor.knee.value = 15;
      monCompressor.ratio.value = 10;
      monCompressor.attack.value = 0.005;
      monCompressor.release.value = 0.25;

      monSource.connect(monBass);
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
        monitorCompressor: monCompressor
      };
    } catch (error: any) {
      console.error("Failed to start mic input", error);
    }
  };

  return { startMicInput, stopMicInput, updateMicParams, micNodesRef, micStreamRef };
};
