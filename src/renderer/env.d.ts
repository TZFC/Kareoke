export {};

declare global {
  interface ElectronAPI {
    loadSongList(): Promise<any[]>;
    loadGlobalConfig(): Promise<any>;
    saveGlobalConfig(config: any): Promise<boolean>;
    saveSongConfig(name: string, config: any): Promise<boolean>;
    processFile(filePath: string): Promise<any>;
    deleteSong(name: string): Promise<boolean>;
    onProgress(callback: (event: any, data: any) => void): void;
    onStatus(callback: (event: any, data: any) => void): void;
    log(level: string, message: string): void;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
