import { describe, it, expect } from 'vitest';
import { orgReducer, initialOrgState, decodeOrgCells, type OrgState } from '../src/state/orgReducer';
import { cellKey } from '../src/lib/grid';

const org = { id: 'o', name: 'Ekipa', owner_id: 'me', is_public: false, public_delay_minutes: 0, channel_key: 'k' };
const loaded = (cells: [number, number, string, number][] = []): OrgState =>
  orgReducer(initialOrgState, { type: 'loaded', org, members: [], cells, pins: [], activity: [], activityDone: true });
const entry = (id: number, data: Record<string, unknown> = {}) => ({
  id, actor_id: 'a', actor_name: 'A', actor_is_superadmin: false, kind: 'cells_marked', data, created_at: '', updated_at: '',
});

describe('orgReducer', () => {
  it('decodes compact cells', () => {
    expect(decodeOrgCells({ users: ['a', 'b'], cells: [1, 2, 1, 100, 3, 4, 0, 200] })).toEqual([[1, 2, 'b', 100], [3, 4, 'a', 200]]);
  });

  it('loads cells by grid key', () => {
    const s = loaded([[3, 4, 'a', 10]]);
    expect(s.cells.get(cellKey(3, 4))).toEqual({ userId: 'a', at: 10 });
    expect(s.loaded).toBe(true);
  });

  it('optimistic add then confirm keeps the cell', () => {
    let s = orgReducer(loaded(), { type: 'optimisticAdd', keys: [5], userId: 'me', at: 1 });
    expect(s.cells.get(5)?.userId).toBe('me');
    expect(s.pending.has(5)).toBe(true);
    s = orgReducer(s, { type: 'confirmAdd', keys: [5], inserted: [5], userId: 'me' });
    expect(s.cells.get(5)?.userId).toBe('me');
    expect(s.pending.has(5)).toBe(false);
  });

  it('optimistic add skips occupied cells', () => {
    let s = loaded();
    s = { ...s, cells: new Map([[5, { userId: 'other', at: 1 }]]) };
    s = orgReducer(s, { type: 'optimisticAdd', keys: [5, 6], userId: 'me', at: 2 });
    expect(s.cells.get(5)?.userId).toBe('other');
    expect(s.pending.has(5)).toBe(false);
    expect(s.cells.get(6)?.userId).toBe('me');
  });

  it('rejected add is reverted', () => {
    let s = orgReducer(loaded(), { type: 'optimisticAdd', keys: [5, 6], userId: 'me', at: 1 });
    s = orgReducer(s, { type: 'confirmAdd', keys: [5, 6], inserted: [6], userId: 'me' });
    expect(s.cells.has(5)).toBe(false);
    expect(s.cells.get(6)?.userId).toBe('me');
  });

  it('rejected add does not remove a remote owner that arrived meanwhile', () => {
    let s = orgReducer(loaded(), { type: 'optimisticAdd', keys: [5], userId: 'me', at: 1 });
    s = { ...s, cells: new Map(s.cells).set(5, { userId: 'other', at: 2 }) };
    s = orgReducer(s, { type: 'confirmAdd', keys: [5], inserted: [], userId: 'me' });
    expect(s.cells.get(5)?.userId).toBe('other');
  });

  it('optimistic remove only removes own cells and restores on failure', () => {
    let s = loaded();
    s = { ...s, cells: new Map([[1, { userId: 'me', at: 1 }], [2, { userId: 'other', at: 1 }]]) };
    s = orgReducer(s, { type: 'optimisticRemove', keys: [1, 2], userId: 'me' });
    expect(s.cells.has(1)).toBe(false);
    expect(s.cells.has(2)).toBe(true);
    s = orgReducer(s, { type: 'confirmRemove', keys: [1], removed: [] });
    expect(s.cells.get(1)?.userId).toBe('me');
  });

  it('remote events apply and bump the version', () => {
    let s = loaded();
    const v = s.version;
    s = orgReducer(s, { type: 'remoteAdded', cells: [[2, 3, 'x', 9]] });
    expect(s.cells.get(cellKey(2, 3))).toEqual({ userId: 'x', at: 9 });
    s = orgReducer(s, { type: 'remoteRemoved', keys: [cellKey(2, 3)] });
    expect(s.cells.has(cellKey(2, 3))).toBe(false);
    expect(s.version).toBe(v + 2);
  });

  it('remote confirmation of my own add clears pending', () => {
    let s = orgReducer(loaded(), { type: 'optimisticAdd', keys: [cellKey(1, 1)], userId: 'me', at: 1 });
    s = orgReducer(s, { type: 'remoteAdded', cells: [[1, 1, 'me', 5]] });
    expect(s.pending.has(cellKey(1, 1))).toBe(false);
    expect(s.cells.get(cellKey(1, 1))).toEqual({ userId: 'me', at: 5 });
  });

  it('activity upsert replaces by id and keeps order desc', () => {
    let s = orgReducer(loaded(), { type: 'activityUpserted', entry: entry(1) });
    s = orgReducer(s, { type: 'activityUpserted', entry: entry(2) });
    s = orgReducer(s, { type: 'activityUpserted', entry: entry(1, { count: 5 }) });
    expect(s.activity.map((a) => a.id)).toEqual([2, 1]);
    expect(s.activity[1].data.count).toBe(5);
  });

  it('activity pages append older entries without duplicates', () => {
    let s = orgReducer(loaded(), { type: 'activityUpserted', entry: entry(10) });
    s = orgReducer(s, { type: 'activityPage', entries: [entry(10), entry(9), entry(8)], done: true });
    expect(s.activity.map((a) => a.id)).toEqual([10, 9, 8]);
    expect(s.activityDone).toBe(true);
  });

  it('tracks members, pins, presence and org changes', () => {
    let s = orgReducer(loaded(), { type: 'memberChanged', member: { id: 'b', username: 'B', color: '#ffffff', joined_at: null } });
    expect(s.members.get('b')?.username).toBe('B');
    s = orgReducer(s, { type: 'memberRemoved', userId: 'b' });
    expect(s.members.has('b')).toBe(false);

    const pin = { id: 'p', org_id: 'o', user_id: 'me', px: 1, py: 2, icon: 'note', body: 'x', created_at: '', updated_at: '' };
    s = orgReducer(s, { type: 'pinUpserted', pin });
    expect(s.pins.get('p')?.body).toBe('x');
    s = orgReducer(s, { type: 'pinRemoved', id: 'p' });
    expect(s.pins.has('p')).toBe(false);

    s = orgReducer(s, { type: 'presence', online: ['me', 'b'] });
    expect([...s.online].sort()).toEqual(['b', 'me']);

    s = orgReducer(s, { type: 'orgChanged', org: { id: 'o', owner_id: 'b', is_public: true } });
    expect(s.org?.owner_id).toBe('b');
    expect(s.org?.channel_key).toBe('k');
  });
});
