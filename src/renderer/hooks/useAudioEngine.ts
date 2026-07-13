import { useRef, useEffect } from 'react';
import { SongItem, SongConfig, GlobalConfig } from '../types';
import { useAudioContexts } from './useAudioContexts';
import { useMicEngine } from './useMicEngine';
import { usePlaybackEngine } from './usePlaybackEngine';

export const useAudioEngine = (
  locale: string,
  globalConfig: GlobalConfig,
  songConfig: SongConfig,
  selectedSong: SongItem | null,
  setStatusMessage: (msg: string) => void
) => {
  const globalConfigRef = useRef(globalConfig);
  const songConfigRef = useRef(songConfig);
  const selectedSongRef = useRef(selectedSong);

  useEffect(() => { globalConfigRef.current = globalConfig; }, [globalConfig]);
  useEffect(() => { songConfigRef.current = songConfig; }, [songConfig]);
  useEffect(() => { selectedSongRef.current = selectedSong; }, [selectedSong]);

  const { audienceContextRef, monitorContextRef, needBuildAudioContext } = useAudioContexts(globalConfig);
  
  const { startMicInput, stopMicInput, updateMicParams } = useMicEngine();

  const {
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
  } = usePlaybackEngine(
    locale,
    globalConfigRef,
    songConfigRef,
    selectedSongRef,
    setStatusMessage,
    audienceContextRef,
    monitorContextRef,
    needBuildAudioContext,
    startMicInput,
    stopMicInput
  );

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
  }, [songConfig.instrumentalVolume, songConfig.vocalVolume, songConfig.instrumentalPitch, songConfig.vocalPitch, playbackNodesRef, playingRef]);

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
  }, [stopPlayback, audienceContextRef, monitorContextRef]);

  const handleUpdateMicParams = () => {
    updateMicParams(globalConfigRef.current);
  };

  return {
    playing,
    currentTime,
    duration,
    startPlayback,
    pausePlayback,
    stopPlayback,
    seekTo,
    loadBuffers,
    updateMicParams: handleUpdateMicParams,
    needBuildAudioContext: () => needBuildAudioContext(globalConfigRef.current)
  };
};
