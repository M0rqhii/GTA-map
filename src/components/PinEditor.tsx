import { useState, type FormEvent } from 'react';
import { PIN_ICONS, type PinIcon } from '../lib/pins';
import { PIN_BODY_MAX, validatePinBody } from '../lib/validation';
import { Button } from './ui';

type Props = {
  title: string;
  initial?: { icon: string; body: string };
  onSave: (icon: string, body: string) => Promise<boolean>;
  onCancel: () => void;
};

export function PinEditor({ title, initial, onSave, onCancel }: Props) {
  const [icon, setIcon] = useState<string>(initial?.icon ?? 'note');
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const problem = validatePinBody(body);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return;
    setBusy(true);
    const ok = await onSave(icon, body.trim());
    setBusy(false);
    if (ok) onCancel();
  }

  return (
    <div className="fixed inset-0 z-[2500] grid place-items-end bg-ink-950/60 sm:place-items-center" role="dialog" aria-modal="true" onClick={onCancel}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="hud w-full max-w-lg animate-rise p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-[0.08em]">{title}</h2>
        <p className="label-caps mt-4">Rodzaj</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {PIN_ICONS.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setIcon(i.id as PinIcon)}
              aria-pressed={icon === i.id}
              className={[
                'flex flex-col items-center gap-1 border px-1 py-2 transition-colors',
                icon === i.id ? 'border-sun bg-sun-soft' : 'border-ink-600 hover:border-ink-400',
              ].join(' ')}
            >
              <span className="text-xl leading-none">{i.emoji}</span>
              <span className="text-[11px] leading-tight text-ink-200">{i.label}</span>
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="flex justify-between">
            <span className="label-caps">Notatka</span>
            <span className={`font-mono text-[11px] ${body.length > PIN_BODY_MAX ? 'text-danger' : 'text-ink-400'}`}>{body.length}/{PIN_BODY_MAX}</span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            autoFocus
            placeholder="np. skrzynka za garażem, wejście od tyłu…"
            className="mt-1.5 block w-full resize-none border border-ink-600 bg-ink-950/70 p-3 text-[15px] text-ink-100 outline-none placeholder:text-ink-500 focus:border-sun"
          />
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Anuluj</Button>
          <Button type="submit" disabled={Boolean(problem)} loading={busy}>Zapisz</Button>
        </div>
      </form>
    </div>
  );
}
