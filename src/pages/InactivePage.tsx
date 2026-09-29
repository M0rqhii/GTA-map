import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui';
import { AuthShell } from './AuthShell';

export function InactivePage() {
  const { me, signOut } = useAuth();
  return (
    <AuthShell eyebrow="Konto nieaktywne" title="Brak dostępu">
      <p className="text-ink-200">
        Konto <span className="font-mono text-ink-100">{me?.username}</span> nie zostało aktywowane. Poproś administratora o aktywację
        albo załóż konto przez link z zaproszeniem.
      </p>
      <Button variant="ghost" className="mt-6 w-full" onClick={() => void signOut()}>Wyloguj</Button>
    </AuthShell>
  );
}
