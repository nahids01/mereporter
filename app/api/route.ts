import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { autoFetchProject, getFullProjectById } from '@/lib/auto-fetch';

// GET /api/cron/fetch — daily auto-fetch, scheduler-only (CRON_SECRET).
// Runs the shared auto-fetch for EVERY project: connected Google (GSC/GA4),
// Bing (key set), and DataForSEO SERP/GBP (key set, stored keywords only).
// A failed source stores nothing for that source and is logged in the
// per-project failures; it never blocks the other sources or projects.
// This route does NOT generate reports — that is /api/cron/monthly, which
// runs this same fetch first and then builds reports from the fresh data.
export async function GET(req: NextRequest) {
  const gate = checkCronSecret(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const service = getServerSupabase();
  const { data: projects } = await service.from('projects').select('id, name');
  const results: Array<{ project_id: string; name: string; fetched: string[]; failures: string[]; skipped: string[] }> = [];
  for (const p of projects ?? []) {
    const full = await getFullProjectById(service, p.id);
    if (!full) { results.push({ project_id: p.id, name: p.name, fetched: [], failures: ['Project could not be loaded.'], skipped: [] }); continue; }
    const r = await autoFetchProject(service, full);
    results.push({ project_id: p.id, name: p.name, ...r });
  }
  return NextResponse.json({ ok: true, projects: results.length, results });
}
