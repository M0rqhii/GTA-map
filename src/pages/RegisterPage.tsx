import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import * as api from '../lib/api';
import { errorMessage } from '../lib/errors';
import { DISCORD_ENABLED } from '../lib/supabase';
import { validatePassword, validateUsername } from '../lib/validation';
import { useAuth } from '../auth/AuthProvider';
import { Button, Splash, TextField } from '../components/ui';
import { AuthShell } from './AuthShell';

export function RegisterPage({ accessKey }: { accessKey: string }) {
  const navigate = useNavigate();
  const { session, me, refreshMe } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activating = useRef(false);

  // Coming back from Discord through this link: activate the fresh account with the link key.
  const needsActivation = Boolean(session && me && !me.activated);
  useEffect(() => {
    if (!needsActivation || activating.current) return;
    activating.current = true;
    api.activateAccount(accessKey)
      .then(async (ok) => {
        if (!ok) throw new Error('not_allowed');
        await refreshMe();
        navigate('/', { replace: true });
      })
      .catch((err) => setError(errorMessage(err)));
  }, [needsActivation, accessKey, refreshMe, navigate]);

  if (needsActivation && !error) return <Splash text="Aktywacja konta" />;

  const usernameError = username ? validateUsername(username) : null;
  const passwordError = password ? validatePassword(password) : null;
  const mismatch = password2 && password !== password2 ? 'Hasła się różnią' : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateUsername(username) ?? validatePassword(password) ?? (password !== password2 ? 'Hasła się różnią' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.register(accessKey, username, password);
      await api.signIn(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Zaproszenie" title="Nowe konto">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Nick" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} error={usernameError} hint="3–20 znaków: litery, cyfry, _ i -" required autoFocus />
        <TextField label="Hasło" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={passwordError} required />
        <TextField label="Powtórz hasło" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} error={mismatch} required />
        {error ? <p className="text-danger" role="alert">{error}</p> : null}
        <Button type="submit" className="w-full" loading={busy}>Załóż konto</Button>
      </form>
      {DISCORD_ENABLED ? (
        <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => api.signInDiscord(window.location.href).catch((err) => setError(errorMessage(err)))}>
          Załóż przez Discord
        </Button>
      ) : null}
    </AuthShell>
  );
}
