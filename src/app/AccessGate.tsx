import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import * as api from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { Button, Splash } from '../components/ui';
import { PublicViewer } from '../pages/PublicViewer';
import { ObsOverlay } from '../pages/ObsOverlay';

const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const InactivePage = lazy(() => import('../pages/InactivePage').then((m) => ({ default: m.InactivePage })));
const OnboardingPage = lazy(() => import('../pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const ChooseColorPage = lazy(() => import('../pages/ChooseColorPage').then((m) => ({ default: m.ChooseColorPage })));
const OrgMapView = lazy(() => import('../pages/OrgMapView').then((m) => ({ default: m.OrgMapView })));
const AccountPage = lazy(() => import('../pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const AdminPage = lazy(() => import('../pages/AdminPage').then((m) => ({ default: m.AdminPage })));

const PATH_RE = /^[A-Za-z0-9-]{1,80}$/;
const resolved = new Map<string, 'login' | 'register' | null>();

// Asks the database what a hidden path is. Unknown paths look exactly like the public map.
function useAccessPath(path: string): 'loading' | 'login' | 'register' | null {
  const valid = PATH_RE.test(path);
  const [kind, setKind] = useState<'loading' | 'login' | 'register' | null>(() => {
    if (!valid) return null;
    return resolved.has(path) ? resolved.get(path)! : 'loading';
  });
  useEffect(() => {
    if (!valid) { setKind(null); return; }
    if (resolved.has(path)) { setKind(resolved.get(path)!); return; }
    let active = true;
    setKind('loading');
    api.resolveAccessPath(path)
      .then((k) => { resolved.set(path, k); if (active) setKind(k); })
      .catch(() => { if (active) setKind(null); });
    return () => { active = false; };
  }, [path, valid]);
  return kind;
}

function HiddenPath({ path, inactive }: { path: string; inactive: boolean }) {
  const kind = useAccessPath(path);
  if (kind === 'loading') return <Splash />;
  if (kind === 'register') return <RegisterPage accessKey={path} />;
  if (inactive) return <InactivePage />;
  if (kind === 'login') return <LoginPage />;
  return <Navigate to="/" replace />;
}

function Home() {
  const { me } = useAuth();
  if (!me!.org_id) return <OnboardingPage />;
  if (!me!.color) return <ChooseColorPage />;
  return <OrgMapView key={me!.org_id} orgId={me!.org_id} readOnly={false} />;
}

function AdminOrgView() {
  const { id } = useParams();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return <Navigate to="/admin" replace />;
  return <OrgMapView key={id} orgId={id} readOnly />;
}

export function AccessGate() {
  const { session, me, loading, meError, refreshMe, signOut } = useAuth();
  const location = useLocation();
  const path = location.pathname.replace(/^\/+|\/+$/g, '');

  // Stream overlay shows only public data, even in a browser that is logged in.
  if (path === '' && new URLSearchParams(location.search).get('obs') === '1') return <ObsOverlay />;

  if (loading) return <Splash />;

  if (!session) {
    return path === '' ? <PublicViewer /> : <Suspense fallback={<Splash />}><HiddenPath path={path} inactive={false} /></Suspense>;
  }

  if (!me) {
    if (!meError) return <Splash />;
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-ink-200">Nie udało się wczytać konta.</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button onClick={() => void refreshMe()}>Spróbuj ponownie</Button>
            <Button variant="ghost" onClick={() => void signOut()}>Wyloguj</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<Splash />}>
      {!me.activated ? (
        <HiddenPath path={path} inactive />
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/konto" element={me.org_id ? <AccountPage /> : <Navigate to="/" replace />} />
          <Route path="/admin" element={me.is_superadmin ? <AdminPage /> : <Navigate to="/" replace />} />
          <Route path="/admin/org/:id" element={me.is_superadmin ? <AdminOrgView /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Suspense>
  );
}
