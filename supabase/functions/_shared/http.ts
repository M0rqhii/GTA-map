import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Browser origins allowed to call the functions. Requests without an Origin header (non-browser
// clients) are still subject to the key/JWT checks inside each function.
const ALLOWED_ORIGINS = new Set<string>([
  'https://gta-searchgrid.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@users.invalid`;
}

export function validPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 72;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Handles preflight, foreign origins and non-POST methods. Returns a response to send, or null to continue.
export function guard(req: Request): Response | null {
  const origin = req.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: 'forbidden' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
  return null;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isDuplicateUserError(message: string): boolean {
  return /already|exists|registered|duplicate|username_taken/i.test(message);
}

// Creates an activated nick+password account. The single-use registration token is consumed by the
// database trigger, which is the only way to get an activated profile.
export async function createActivatedUser(
  db: SupabaseClient,
  username: string,
  password: string,
): Promise<{ userId: string } | { error: 'username_taken' | 'server_error' }> {
  const { data: taken, error: takenError } = await db.rpc('svc_username_taken', { p_username: username });
  if (takenError) return { error: 'server_error' };
  if (taken) return { error: 'username_taken' };

  const { data: token, error: tokenError } = await db.rpc('svc_issue_registration_token', { p_username: username });
  if (tokenError || typeof token !== 'string') return { error: 'server_error' };

  const { data, error } = await db.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username, reg_token: token },
  });
  if (error || !data.user) {
    if (error && isDuplicateUserError(error.message)) return { error: 'username_taken' };
    console.error('createUser failed', error?.message);
    return { error: 'server_error' };
  }
  await db.auth.admin.updateUserById(data.user.id, { user_metadata: { reg_token: null } });
  return { userId: data.user.id };
}
