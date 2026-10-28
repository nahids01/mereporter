import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getFullProject } from '@/lib/integrations';
import { fetchGa4 } from '@/lib/auto-fetch';

// POST /api/integrations/ga4/fetch { project_id } — manual trigger of the
// same shared fetch the daily + monthly crons run. GA4 totals, last 28 days,
// source=ga4, so the combined report picks them up automatically. Any
// failure stores nothing and returns the real error.
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
    const n = await fetchGa4(service, project);
    const property = (project.ga4_property_id ?? '').trim().replace(/^properties\//, '');
    return NextResponse.json({ ok: true, source: 'ga4', property_id: property, imported: n, imported_at: new Date().toISOString(), note: 'Live GA4 totals, last 28 days. These rows flow into the combined monthly report automatically.' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'GA4 fetch failed.' }, { status: 400 });
  }
}
