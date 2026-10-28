import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const supabase = getServerSupabase();
  const q = profile.role === 'admin'
    ? supabase.from('projects').select('id, owner_id, name, website_url, location, created_at').order('created_at')
    : supabase.from('projects').select('id, owner_id, name, website_url, location, created_at').eq('owner_id', profile.id).order('created_at');
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.website_url) return NextResponse.json({ ok: false, error: 'name and website_url are required.' }, { status: 400 });
  let url = String(body.website_url).trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
  try { new URL(url); } catch { return NextResponse.json({ ok: false, error: 'website_url is not a valid URL.' }, { status: 400 }); }
  const supabase = getServerSupabase();
  const { data, error } = await supabase.from('projects').insert({ owner_id: profile.id, name: body.name, website_url: url, location: body.location ?? null }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, project: data });
}
