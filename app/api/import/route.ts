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
// PLUS the keyword CSV path: { project_id, source: 'csv', csv, kind?, mapping: {keyword, country?, language?, searchEngine?, device?} }
// (see the mapping branch in POST) — used by the Add Keywords CSV upload.
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

// Quoted-field CSV parser for the keyword-mapping path only: handles commas
// and double-quotes inside quoted cells. Returns rows of raw cell strings.
function parseCsvCells(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// Resolve one mapping entry to a column index: a number is a 0-based index,
// a string is matched case-insensitively against the header row. Returns -1
// when the entry is absent or matches nothing.
function resolveColumn(mappingValue: unknown, header: string[]): number {
  if (typeof mappingValue === 'number' && Number.isInteger(mappingValue)) {
    return mappingValue >= 0 && mappingValue < header.length ? mappingValue : -1;
  }
  if (typeof mappingValue === 'string' && mappingValue.trim()) {
    const want = mappingValue.trim().toLowerCase();
    const idx = header.findIndex((h) => h.trim().toLowerCase() === want);
    return idx;
  }
  return -1;
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

  // --- KEYWORD CSV PATH (only when an explicit column mapping is sent) ---
  // The Add Keywords "Upload CSV File" mapping step sends:
  //   { project_id, source: 'csv', csv, kind?: 'serp'|'gbp',
  //     mapping: { keyword, country?, language?, searchEngine?, device? } }
  // where each mapping value is a header name (matched case-insensitively)
  // or a 0-based column index. The first CSV row is the header. Rows are
  // inserted into the keywords table (kind from body.kind, default 'serp')
  // with rank null — no rank is ever invented. Country / language / search
  // engine / device are returned in `rows` exactly as mapped, but they are
  // NOT persisted: the keywords table has no columns for them yet, so a
  // future migration is needed before they can be stored. Existing
  // keywords (same project + kind + keyword) are skipped, never duplicated.
  if (typeof body.csv === 'string' && body.mapping && typeof body.mapping === 'object') {
    const kind = body.kind === 'gbp' ? 'gbp' : 'serp';
    const cells = parseCsvCells(body.csv);
    if (cells.length < 2) return NextResponse.json({ ok: false, error: 'CSV needs a header row plus at least one data row.' }, { status: 400 });
    const header = cells[0];
    const m = body.mapping as Record<string, unknown>;
    const colKeyword = resolveColumn(m.keyword, header);
    if (colKeyword === -1) return NextResponse.json({ ok: false, error: 'Mapping must point "keyword" at a column that exists in the CSV header.' }, { status: 400 });
    const colCountry = resolveColumn(m.country, header);
    const colLanguage = resolveColumn(m.language, header);
    const colEngine = resolveColumn(m.searchEngine, header);
    const colDevice = resolveColumn(m.device, header);
    const unmapped = (['country', 'language', 'searchEngine', 'device'] as const)
      .filter((k) => m[k] !== undefined && m[k] !== null && m[k] !== '' && resolveColumn(m[k], header) === -1);
    const seen = new Set<string>();
    const mapped: Array<{ keyword: string; country: string | null; language: string | null; searchEngine: string | null; device: string | null }> = [];
    let duplicates = 0;
    for (const r of cells.slice(1)) {
      const keyword = (r[colKeyword] ?? '').trim();
      if (!keyword) continue;
      if (seen.has(keyword)) { duplicates += 1; continue; }
      seen.add(keyword);
      const pick = (c: number) => (c === -1 ? null : ((r[c] ?? '').trim() || null));
      mapped.push({ keyword, country: pick(colCountry), language: pick(colLanguage), searchEngine: pick(colEngine), device: pick(colDevice) });
    }
    if (mapped.length === 0) return NextResponse.json({ ok: false, error: 'No keyword rows found in the CSV after mapping.' }, { status: 400 });
    if (mapped.length > 5000) return NextResponse.json({ ok: false, error: 'Too many rows (max 5000 per import).' }, { status: 400 });
    const { data: existingKw } = await supabase.from('keywords').select('keyword').eq('project_id', body.project_id).eq('kind', kind);
    const existingSet = new Set((existingKw ?? []).map((k) => k.keyword as string));
    const fresh = mapped.filter((r) => !existingSet.has(r.keyword));
    const skipped = mapped.length - fresh.length;
    if (fresh.length > 0) {
      const { error } = await supabase.from('keywords').insert(
        fresh.map((r) => ({ project_id: body.project_id, kind, keyword: r.keyword, rank: null, country: r.country, language: r.language, search_engine: r.searchEngine, device: r.device })),
      );
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true, source: 'csv', target: 'keywords', kind,
      imported: fresh.length, skipped, duplicates,
      rows: mapped.map((r) => ({ ...r, kind, status: existingSet.has(r.keyword) ? 'skipped-existing' : 'imported' })),
      unmappedColumns: unmapped,
      note: 'Only keyword + type were saved, with no rank (no-data until a live check or GSC import records one). Country, language, search engine and device are stored with each keyword (migration 0011).',
    });
  }

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
