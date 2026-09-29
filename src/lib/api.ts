// Every call to the backend goes through this module.
import { FunctionsHttpError, isAuthApiError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { cellKey, keyToCell } from './grid';
import { usernameToEmail } from './validation';
import type { ActivityEntry } from './format';
import { decodeOrgCells, type Member, type OrgInfo, type Pin, type RemoteCell } from '../state/orgReducer';

export type Me = {
  id: string; username: string; org_id: string | null; color: string | null;
  joined_at: string | null; activated: boolean; is_superadmin: boolean;
};
export type PublicOrg = { id: string; name: string; delay: number };
export type AdminOrg = {
  id: string; name: string; owner_id: string | null; owner_name: string | null; member_count: number;
  cell_count: number; pin_count: number; is_public: boolean; public_delay_minutes: number; created_at: string;
};
export type AdminUser = {
  id: string; username: string; org_id: string | null; org_name: string | null; color: string | null;
  activated: boolean; is_superadmin: boolean; created_at: string; last_sign_in_at: string | null;
};
export type AccessPath = { kind: 'login' | 'register'; path: string; rotated_at: string };

const ACTIVITY_PAGE = 50;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function keysToFlat(keys: number[]): number[] {
  return keys.flatMap((k) => {
    const { x, y } = keyToCell(k);
    return [x, y];
  });
}

function pairsToKeys(pairs: [number, number][]): number[] {
  return pairs.map(([x, y]) => cellKey(x, y));
}

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'server_error');
    }
    throw new Error('server_error');
  }
  return data as T;
}

// --- auth -------------------------------------------------------------------
export async function signIn(username: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) throw new Error(error.message);
}

export async function signInDiscord(redirectTo: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// True only when the auth server rejects the saved login's user (e.g. the account was deleted by a superadmin).
export async function accountGone(): Promise<boolean> {
  const { error } = await supabase.auth.getUser();
  return isAuthApiError(error) && (error.status === 401 || error.status === 403);
}

export function register(key: string, username: string, password: string): Promise<{ ok: true }> {
  return invokeFunction('register', { key, username, password });
}

// --- public -----------------------------------------------------------------
export async function resolveAccessPath(path: string): Promise<'login' | 'register' | null> {
  return rpc<'login' | 'register' | null>('resolve_access_path', { p_path: path });
}

export async function publicListOrgs(): Promise<PublicOrg[]> {
  return (await rpc<PublicOrg[] | null>('public_list_orgs')) ?? [];
}

export async function publicGetCells(orgId: string): Promise<number[] | null> {
  const flat = await rpc<number[] | null>('public_get_cells', { p_org: orgId });
  if (!flat) return null;
  const keys: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) keys.push(cellKey(flat[i], flat[i + 1]));
  return keys;
}

// --- account ----------------------------------------------------------------
export async function getMe(): Promise<Me | null> {
  const rows = await rpc<Me[]>('get_me');
  return rows?.[0] ?? null;
}

export const activateAccount = (key: string) => rpc<boolean>('activate_account', { p_key: key });
export const createOrg = (name: string) => rpc<string>('create_org', { p_name: name });
export const joinOrg = (code: string) => rpc<'ok' | 'invalid_code' | 'already_in_org'>('join_org', { p_code: code });
export const leaveOrg = () => rpc<void>('leave_org');
export const setColor = (color: string) => rpc<void>('set_color', { p_color: color });

// --- org data ---------------------------------------------------------------
export async function fetchOrg(orgId: string): Promise<OrgInfo> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, owner_id, is_public, public_delay_minutes, channel_key')
    .eq('id', orgId)
    .single();
  if (error) throw new Error(error.message);
  return data as OrgInfo;
}

export async function fetchMembers(orgId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, color, joined_at')
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Member[];
}

export async function fetchPins(orgId: string): Promise<Pin[]> {
  const { data, error } = await supabase.from('pins').select('*').eq('org_id', orgId).limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Pin[];
}

export async function fetchActivity(orgId: string, beforeId?: number, actorId?: string): Promise<{ entries: ActivityEntry[]; done: boolean }> {
  let q = supabase
    .from('activity')
    .select('id, actor_id, actor_name, actor_is_superadmin, kind, data, created_at, updated_at')
    .eq('org_id', orgId)
    .order('id', { ascending: false })
    .limit(ACTIVITY_PAGE);
  if (beforeId !== undefined) q = q.lt('id', beforeId);
  if (actorId) q = q.eq('actor_id', actorId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const entries = (data ?? []) as ActivityEntry[];
  return { entries, done: entries.length < ACTIVITY_PAGE };
}

export async function getOrgCells(orgId: string): Promise<RemoteCell[]> {
  const payload = await rpc<{ users: string[]; cells: number[] }>('get_org_cells', { p_org: orgId });
  return decodeOrgCells(payload);
}

export async function markCells(keys: number[]): Promise<number[]> {
  return pairsToKeys(await rpc<[number, number][]>('mark_cells', { p_cells: keysToFlat(keys) }));
}

export async function unmarkCells(keys: number[]): Promise<number[]> {
  return pairsToKeys(await rpc<[number, number][]>('unmark_cells', { p_cells: keysToFlat(keys) }));
}

export const addPin = (px: number, py: number, icon: string, body: string) =>
  rpc<string>('add_pin', { p_px: px, p_py: py, p_icon: icon, p_body: body });
export const updatePin = (id: string, icon: string, body: string) =>
  rpc<void>('update_pin', { p_id: id, p_icon: icon, p_body: body });
export const deletePin = (id: string) => rpc<void>('delete_pin', { p_id: id });

// --- owner ------------------------------------------------------------------
export const getInviteCode = (orgId: string) => rpc<string>('get_invite_code', { p_org: orgId });
export const regenerateInvite = () => rpc<string>('regenerate_invite');
export const kickMember = (userId: string) => rpc<void>('kick_member', { p_user: userId });
export const clearMap = () => rpc<number>('clear_map');
export const setOrgPublic = (isPublic: boolean, delay: number) =>
  rpc<void>('set_org_public', { p_public: isPublic, p_delay: delay });

// --- superadmin -------------------------------------------------------------
export const adminListOrgs = () => rpc<AdminOrg[]>('admin_list_orgs');
export const adminListUsers = () => rpc<AdminUser[]>('admin_list_users');
export const adminCreateOrg = (name: string, ownerId: string | null) =>
  rpc<string>('admin_create_org', { p_name: name, p_owner: ownerId });
export const adminSetOwner = (orgId: string, userId: string) => rpc<void>('admin_set_owner', { p_org: orgId, p_user: userId });
export const adminDeleteOrg = (orgId: string) => rpc<void>('admin_delete_org', { p_org: orgId });
export const adminMoveUser = (userId: string, orgId: string | null) => rpc<void>('admin_move_user', { p_user: userId, p_org: orgId });
export const adminClearMap = (orgId: string) => rpc<number>('admin_clear_map', { p_org: orgId });
export const adminSetOrgPublic = (orgId: string, isPublic: boolean, delay: number) =>
  rpc<void>('admin_set_org_public', { p_org: orgId, p_public: isPublic, p_delay: delay });
export const adminSetSuperadmin = (userId: string, value: boolean) =>
  rpc<void>('admin_set_superadmin', { p_user: userId, p_value: value });
export const adminSetActivated = (userId: string, value: boolean) =>
  rpc<void>('admin_set_activated', { p_user: userId, p_value: value });
export const adminGetAccessPaths = () => rpc<AccessPath[]>('admin_get_access_paths');
export const adminRotateAccessPath = (kind: 'login' | 'register') => rpc<string>('admin_rotate_access_path', { p_kind: kind });

export const adminCreateUser = (username: string, password: string, orgId: string | null) =>
  invokeFunction<{ ok: true; user_id: string }>('admin-users', { action: 'create_user', username, password, org_id: orgId });
export const adminResetPassword = (userId: string, password: string) =>
  invokeFunction<{ ok: true }>('admin-users', { action: 'reset_password', user_id: userId, password });
export const adminDeleteUser = (userId: string) =>
  invokeFunction<{ ok: true }>('admin-users', { action: 'delete_user', user_id: userId });
