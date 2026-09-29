import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import { supabase } from '../lib/supabase';
import { cellKey } from '../lib/grid';
import type { Cell } from './orgReducer';

const POLL_MS = 30_000;
const LIST_POLL_MS = 60_000;
const ANON: Cell = { userId: '', at: 0 };

export type PublicStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

// Anonymous viewer state: bare coordinates only, live over `pub:<org>` or polled when the org is delayed.
export function usePublicMap(orgId: string | null) {
  const [orgs, setOrgs] = useState<api.PublicOrg[] | null>(null);
  const [cells, setCells] = useState<Map<number, Cell>>(new Map());
  const [status, setStatus] = useState<PublicStatus>('idle');
  const [live, setLive] = useState(false);
  const orgsRef = useRef<api.PublicOrg[] | null>(null);

  const loadOrgs = useCallback(async () => {
    try {
      const list = await api.publicListOrgs();
      orgsRef.current = list;
      setOrgs(list);
      return list;
    } catch {
      return orgsRef.current ?? [];
    }
  }, []);

  useEffect(() => {
    void loadOrgs();
    const t = setInterval(() => void loadOrgs(), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [loadOrgs]);

  const delay = orgs?.find((o) => o.id === orgId)?.delay ?? null;

  useEffect(() => {
    if (!orgId) {
      setStatus('idle');
      setCells(new Map());
      return;
    }
    let cancelled = false;
    const loadCells = async () => {
      try {
        const keys = await api.publicGetCells(orgId);
        if (cancelled) return;
        if (keys === null) {
          setStatus('unavailable');
          setCells(new Map());
          return;
        }
        setCells(new Map(keys.map((k) => [k, ANON])));
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus((s) => (s === 'ready' ? s : 'unavailable'));
      }
    };

    setStatus('loading');
    void loadCells();

    if (delay === null) return () => { cancelled = true; };

    if (delay > 0) {
      setLive(false);
      const t = setInterval(() => { void loadOrgs(); void loadCells(); }, POLL_MS);
      return () => { cancelled = true; clearInterval(t); };
    }

    const apply = (pairs: [number, number][], add: boolean) =>
      setCells((prev) => {
        const next = new Map(prev);
        for (const [x, y] of pairs) {
          if (add) next.set(cellKey(x, y), ANON);
          else next.delete(cellKey(x, y));
        }
        return next;
      });

    let wasDown = false;
    const channel = supabase
      .channel(`pub:${orgId}`, { config: { private: true } })
      .on('broadcast', { event: 'cells_added' }, ({ payload }) => apply(payload.cells ?? [], true))
      .on('broadcast', { event: 'cells_removed' }, ({ payload }) => apply(payload.cells ?? [], false))
      .on('broadcast', { event: 'resync' }, () => void loadCells())
      .on('broadcast', { event: 'visibility_changed' }, () => { void loadOrgs(); void loadCells(); })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          setLive(true);
          if (wasDown) void loadCells();
          wasDown = false;
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setLive(false);
          wasDown = true;
        }
      });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orgId, delay, loadOrgs]);

  return { orgs, cells, status, delay, live };
}
