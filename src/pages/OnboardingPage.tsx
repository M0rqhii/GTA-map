import { useState, type FormEvent } from 'react';
import * as api from '../lib/api';
import { errorMessage } from '../lib/errors';
import { normalizeInviteCode, validateInviteCode, validateOrgName } from '../lib/validation';
import { useAuth } from '../auth/AuthProvider';
import { Button, TextField } from '../components/ui';
import { AuthShell } from './AuthShell';

export function OnboardingPage() {
  const { me, refreshMe, signOut } = useAuth();
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeInviteCode(code);
    const problem = validateInviteCode(normalized);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const result = await api.joinOrg(normalized);
      if (result !== 'ok') throw new Error(result);
      await refreshMe();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const problem = validateOrgName(name);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api.createOrg(name.trim());
      await refreshMe();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow={`Cześć, ${me?.username ?? ''}`} title="Organizacja">
      <div className="mb-5 grid grid-cols-2 border border-ink-600" role="tablist">
        {(['join', 'create'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(null); }}
            className={`h-10 font-display text-[15px] font-semibold uppercase tracking-[0.1em] transition-colors ${mode === m ? 'bg-sun text-ink-950' : 'text-ink-300 hover:text-ink-100'}`}
          >
            {m === 'join' ? 'Dołącz kodem' : 'Załóż nową'}
          </button>
        ))}
      </div>

      {mode === 'join' ? (
        <form onSubmit={join} className="space-y-4">
          <TextField
            label="Kod zaproszenia"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="K7F2QX"
            autoComplete="off"
            className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.4em]"
            hint="Dostaniesz go od właściciela organizacji."
            autoFocus
          />
          {error ? <p className="text-danger" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" loading={busy}>Dołącz</Button>
        </form>
      ) : (
        <form onSubmit={create} className="space-y-4">
          <TextField label="Nazwa organizacji" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} hint="2–32 znaki. Wielkość liter nie ma znaczenia przy sprawdzaniu, czy nazwa jest wolna." autoFocus />
          {error ? <p className="text-danger" role="alert">{error}</p> : null}
          <Button type="submit" className="w-full" loading={busy}>Załóż organizację</Button>
        </form>
      )}
      <button type="button" onClick={() => void signOut()} className="label-caps mt-6 block w-full text-center hover:text-ink-100">Wyloguj</button>
    </AuthShell>
  );
}
