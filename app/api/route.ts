import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';
import { GOOGLE_SCOPES, signState } from '@/lib/google';

// GET /api/integrations/google/start?project_id=…&provider=gsc|ga4
// Requires an approved JWT + project ownership. Returns the Google OAuth URL
// as JSON (the browser then navigates there); no token ever appears in a URL.
// If the Google OAuth env vars are unset, returns 503 with a setup message —
// never a fake "connected" state.
export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const params = new URL(req.url).searchParams;
  const projectId = params.get('project_id') ?? '';
  const provider = params.get('provider') ?? '';
  if (provider !== 'gsc' && provider !== 'ga4') {
    return NextResponse.json({ ok: false, error: 'provider must be gsc or ga4.' }, { status: 400 });
  }
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, auth.profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({
      ok: false,
      error: 'Google OAuth is not configured. Owner: create a Google Cloud OAuth client, set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Vercel env vars, redeploy, then connect again.',
    }, { status: 503 });
  }
  const redirectUri = `${new URL(req.url).origin}/api/integrations/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', signState(projectId, provider));
  return NextResponse.json({ ok: true, url: url.toString() });
}
