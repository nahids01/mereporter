import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { buildMonthlyReport } from '@/lib/report';

// GET /api/cron/monthly — scheduler-only, NOT a user-JWT route.
// A user JWT must never trigger reports for ALL projects: that would let one
// user generate (and, in a fuller build, email) other users' reports.
// Instead this route is gated ONLY by CRON_SECRET:
// - If CRON_SECRET is not set, the route refuses to run at all (503) rather
//   than running unauthenticated, which was the previous open behaviour.
// - If CRON_SECRET is set, the caller must send
//   `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends this header
//   automatically when CRON_SECRET is configured as an env var.
// Monthly cron (1st, 09:00 — see vercel.json; Vercel cron timezone handling
// must be confirmed in the Vercel dashboard, it is not assumed here).
// Drafts a report for EVERY project from stored rows only. It does NOT send
// email in this skeleton and never marks a report "sent" without a provider
// confirmation, which does not exist yet. No key value is ever returned.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'Cron secret not configured; refusing unauthenticated run.' },
      { status: 503 },
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const match =
    auth.length === expected.length &&
    timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!match) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const supabase = getServerSupabase();
  const { data: projects } = await supabase.from('projects').select('id');
  const month = new Date().toISOString().slice(0, 7);
  let created = 0;
  for (const project of projects ?? []) {
    const [{ data: keywords }, { data: metrics }] = await Promise.all([
      supabase.from('keywords').select('*').eq('project_id', project.id),
      supabase.from('metric_imports').select('*').eq('project_id', project.id),
    ]);
    const report = buildMonthlyReport(project.id, month, keywords ?? [], metrics ?? []);
    const { error } = await supabase.from('reports').upsert({
      project_id: project.id,
      month,
      report_json: report,
      status: 'draft',
    });
    if (!error) created += 1;
  }
  return NextResponse.json({ ok: true, month, projects: projects?.length ?? 0, draftsCreated: created, sent: 0, note: 'Drafts only. Email sending requires a Resend key and verified sender, not configured.' });
}
