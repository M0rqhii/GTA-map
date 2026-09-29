import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api';
import { errorCode, errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthProvider';
import { ColorPicker } from './ColorPicker';
import { Button, Swatch } from './ui';

// Loads colors taken in my org, lets me pick a free one and saves it.
export function ColorSelector({ onSaved, submitLabel }: { onSaved?: () => void; submitLabel: string }) {
  const { me, refreshMe } = useAuth();
  const [taken, setTaken] = useState<Map<string, string>>(new Map());
  const [value, setValue] = useState<string | null>(me?.color ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTaken = useCallback(async () => {
    if (!me?.org_id) return;
    const members = await api.fetchMembers(me.org_id);
    setTaken(new Map(members.filter((m) => m.color && m.id !== me.id).map((m) => [m.color!, m.username])));
  }, [me?.org_id, me?.id]);

  useEffect(() => {
    void loadTaken();
    const t = setInterval(() => void loadTaken(), 15_000);
    return () => clearInterval(t);
  }, [loadTaken]);

  async function save() {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await api.setColor(value);
      await refreshMe();
      onSaved?.();
    } catch (e) {
      setError(errorMessage(e));
      if (errorCode(e).includes('color_taken')) {
        setValue(null);
        void loadTaken();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ColorPicker value={value} onChange={setValue} taken={taken} mine={me?.color ?? null} />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-mono text-sm text-ink-300">
          <Swatch color={value} size={18} />
          {value ?? 'wybierz kolor'}
        </span>
        <Button onClick={save} disabled={!value || value === me?.color} loading={busy}>{submitLabel}</Button>
      </div>
      {error ? <p className="mt-3 text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
