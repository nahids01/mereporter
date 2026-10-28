import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

// Stored competitors only. MeReporter does not invent competitor ranks or traffic:
// a competitor row is just a domain the user added, with its own stored rank rows
// only when a live check (via /api/rank against that domain) has actually run.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data } = await supabase.from('competitors').select('*').eq('project_id', projectId).order('created_at');
  return NextResponse.json({ ok: true, competitors: data ?? [] });
}
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.project_id || !body?.domain) return NextResponse.json({ ok: false, error: 'project_id and domain are required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const rawDomain = String(body.domain).toLowerCase().replace('https://', '').replace('http://', '').split('/')[0];
  const cleanDomain = rawDomain.startsWith('www.') ? rawDomain.slice(4) : rawDomain;
  const { data, error } = await supabase.from('competitors').insert({ project_id: body.project_id, domain: cleanDomain, name: body.name ?? null, notes: body.notes ?? null }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, competitor: data });
}
export async function DELETE(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const supabase = getServerSupabase();
  const { data: row } = await supabase.from('competitors').select('project_id').eq('id', id).single();
  if (!row) return NextResponse.json({ ok: false, error: 'Competitor not found.' }, { status: 404 });
  const project = await getOwnedProject(supabase, row.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Competitor not found.' }, { status: 404 });
  await supabase.from('competitors').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
