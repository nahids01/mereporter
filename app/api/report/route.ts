import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest, canViewProject } from '@/lib/auth';
import { buildMonthlyReport } from '@/lib/report';

// POST /api/report — hardened, draft-only.
// - Requires a valid Supabase JWT and an approved profile (see lib/auth.ts).
// - The project is fetched first and the caller must own it or be an admin
//   (admin = one of the two emails in lib/access.ts only). A missing project
//   and an unauthorised project both return 404, so ownership cannot be
//   probed by enumeration.
// - Builds a monthly report ONLY from stored rows. No live SERP/GBP fetch is
//   attempted here: without a SERP key, live checks honestly return no-data.
// - Email sending is not attempted here: without a Resend key, status stays
//   draft and is never marked sent. No key value is ever returned.
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
    .select('id, owner_id')
    .eq('id', body.project_id)
    .single();
  if (!project || !canViewProject(auth.profile, project.owner_id)) {
    return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  }
  const [{ data: keywords }, { data: metrics }] = await Promise.all([
    supabase.from('keywords').select('*').eq('project_id', body.project_id),
    supabase.from('metric_imports').select('*').eq('project_id', body.project_id),
  ]);
  const report = buildMonthlyReport(body.project_id, body.month, keywords ?? [], metrics ?? []);
  const { data, error } = await supabase.from('reports').upsert({
    project_id: body.project_id,
    month: body.month,
    report_json: report,
    status: 'draft',
  }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, report, stored: data, emailSent: false, emailNote: 'Not sent: Resend key / sender not configured in this skeleton.' });
}
