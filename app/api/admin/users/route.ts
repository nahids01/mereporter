import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { isInitialAdmin } from '@/lib/access';
// Admin-only user management. Actions: approve, reject, revoke (revoke returns the
// account to pending, removing access without deleting it). Admin promotion is
// FORBIDDEN here: the effective role is always derived from lib/access.ts — only
// the two initial admin emails are admins, and any caller-supplied role field is ignored.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.profile.role !== 'admin') return NextResponse.json({ ok: false, error: 'Admin only.' }, { status: 403 });
  const supabase = getServerSupabase();
  const { data } = await supabase.from('profiles').select('id, email, role, status, created_at').order('created_at');
  const users = (data ?? []).map((u: { email: string }) => ({ ...u, effective_role: isInitialAdmin(u.email) ? 'admin' : 'user' }));
  return NextResponse.json({ ok: true, users });
}
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.profile.role !== 'admin') return NextResponse.json({ ok: false, error: 'Admin only.' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (!body?.user_id || !['approve', 'reject', 'revoke'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'user_id and action (approve, reject, revoke) are required.' }, { status: 400 });
  }
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
  const supabase = getServerSupabase();
  const { data: target } = await supabase.from('profiles').select('id, email').eq('id', body.user_id).single();
  if (!target) return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
  // Role is never taken from the request: it stays derived from the email list.
  const role = isInitialAdmin(target.email) ? 'admin' : 'user';
  const { data, error } = await supabase.from('profiles').update({ status, role }).eq('id', body.user_id).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, user: { ...data, effective_role: role }, note: 'Role was not promoted by this request: only the two initial admin emails in lib/access.ts are admins.' });
}
