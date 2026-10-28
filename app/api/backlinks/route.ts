import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

// Stored backlinks only. MeReporter has no live backlink-discovery provider wired in,
// so it never invents a backlink: rows here are ones the user added or imported, with
// their source recorded. A project with no rows shows an honest empty state.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data } = await supabase.from('backlinks').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(500);
  return NextResponse.json({ ok: true, backlinks: data ?? [], note: 'Stored rows only — no live backlink discovery provider is configured, so no backlink is shown unless it was added/imported.' });
}
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.project_id || !body?.source_url) return NextResponse.json({ ok: false, error: 'project_id and source_url are required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data, error } = await supabase.from('backlinks').insert({ project_id: body.project_id, source_url: body.source_url, target_url: body.target_url ?? project.website_url, anchor_text: body.anchor_text ?? null, rel: body.rel ?? null, status: 'active' }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, backlink: data });
}
