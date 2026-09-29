import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Toast = { id: number; text: string; kind: 'info' | 'error' | 'ok' };
type ToastApi = { push: (text: string, kind?: Toast['kind']) => void };

const ToastContext = createContext<ToastApi>({ push: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = nextId.current++;
    setToasts((list) => [...list.filter((t) => t.text !== text), { id, text, kind }].slice(-4));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 3000);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-[2000] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'hud pointer-events-auto animate-rise px-4 py-2.5 text-[15px] shadow-lg shadow-black/40',
              t.kind === 'error' ? 'text-danger' : t.kind === 'ok' ? 'text-ok' : 'text-ink-100',
            ].join(' ')}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
