import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Button, TextField } from './ui';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string; // user must type this exactly to confirm
};
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [typed, setTyped] = useState('');

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setTyped('');
    setPending({ ...o, resolve });
  }), []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const blocked = pending?.requireText !== undefined && typed.trim() !== pending.requireText;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-[3000] grid place-items-center bg-ink-950/75 p-4" role="dialog" aria-modal="true" onClick={() => close(false)}>
          <form
            className="hud w-full max-w-md animate-rise p-6"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (!blocked) close(true); }}
          >
            <h2 className="font-display text-2xl font-semibold uppercase tracking-[0.08em]">{pending.title}</h2>
            <p className="mt-3 whitespace-pre-line text-ink-200">{pending.message}</p>
            {pending.requireText !== undefined ? (
              <TextField
                className="mt-4"
                label={`Wpisz „${pending.requireText}”, aby potwierdzić`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
              />
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => close(false)}>Anuluj</Button>
              <Button type="submit" variant={pending.danger ? 'danger' : 'primary'} disabled={blocked} autoFocus={pending.requireText === undefined}>
                {pending.confirmLabel ?? 'Potwierdź'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
