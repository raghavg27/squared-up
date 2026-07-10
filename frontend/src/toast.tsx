import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ToastAction { label: string; run: () => void | Promise<void> }
interface ToastData { id: number; message: string; action?: ToastAction }
interface ToastApi { showToast: (message: string, action?: ToastAction) => void }

const ToastContext = createContext<ToastApi>({ showToast: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TOAST_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    setBusy(false);
    setToast({ id: Date.now(), message, action });
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  function dismiss() {
    window.clearTimeout(timer.current);
    setToast(null);
  }

  async function runAction() {
    if (!toast?.action || busy) return;
    setBusy(true);
    try {
      await toast.action.run();
      dismiss();
    } catch {
      showToast("That didn't work — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        // Sits above the bottom nav / sheet footers; pointer-events scoped so the
        // page behind stays tappable.
        <div className="fixed inset-x-0 bottom-24 z-[60] pointer-events-none">
          <div key={toast.id} className="max-w-[28rem] mx-auto px-mobile">
            <div className="pop-in pointer-events-auto bg-ink text-neutral-0 rounded-button shadow-lg px-4 py-3 flex items-center gap-3">
              <span className="flex-1 font-body text-[15px]">{toast.message}</span>
              {toast.action && (
                <button onClick={runAction} disabled={busy} className="font-body text-[15px] font-bold text-primary-fixed-dim disabled:opacity-60 shrink-0">
                  {busy ? '…' : toast.action.label}
                </button>
              )}
              <button onClick={dismiss} aria-label="Dismiss" className="text-neutral-300 shrink-0 w-6 h-6 flex items-center justify-center">✕</button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
