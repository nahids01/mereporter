import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

import { runLiveAudit, fetchPageSpeed } from '@/lib/audit';
// GET ?project_id= — stored scans, newest first.
// POST { project_id, url? } — fetches the project's OWN URL (or an explicit URL on the
// same project only if the caller owns it; the stored scan always records the URL fetched)
// and scores it from real checks only. Optional PageSpeed data is info-only.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data } = await supabase.from('audit_scans').select('*').eq('project_id', projectId).order('scanned_at', { ascending: false }).limit(50);
  return NextResponse.json({ ok: true, scans: data ?? [], pagespeedConfigured: Boolean(process.env.GOOGLE_PAGESPEED_API_KEY) });
}
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.project_id) return NextResponse.json({ ok: false, error: 'project_id is required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const url = body.url ? String(body.url) : project.website_url;
  const result = await runLiveAudit(url);
  const pagespeed = await fetchPageSpeed(url);
  const { data, error } = await supabase.from('audit_scans').insert({
    project_id: body.project_id, url, score: result.score, checks: result.checks,
    response_time_ms: result.responseTimeMs, page_size_bytes: result.pageSizeBytes,
    pagespeed: pagespeed, scanned_at: new Date().toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message, audit: result }, { status: 400 });
  return NextResponse.json({ ok: true, scan: data, audit: result, pagespeed, note: 'Score 0-100 is computed only from the live checks listed in checks[]. PageSpeed, when configured, is info only.' });
}
