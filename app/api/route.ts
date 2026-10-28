import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getFullProject } from '@/lib/integrations';

// POST /api/integrations/project-settings { project_id, gsc_site_url?, ga4_property_id?, bing_site_url? }
// Only the fields present in the body are updated, on a project the caller
// owns (or an admin project). Empty string clears a field. These settings
// are what the GSC/GA4/Bing fetch routes read — no key values are involved.
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  const service = getServerSupabase();
  const project = await getFullProject(service, body?.project_id ?? '', auth.profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const patch: Record<string, string | null> = {};
  for (const key of ['gsc_site_url', 'ga4_property_id', 'bing_site_url'] as const) {
    if (body?.[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].length > 500) {
      return NextResponse.json({ ok: false, error: `${key} must be a short text value.` }, { status: 400 });
    }
    patch[key] = body[key].trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update. Send at least one of gsc_site_url, ga4_property_id, bing_site_url.' }, { status: 400 });
  }
  const { error } = await service.from('projects').update(patch).eq('id', project.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, updated: patch });
}
