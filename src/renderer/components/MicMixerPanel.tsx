import React from 'react';
import { t } from '../i18n';
import { GlobalConfig } from '../types';

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
      <h3 className="panel-title">{t(locale, 'micLiveMix')}</h3>
      <div className="control-group">
        <label className="range-label">
          <span>{t(locale, 'micVolume')}: {globalConfig.micVolume.toFixed(2)}</span>
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
          <span>{t(locale, 'micBass')}: {globalConfig.micBass} dB</span>
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
          <span>{t(locale, 'micTreble')}: {globalConfig.micTreble} dB</span>
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
          <span>{t(locale, 'micReverb')}: {globalConfig.micReverb.toFixed(2)}</span>
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
