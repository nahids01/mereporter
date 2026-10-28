import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

// CSV / JSON import for GSC, GA4 and Bing. Every stored row carries its source and
// imported_at date. This is the free authentic fallback until live OAuth sync exists:
// imported rows are labelled as imported, never presented as a live sync.
// Accepts: { project_id, source, rows: [{metric, value}] } OR { project_id, source, csv: 'metric,value\n...' }
const SOURCES = ['gsc', 'ga4', 'bing', 'csv'] as const;
function parseCsv(csv: string): Array<{ metric: string; value: number | null }> {
  const lines = csv.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean);
  const rows: Array<{ metric: string; value: number | null }> = [];
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2 || /^metric$/i.test(parts[0])) continue;
    const v = Number(parts[1]);
    rows.push({ metric: parts[0], value: Number.isFinite(v) ? v : null });
  }
  return rows;
}
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  const source = body?.source;
  if (!body?.project_id || !SOURCES.includes(source)) return NextResponse.json({ ok: false, error: 'project_id and a valid source (gsc, ga4, bing, csv) are required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  let rows: Array<{ metric: string; value: number | null }> = [];
  if (typeof body.csv === 'string') rows = parseCsv(body.csv);
  else if (Array.isArray(body.rows)) rows = body.rows.filter((r: { metric?: unknown }) => typeof r?.metric === 'string').map((r: { metric: string; value?: unknown }) => ({ metric: r.metric, value: typeof r.value === 'number' ? r.value : null }));
  if (rows.length === 0) return NextResponse.json({ ok: false, error: 'No importable rows found. Send rows[] or a metric,value CSV.' }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ ok: false, error: 'Too many rows (max 5000 per import).' }, { status: 400 });
  const importedAt = new Date().toISOString();
  const toInsert = rows.map((r) => ({ project_id: body.project_id, source, metric: r.metric, value: r.value, imported_at: importedAt }));
  const { error } = await supabase.from('metric_imports').insert(toInsert);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, source, imported: rows.length, imported_at: importedAt, note: 'Imported rows only — this is not a live GSC/GA4/Bing sync. Each row stores its source and import date.' });
}
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data } = await supabase.from('metric_imports').select('*').eq('project_id', projectId).order('imported_at', { ascending: false }).limit(500);
  return NextResponse.json({ ok: true, imports: data ?? [] });
}
