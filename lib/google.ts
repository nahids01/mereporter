import { createHmac, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// Google OAuth helpers (server only). Tokens live only in the
// integration_tokens table, accessed via the service-role client.
// No token value is ever returned to the browser or put in a URL.

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
];

function signingKey(): string {
  // Optional dedicated secret; falls back to the server Supabase secret.
  // Either value stays server-side only and is never returned.
  return process.env.GOOGLE_OAUTH_STATE_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? '';
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

export function signState(projectId: string, provider: 'gsc' | 'ga4'): string {
  const payload = b64url(JSON.stringify({ projectId, provider, ts: Date.now() }));
  const sig = createHmac('sha256', signingKey()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyState(state: string): { projectId: string; provider: 'gsc' | 'ga4' } | null {
  try {
    const [payload, sig] = state.split('.');
    if (!payload || !sig) return null;
    const expected = createHmac('sha256', signingKey()).update(payload).digest('hex');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      projectId?: unknown; provider?: unknown; ts?: unknown;
    };
    if (typeof parsed.projectId !== 'string' || (parsed.provider !== 'gsc' && parsed.provider !== 'ga4')) return null;
    if (typeof parsed.ts !== 'number' || Date.now() - parsed.ts > 15 * 60 * 1000) return null;
    return { projectId: parsed.projectId, provider: parsed.provider };
  } catch {
    return null;
  }
}

export type TokenRow = {
  project_id: string; provider: string; access_token: string;
  refresh_token: string | null; expires_at: string | null;
};

async function loadTokenRow(service: SupabaseClient, projectId: string, provider: string): Promise<TokenRow | null> {
  const { data } = await service.from('integration_tokens')
    .select('project_id, provider, access_token, refresh_token, expires_at')
    .eq('project_id', projectId).eq('provider', provider).maybeSingle();
  return (data as TokenRow | null) ?? null;
}

/** Return a valid Google access token for this project, refreshing it when expired.
 *  A GSC connect covers GA4 too (and vice versa): both scopes are requested at
 *  connect time, so the other provider's token row is used as a fallback. */
export async function getValidGoogleToken(service: SupabaseClient, projectId: string, provider: 'gsc' | 'ga4'): Promise<string> {
  let row = await loadTokenRow(service, projectId, provider);
  if (!row) row = await loadTokenRow(service, projectId, provider === 'gsc' ? 'ga4' : 'gsc');
  if (!row) throw new Error(`No Google token for this project. Connect Google on the Integrations page first.`);
  if (row.expires_at && Date.now() < new Date(row.expires_at).getTime() - 60 * 1000) return row.access_token;
  if (!row.refresh_token) {
    if (row.expires_at && Date.now() < new Date(row.expires_at).getTime()) return row.access_token;
    throw new Error('Google token has expired and has no refresh token. Reconnect Google on the Integrations page.');
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured on the server.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: row.refresh_token,
      client_id: clientId, client_secret: clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string') {
    const msg = (json as { error_description?: unknown; error?: unknown }).error_description
      ?? (json as { error?: unknown }).error ?? `Google token refresh failed (${res.status})`;
    throw new Error(`Google token refresh failed: ${String(msg)}. Reconnect Google on the Integrations page.`);
  }
  const expiresAt = typeof json.expires_in === 'number'
    ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null;
  await service.from('integration_tokens').update({ access_token: json.access_token, expires_at: expiresAt })
    .eq('project_id', projectId).eq('provider', row.provider);
  return json.access_token;
}
