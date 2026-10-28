import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
// Admin-only, server-side route using SUPABASE_SECRET_KEY (never exposed to the
// browser). This fixes the admin dashboard list RLS limitation: the browser anon
// client can only see an admin's OWN projects under RLS, so admins must list all
// projects through this route. Non-admins get 403. No key value is returned.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.profile.role !== 'admin') return NextResponse.json({ ok: false, error: 'Admin only.' }, { status: 403 });
  const supabase = getServerSupabase();
  const [{ data: projects }, { data: profiles }] = await Promise.all([
    supabase.from('projects').select('id, owner_id, name, website_url, location, created_at').order('created_at'),
    supabase.from('profiles').select('id, email, role, status, created_at').order('created_at'),
  ]);
  const byId = new Map((profiles ?? []).map((p: { id: string }) => [p.id, p]));
  const enriched = (projects ?? []).map((p: { owner_id: string }) => ({ ...p, owner_email: (byId.get(p.owner_id) as { email?: string } | undefined)?.email ?? null }));
  return NextResponse.json({ ok: true, projects: enriched, userCount: profiles?.length ?? 0 });
}
