import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getFullProject, last28Days, googleErrorMessage } from '@/lib/integrations';
import { getValidGoogleToken } from '@/lib/google';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }

// POST /api/integrations/gsc/import { project_id, property?, keywords?, preview? }
// JWT + project ownership are checked (missing/unauthorised projects return
// the same 404, so ownership cannot be probed).
//
// Two modes, both storing ONLY real Search Console values — never invented:
//  1. keywords[] supplied: [{ keyword, position, clicks, impressions, ctr }]
//     — e.g. rows the user ticked in the Add Keywords "Import from Search
//     Console" dialog. Each keyword is upserted (kind 'serp') with its GSC
//     position, rounded to the integer rank column, as the initial recorded
//     rank, plus a ranking_snapshots row with source 'gsc'.
//  2. keywords omitted: the picked property (body.property, else the
//     project's saved GSC property, else the project URL) is queried live
//     via the stored Google OAuth token — searchAnalytics, dimension query,
//     last 28 days — and every returned query is imported the same way.
//     With preview:true nothing is stored; the live GSC rows are returned
//     so the dialog can offer Import selected / Import all first.
// Per-keyword clicks/impressions/ctr have no storage table in this schema,
// so they are returned in the response, not persisted or presented as
// stored metrics. Only keyword + rank (+ snapshot) are saved.
type GscRow = { keyword: string; position: number | null; clicks: number | null; impressions: number | null; ctr: number | null };

function toNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normaliseRows(input: unknown): GscRow[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: GscRow[] = [];
  for (const r of input as Array<Record<string, unknown>>) {
    const keyword = typeof r?.keyword === 'string' ? r.keyword.trim() : '';
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push({
      keyword,
      position: toNum(r?.position),
      clicks: toNum(r?.clicks),
      impressions: toNum(r?.impressions),
      ctr: toNum(r?.ctr),
    });
  }
  return out;
}

async function fetchGscQueries(service: ReturnType<typeof getServerSupabase>, projectId: string, property: string): Promise<GscRow[]> {
  const token = await getValidGoogleToken(service, projectId, 'gsc');
  const { startDate, endDate } = last28Days();
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 1000 }),
    },
  );
  const json = await res.json().catch(() => ({})) as {
    rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
  };
  if (!res.ok) throw new Error(googleErrorMessage(json, res.status));
  const rows: GscRow[] = [];
  for (const r of json.rows ?? []) {
    const keyword = (r.keys?.[0] ?? '').trim();
    if (!keyword) continue;
    rows.push({
      keyword,
      position: typeof r.position === 'number' ? r.position : null,
      clicks: typeof r.clicks === 'number' ? r.clicks : null,
      impressions: typeof r.impressions === 'number' ? r.impressions : null,
      ctr: typeof r.ctr === 'number' ? r.ctr : null,
    });
  }
  return rows;
}

export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  const service = getServerSupabase();
  const project = await getFullProject(service, body?.project_id ?? '', auth.profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });

  const property = (typeof body?.property === 'string' && body.property.trim())
    || (project.gsc_site_url ?? '').trim()
    || (project.website_url.endsWith('/') ? project.website_url : `${project.website_url}/`);

  let rows: GscRow[];
  let fetchedLive = false;
  try {
    if (Array.isArray(body?.keywords)) {
      rows = normaliseRows(body.keywords);
    } else {
      rows = await fetchGscQueries(service, project.id, property);
      fetchedLive = true;
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Search Console import failed.' }, { status: 400 });
  }

  if (body?.preview === true) {
    return NextResponse.json({
      ok: true, preview: true, property, fetchedLive, rows,
      note: 'Preview only — nothing was stored. Send these rows back as keywords[] to import them.',
    });
  }
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: 'No Search Console queries found for this property/period. Check the property is verified and the picked property matches it.' }, { status: 400 });
  }
  if (rows.length > 5000) return NextResponse.json({ ok: false, error: 'Too many rows (max 5000 per import).' }, { status: 400 });

  const { data: existing } = await service.from('keywords').select('id, keyword').eq('project_id', project.id).eq('kind', 'serp');
  const byKeyword = new Map<string, string>();
  for (const kw of existing ?? []) byKeyword.set(kw.keyword as string, kw.id as string);

  const checkedAt = new Date().toISOString();
  let created = 0; let updated = 0;
  const stored: GscRow[] = [];
  for (const row of rows) {
    const rank = row.position === null ? null : Math.round(row.position);
    const existingId = byKeyword.get(row.keyword);
    if (existingId) {
      const { error } = await service.from('keywords').update({ rank, checked_at: checkedAt }).eq('id', existingId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      updated += 1;
    } else {
      const ins = await service.from('keywords').insert({ project_id: project.id, kind: 'serp', keyword: row.keyword, rank, checked_at: checkedAt }).select('id').single();
      if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 400 });
      byKeyword.set(row.keyword, ins.data.id as string);
      created += 1;
    }
    await service.from('ranking_snapshots').insert({
      project_id: project.id, keyword_id: byKeyword.get(row.keyword), keyword: row.keyword,
      kind: 'serp', rank, source: 'gsc', checked_at: checkedAt,
    });
    stored.push({ ...row, position: row.position });
  }
  return NextResponse.json({
    ok: true, property, fetchedLive, imported: rows.length, created, updated, rows: stored,
    note: 'Imported from Search Console: each keyword keeps its GSC average position (rounded) as its initial recorded rank. Clicks, impressions and CTR were returned above but are not stored per keyword — no per-keyword stats table exists yet.',
  });
}
