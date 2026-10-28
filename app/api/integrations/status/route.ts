import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getFullProject } from '@/lib/integrations';

// GET /api/integrations/status?project_id=…
// Booleans and settings only — never a token or key value. Without a
// project_id it returns only the server env booleans; with one, it also
// returns the project's integration settings and which providers actually
// hold a token for it (a provider is "connected" only if a token row exists).
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const base = {
    googleConfigured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    bingConfigured: Boolean(process.env.BING_API_KEY),
    dataforseoConfigured: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
  };
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  if (!projectId) return NextResponse.json({ ok: true, ...base });
  const service = getServerSupabase();
  const project = await getFullProject(service, projectId, auth.profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data: tokens } = await service.from('integration_tokens')
    .select('provider, site_url, property_id, expires_at').eq('project_id', projectId);
  const connected = (tokens ?? []).map((t) => ({
    provider: t.provider as string,
    site_url: (t as { site_url?: string | null }).site_url ?? null,
    property_id: (t as { property_id?: string | null }).property_id ?? null,
    expires_at: (t as { expires_at?: string | null }).expires_at ?? null,
  }));
  return NextResponse.json({
    ok: true, ...base,
    project: {
      gsc_site_url: project.gsc_site_url, ga4_property_id: project.ga4_property_id,
      bing_site_url: project.bing_site_url, website_url: project.website_url,
    },
    connected,
    googleConnected: connected.some((c) => c.provider === 'gsc' || c.provider === 'ga4'),
  });
}
