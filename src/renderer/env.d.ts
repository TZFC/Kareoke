export {};

declare global {
  interface ElectronAPI {
    loadSongList(): Promise<any[]>;
    loadGlobalConfig(): Promise<any>;
    saveGlobalConfig(config: any): Promise<boolean>;
    saveSongConfig(name: string, config: any): Promise<boolean>;
    readAudioFile(filePath: string): Promise<string>;
    processFile(filePath: string): Promise<any>;
    onProgress(callback: (event: any, data: any) => void): void;
    onStatus(callback: (event: any, data: any) => void): void;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
