import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import * as api from '../lib/api';
import { errorMessage } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { validateOrgName, validatePassword, validateUsername } from '../lib/validation';
import { useAuth } from '../auth/AuthProvider';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toasts';
import { Button, SectionTitle, Swatch, TextField, Wordmark } from '../components/ui';
import { IconBack, IconCopy } from '../components/icons';

type Tab = 'orgs' | 'users' | 'links';
const DELAYS = [0, 5, 15, 30];

const selectCls = 'h-8 border border-ink-600 bg-ink-950/70 px-2 text-sm text-ink-100 outline-none focus:border-sun';

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label-caps !text-[10px]">{label}</div>
      <div className="mt-0.5 truncate text-ink-100">{children}</div>
    </div>
  );
}

export function AdminPage() {
  const { me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('orgs');
  const [orgs, setOrgs] = useState<api.AdminOrg[] | null>(null);
  const [users, setUsers] = useState<api.AdminUser[] | null>(null);
  const [paths, setPaths] = useState<api.AccessPath[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [o, u, p] = await Promise.all([api.adminListOrgs(), api.adminListUsers(), api.adminGetAccessPaths()]);
      setOrgs(o);
      setUsers(u);
      setPaths(p);
    } catch (e) {
      toast.push(errorMessage(e), 'error');
    }
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (action: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    try {
      await action();
      if (okText) toast.push(okText, 'ok');
      await reload();
      return true;
    } catch (e) {
      toast.push(errorMessage(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [reload, toast]);

  // --- forms
  const [newOrg, setNewOrg] = useState({ name: '', owner: '' });
  const [newUser, setNewUser] = useState({ username: '', password: '', org: '' });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  async function createOrg(e: FormEvent) {
    e.preventDefault();
    const problem = validateOrgName(newOrg.name);
    if (problem) return toast.push(problem, 'error');
    if (await run(() => api.adminCreateOrg(newOrg.name.trim(), newOrg.owner || null), 'Organizacja utworzona')) setNewOrg({ name: '', owner: '' });
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    const problem = validateUsername(newUser.username) ?? validatePassword(newUser.password);
    if (problem) return toast.push(problem, 'error');
    if (await run(() => api.adminCreateUser(newUser.username, newUser.password, newUser.org || null), 'Konto utworzone')) {
      setNewUser({ username: '', password: '', org: '' });
    }
  }

  const activeUsers = (users ?? []).filter((u) => u.activated);
  const link = (path: string) => `${window.location.origin}/${path}`;

  return (
    <div className="h-full overflow-y-auto bg-ink-900">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Wordmark size="md" />
            <p className="label-caps mt-1 text-sun">Panel superadmina</p>
          </div>
          <Link to="/" className="label-caps flex items-center gap-1 hover:text-sun"><IconBack width={14} height={14} />Mapa</Link>
        </header>

        <nav className="mb-5 flex border-b border-ink-700" role="tablist">
          {([['orgs', 'Organizacje'], ['users', 'Użytkownicy'], ['links', 'Ukryte linki']] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-4 py-2.5 font-display text-[15px] font-semibold uppercase tracking-[0.1em] ${tab === id ? 'border-sun text-sun' : 'border-transparent text-ink-300 hover:text-ink-100'}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'orgs' ? (
          <>
            <form onSubmit={createOrg} className="hud mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <TextField label="Nowa organizacja" value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })} maxLength={32} />
              <label className="block">
                <span className="label-caps">Właściciel (opcjonalnie)</span>
                <select className={`${selectCls} mt-1.5 !h-11 w-full`} value={newOrg.owner} onChange={(e) => setNewOrg({ ...newOrg, owner: e.target.value })}>
                  <option value="">— brak —</option>
                  {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.username}{u.org_name ? ` (${u.org_name})` : ''}</option>)}
                </select>
              </label>
              <Button type="submit" loading={busy}>Utwórz</Button>
            </form>

            {orgs === null ? <p className="text-ink-400">Wczytywanie…</p> : orgs.length === 0 ? <p className="text-ink-400">Brak organizacji.</p> : (
              <ul className="space-y-2">
                {orgs.map((o) => (
                  <li key={o.id} className="hud p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-xl font-semibold uppercase tracking-[0.06em]">{o.name}</h3>
                        <p className="font-mono text-[12px] text-ink-400">utworzona {relativeTime(o.created_at)}</p>
                      </div>
                      <Link to={`/admin/org/${o.id}`} className="border border-sun px-3 py-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-sun hover:bg-sun hover:text-ink-950">Podgląd mapy</Link>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Cell label="Właściciel">{o.owner_name ?? '—'}</Cell>
                      <Cell label="Członkowie">{o.member_count}</Cell>
                      <Cell label="Kwadraty">{o.cell_count}</Cell>
                      <Cell label="Pinezki">{o.pin_count}</Cell>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-3">
                      <select className={selectCls} value="" disabled={busy} onChange={(e) => e.target.value && run(() => api.adminSetOwner(o.id, e.target.value), 'Właściciel zmieniony')} aria-label="Zmień właściciela">
                        <option value="">Zmień właściciela…</option>
                        {activeUsers.filter((u) => u.id !== o.owner_id).map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                      </select>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-[#f5b50a]" checked={o.is_public} disabled={busy} onChange={(e) => run(() => api.adminSetOrgPublic(o.id, e.target.checked, o.public_delay_minutes))} />
                        Publiczna
                      </label>
                      <select className={selectCls} value={o.public_delay_minutes} disabled={busy} onChange={(e) => run(() => api.adminSetOrgPublic(o.id, o.is_public, Number(e.target.value)))} aria-label="Opóźnienie">
                        {DELAYS.map((d) => <option key={d} value={d}>{d === 0 ? 'na żywo' : `${d} min`}</option>)}
                      </select>
                      <span className="flex-1" />
                      <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
                        if (await confirm({ title: 'Wyczyścić mapę?', message: `Usunie wszystkie kwadraty organizacji ${o.name}.`, danger: true, confirmLabel: 'Wyczyść', requireText: o.name })) {
                          await run(() => api.adminClearMap(o.id), 'Mapa wyczyszczona');
                        }
                      }}>Wyczyść mapę</Button>
                      <Button size="sm" variant="danger" disabled={busy} onClick={async () => {
                        if (await confirm({ title: 'Usunąć organizację?', message: 'Członkowie trafią na ekran wyboru organizacji. Mapa, pinezki i historia zostaną usunięte.', danger: true, confirmLabel: 'Usuń', requireText: o.name })) {
                          await run(() => api.adminDeleteOrg(o.id), 'Organizacja usunięta');
                        }
                      }}>Usuń</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {tab === 'users' ? (
          <>
            <form onSubmit={createUser} className="hud mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <TextField label="Nick" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} autoComplete="off" />
              <TextField label="Hasło" type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} autoComplete="new-password" />
              <label className="block">
                <span className="label-caps">Organizacja</span>
                <select className={`${selectCls} mt-1.5 !h-11 w-full`} value={newUser.org} onChange={(e) => setNewUser({ ...newUser, org: e.target.value })}>
                  <option value="">— brak —</option>
                  {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <Button type="submit" loading={busy}>Utwórz konto</Button>
            </form>

            {users === null ? <p className="text-ink-400">Wczytywanie…</p> : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id} className="hud p-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <div className="flex min-w-40 items-center gap-2">
                        <Swatch color={u.color} size={14} />
                        <span className="font-medium">{u.username}</span>
                        {u.is_superadmin ? <span className="font-mono text-[11px] text-sun">SUPERADMIN</span> : null}
                        {!u.activated ? <span className="font-mono text-[11px] text-danger">NIEAKTYWNE</span> : null}
                      </div>
                      <Cell label="Organizacja">{u.org_name ?? '—'}</Cell>
                      <Cell label="Ostatnio">{u.last_sign_in_at ? relativeTime(u.last_sign_in_at) : 'nigdy'}</Cell>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-3">
                      <select className={selectCls} value="" disabled={busy} aria-label="Przenieś do organizacji" onChange={(e) => {
                        const v = e.target.value;
                        if (v) void run(() => api.adminMoveUser(u.id, v === '__none' ? null : v), 'Przeniesiono');
                      }}>
                        <option value="">Przenieś do…</option>
                        <option value="__none">— bez organizacji —</option>
                        {(orgs ?? []).filter((o) => o.id !== u.org_id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      {u.id !== me?.id ? (
                        <>
                          <Button size="sm" variant="subtle" disabled={busy} onClick={() => run(() => api.adminSetActivated(u.id, !u.activated), u.activated ? 'Dezaktywowano' : 'Aktywowano')}>
                            {u.activated ? 'Dezaktywuj' : 'Aktywuj'}
                          </Button>
                          <Button size="sm" variant="subtle" disabled={busy} onClick={async () => {
                            if (await confirm({ title: u.is_superadmin ? 'Odebrać superadmina?' : 'Nadać superadmina?', message: u.is_superadmin ? `${u.username} straci dostęp do tego panelu.` : `${u.username} będzie miał pełny dostęp do wszystkich organizacji i kont.`, danger: !u.is_superadmin })) {
                              await run(() => api.adminSetSuperadmin(u.id, !u.is_superadmin), 'Zapisano');
                            }
                          }}>
                            {u.is_superadmin ? 'Odbierz superadmina' : 'Nadaj superadmina'}
                          </Button>
                        </>
                      ) : null}
                      <Button size="sm" variant="subtle" disabled={busy} onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setResetPassword(''); }}>Reset hasła</Button>
                      <span className="flex-1" />
                      {u.id !== me?.id ? (
                        <Button size="sm" variant="danger" disabled={busy} onClick={async () => {
                          if (await confirm({ title: 'Usunąć konto?', message: `Konto ${u.username} i jego kwadraty zostaną usunięte.`, danger: true, confirmLabel: 'Usuń', requireText: u.username })) {
                            await run(() => api.adminDeleteUser(u.id), 'Konto usunięte');
                          }
                        }}>Usuń konto</Button>
                      ) : null}
                    </div>
                    {resetFor === u.id ? (
                      <form
                        className="mt-3 flex flex-wrap items-end gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const problem = validatePassword(resetPassword);
                          if (problem) return toast.push(problem, 'error');
                          if (await run(() => api.adminResetPassword(u.id, resetPassword), 'Hasło zmienione')) setResetFor(null);
                        }}
                      >
                        <TextField label={`Nowe hasło dla ${u.username}`} type="text" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} autoComplete="new-password" className="min-w-60 flex-1" />
                        <Button type="submit" size="md" loading={busy}>Ustaw</Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {tab === 'links' ? (
          <section className="hud p-5">
            <SectionTitle>Ukryte linki</SectionTitle>
            <p className="mb-4 text-ink-300">
              Tylko pod tymi adresami pojawia się logowanie i rejestracja. Każdy inny adres pokazuje publiczną mapę.
              Jeśli link wycieknie – wygeneruj nowy, stary natychmiast przestanie działać.
            </p>
            {paths === null ? <p className="text-ink-400">Wczytywanie…</p> : (
              <ul className="space-y-4">
                {paths.map((p) => (
                  <li key={p.kind}>
                    <p className="label-caps">{p.kind === 'login' ? 'Logowanie' : 'Rejestracja'} · zmieniony {relativeTime(p.rotated_at)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input readOnly value={link(p.path)} onFocus={(e) => e.target.select()} className="h-10 min-w-0 flex-1 border border-ink-600 bg-ink-950/70 px-3 font-mono text-[13px] text-ink-100" />
                      <Button variant="ghost" className="h-10 px-3" aria-label="Kopiuj" onClick={async () => {
                        try { await navigator.clipboard.writeText(link(p.path)); toast.push('Skopiowano', 'ok'); } catch { toast.push('Nie udało się skopiować', 'error'); }
                      }}><IconCopy /></Button>
                      <Button variant="danger" size="sm" className="h-10" disabled={busy} onClick={async () => {
                        if (await confirm({ title: 'Nowy link?', message: 'Stary link przestanie działać od razu.', confirmLabel: 'Wygeneruj', danger: true })) {
                          await run(() => api.adminRotateAccessPath(p.kind), 'Nowy link gotowy');
                        }
                      }}>Wygeneruj nowy</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
