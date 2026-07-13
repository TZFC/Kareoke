import { Locale } from './i18n';

export type SongConfig = {
  displayName?: string;
  instrumentalVolume: number;
  instrumentalPitch: number;
  vocalVolume: number;
  vocalPitch: number;
  offsetMs: number;
  notes: string;
  lrcText?: string;
  autoScroll: boolean;
  routeBackingToAudience: boolean;
  routeBackingToMonitor: boolean;
  routeVocalToAudience: boolean;
  routeVocalToMonitor: boolean;
};

export type SongItem = {
  name: string;
  file: string;
  sourcePath: string;
  vocalPath: string;
  instrumentalPath: string;
  config: SongConfig | null;
};

export type GlobalConfig = {
  inputDevices: string[];
  outputDevices: string[];
  microphoneDevice: string;
  audienceDevice: string;
  monitorDevice: string;
  micVolume: number;
  micBass: number;
  micTreble: number;
  micReverb: number;
  routeMicToAudience: boolean;
  routeMicToMonitor: boolean;
  language: Locale;
};

export type DeviceItem = {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
};
