import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { verifyState } from '@/lib/google';

// GET /api/integrations/google/callback?code=…&state=…
// Google redirects the browser here without a JWT, so security rests on the
// signed state (project + provider + 15-minute expiry, HMAC-verified) and on
// the server-side code exchange with the OAuth client secret. Tokens are
// stored via the service client only and never appear in the redirect URL.
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/integrations?error=${encodeURIComponent(reason)}`);
  if (!hasServerSupabase()) return fail('google_not_configured');
  const params = new URL(req.url).searchParams;
  if (params.get('error')) return fail('google_denied');
  const code = params.get('code') ?? '';
  const state = verifyState(params.get('state') ?? '');
  if (!code || !state) return fail('invalid_state');
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('google_not_configured');
  const redirectUri = `${origin}/api/integrations/google/callback`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string') return fail('google_exchange_failed');
  const service = getServerSupabase();
  const { data: project } = await service.from('projects')
    .select('id, gsc_site_url, ga4_property_id').eq('id', state.projectId).single();
  if (!project) return fail('project_not_found');
  const expiresAt = typeof json.expires_in === 'number'
    ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null;
  const { error } = await service.from('integration_tokens').upsert({
    project_id: state.projectId,
    provider: state.provider,
    site_url: (project as { gsc_site_url?: string | null }).gsc_site_url ?? null,
    property_id: (project as { ga4_property_id?: string | null }).ga4_property_id ?? null,
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    expires_at: expiresAt,
  }, { onConflict: 'project_id,provider' });
  if (error) return fail('token_store_failed');
  return NextResponse.redirect(`${origin}/integrations?connected=google`);
}
