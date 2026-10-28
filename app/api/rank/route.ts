import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

import { isDataForSEOConfigured, liveSerpRank } from '@/lib/dataforseo';
import { logDataForSEOUsage } from '@/lib/dataforseo-usage';
import { projectDomain } from '@/lib/project-access';

// GET ?project_id= — stored keywords + ranking history. No live call, no invented rank.
// POST { project_id, keyword, kind? } — creates/keeps the keyword row, then, ONLY if
// DataForSEO is configured, runs a live SERP check and stores the snapshot. Without the
// key it returns configured:false and stores no rank (the keyword row keeps rank null).
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const [{ data: keywords }, { data: snapshots }] = await Promise.all([
    supabase.from('keywords').select('*').eq('project_id', projectId).order('created_at'),
    supabase.from('ranking_snapshots').select('*').eq('project_id', projectId).order('checked_at', { ascending: false }).limit(200),
  ]);
  // DATAFORSEO VISIBILITY IS ADMIN-ONLY: only admins get the configured
  // flag, and non-admins never see the provider name in a snapshot's
  // source field either — it is stripped from their responses.
  const isAdmin = profile.role === 'admin';
  const safeSnapshots = isAdmin ? (snapshots ?? []) : (snapshots ?? []).map(({ source, ...rest }) => rest);
  return NextResponse.json({ ok: true, isAdmin, project, keywords: keywords ?? [], snapshots: safeSnapshots, ...(isAdmin ? { dataforseoConfigured: isDataForSEOConfigured() } : {}) });
}

export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  const kind = body?.kind === 'gbp' ? 'gbp' : 'serp';
  if (!body?.project_id || !body?.keyword) return NextResponse.json({ ok: false, error: 'project_id and keyword are required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  let kw = (await supabase.from('keywords').select('*').eq('project_id', body.project_id).eq('kind', kind).eq('keyword', body.keyword).single()).data;
  if (!kw) {
    const ins = await supabase.from('keywords').insert({ project_id: body.project_id, kind, keyword: body.keyword, rank: null }).select().single();
    if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 400 });
    kw = ins.data;
  }
  if (!isDataForSEOConfigured()) {
    return NextResponse.json({ ok: true, configured: false, keyword: kw, rank: null, note: 'Live rank is not set up yet. No live check was run and no rank was stored. This keyword shows no-data until it is set up.' });
  }
  const live = await liveSerpRank(body.keyword, projectDomain(project.website_url), project.location);
  if (!live.configured) return NextResponse.json({ ok: true, configured: false, keyword: kw, rank: null });
  if (!live.ok) return NextResponse.json({ ok: false, error: live.error, keyword: kw }, { status: 502 });
  await logDataForSEOUsage(supabase, body.project_id, 'serp', body.keyword, 1);
  const checkedAt = new Date().toISOString();
  await supabase.from('ranking_snapshots').insert({ project_id: body.project_id, keyword_id: kw.id, keyword: body.keyword, kind, rank: live.data.rank, source: 'dataforseo', checked_at: checkedAt });
  await supabase.from('keywords').update({ rank: live.data.rank, checked_at: checkedAt }).eq('id', kw.id);
  return NextResponse.json({ ok: true, configured: true, keyword: { ...kw, rank: live.data.rank, checked_at: checkedAt }, rank: live.data.rank, itemsChecked: live.data.itemsChecked, note: live.data.rank === null ? 'Live check ran; the project domain was not found in the returned search results — recorded as no-data, not as a rank.' : 'Live rank recorded.' });
}
