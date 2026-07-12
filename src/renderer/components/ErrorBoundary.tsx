import React from 'react';
import { t } from '../i18n';

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (window.electronAPI) {
      window.electronAPI.log(
        'error',
        `React Render Error: ${error.message}\n${error.stack}\n${info.componentStack}`
      );
    } else {
      console.error(error);
    }
  }

  render() {
    if (this.state.hasError) {
      const locale =
        typeof navigator !== 'undefined' &&
        navigator.language.toLowerCase().startsWith('zh')
          ? 'zh-CN'
          : 'en-US';
      return (
        <div
          style={{
            padding: 40,
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#0a0d12'
          }}
        >
          <h2>{t(locale, 'uiCrashRecovered')}</h2>
          <p style={{ opacity: 0.8, marginBottom: 15 }}>
            {t(locale, 'uiCrashMessage')}
          </p>
          <pre
            style={{
              color: '#ef4444',
              maxWidth: '80%',
              overflowX: 'auto',
              background: '#1e1e1e',
              padding: 15,
              borderRadius: 8
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: '10px 20px', fontSize: '1.1rem' }}
          >
            {t(locale, 'reloadApp')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
