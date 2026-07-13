import React from 'react';
import { t } from '../i18n';
import { SongConfig } from '../types';
import { EditableNumber } from './EditableNumber';

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
        <h3 className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t(locale, 'instrumental')}
          <button onClick={() => updateConfig({ instrumentalVolume: 1, instrumentalPitch: 0 })} style={{ fontSize: '0.75rem', padding: '2px 6px', opacity: 0.8 }}>
            {t(locale, 'reset')}
          </button>
        </h3>
        <label className="range-label">
          <span>
            {t(locale, 'volume')}: 
            <EditableNumber 
              value={songConfig.instrumentalVolume} 
              onChange={val => updateConfig({ instrumentalVolume: val })} 
              min={0} max={1} 
            />
          </span>
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
          <div className="value-label">
            <EditableNumber 
              value={songConfig.instrumentalPitch} 
              onChange={val => updateConfig({ instrumentalPitch: Math.round(val) })} 
              toFixed={0} suffix=" st" 
            />
          </div>
        </div>
      </div>

      <div className="control-group">
        <h3 className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {t(locale, 'vocal')}
          <button onClick={() => updateConfig({ vocalVolume: 1, vocalPitch: 0 })} style={{ fontSize: '0.75rem', padding: '2px 6px', opacity: 0.8 }}>
            {t(locale, 'reset')}
          </button>
        </h3>
        <label className="range-label">
          <span>
            {t(locale, 'volume')}: 
            <EditableNumber 
              value={songConfig.vocalVolume} 
              onChange={val => updateConfig({ vocalVolume: val })} 
              min={0} max={1} 
            />
          </span>
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
          <div className="value-label">
            <EditableNumber 
              value={songConfig.vocalPitch} 
              onChange={val => updateConfig({ vocalPitch: Math.round(val) })} 
              toFixed={0} suffix=" st" 
            />
          </div>
        </div>
      </div>
    </>
  );
};
