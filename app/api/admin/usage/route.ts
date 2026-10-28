import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';

// GET /api/admin/usage — admin only (the two admin emails in lib/access.ts).
// Returns ONLY counts from dataforseo_usage for the current Europe/London
// month: total searches, SERP vs GBP split, and per-project totals with
// project names. No key values, no API responses, no other users' details
// beyond the project names admins already see in /api/admin/projects.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only.' }, { status: 403 });
  }
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const from = `${month}-01T00:00:00Z`;
  const service = getServerSupabase();
  const { data: rows } = await service.from('dataforseo_usage')
    .select('project_id, kind, searches, created_at').gte('created_at', from).limit(10000);
  const { data: projects } = await service.from('projects').select('id, name');
  const names = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]));
  const perProject = new Map<string, { project_id: string; name: string; searches: number; serp: number; gbp: number }>();
  let total = 0; let serp = 0; let gbp = 0;
  for (const r of rows ?? []) {
    const s = Number(r.searches) || 0;
    total += s;
    if (r.kind === 'serp') serp += s; else if (r.kind === 'gbp') gbp += s;
    const entry = perProject.get(r.project_id) ?? { project_id: r.project_id, name: names.get(r.project_id) ?? r.project_id, searches: 0, serp: 0, gbp: 0 };
    entry.searches += s;
    if (r.kind === 'serp') entry.serp += s; else if (r.kind === 'gbp') entry.gbp += s;
    perProject.set(r.project_id, entry);
  }
  return NextResponse.json({
    ok: true, month, totalSearches: total, serpSearches: serp, gbpSearches: gbp,
    perProject: [...perProject.values()].sort((a, b) => b.searches - a.searches),
    note: 'Counts of completed DataForSEO searches only (SERP = 1 per keyword, GBP grid = 9 per keyword, 3x3). Failed calls log nothing and store no rank.',
  });
}
