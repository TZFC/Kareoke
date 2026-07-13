import React from 'react';
import { t } from '../i18n';
import { GlobalConfig, SongConfig, DeviceItem } from '../types';

interface DeviceSelectorProps {
  locale: string;
  globalConfig: GlobalConfig;
  songConfig: SongConfig;
  devices: DeviceItem[];
  saveGlobal: (config: GlobalConfig) => void;
  updateConfig: (changes: Partial<SongConfig>) => void;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  locale,
  globalConfig,
  songConfig,
  devices,
  saveGlobal,
  updateConfig
}) => {
  const isMicMissing = Boolean(globalConfig.microphoneDevice && !devices.some(d => d.kind === 'audioinput' && d.deviceId === globalConfig.microphoneDevice));
  const isAudMissing = Boolean(globalConfig.audienceDevice && !devices.some(d => d.kind === 'audiooutput' && d.deviceId === globalConfig.audienceDevice));
  const isMonMissing = Boolean(globalConfig.monitorDevice && !devices.some(d => d.kind === 'audiooutput' && d.deviceId === globalConfig.monitorDevice));

  return (
    <div className="panel">
      <h3 className="panel-title">{t(locale, 'inputDevices')}</h3>
      <div className="control-group">
        <label className="range-label">
          <span>{t(locale, 'microphoneDevice')}</span>
          <select 
            value={globalConfig.microphoneDevice} 
            style={{ color: isMicMissing ? '#ff4444' : 'inherit', borderColor: isMicMissing ? '#ff4444' : undefined }}
            onClick={() => window.electronAPI.log('info', 'User input: Clicked microphone device dropdown')}
            onChange={(e) => {
              window.electronAPI.log('info', `User input: Selected microphone device: ${e.target.value || 'none'}`);
              saveGlobal({ ...globalConfig, microphoneDevice: e.target.value });
            }}
          >
            <option value="">{t(locale, 'selectMicrophone')}</option>
            {isMicMissing && (
              <option value={globalConfig.microphoneDevice}>
                [{t(locale, 'disconnectedDevice')}]
              </option>
            )}
            {devices.filter((device) => device.kind === 'audioinput').map((device) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || t(locale, 'microphoneDevice')}</option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="panel-title">{t(locale, 'outputDevices')}</h3>
      <div className="control-group">
        <label className="range-label">
          <span>{t(locale, 'audienceDevice')}</span>
          <select 
            value={globalConfig.audienceDevice} 
            style={{ color: isAudMissing ? '#ff4444' : 'inherit', borderColor: isAudMissing ? '#ff4444' : undefined }}
            onClick={() => window.electronAPI.log('info', 'User input: Clicked audience device dropdown')}
            onChange={(e) => {
              window.electronAPI.log('info', `User input: Selected audience device: ${e.target.value || 'none'}`);
              saveGlobal({ ...globalConfig, audienceDevice: e.target.value });
            }}
          >
            <option value="">{t(locale, 'selectAudience')}</option>
            {isAudMissing && (
              <option value={globalConfig.audienceDevice}>
                [{t(locale, 'disconnectedDevice')}]
              </option>
            )}
            {devices.filter((device) => device.kind === 'audiooutput').map((device) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || t(locale, 'outputDevice')}</option>
            ))}
          </select>
        </label>

        <label className="range-label" style={{ marginTop: 12 }}>
          <span>{t(locale, 'monitorDevice')}</span>
          <select 
            value={globalConfig.monitorDevice} 
            style={{ color: isMonMissing ? '#ff4444' : 'inherit', borderColor: isMonMissing ? '#ff4444' : undefined }}
            onClick={() => window.electronAPI.log('info', 'User input: Clicked monitor device dropdown')}
            onChange={(e) => {
              window.electronAPI.log('info', `User input: Selected monitor device: ${e.target.value || 'none'}`);
              saveGlobal({ ...globalConfig, monitorDevice: e.target.value });
            }}
          >
            <option value="">{t(locale, 'selectMonitor')}</option>
            {isMonMissing && (
              <option value={globalConfig.monitorDevice}>
                [{t(locale, 'disconnectedDevice')}]
              </option>
            )}
            {devices.filter((device) => device.kind === 'audiooutput').map((device) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || t(locale, 'outputDevice')}</option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="panel-title" style={{ marginTop: 12 }}>{t(locale, 'audioRouting')}</h3>
      <div className="control-group">
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0', fontSize: '0.8rem' }}></th>
              <th style={{ textAlign: 'center', padding: '6px 0', width: '35%', fontSize: '0.8rem' }}>{t(locale, 'routingOutput')}</th>
              <th style={{ textAlign: 'center', padding: '6px 0', width: '35%', fontSize: '0.8rem' }}>{t(locale, 'routingMonitor')}</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <td style={{ padding: '8px 0', fontWeight: 'bold', color: 'var(--text)' }}>{t(locale, 'instrumentalStem')}</td>
              <td style={{ textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={songConfig.routeBackingToAudience} 
                  onChange={(e) => updateConfig({ routeBackingToAudience: e.target.checked })} 
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={songConfig.routeBackingToMonitor} 
                  onChange={(e) => updateConfig({ routeBackingToMonitor: e.target.checked })} 
                />
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <td style={{ padding: '8px 0', fontWeight: 'bold', color: 'var(--text)' }}>{t(locale, 'vocalStem')}</td>
              <td style={{ textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={songConfig.routeVocalToAudience} 
                  onChange={(e) => updateConfig({ routeVocalToAudience: e.target.checked })} 
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={songConfig.routeVocalToMonitor} 
                  onChange={(e) => updateConfig({ routeVocalToMonitor: e.target.checked })} 
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0', fontWeight: 'bold', color: 'var(--text)' }}>{t(locale, 'microphone')}</td>
              <td style={{ textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={globalConfig.routeMicToAudience} 
                  onChange={(e) => saveGlobal({ ...globalConfig, routeMicToAudience: e.target.checked })} 
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={globalConfig.routeMicToMonitor} 
                  onChange={(e) => saveGlobal({ ...globalConfig, routeMicToMonitor: e.target.checked })} 
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
