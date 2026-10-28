import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { isInitialAdmin } from '@/lib/access';

// POST /api/profile/ensure
// Creates or repairs the caller's profiles row. This exists because the
// profiles table RLS has only a select policy ("own profile") and no
// insert/update policy, so a browser upsert silently fails, no profile row
// is ever created, and the dashboard then cannot load ("No profile found").
// This route verifies the caller's Supabase JWT with the anon client (the
// same pattern as lib/auth.ts), then upserts with the service-role client,
// which bypasses RLS. Role/status are derived ONLY from INITIAL_ADMIN_EMAILS
// in lib/access.ts — any client-supplied role is ignored (the request body
// is not read at all). An already-approved status is preserved and an
// approved user is never downgraded.
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json(
      { ok: false, error: 'Supabase server is not configured.' },
      { status: 503 },
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return NextResponse.json(
      { ok: false, error: 'Supabase is not configured.' },
      { status: 503 },
    );
  }
  const header = req.headers.get('authorization');
  const match = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  const token = match ? match[1].trim() : null;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Missing Authorization: Bearer <Supabase access token>.' },
      { status: 401 },
    );
  }
  const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { data, error: userError } = await anon.auth.getUser(token);
  const user = data?.user;
  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: 'Invalid or expired access token.' },
      { status: 401 },
    );
  }

  const service = getServerSupabase();
  const { data: existing } = await service
    .from('profiles')
    .select('id, email, role, status')
    .eq('id', user.id)
    .maybeSingle();

  const email = (user.email ?? existing?.email ?? '').toLowerCase();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: 'No email address on this account.' },
      { status: 400 },
    );
  }
  const admin = isInitialAdmin(email);
  let role: 'admin' | 'user';
  let status: 'pending' | 'approved' | 'rejected';
  if (admin) {
    // Initial admins are always admin/approved, including repairing a row
    // that was created pending or with the wrong role.
    role = 'admin';
    status = 'approved';
  } else if (existing && existing.status === 'approved') {
    // Preserve an already-approved status; never downgrade an approved user.
    role = 'user';
    status = 'approved';
  } else if (existing) {
    // Preserve a pending/rejected status; only an admin approval changes it.
    role = 'user';
    status = existing.status as 'pending' | 'rejected';
  } else {
    role = 'user';
    status = 'pending';
  }

  const { data: profile, error: upsertError } = await service
    .from('profiles')
    .upsert({ id: user.id, email, role, status })
    .select('id, email, role, status')
    .single();
  if (upsertError || !profile) {
    return NextResponse.json(
      { ok: false, error: upsertError?.message ?? 'Could not create your profile.' },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, profile });
}
