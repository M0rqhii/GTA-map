import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import * as api from '../lib/api';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthProvider';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toasts';
import { ColorSelector } from '../components/ColorSelector';
import { MapBackdrop } from '../components/MapBackdrop';
import { Button, SectionTitle, Signature, Wordmark } from '../components/ui';
import { IconBack } from '../components/icons';

export function AccountPage() {
  const { me, refreshMe, signOut } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (me?.org_id) api.fetchOrg(me.org_id).then((o) => setOrgName(o.name)).catch(() => setOrgName(null));
  }, [me?.org_id]);

  async function leave() {
    const ok = await confirm({
      title: 'Wyjść z organizacji?',
      message: 'Twoje kwadraty i pinezki zostaną usunięte z mapy organizacji. Wrócić możesz tylko z kodem zaproszenia.',
      confirmLabel: 'Wychodzę',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.leaveOrg();
      await refreshMe();
    } catch (e) {
      toast.push(errorMessage(e), 'error');
    }
  }

  return (
    <div className="relative min-h-full overflow-y-auto">
      <MapBackdrop />
      <main className="relative mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Wordmark size="md" />
          <Link to="/" className="label-caps flex items-center gap-1 hover:text-sun"><IconBack width={14} height={14} />Mapa</Link>
        </div>

        <section className="hud animate-rise p-6">
          <p className="label-caps text-sun">Konto</p>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-[0.06em]">{me?.username}</h1>
          <p className="mt-1 text-ink-300">Organizacja: <span className="text-ink-100">{orgName ?? '…'}</span></p>
        </section>

        <section className="hud mt-4 animate-rise p-6" style={{ animationDelay: '60ms' }}>
          <SectionTitle>Kolor</SectionTitle>
          <p className="mb-4 text-ink-300">Zmiana od razu przemaluje wszystkie twoje kwadraty i pinezki u wszystkich.</p>
          <ColorSelector submitLabel="Zmień kolor" onSaved={() => toast.push('Kolor zmieniony', 'ok')} />
        </section>

        <section className="hud mt-4 animate-rise p-6" style={{ animationDelay: '120ms' }}>
          <SectionTitle>Sesja</SectionTitle>
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={() => void signOut()}>Wyloguj</Button>
            <Button variant="danger" onClick={leave}>Wyjdź z organizacji</Button>
          </div>
        </section>
        <div className="mt-6 flex justify-center"><Signature /></div>
      </main>
    </div>
  );
}
