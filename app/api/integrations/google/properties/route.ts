import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';
import { getValidGoogleToken } from '@/lib/google';
import { googleErrorMessage } from '@/lib/integrations';

// GET /api/integrations/google/properties?project_id=…
// JWT + project ownership required. Returns the ONE connected Google
// account's Search Console sites list and GA4 properties list, fetched
// live from Google with the server-side stored OAuth token (refreshed if
// expired). The account is the one connected for this project, or — when
// this project has no token yet — the account connected on another
// project owned by the SAME signed-in user, so one Google connect can
// serve every new URL that user adds: the picker choice is then stored
// per project (projects.gsc_site_url / ga4_property_id) and reused by
// the GSC/GA4 fetch routes. Tokens of other users are never consulted.
// No property list is ever fabricated: with no connected account the
// response is googleConnected:false with empty lists and a real error
// telling the user to connect Google first. With a connected account but
// a failing Google API, that side returns an empty list plus the real
// Google error while the other side still returns its live list.
// No token value is ever returned. There is NO text-field-only connect
// path here: the pickers in Settings (and the Keywords Search Console
// import dialog, which should call this same endpoint) are the path,
// with a clearly labelled fallback field in Settings only.

// Find a usable Google token: this project's token first, then any token
// on another project owned by the caller. Returns null when none works.
async function findGoogleToken(service: SupabaseClient, projectId: string, ownerId: string): Promise<{ token: string; sameProject: boolean } | null> {
  const candidates: Array<{ id: string; sameProject: boolean }> = [{ id: projectId, sameProject: true }];
  try {
    const { data } = await service.from('projects').select('id').eq('owner_id', ownerId).order('created_at');
    for (const row of (data ?? []) as Array<{ id: string }>) {
      if (row.id !== projectId) candidates.push({ id: row.id, sameProject: false });
    }
  } catch { /* fall through to this-project-only attempt */ }
  for (const c of candidates) {
    try {
      const token = await getValidGoogleToken(service, c.id, 'gsc');
      return { token, sameProject: c.sameProject };
    } catch { /* try the next owned project */ }
  }
  return null;
}

type GscSite = { siteUrl: string; permissionLevel: string | null };
type Ga4Property = { property: string; propertyId: string; displayName: string; account: string | null };

export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 });
  }
  const auth = await authenticateRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const service = getServerSupabase();
  const project = await getOwnedProject(service, projectId, auth.profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const googleConfigured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  if (!googleConfigured) {
    return NextResponse.json({
      ok: false, googleConnected: false, googleConfigured: false,
      searchConsoleSites: [], ga4Properties: [],
      error: 'Google sign-in is not configured on the server yet (owner setup step). Until then no Google account can be connected and no property list exists.',
    }, { status: 503 });
  }
  const found = await findGoogleToken(service, projectId, auth.profile.id);
  if (!found) {
    return NextResponse.json({
      ok: false, googleConnected: false, googleConfigured: true,
      searchConsoleSites: [], ga4Properties: [],
      error: 'No Google account is connected for this project yet. Connect Google once (on Integrations, or below in Settings), then this list will show that account\'s Search Console sites and Analytics properties.',
    }, { status: 400 });
  }
  const headers = { Authorization: `Bearer ${found.token}` };
  let searchConsoleSites: GscSite[] = [];
  let ga4Properties: Ga4Property[] = [];
  let searchConsoleError: string | null = null;
  let ga4Error: string | null = null;
  try {
    const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', { headers });
    const json = await res.json().catch(() => ({})) as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> };
    if (!res.ok) searchConsoleError = googleErrorMessage(json, res.status);
    else {
      searchConsoleSites = (json.siteEntry ?? [])
        .filter((e) => typeof e.siteUrl === 'string')
        .map((e) => ({ siteUrl: e.siteUrl as string, permissionLevel: e.permissionLevel ?? null }));
    }
  } catch (e) { searchConsoleError = e instanceof Error ? e.message : 'Search Console list request failed.'; }
  try {
    const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { headers });
    const json = await res.json().catch(() => ({})) as {
      accountSummaries?: Array<{ displayName?: string; propertySummaries?: Array<{ property?: string; displayName?: string }> }>;
    };
    if (!res.ok) ga4Error = googleErrorMessage(json, res.status);
    else {
      for (const account of json.accountSummaries ?? []) {
        for (const prop of account.propertySummaries ?? []) {
          if (typeof prop.property !== 'string') continue;
          ga4Properties.push({
            property: prop.property,
            propertyId: prop.property.replace(/^properties\//, ''),
            displayName: prop.displayName ?? prop.property,
            account: account.displayName ?? null,
          });
        }
      }
    }
  } catch (e) { ga4Error = e instanceof Error ? e.message : 'Analytics list request failed.'; }
  return NextResponse.json({
    ok: true, googleConnected: true, googleConfigured: true,
    accountSource: found.sameProject ? 'this project' : 'another project you own',
    searchConsoleSites, ga4Properties, searchConsoleError, ga4Error,
    note: 'Live lists from the connected Google account. Pick one Search Console site and one Analytics property per project in Settings; the picks are stored per project and reused for every fetch of that project.',
  });
}
