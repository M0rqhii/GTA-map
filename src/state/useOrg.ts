import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as api from '../lib/api';
import { supabase } from '../lib/supabase';
import { cellKey, type CellXY } from '../lib/grid';
import { errorCode, errorMessage } from '../lib/errors';
import { pluralCells, type ActivityEntry } from '../lib/format';
import { useToast } from '../components/Toasts';
import { Batcher, brushModeFor, brushWants, cellsOnLine, type BrushMode } from '../map/brush';
import { initialOrgState, orgReducer, type Member, type OrgInfo, type Pin, type RemoteCell } from './orgReducer';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';
const MAX_BATCH = 1000;

type Options = { meId: string; readOnly: boolean; onRemoved: () => void };

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Org map state: initial load, realtime channel (broadcast + presence), optimistic cell/pin edits.
export function useOrg(orgId: string, { meId, readOnly, onRemoved }: Options) {
  const [state, dispatch] = useReducer(orgReducer, initialOrgState);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [topic, setTopic] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();
  const stateRef = useRef(state);
  stateRef.current = state;
  const statusRef = useRef(status);
  statusRef.current = status;
  const onRemovedRef = useRef(onRemoved);
  onRemovedRef.current = onRemoved;

  const loadAll = useCallback(async () => {
    try {
      const [org, members, cells, pins, activity] = await Promise.all([
        api.fetchOrg(orgId), api.fetchMembers(orgId), api.getOrgCells(orgId), api.fetchPins(orgId), api.fetchActivity(orgId),
      ]);
      dispatch({ type: 'loaded', org, members, cells, pins, activity: activity.entries, activityDone: activity.done });
      setTopic(`org:${org.id}:${org.channel_key}`);
      setLoadError(null);
    } catch (e) {
      const code = errorCode(e);
      // The org is gone or we were removed from it.
      if (code.includes('not_allowed') || code.includes('0 rows') || code.includes('PGRST116')) onRemovedRef.current();
      else setLoadError(errorMessage(e));
    }
  }, [orgId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Realtime channel
  useEffect(() => {
    if (!topic) return;
    let wasDown = false;
    const channel = supabase.channel(topic, { config: { private: true, presence: { key: meId } } });
    channel
      .on('broadcast', { event: 'cells_added' }, ({ payload }) =>
        dispatch({ type: 'remoteAdded', cells: (payload.cells ?? []) as RemoteCell[] }))
      .on('broadcast', { event: 'cells_removed' }, ({ payload }) =>
        dispatch({ type: 'remoteRemoved', keys: ((payload.cells ?? []) as [number, number][]).map(([x, y]) => cellKey(x, y)) }))
      .on('broadcast', { event: 'resync' }, () => void loadAll())
      .on('broadcast', { event: 'channel_rotated' }, () => void loadAll())
      .on('broadcast', { event: 'member_changed' }, ({ payload }) => dispatch({ type: 'memberChanged', member: payload.profile as Member }))
      .on('broadcast', { event: 'member_removed' }, ({ payload }) => {
        if (payload.user_id === meId) onRemovedRef.current();
        else dispatch({ type: 'memberRemoved', userId: payload.user_id });
      })
      .on('broadcast', { event: 'pin_upserted' }, ({ payload }) => dispatch({ type: 'pinUpserted', pin: payload.pin as Pin }))
      .on('broadcast', { event: 'pin_removed' }, ({ payload }) => dispatch({ type: 'pinRemoved', id: payload.id }))
      .on('broadcast', { event: 'activity_upserted' }, ({ payload }) => dispatch({ type: 'activityUpserted', entry: payload.entry as ActivityEntry }))
      .on('broadcast', { event: 'org_changed' }, ({ payload }) => dispatch({ type: 'orgChanged', org: payload.org as OrgInfo }))
      .on('broadcast', { event: 'org_deleted' }, () => onRemovedRef.current())
      .on('presence', { event: 'sync' }, () => dispatch({ type: 'presence', online: Object.keys(channel.presenceState()) }))
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          setStatus('online');
          if (!readOnly) void channel.track({ online_at: new Date().toISOString() });
          if (wasDown) void loadAll();
          wasDown = false;
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus('offline');
          wasDown = true;
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [topic, meId, readOnly, loadAll]);

  const canWrite = useCallback(() => {
    if (readOnly) return false;
    if (statusRef.current !== 'online') {
      toast.push(errorMessage('offline'), 'error');
      return false;
    }
    return true;
  }, [readOnly, toast]);

  const sendMark = useCallback(async (keys: number[]) => {
    for (const part of chunks(keys, MAX_BATCH)) {
      try {
        const inserted = await api.markCells(part);
        dispatch({ type: 'confirmAdd', keys: part, inserted, userId: meId });
        const rejected = part.length - inserted.length;
        if (rejected > 0) toast.push(part.length === 1 ? 'Ktoś był szybszy – ten kwadrat jest już zajęty.' : `${rejected} ${pluralCells(rejected)} było już zajętych.`);
      } catch (e) {
        dispatch({ type: 'confirmAdd', keys: part, inserted: [], userId: meId });
        toast.push(errorMessage(e), 'error');
      }
    }
  }, [meId, toast]);

  const sendUnmark = useCallback(async (keys: number[]) => {
    for (const part of chunks(keys, MAX_BATCH)) {
      try {
        const removed = await api.unmarkCells(part);
        dispatch({ type: 'confirmRemove', keys: part, removed });
      } catch (e) {
        dispatch({ type: 'confirmRemove', keys: part, removed: [] });
        toast.push(errorMessage(e), 'error');
      }
    }
  }, [toast]);

  const toggleCell = useCallback((x: number, y: number) => {
    if (!canWrite()) return;
    const key = cellKey(x, y);
    const s = stateRef.current;
    if (s.pending.has(key)) return;
    const cell = s.cells.get(key);
    if (!cell) {
      dispatch({ type: 'optimisticAdd', keys: [key], userId: meId, at: Math.floor(Date.now() / 1000) });
      void sendMark([key]);
    } else if (cell.userId === meId) {
      dispatch({ type: 'optimisticRemove', keys: [key], userId: meId });
      void sendUnmark([key]);
    }
  }, [canWrite, meId, sendMark, sendUnmark]);

  // Brush: paint or erase along the pointer path, sent in batches every 150 ms.
  const brush = useRef<{ mode: BrushMode; last: CellXY; seen: Set<number>; batcher: Batcher } | null>(null);

  const brushVisit = useCallback((c: CellXY) => {
    const b = brush.current;
    if (!b) return;
    const key = cellKey(c.x, c.y);
    if (b.seen.has(key)) return;
    b.seen.add(key);
    if (!brushWants(b.mode, stateRef.current.cells.get(key), meId)) return;
    if (b.mode === 'paint') dispatch({ type: 'optimisticAdd', keys: [key], userId: meId, at: Math.floor(Date.now() / 1000) });
    else dispatch({ type: 'optimisticRemove', keys: [key], userId: meId });
    b.batcher.push([key]);
  }, [meId]);

  const brushStart = useCallback((c: CellXY): boolean => {
    if (readOnly || statusRef.current !== 'online') return false;
    const mode = brushModeFor(stateRef.current.cells.get(cellKey(c.x, c.y)), meId);
    if (!mode) return false;
    const flush = mode === 'paint' ? sendMark : sendUnmark;
    brush.current = { mode, last: c, seen: new Set(), batcher: new Batcher((keys) => void flush(keys), 150) };
    brushVisit(c);
    return true;
  }, [readOnly, meId, sendMark, sendUnmark, brushVisit]);

  const brushMove = useCallback((c: CellXY) => {
    const b = brush.current;
    if (!b) return;
    for (const step of cellsOnLine(b.last, c)) brushVisit(step);
    b.last = c;
  }, [brushVisit]);

  const brushEnd = useCallback(() => {
    const b = brush.current;
    if (!b) return;
    b.batcher.flushNow();
    b.batcher.dispose();
    brush.current = null;
  }, []);

  // Pins
  const addPin = useCallback(async (px: number, py: number, icon: string, body: string) => {
    if (!canWrite()) return false;
    try {
      const id = await api.addPin(px, py, icon, body);
      const now = new Date().toISOString();
      dispatch({ type: 'pinUpserted', pin: { id, org_id: orgId, user_id: meId, px, py, icon, body, created_at: now, updated_at: now } });
      return true;
    } catch (e) {
      toast.push(errorMessage(e), 'error');
      return false;
    }
  }, [canWrite, orgId, meId, toast]);

  const updatePin = useCallback(async (pin: Pin, icon: string, body: string) => {
    if (!canWrite()) return false;
    try {
      await api.updatePin(pin.id, icon, body);
      dispatch({ type: 'pinUpserted', pin: { ...pin, icon, body, updated_at: new Date().toISOString() } });
      return true;
    } catch (e) {
      toast.push(errorMessage(e), 'error');
      return false;
    }
  }, [canWrite, toast]);

  const deletePin = useCallback(async (id: string) => {
    if (!canWrite()) return false;
    try {
      await api.deletePin(id);
      dispatch({ type: 'pinRemoved', id });
      return true;
    } catch (e) {
      toast.push(errorMessage(e), 'error');
      return false;
    }
  }, [canWrite, toast]);

  const loadMoreActivity = useCallback(async () => {
    const list = stateRef.current.activity;
    const oldest = list.length ? list[list.length - 1].id : undefined;
    try {
      const page = await api.fetchActivity(orgId, oldest);
      dispatch({ type: 'activityPage', entries: page.entries, done: page.done });
    } catch (e) {
      toast.push(errorMessage(e), 'error');
    }
  }, [orgId, toast]);

  return {
    state, status, loadError, reload: loadAll,
    toggleCell, brushStart, brushMove, brushEnd,
    addPin, updatePin, deletePin, loadMoreActivity,
  };
}

export type OrgController = ReturnType<typeof useOrg>;
