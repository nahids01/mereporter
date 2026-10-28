import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getFullProject } from '@/lib/integrations';
import { fetchBing } from '@/lib/auto-fetch';

// POST /api/integrations/bing/fetch { project_id } — manual trigger of the
// same shared fetch the daily + monthly crons run. Bing Webmaster totals,
// source=bing, so the combined report picks them up automatically. The API
// key is server-side only and never returned. Any failure stores nothing
// and returns the real error.
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
  if (!process.env.BING_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Bing is not configured. Owner: set BING_API_KEY in Vercel env vars (key from Bing Webmaster Tools → Settings → API Access), redeploy, then fetch again.' }, { status: 503 });
  }
  try {
    const n = await fetchBing(service, project);
    const site = (project.bing_site_url ?? '').trim() || project.website_url;
    return NextResponse.json({ ok: true, source: 'bing', site, imported: n, imported_at: new Date().toISOString(), note: 'Live Bing Webmaster rank & traffic totals (weekly rows summed). These rows flow into the combined monthly report automatically.' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Bing fetch failed.' }, { status: 400 });
  }
}
