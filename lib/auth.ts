import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/server';
import { isInitialAdmin, type Profile } from '@/lib/access';

// Server-side caller authentication for API routes.
// The service-role client in lib/server.ts bypasses RLS, so it must NEVER be
// used for a user-scoped read/write without the manual checks in this file.
// JWT verification uses the publishable (anon) client: the token comes from
// the caller, is verified against Supabase Auth, and is never trusted blindly.

export type EffectiveProfile = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'approved';
};

export type AuthFailure = { ok: false; status: number; error: string };
export type AuthSuccess = { ok: true; profile: EffectiveProfile };

function getBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export async function authenticateRequest(req: Request): Promise<AuthSuccess | AuthFailure> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization: Bearer <Supabase access token>.' };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return { ok: false, status: 503, error: 'Supabase is not configured.' };
  }
  // Verify the JWT with Supabase Auth (anon client). This rejects expired,
  // forged, or revoked tokens; a token alone never grants access.
  const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    return { ok: false, status: 401, error: 'Invalid or expired access token.' };
  }
  // Load the caller's profile with the service client, then enforce the
  // access model in code. Admin status is authoritative ONLY from the
  // initial-admin email list in lib/access.ts: a stored role of 'admin'
  // for any other email is downgraded to 'user' here.
  const service = getServerSupabase();
  const { data: row, error: profileError } = await service
    .from('profiles')
    .select('id, email, role, status')
    .eq('id', user.id)
    .single();
  if (profileError || !row) {
    return { ok: false, status: 403, error: 'No approved profile for this account.' };
  }
  const profile = row as Profile;
  if (profile.status !== 'approved') {
    return { ok: false, status: 403, error: 'Account is not approved.' };
  }
  const email = (user.email ?? profile.email ?? '').toLowerCase();
  const role: 'admin' | 'user' = isInitialAdmin(email) ? 'admin' : 'user';
  return { ok: true, profile: { id: user.id, email, role, status: 'approved' } };
}

export function canViewProject(profile: EffectiveProfile, projectOwnerId: string): boolean {
  if (profile.role === 'admin') return true;
  return profile.id === projectOwnerId;
}
