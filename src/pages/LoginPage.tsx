import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import * as api from '../lib/api';
import { errorMessage } from '../lib/errors';
import { DISCORD_ENABLED } from '../lib/supabase';
import { Button, TextField } from '../components/ui';
import { AuthShell } from './AuthShell';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.signIn(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Dostęp zastrzeżony" title="Logowanie">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Nick" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        <TextField label="Hasło" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="text-danger" role="alert">{error}</p> : null}
        <Button type="submit" className="w-full" loading={busy}>Zaloguj</Button>
      </form>
      {DISCORD_ENABLED ? (
        <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => api.signInDiscord(`${window.location.origin}/`).catch((err) => setError(errorMessage(err)))}>
          Zaloguj przez Discord
        </Button>
      ) : null}
    </AuthShell>
  );
}
