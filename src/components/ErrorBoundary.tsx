import { Component, type ReactNode } from 'react';
import i18n from '@/i18n';

/** Last line of defence: a crash in one screen shows a calm message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md space-y-4 p-6 pt-16 text-center">
        <h1 className="text-xl font-semibold">{i18n.t('error.title')}</h1>
        <p className="text-muted">{i18n.t('error.body')}</p>
        <button type="button" onClick={() => location.reload()} className="min-h-12 rounded-xl bg-accent px-6 font-semibold text-on-accent">
          {i18n.t('error.reload')}
        </button>
      </div>
    );
  }
}
