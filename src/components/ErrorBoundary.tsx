import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface State { error: Error | null }

class ErrorBoundaryInner extends React.Component<{ children: React.ReactNode } & WithTranslation, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const { t } = this.props;
    const err = this.state.error;
    const stack = err?.stack || '';
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white border border-red-200 rounded-xl shadow-sm p-5">
          <h1 className="text-base font-semibold text-red-700 mb-2">{t('errors.boundary_title')}</h1>
          <p className="text-sm text-gray-700 mb-2 break-words">
            {err?.message || String(err)}
          </p>
          {stack && (
            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer">{t('errors.details')}</summary>
              <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-words mt-2 max-h-60 overflow-auto">
                {stack}
              </pre>
            </details>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={this.reset}
              className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-sm"
            >
              {t('errors.retry')}
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              {t('errors.to_home')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
