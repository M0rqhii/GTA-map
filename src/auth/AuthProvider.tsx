import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import * as api from '../lib/api';

type AuthValue = {
  session: Session | null;
  me: api.Me | null;
  loading: boolean;
  meError: boolean;
  refreshMe: () => Promise<api.Me | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<api.Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [meError, setMeError] = useState(false);

  const refreshMe = useCallback(async () => {
    try {
      const profile = await api.getMe();
      if (!profile) {
        // The account behind this session no longer exists (e.g. deleted by a superadmin).
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setMe(null);
        return null;
      }
      setMe(profile);
      setMeError(false);
      return profile;
    } catch {
      setMeError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await refreshMe();
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) {
        setMe(null);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Never await Supabase calls inside this callback (it can deadlock the auth lock).
        setTimeout(() => { void refreshMe(); }, 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    await api.signOut();
    setMe(null);
    window.history.replaceState(null, '', '/');
  }, []);

  const value = useMemo(
    () => ({ session, me, loading, meError, refreshMe, signOut }),
    [session, me, loading, meError, refreshMe, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
