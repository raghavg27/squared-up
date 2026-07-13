import { Component, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from './ui.js';

// Last line of defence: a render crash anywhere below shows this friendly
// screen instead of React's white page. Reload is the honest recovery — the
// broken state is gone and cached data makes the return trip fast.
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('Squared Up crashed:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center text-center px-8 gap-3">
        <div className="w-16 h-16 rounded-card bg-primary/10 text-primary flex items-center justify-center">
          <Icon name="sentiment_dissatisfied" fill style={{ fontSize: 32 }} />
        </div>
        <h1 className="font-heading text-[22px] font-extrabold text-ink">Something went wrong</h1>
        <p className="font-body text-[15px] font-semibold text-neutral-600 max-w-[280px]">
          Not your fault — a screen hit a snag. Reload and you'll be right back where you were.
        </p>
        <button onClick={() => window.location.reload()} className="btn-coral mt-3 justify-center">
          Reload
        </button>
      </div>
    );
  }
}

/** In-sheet fallback when a screen's data failed to load cold — with retry. */
export function LoadErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border-2 border-dashed border-neutral-300 rounded-card py-10 px-6 flex flex-col items-center gap-2 text-neutral-600">
      <Icon name="wifi_off" style={{ fontSize: 28 }} />
      <p className="font-body text-[15px] font-semibold text-center max-w-[280px]">{message}</p>
      <button onClick={onRetry} className="mt-2 px-6 h-10 rounded-full bg-surface shadow-soft text-primary font-body text-[14px] font-bold active:scale-95 transition-transform">
        Try again
      </button>
    </div>
  );
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Slim banner pinned under the notch while the device is offline. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[70] max-w-[28rem] mx-auto pointer-events-none">
      <div className="mx-3 mt-2 rounded-full bg-ink text-neutral-0 px-4 py-2 flex items-center justify-center gap-2 shadow-lg">
        <Icon name="cloud_off" style={{ fontSize: 16 }} />
        <span className="font-body text-[13px] font-semibold">You're offline — showing saved data</span>
      </div>
    </div>
  );
}
