import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { errorMessage } from '../lib/errors';
import type { OrgInfo } from '../state/orgReducer';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toasts';
import { Button } from './ui';
import { IconCopy } from './icons';

const DELAYS = [0, 5, 15, 30] as const;

async function copy(text: string, push: (t: string, k?: 'ok' | 'error') => void) {
  try {
    await navigator.clipboard.writeText(text);
    push('Skopiowano', 'ok');
  } catch {
    push('Nie udało się skopiować', 'error');
  }
}

export function OrgSettings({ org }: { org: OrgInfo }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const publicLink = `${window.location.origin}/?org=${org.id}`;

  useEffect(() => {
    api.getInviteCode(org.id).then(setCode).catch(() => setCode(null));
  }, [org.id]);

  async function run(action: () => Promise<unknown>, okText?: string) {
    setBusy(true);
    try {
      await action();
      if (okText) toast.push(okText, 'ok');
    } catch (e) {
      toast.push(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="label-caps">Kod zaproszenia</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-11 flex-1 items-center border border-ink-600 bg-ink-950/70 px-3 font-mono text-2xl tracking-[0.35em] text-sun">
            {code ?? '······'}
          </span>
          <Button variant="ghost" className="h-11 px-3" disabled={!code} onClick={() => code && copy(code, toast.push)} title="Kopiuj kod" aria-label="Kopiuj kod">
            <IconCopy />
          </Button>
        </div>
        <p className="mt-1.5 text-sm text-ink-400">Nowa osoba wpisuje go po założeniu konta.</p>
        <Button
          variant="subtle"
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={async () => {
            const ok = await confirm({ title: 'Nowy kod?', message: 'Stary kod przestanie działać. Osoby już w organizacji zostają.', confirmLabel: 'Wygeneruj' });
            if (ok) await run(async () => setCode(await api.regenerateInvite()), 'Nowy kod gotowy');
          }}
        >
          Wygeneruj nowy kod
        </Button>
      </section>

      <section>
        <p className="label-caps">Publiczna mapa</p>
        <p className="mt-1.5 text-sm text-ink-300">
          Widzowie (np. na streamie) zobaczą tylko przeszukane kwadraty – bez kolorów, nicków, godzin i pinezek.
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#f5b50a]"
            checked={org.is_public}
            disabled={busy}
            onChange={(e) => run(() => api.setOrgPublic(e.target.checked, org.public_delay_minutes), e.target.checked ? 'Mapa jest publiczna' : 'Mapa ukryta')}
          />
          <span className="text-ink-100">{org.is_public ? 'Włączona' : 'Wyłączona'}</span>
        </label>
        <div className="mt-3">
          <p className="label-caps">Opóźnienie dla widzów</p>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {DELAYS.map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => run(() => api.setOrgPublic(org.is_public, d))}
                className={[
                  'h-9 border font-mono text-[13px] transition-colors',
                  org.public_delay_minutes === d ? 'border-sun bg-sun-soft text-sun' : 'border-ink-600 text-ink-300 hover:border-ink-400',
                ].join(' ')}
              >
                {d === 0 ? 'na żywo' : `${d} min`}
              </button>
            ))}
          </div>
        </div>
        {org.is_public ? (
          <>
            {[
              { label: 'Link dla widzów', url: publicLink, hint: null },
              { label: 'Link do OBS (źródło przeglądarki)', url: `${publicLink}&obs=1`, hint: 'Sama mapa w żółtej ramce, tło przezroczyste. Rozmiar np. 560 × 820. &label=0 ukrywa podpis net-flow.pl.' },
            ].map((l) => (
              <div key={l.label} className="mt-3">
                <p className="label-caps">{l.label}</p>
                <div className="mt-2 flex items-center gap-2">
                  <input readOnly value={l.url} className="h-9 min-w-0 flex-1 border border-ink-600 bg-ink-950/70 px-2 font-mono text-[12px] text-ink-200" onFocus={(e) => e.target.select()} />
                  <Button variant="ghost" size="sm" className="h-9" onClick={() => copy(l.url, toast.push)} aria-label={`Kopiuj: ${l.label}`}><IconCopy /></Button>
                </div>
                {l.hint ? <p className="mt-1 text-sm text-ink-400">{l.hint}</p> : null}
              </div>
            ))}
          </>
        ) : null}
      </section>

      <section className="border-t border-ink-700 pt-5">
        <p className="label-caps text-danger">Strefa zagrożenia</p>
        <Button
          variant="danger"
          size="sm"
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            const ok = await confirm({
              title: 'Wyczyścić mapę?',
              message: 'Wszystkie zaznaczone kwadraty całej organizacji zostaną usunięte. Pinezki zostają. Tego nie da się cofnąć.',
              confirmLabel: 'Wyczyść',
              danger: true,
              requireText: org.name,
            });
            if (ok) await run(async () => {
              const n = await api.clearMap();
              toast.push(`Usunięto ${n} kwadratów`, 'ok');
            });
          }}
        >
          Wyczyść mapę
        </Button>
      </section>
    </div>
  );
}
