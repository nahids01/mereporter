import { NextRequest, NextResponse } from 'next/server';
import { getOwnedProject } from '@/lib/project-access';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest, canViewProject } from '@/lib/auth';
import { buildMonthlyReport } from '@/lib/report';

// Builder field allow-lists. Anything outside these is dropped, never stored
// verbatim, so a crafted request cannot smuggle an arbitrary element,
// template, schedule or format into report_json.
const TEMPLATES = ['basic', 'progress', 'competitor'] as const;
const FORMATS = ['pdf', 'csv', 'html'] as const;
const ELEMENTS = ['keyword-overview', 'keyword-list', 'traffic-overview', 'graph', 'compare-periods'] as const;
const FREQUENCIES = ['weekly', 'monthly'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

type BuilderInput = {
  report_name: string;
  template: string;
  format: string;
  elements: string[];
  schedule: { enabled: boolean; frequency: string; day: string; time: string; recipients: string[] };
  date_range: { start: string; end: string } | null;
  logo: string;
};

function normaliseTemplate(v: unknown): string {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('progress')) return 'progress';
  if (s.includes('competitor')) return 'competitor';
  return 'basic';
}

function normaliseFormat(v: unknown): string {
  const s = String(v ?? '').toLowerCase();
  return (FORMATS as readonly string[]).includes(s) ? s : 'pdf';
}

function normaliseElements(v: unknown): string[] {
  if (!Array.isArray(v)) return ['keyword-overview', 'keyword-list'];
  const kept = v.map(String).filter((e) => (ELEMENTS as readonly string[]).includes(e));
  // De-dupe, preserving order.
  return [...new Set(kept)].slice(0, ELEMENTS.length);
}

function normaliseSchedule(v: unknown): BuilderInput['schedule'] {
  const base = { enabled: false, frequency: 'weekly', day: 'Monday', time: '09:00', recipients: [] as string[] };
  if (!v || typeof v !== 'object') return base;
  const o = v as Record<string, unknown>;
  const time = String(o.time ?? '09:00');
  const recipients = Array.isArray(o.recipients)
    ? [...new Set(o.recipients.map(String).map((r) => r.trim()).filter((r) => r.includes('@')))].slice(0, 50)
    : [];
  return {
    enabled: o.enabled === true,
    frequency: (FREQUENCIES as readonly string[]).includes(String(o.frequency)) ? String(o.frequency) : 'weekly',
    day: (DAYS as readonly string[]).includes(String(o.day)) ? String(o.day) : 'Monday',
    time: /^\d{2}:\d{2}$/.test(time) ? time : '09:00',
    recipients,
  };
}

function normaliseDateRange(v: unknown): BuilderInput['date_range'] {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const start = String(o.start ?? '');
  const end = String(o.end ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return { start, end };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const params = new URL(req.url).searchParams;
  const supabase = getServerSupabase();

  // GET ?id= — one stored report, for opening it in the builder. Ownership
  // is checked through the report's own project, so a missing report and an
  // unauthorised report both return 404 (no probing).
  const reportId = params.get('id') ?? '';
  if (reportId) {
    const { data: row } = await supabase.from('reports').select('*').eq('id', reportId).single();
    if (!row) return NextResponse.json({ ok: false, error: 'Report not found.' }, { status: 404 });
    const project = await getOwnedProject(supabase, String(row.project_id), auth.profile);
    if (!project) return NextResponse.json({ ok: false, error: 'Report not found.' }, { status: 404 });
    return NextResponse.json({ ok: true, report: row, project });
  }

  const projectId = params.get('project_id') ?? '';
  const project = await getOwnedProject(supabase, projectId, auth.profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });

  // GET ?export=csv&project_id=&month= — the project's keyword table as CSV.
  // SERP and GBP stay separate via the KIND column (SERP rows first).
  // The keywords table has no month column, so `month` is only used for the
  // download filename; the CSV is the current stored table, not a
  // month-filtered reconstruction, and nothing is estimated. A rank of ""
  // means no data (never checked / not found), not rank 0.
  if (params.get('export') === 'csv') {
    const month = params.get('month') ?? '';
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: 'month must be YYYY-MM when supplied.' }, { status: 400 });
    }
    const [{ data: keywords }, { data: snapshots }] = await Promise.all([
      supabase.from('keywords').select('*').eq('project_id', projectId).order('keyword'),
      supabase.from('ranking_snapshots').select('*').eq('project_id', projectId).order('checked_at', { ascending: false }).limit(500),
    ]);
    // Previous numeric rank per keyword (latest snapshot before the newest
    // one for that keyword), for the LAST CHANGE column.
    const byKey = new Map<string, { rank: number; checked_at: string }[]>();
    for (const s of snapshots ?? []) {
      const rank = typeof s.rank === 'number' ? s.rank : null;
      if (rank === null) continue;
      const key = `${s.kind}::${s.keyword}`;
      const list = byKey.get(key) ?? [];
      list.push({ rank, checked_at: String(s.checked_at ?? '') });
      byKey.set(key, list);
    }
    const rows = (keywords ?? []).slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'serp' ? -1 : 1;
      return String(a.keyword).localeCompare(String(b.keyword));
    });
    const lines = ['KIND,KEYWORD,RANK,PREVIOUS RANK,LAST CHANGE,LAST CHECKED'];
    for (const k of rows) {
      const hist = byKey.get(`${k.kind}::${k.keyword}`) ?? [];
      const latest = hist[0];
      const prev = hist[1];
      const lastChange = latest && prev ? latest.rank - prev.rank : null;
      lines.push([
        csvCell(k.kind), csvCell(k.keyword),
        csvCell(typeof k.rank === 'number' ? k.rank : ''),
        csvCell(prev ? prev.rank : ''),
        csvCell(lastChange === null ? '' : lastChange),
        csvCell(k.checked_at ?? ''),
      ].join(','));
    }
    const filename = month ? `report-${month}.csv` : 'report-keywords.csv';
    return new NextResponse(lines.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const { data } = await supabase.from('reports').select('*').eq('project_id', projectId).order('month', { ascending: false });
  return NextResponse.json({ ok: true, reports: data ?? [] });
}

// POST /api/report — hardened, draft-only.
// - Requires a valid Supabase JWT and an approved profile (see lib/auth.ts).
// - The project is fetched first and the caller must own it or be an admin
//   (admin = one of the two emails in lib/access.ts only). A missing project
//   and an unauthorised project both return 404, so ownership cannot be
//   probed by enumeration.
// - Builds a monthly report ONLY from stored rows. No live SERP/GBP fetch is
//   attempted here: without a SERP key, live checks honestly return no-data.
// - Builder fields (template, format, elements, schedule, report name, date
//   range, logo) are sanitised above and stored inside report_json.builder.
//   They change what the saved report describes, never the underlying data.
// - Email sending is not attempted here: there is no verified sender
//   configured for this endpoint, so status stays draft and is never marked
//   sent. No key value is ever returned.
// - NOTE: reports has a unique (project_id, month) constraint, so saving a
//   second builder report for the same project and month overwrites (upserts)
//   the first. The builder UI says this plainly.
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  if (!body?.project_id || !body?.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ ok: false, error: 'project_id and month (YYYY-MM) are required.' }, { status: 400 });
  }
  const supabase = getServerSupabase();
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, website_url')
    .eq('id', body.project_id)
    .single();
  if (!project || !canViewProject(auth.profile, project.owner_id)) {
    return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  }
  const builder: BuilderInput = {
    report_name: String(body.report_name ?? '').trim().slice(0, 200)
      || `Report for ${project.website_url}`,
    template: normaliseTemplate(body.template),
    format: normaliseFormat(body.format),
    elements: body.elements !== undefined ? normaliseElements(body.elements) : ['keyword-overview', 'keyword-list'],
    schedule: normaliseSchedule(body.schedule),
    date_range: normaliseDateRange(body.date_range),
    // A logo upload is stored only as a short marker or a small data URL
    // (capped); large uploads are not smuggled into report_json.
    logo: String(body.logo ?? 'mereporter-default').slice(0, 300000),
  };
  const [{ data: keywords }, { data: metrics }] = await Promise.all([
    supabase.from('keywords').select('*').eq('project_id', body.project_id),
    supabase.from('metric_imports').select('*').eq('project_id', body.project_id),
  ]);
  const report = buildMonthlyReport(body.project_id, body.month, keywords ?? [], metrics ?? []);
  const reportWithBuilder = { ...report, builder };
  const { data, error } = await supabase.from('reports').upsert({
    project_id: body.project_id,
    month: body.month,
    report_json: reportWithBuilder,
    status: 'draft',
  }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const emailNote = resendConfigured
    ? 'Not sent — no verified sender is configured for delivery; report saved as draft.'
    : 'Not sent — email not configured; report saved as draft.';
  return NextResponse.json({ ok: true, report: reportWithBuilder, stored: data, emailSent: false, emailNote });
}
