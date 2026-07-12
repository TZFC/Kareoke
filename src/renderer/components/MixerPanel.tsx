import React from 'react';
import { t } from '../i18n';
import { SongConfig } from '../types';

interface MixerPanelProps {
  locale: string;
  songConfig: SongConfig;
  updateConfig: (changes: Partial<SongConfig>) => void;
}

export const MixerPanel: React.FC<MixerPanelProps> = ({
  locale,
  songConfig,
  updateConfig
}) => {
  return (
    <>
      <div className="control-group">
        <h3 className="panel-title">{t(locale, 'instrumental')}</h3>
        <label className="range-label">
          <span>{t(locale, 'volume')}: {songConfig.instrumentalVolume.toFixed(2)}</span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={songConfig.instrumentalVolume} 
            onChange={(e) => updateConfig({ instrumentalVolume: Number(e.target.value) })} 
          />
        </label>
        <div className="control-grid">
          <button onClick={() => updateConfig({ instrumentalPitch: songConfig.instrumentalPitch + 1 })}>
            {t(locale, 'pitchUp')}
          </button>
          <button onClick={() => updateConfig({ instrumentalPitch: songConfig.instrumentalPitch - 1 })}>
            {t(locale, 'pitchDown')}
          </button>
          <div className="value-label">{songConfig.instrumentalPitch} st</div>
        </div>
      </div>

      <div className="control-group">
        <h3 className="panel-title">{t(locale, 'vocal')}</h3>
        <label className="range-label">
          <span>{t(locale, 'volume')}: {songConfig.vocalVolume.toFixed(2)}</span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={songConfig.vocalVolume} 
            onChange={(e) => updateConfig({ vocalVolume: Number(e.target.value) })} 
          />
        </label>
        <div className="control-grid">
          <button onClick={() => updateConfig({ vocalPitch: songConfig.vocalPitch + 1 })}>
            {t(locale, 'pitchUp')}
          </button>
          <button onClick={() => updateConfig({ vocalPitch: songConfig.vocalPitch - 1 })}>
            {t(locale, 'pitchDown')}
          </button>
          <div className="value-label">{songConfig.vocalPitch} st</div>
        </div>
        <label className="checkbox-row">
          <input 
            type="checkbox" 
            checked={songConfig.routeBackingToMonitor} 
            onChange={(e) => updateConfig({ routeBackingToMonitor: e.target.checked })} 
          />
          <span>{t(locale, 'routeBackingToMonitor')}</span>
        </label>
      </div>
    </>
  );
};
