import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import * as api from '../lib/api';

type AuthValue = {
  session: Session | null;
  me: api.Me | null;
  loading: boolean;
  meError: boolean;
  restoreFailed: boolean; // a saved login could not be refreshed (network); it is still saved
  refreshMe: () => Promise<api.Me | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

// The login is saved in localStorage and its token refreshed by supabase-js, so it survives reloads and
// browser restarts until the user signs out.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<api.Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [meError, setMeError] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const meRef = useRef(me);
  meRef.current = me;

  const refreshMe = useCallback(async () => {
    try {
      const profile = await api.getMe();
      if (!profile) {
        // get_me is also empty when the request went out without a valid token (a failed refresh),
        // so sign out only when the auth server confirms the account is gone.
        if (await api.accountGone()) {
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setMe(null);
        } else {
          setMeError(true);
        }
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
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      // An expired token that could not be refreshed for lack of network: the login stays saved and
      // supabase-js retries in the background (TOKEN_REFRESHED below), so don't show the signed-out page.
      setRestoreFailed(!data.session && isAuthRetryableFetchError(error));
      if (data.session) await refreshMe();
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) {
        setMe(null);
        setRestoreFailed(false);
        return;
      }
      setRestoreFailed(false);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || (event === 'TOKEN_REFRESHED' && !meRef.current)) {
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
    () => ({ session, me, loading, meError, restoreFailed, refreshMe, signOut }),
    [session, me, loading, meError, restoreFailed, refreshMe, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
