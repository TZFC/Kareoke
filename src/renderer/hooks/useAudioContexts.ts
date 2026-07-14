import { useRef, useEffect } from 'react';
import { GlobalConfig } from '../types';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import soundtouchWorkletUrl from '@soundtouchjs/audio-worklet/processor?url';

export const useAudioContexts = (globalConfig: GlobalConfig) => {
  const audienceContextRef = useRef<AudioContext | null>(null);
  const monitorContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (audienceContextRef.current && globalConfig.audienceDevice) {
      window.electronAPI.log('info', `Routing: Applying Audience device sinkId: ${globalConfig.audienceDevice}`);
      (audienceContextRef.current as any).setSinkId(globalConfig.audienceDevice).catch((error: Error) => {
        window.electronAPI.log('error', `Failed to set audience sinkId: ${error.message}`);
      });
    }
  }, [globalConfig.audienceDevice]);

  useEffect(() => {
    if (monitorContextRef.current && globalConfig.monitorDevice) {
      window.electronAPI.log('info', `Routing: Applying Monitor device sinkId: ${globalConfig.monitorDevice}`);
      (monitorContextRef.current as any).setSinkId(globalConfig.monitorDevice).catch((error: Error) => {
        window.electronAPI.log('error', `Failed to set monitor sinkId: ${error.message}`);
      });
    }
  }, [globalConfig.monitorDevice]);

  const needBuildAudioContext = async (gConfig: GlobalConfig) => {
    if (!audienceContextRef.current) {
      audienceContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      try { await SoundTouchNode.register(audienceContextRef.current, soundtouchWorkletUrl); } catch (error) { window.electronAPI.log('warn', `Failed to register SoundTouchNode on audienceCtx`); }
      if (gConfig.audienceDevice) {
        try {
          await (audienceContextRef.current as any).setSinkId(gConfig.audienceDevice);
        } catch (error: any) {
          window.electronAPI.log('error', `Failed to set audience device sinkId to ${gConfig.audienceDevice}: ${error.message}`);
        }
      }
    }
    if (!monitorContextRef.current) {
      monitorContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      try { await SoundTouchNode.register(monitorContextRef.current, soundtouchWorkletUrl); } catch (error) { window.electronAPI.log('warn', `Failed to register SoundTouchNode on monitorCtx`); }
      if (gConfig.monitorDevice) {
        try {
          await (monitorContextRef.current as any).setSinkId(gConfig.monitorDevice);
        } catch (error: any) {
          window.electronAPI.log('error', `Failed to set monitor device sinkId to ${gConfig.monitorDevice}: ${error.message}`);
        }
      }
    }
  };

  return { audienceContextRef, monitorContextRef, needBuildAudioContext };
};
