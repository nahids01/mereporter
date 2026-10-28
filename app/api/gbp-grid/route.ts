import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

import { isDataForSEOConfigured, liveGbpGrid, gridPoints } from '@/lib/dataforseo';
import { geocodePlace } from '@/lib/geocode';
import { projectDomain } from '@/lib/project-access';
// GET ?project_id= — stored grid snapshots.
// POST { project_id, keyword, lat?, lng?, place? } — centre comes from explicit
// coordinates or from Nominatim geocoding of `place` (coordinates only, never a rank).
// The 3x3 grid is then checked live ONLY if DataForSEO is configured; otherwise
// configured:false is returned and NOTHING is stored.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data } = await supabase.from('gbp_grid_snapshots').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(50);
  return NextResponse.json({ ok: true, snapshots: data ?? [], dataforseoConfigured: isDataForSEOConfigured() });
}
export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.project_id || !body?.keyword) return NextResponse.json({ ok: false, error: 'project_id and keyword are required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  let lat = typeof body.lat === 'number' ? body.lat : null;
  let lng = typeof body.lng === 'number' ? body.lng : null;
  let centreName: string | null = null;
  if ((lat === null || lng === null) && body.place) {
    const geo = await geocodePlace(String(body.place));
    if (!geo) return NextResponse.json({ ok: false, error: 'Could not geocode that place via Nominatim. Supply lat/lng instead.' }, { status: 400 });
    lat = geo.lat; lng = geo.lng; centreName = geo.displayName;
  }
  if (lat === null || lng === null) return NextResponse.json({ ok: false, error: 'lat/lng or a geocodable place is required for the grid centre.' }, { status: 400 });
  if (!isDataForSEOConfigured()) {
    return NextResponse.json({ ok: true, configured: false, centre: { lat, lng, name: centreName }, points: [], note: 'DataForSEO is not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD unset). Grid centre was resolved, but no grid rank was checked and nothing was stored.' });
  }
  const points = gridPoints(lat, lng, typeof body.step_km === 'number' ? body.step_km : 2);
  const live = await liveGbpGrid(body.keyword, projectDomain(project.website_url), points);
  if (!live.configured) return NextResponse.json({ ok: true, configured: false });
  if (!live.ok) return NextResponse.json({ ok: false, error: live.error }, { status: 502 });
  const { data, error } = await supabase.from('gbp_grid_snapshots').insert({ project_id: body.project_id, keyword: body.keyword, centre_lat: lat, centre_lng: lng, centre_name: centreName, grid_json: live.data.points, created_at: new Date().toISOString() }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, configured: true, snapshot: data, points: live.data.points, note: 'Grid ranks are live DataForSEO Google Maps results per grid point. Points where the business was not found are rank null (no-data), never estimated.' });
}
