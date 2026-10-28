import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';

// POST /api/projects — hardened.
// - Requires a valid Supabase JWT in `Authorization: Bearer <access token>`.
// - Requires an approved profile; pending/rejected callers get 403.
// - NEVER trusts a caller-supplied owner_id: the created project is always
//   owned by the authenticated caller. This closes impersonation even for
//   admins (an admin creates their own projects here; viewing all projects
//   is a separate, admin-gated read, not an owner override).
// - Returns only the created project row; project rows contain no key values.
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.website_url) {
    return NextResponse.json({ ok: false, error: 'name and website_url are required.' }, { status: 400 });
  }
  // Deliberately ignore body.owner_id, even if supplied.
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from('projects').insert({
    owner_id: auth.profile.id,
    name: body.name,
    website_url: body.website_url,
    location: body.location ?? null,
  }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, project: data });
}
