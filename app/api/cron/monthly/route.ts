import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { buildMonthlyReport } from '@/lib/report';
import { autoFetchProject, getFullProjectById } from '@/lib/auto-fetch';

// GET /api/cron/monthly — scheduler-only (CRON_SECRET), NOT a user-JWT route.
// A user JWT must never trigger reports for ALL projects.
// Order of work, every 1st of the month:
//  1. Auto-fetch every connected integration for every project (same shared
//     fetch as the daily /api/cron/fetch): GSC, GA4, Bing, DataForSEO
//     SERP/GBP — only for sources actually connected and keywords actually
//     stored. A failed source stores nothing for that source; the failure
//     is logged in that project's report and the report still builds.
//  2. Generate a frozen draft monthly report for EVERY project from the
//     fresh + previously stored data (report month in Europe/London time).
// Email sending is unchanged: without a Resend key + verified sender, a
// report stays draft and is never marked sent. No key value is ever returned.
export async function GET(req: NextRequest) {
  const gate = checkCronSecret(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const supabase = getServerSupabase();
  const { data: projects } = await supabase.from('projects').select('id');
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  let created = 0;
  const fetchSummary: Array<{ project_id: string; fetched: string[]; failures: string[] }> = [];
  for (const project of projects ?? []) {
    const full = await getFullProjectById(supabase, project.id);
    let fetched: string[] = []; let failures: string[] = [];
    if (full) {
      const r = await autoFetchProject(supabase, full);
      fetched = r.fetched; failures = r.failures;
    } else {
      failures = ['Project could not be loaded for auto-fetch; report built from stored data only.'];
    }
    fetchSummary.push({ project_id: project.id, fetched, failures });
    const [{ data: keywords }, { data: metrics }] = await Promise.all([
      supabase.from('keywords').select('*').eq('project_id', project.id),
      supabase.from('metric_imports').select('*').eq('project_id', project.id),
    ]);
    const report = buildMonthlyReport(project.id, month, keywords ?? [], metrics ?? []) as ReturnType<typeof buildMonthlyReport> & { autoFetch?: { fetched: string[]; failures: string[] } };
    report.autoFetch = { fetched, failures };
    if (failures.length > 0) {
      const importsSection = report.sections.find((s) => s.name.startsWith('Search / analytics'));
      if (importsSection) {
        importsSection.note += ` Auto-fetch failures this run (no data stored for these sources): ${failures.join(' | ')}`;
      }
    }
    const { error } = await supabase.from('reports').upsert({
      project_id: project.id,
      month,
      report_json: report,
      status: 'draft',
    });
    if (!error) created += 1;
  }
  return NextResponse.json({ ok: true, month, projects: projects?.length ?? 0, draftsCreated: created, sent: 0, autoFetch: fetchSummary, note: 'Drafts only. Email sending requires a Resend key and verified sender, not configured.' });
}
