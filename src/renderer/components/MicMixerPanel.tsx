import React from 'react';
import { t } from '../i18n';
import { GlobalConfig } from '../types';
import { EditableNumber } from './EditableNumber';

interface MicMixerPanelProps {
  locale: string;
  globalConfig: GlobalConfig;
  saveGlobal: (config: GlobalConfig) => void;
}

export const MicMixerPanel: React.FC<MicMixerPanelProps> = ({
  locale,
  globalConfig,
  saveGlobal
}) => {
  return (
    <>
      <h3 className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t(locale, 'micLiveMix')}
        <button onClick={() => saveGlobal({ ...globalConfig, micVolume: 0.8, micBass: 0, micTreble: 0, micReverb: 0.3 })} style={{ fontSize: '0.75rem', padding: '2px 6px', opacity: 0.8 }}>
          {t(locale, 'reset')}
        </button>
      </h3>
      <div className="control-group">
        <label className="range-label">
          <span>
            {t(locale, 'micVolume')}: 
            <EditableNumber 
              value={globalConfig.micVolume} 
              onChange={val => saveGlobal({ ...globalConfig, micVolume: val })} 
              min={0} max={1} 
            />
          </span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={globalConfig.micVolume} 
            onChange={(e) => saveGlobal({ ...globalConfig, micVolume: Number(e.target.value) })} 
          />
        </label>
        <label className="range-label">
          <span>
            {t(locale, 'micBass')}: 
            <EditableNumber 
              value={globalConfig.micBass} 
              onChange={val => saveGlobal({ ...globalConfig, micBass: Math.round(val) })} 
              toFixed={0} suffix=" dB" 
              min={-12} max={12} 
            />
          </span>
          <input 
            type="range" 
            min="-12" 
            max="12" 
            step="1" 
            value={globalConfig.micBass} 
            onChange={(e) => saveGlobal({ ...globalConfig, micBass: Number(e.target.value) })} 
          />
        </label>
        <label className="range-label">
          <span>
            {t(locale, 'micTreble')}: 
            <EditableNumber 
              value={globalConfig.micTreble} 
              onChange={val => saveGlobal({ ...globalConfig, micTreble: Math.round(val) })} 
              toFixed={0} suffix=" dB" 
              min={-12} max={12} 
            />
          </span>
          <input 
            type="range" 
            min="-12" 
            max="12" 
            step="1" 
            value={globalConfig.micTreble} 
            onChange={(e) => saveGlobal({ ...globalConfig, micTreble: Number(e.target.value) })} 
          />
        </label>
        <label className="range-label">
          <span>
            {t(locale, 'micReverb')}: 
            <EditableNumber 
              value={globalConfig.micReverb} 
              onChange={val => saveGlobal({ ...globalConfig, micReverb: val })} 
              min={0} max={1} 
            />
          </span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={globalConfig.micReverb} 
            onChange={(e) => saveGlobal({ ...globalConfig, micReverb: Number(e.target.value) })} 
          />
        </label>
      </div>
    </>
  );
};
