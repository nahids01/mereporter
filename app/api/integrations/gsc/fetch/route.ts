import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getFullProject, last28Days } from '@/lib/integrations';
import { fetchGsc } from '@/lib/auto-fetch';

// POST /api/integrations/gsc/fetch { project_id } — manual trigger of the
// same shared fetch the daily + monthly crons run. Search Console totals,
// last 28 days, source=gsc, so the combined report picks them up
// automatically. Any failure stores nothing and returns the real error.
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
  try {
    const n = await fetchGsc(service, project);
    const { startDate, endDate } = last28Days();
    const site = (project.gsc_site_url ?? '').trim() || (project.website_url.endsWith('/') ? project.website_url : `${project.website_url}/`);
    return NextResponse.json({ ok: true, source: 'gsc', site, startDate, endDate, imported: n, imported_at: new Date().toISOString(), note: 'Live Search Console totals, last 28 days. These rows flow into the combined monthly report automatically.' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'GSC fetch failed.' }, { status: 400 });
  }
}
