import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

// AI Visibility: prompts are stored per project. There is NO live LLM-answer check
// wired in (no LLM provider key is configured for this feature), so a prompt with no
// recorded answer honestly shows 'not checked' — it is never shown as mentioned /
// cited / visible. When a provider is added later, results must be stored in
// ai_prompts.result_json with the provider and timestamp, never invented.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data } = await supabase.from('ai_prompts').select('*').eq('project_id', projectId).order('created_at');
  const rows = data ?? [];
  const checked = rows.filter((r: { result_json: unknown }) => r.result_json !== null);
  return NextResponse.json({ ok: true, prompts: rows, summary: { total: rows.length, checked: checked.length, notChecked: rows.length - checked.length, note: 'No live AI-answer provider is configured; checked counts only prompts with a stored result.' } });
}
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.project_id || !body?.prompt) return NextResponse.json({ ok: false, error: 'project_id and prompt are required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data, error } = await supabase.from('ai_prompts').insert({ project_id: body.project_id, prompt: body.prompt, brand_mentioned: null, result_json: null }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, prompt: data, note: 'Prompt stored as not checked. No AI answer was fetched and no visibility claim is made.' });
}
