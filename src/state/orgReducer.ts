import { cellKey } from '../lib/grid';
import type { ActivityEntry } from '../lib/format';

export type Cell = { userId: string; at: number }; // at = epoch seconds
export type Member = { id: string; username: string; color: string | null; joined_at: string | null };
export type Pin = {
  id: string; org_id: string; user_id: string; px: number; py: number;
  icon: string; body: string; created_at: string; updated_at: string;
};
export type OrgInfo = {
  id: string; name: string; owner_id: string | null; is_public: boolean;
  public_delay_minutes: number; channel_key: string;
};
type PendingOp = { op: 'add' | 'remove'; prev?: Cell };

export type OrgState = {
  org: OrgInfo | null;
  cells: Map<number, Cell>;
  pending: Map<number, PendingOp>;
  members: Map<string, Member>;
  pins: Map<string, Pin>;
  activity: ActivityEntry[];
  activityDone: boolean;
  online: Set<string>;
  loaded: boolean;
  version: number; // bumped whenever something drawn on the grid changes
};

export const initialOrgState: OrgState = {
  org: null,
  cells: new Map(),
  pending: new Map(),
  members: new Map(),
  pins: new Map(),
  activity: [],
  activityDone: false,
  online: new Set(),
  loaded: false,
  version: 0,
};

export type RemoteCell = [x: number, y: number, userId: string, at: number];

export type OrgAction =
  | { type: 'loaded'; org: OrgInfo; members: Member[]; cells: RemoteCell[]; pins: Pin[]; activity: ActivityEntry[]; activityDone: boolean }
  | { type: 'optimisticAdd'; keys: number[]; userId: string; at: number }
  | { type: 'optimisticRemove'; keys: number[]; userId: string }
  | { type: 'confirmAdd'; keys: number[]; inserted: number[]; userId: string }
  | { type: 'confirmRemove'; keys: number[]; removed: number[] }
  | { type: 'remoteAdded'; cells: RemoteCell[] }
  | { type: 'remoteRemoved'; keys: number[] }
  | { type: 'memberChanged'; member: Member }
  | { type: 'memberRemoved'; userId: string }
  | { type: 'pinUpserted'; pin: Pin }
  | { type: 'pinRemoved'; id: string }
  | { type: 'activityUpserted'; entry: ActivityEntry }
  | { type: 'activityPage'; entries: ActivityEntry[]; done: boolean }
  | { type: 'presence'; online: string[] }
  | { type: 'orgChanged'; org: Partial<OrgInfo> & { id: string } };

export function decodeOrgCells(payload: { users: string[]; cells: number[] }): RemoteCell[] {
  const out: RemoteCell[] = [];
  for (let i = 0; i + 3 < payload.cells.length; i += 4) {
    const c = payload.cells;
    out.push([c[i], c[i + 1], payload.users[c[i + 2]], c[i + 3]]);
  }
  return out;
}

function mergeActivity(current: ActivityEntry[], incoming: ActivityEntry[]): ActivityEntry[] {
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

export function orgReducer(s: OrgState, a: OrgAction): OrgState {
  switch (a.type) {
    case 'loaded': {
      const cells = new Map<number, Cell>();
      for (const [x, y, userId, at] of a.cells) cells.set(cellKey(x, y), { userId, at });
      return {
        ...s,
        org: a.org,
        cells,
        pending: new Map(),
        members: new Map(a.members.map((m) => [m.id, m])),
        pins: new Map(a.pins.map((p) => [p.id, p])),
        activity: mergeActivity([], a.activity),
        activityDone: a.activityDone,
        loaded: true,
        version: s.version + 1,
      };
    }
    case 'optimisticAdd': {
      const cells = new Map(s.cells);
      const pending = new Map(s.pending);
      for (const k of a.keys) {
        if (cells.has(k)) continue;
        cells.set(k, { userId: a.userId, at: a.at });
        pending.set(k, { op: 'add' });
      }
      return { ...s, cells, pending, version: s.version + 1 };
    }
    case 'optimisticRemove': {
      const cells = new Map(s.cells);
      const pending = new Map(s.pending);
      for (const k of a.keys) {
        const prev = cells.get(k);
        if (!prev || prev.userId !== a.userId) continue;
        cells.delete(k);
        pending.set(k, { op: 'remove', prev });
      }
      return { ...s, cells, pending, version: s.version + 1 };
    }
    case 'confirmAdd': {
      const inserted = new Set(a.inserted);
      const cells = new Map(s.cells);
      const pending = new Map(s.pending);
      for (const k of a.keys) {
        if (pending.get(k)?.op !== 'add') continue;
        pending.delete(k);
        if (!inserted.has(k) && cells.get(k)?.userId === a.userId) cells.delete(k);
      }
      return { ...s, cells, pending, version: s.version + 1 };
    }
    case 'confirmRemove': {
      const removed = new Set(a.removed);
      const cells = new Map(s.cells);
      const pending = new Map(s.pending);
      for (const k of a.keys) {
        const p = pending.get(k);
        if (p?.op !== 'remove') continue;
        pending.delete(k);
        if (!removed.has(k) && p.prev && !cells.has(k)) cells.set(k, p.prev);
      }
      return { ...s, cells, pending, version: s.version + 1 };
    }
    case 'remoteAdded': {
      const cells = new Map(s.cells);
      const pending = new Map(s.pending);
      for (const [x, y, userId, at] of a.cells) {
        const k = cellKey(x, y);
        cells.set(k, { userId, at });
        if (pending.get(k)?.op === 'add') pending.delete(k);
      }
      return { ...s, cells, pending, version: s.version + 1 };
    }
    case 'remoteRemoved': {
      const cells = new Map(s.cells);
      const pending = new Map(s.pending);
      for (const k of a.keys) {
        cells.delete(k);
        if (pending.get(k)?.op === 'remove') pending.delete(k);
      }
      return { ...s, cells, pending, version: s.version + 1 };
    }
    case 'memberChanged': {
      const members = new Map(s.members).set(a.member.id, a.member);
      return { ...s, members, version: s.version + 1 };
    }
    case 'memberRemoved': {
      if (!s.members.has(a.userId)) return s;
      const members = new Map(s.members);
      members.delete(a.userId);
      return { ...s, members, version: s.version + 1 };
    }
    case 'pinUpserted':
      return { ...s, pins: new Map(s.pins).set(a.pin.id, a.pin) };
    case 'pinRemoved': {
      const pins = new Map(s.pins);
      pins.delete(a.id);
      return { ...s, pins };
    }
    case 'activityUpserted':
      return { ...s, activity: mergeActivity(s.activity, [a.entry]) };
    case 'activityPage':
      return { ...s, activity: mergeActivity(s.activity, a.entries), activityDone: a.done };
    case 'presence':
      return { ...s, online: new Set(a.online) };
    case 'orgChanged':
      return s.org && s.org.id === a.org.id ? { ...s, org: { ...s.org, ...a.org } } : s;
  }
}
