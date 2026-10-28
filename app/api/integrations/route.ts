import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getFullProject } from '@/lib/integrations';
import { fetchDataForSEO } from '@/lib/auto-fetch';
import { isDataForSEOConfigured } from '@/lib/dataforseo';

// POST /api/integrations/dataforseo/run-all { project_id } — the one-click
// DataForSEO automation. ADMIN-ONLY: only the two initial admin emails may
// call it; a non-admin gets a generic 403 that names no provider, even for
// their own project. Automated cron auto-fetch (server-side, CRON_SECRET)
// still updates every user's ranks/grids, so normal users see results
// without ever seeing the provider. Requires a valid Supabase JWT and an
// approved profile, and the caller must own the project or be an admin
// (checked via getFullProject, which returns null for both missing and
// unauthorised projects). Runs ONLY the DataForSEO part of the shared
// auto-fetch for this project: every stored SERP keyword (1 search each) +
// every stored GBP keyword (one fixed 3x3 grid, 9 searches each). Ranks,
// grid snapshots and dataforseo_usage rows are written by the shared
// logic; nothing is fabricated, and a failed keyword stores nothing for
// that keyword. If the DataForSEO sign-in is not set, this returns 503
// "not connected" — never a fake success. No key value is ever returned
// or accepted here: credentials live only in server env vars (see the
// Integrations page).
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'This action is only available to admins.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const service = getServerSupabase();
  const project = await getFullProject(service, body?.project_id ?? '', auth.profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  if (!isDataForSEOConfigured()) {
    return NextResponse.json({
      ok: false,
      error: 'DataForSEO is not connected. The owner must add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the hosting (Vercel) env vars and redeploy — credentials are never typed into this app or stored in its database. Until then no live rank is checked and nothing is shown as connected.',
    }, { status: 503 });
  }
  try {
    const result = await fetchDataForSEO(service, project);
    return NextResponse.json({
      ok: true,
      project_id: project.id,
      serpChecked: result.serpChecked,
      gbpChecked: result.gbpChecked,
      searchesUsed: result.searchesUsed,
      failures: result.failures,
      checked_at: new Date().toISOString(),
      note: 'Full live check done: every stored search keyword checked once and every stored local keyword checked on a 3x3 grid. Ranks and grids are now in Keywords and GBP & Local, and the next report will include them automatically.',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'DataForSEO full check failed.' }, { status: 400 });
  }
}
