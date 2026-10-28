import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidGoogleToken } from '@/lib/google';
import { getFullProject, insertMetrics, last28Days, googleErrorMessage, type FullProject } from '@/lib/integrations';
import { isDataForSEOConfigured, liveSerpRank, liveGbpGrid, gridPoints } from '@/lib/dataforseo';
import { logDataForSEOUsage, dedupeKeywords } from '@/lib/dataforseo-usage';
import { geocodePlace } from '@/lib/geocode';
import { projectDomain } from '@/lib/project-access';

// Shared live-fetch logic, used by BOTH the manual Integrations buttons and
// the automated cron routes (/api/cron/fetch daily, /api/cron/monthly).
// One implementation, two triggers — so manual and automatic fetches can
// never drift apart. Every function throws on failure and stores nothing in
// that case; callers record the error message and keep going with the rest.

// --- GSC: Search Console searchAnalytics totals, last 28 days ---
export async function fetchGsc(service: SupabaseClient, project: FullProject): Promise<number> {
  const token = await getValidGoogleToken(service, project.id, 'gsc');
  let site = (project.gsc_site_url ?? '').trim();
  if (!site) site = project.website_url.endsWith('/') ? project.website_url : `${project.website_url}/`;
  const { startDate, endDate } = last28Days();
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate }),
    },
  );
  const json = await res.json().catch(() => ({})) as { rows?: Array<{ clicks?: number; impressions?: number; ctr?: number; position?: number }> };
  if (!res.ok) throw new Error(googleErrorMessage(json, res.status));
  const row = json.rows?.[0];
  if (!row || typeof row.clicks !== 'number') {
    throw new Error('Search Console returned no rows for this site/period. Check the property is verified and the GSC site URL matches it exactly.');
  }
  await insertMetrics(service, project.id, 'gsc', [
    { metric: 'gsc_clicks', value: row.clicks },
    { metric: 'gsc_impressions', value: row.impressions ?? null },
    { metric: 'gsc_ctr', value: row.ctr ?? null },
    { metric: 'gsc_avg_position', value: row.position ?? null },
  ]);
  return 4;
}

// --- GA4: Analytics Data API totals, last 28 days ---
export async function fetchGa4(service: SupabaseClient, project: FullProject): Promise<number> {
  const property = (project.ga4_property_id ?? '').trim().replace(/^properties\//, '');
  if (!property || !/^[A-Za-z0-9_-]+$/.test(property)) {
    throw new Error('GA4 property ID is not set for this project. Set it on the Integrations page, then the next auto-fetch will pick it up.');
  }
  const token = await getValidGoogleToken(service, project.id, 'ga4');
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      }),
    },
  );
  const json = await res.json().catch(() => ({})) as { rows?: Array<{ metricValues?: Array<{ value?: string }> }> };
  if (!res.ok) throw new Error(googleErrorMessage(json, res.status));
  const values = json.rows?.[0]?.metricValues;
  if (!values || values.length < 2) throw new Error('GA4 returned no rows for this property/period.');
  const sessions = Number(values[0].value);
  const users = Number(values[1].value);
  if (!Number.isFinite(sessions) || !Number.isFinite(users)) throw new Error('GA4 returned non-numeric values; nothing was stored.');
  await insertMetrics(service, project.id, 'ga4', [
    { metric: 'ga4_sessions', value: sessions },
    { metric: 'ga4_active_users', value: users },
  ]);
  return 2;
}

// --- Bing: Webmaster API rank & traffic totals, weekly rows summed ---
export async function fetchBing(service: SupabaseClient, project: FullProject): Promise<number> {
  const apiKey = process.env.BING_API_KEY;
  if (!apiKey) throw new Error('Bing is not configured (BING_API_KEY unset).');
  const site = (project.bing_site_url ?? '').trim() || project.website_url;
  const url = `https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(site)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => null) as unknown;
  if (!res.ok) {
    const msg = (json as { Message?: unknown } | null)?.Message ?? `Bing Webmaster API failed (${res.status})`;
    throw new Error(String(msg));
  }
  const raw = Array.isArray(json) ? json : (json as { d?: unknown[] })?.d ?? [];
  const rows = (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
  let clicks = 0; let impressions = 0; let weighted = 0; let have = false;
  for (const r of rows) {
    const c = Number(r.Clicks); const i = Number(r.Impressions); const p = Number(r.AvgImpressionPosition);
    if (Number.isFinite(c) && Number.isFinite(i)) {
      clicks += c; impressions += i; have = true;
      if (Number.isFinite(p)) weighted += p * i;
    }
  }
  if (!have) throw new Error('Bing returned no usable traffic rows for this site. Check the site is verified and the Bing site URL matches it exactly.');
  await insertMetrics(service, project.id, 'bing', [
    { metric: 'bing_clicks', value: clicks },
    { metric: 'bing_impressions', value: impressions },
    { metric: 'bing_avg_position', value: impressions > 0 ? weighted / impressions : null },
  ]);
  return 3;
}

// --- DataForSEO SERP: every stored SERP keyword, one live check each ---
async function fetchSerp(service: SupabaseClient, project: FullProject, failures: string[]): Promise<number> {
  if (!isDataForSEOConfigured()) return 0;
  const { data: keywords } = await service.from('keywords').select('id, keyword').eq('project_id', project.id).eq('kind', 'serp');
  let ok = 0;
  for (const kw of dedupeKeywords(keywords ?? [])) {
    const live = await liveSerpRank(kw.keyword, projectDomain(project.website_url), project.location);
    if (!live.configured) break;
    if (!live.ok) { failures.push(`SERP "${kw.keyword}": ${live.error}`); continue; }
    await logDataForSEOUsage(service, project.id, 'serp', kw.keyword, 1);
    const checkedAt = new Date().toISOString();
    await service.from('ranking_snapshots').insert({ project_id: project.id, keyword_id: kw.id, keyword: kw.keyword, kind: 'serp', rank: live.data.rank, source: 'dataforseo', checked_at: checkedAt });
    await service.from('keywords').update({ rank: live.data.rank, checked_at: checkedAt }).eq('id', kw.id);
    ok += 1;
  }
  return ok;
}

// --- DataForSEO GBP grid: every stored GBP keyword, 3x3 grid ---
async function fetchGbp(service: SupabaseClient, project: FullProject, failures: string[]): Promise<number> {
  if (!isDataForSEOConfigured()) return 0;
  const { data: keywords } = await service.from('keywords').select('id, keyword').eq('project_id', project.id).eq('kind', 'gbp');
  let ok = 0;
  for (const kw of dedupeKeywords(keywords ?? [])) {
    // Centre: the keyword's last grid snapshot first, else the project
    // location geocoded (coordinates only). No centre is ever invented:
    // without either, this keyword is skipped and the skip is logged.
    let lat: number | null = null; let lng: number | null = null; let centreName: string | null = null;
    const { data: snap } = await service.from('gbp_grid_snapshots')
      .select('centre_lat, centre_lng, centre_name').eq('project_id', project.id).eq('keyword', kw.keyword)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (snap?.centre_lat != null && snap?.centre_lng != null) {
      lat = Number(snap.centre_lat); lng = Number(snap.centre_lng); centreName = snap.centre_name as string | null;
    } else if (project.location) {
      const geo = await geocodePlace(project.location);
      if (geo) { lat = geo.lat; lng = geo.lng; centreName = geo.displayName; }
    }
    if (lat === null || lng === null) {
      failures.push(`GBP "${kw.keyword}": no grid centre (run a manual grid check once, or set the project location).`);
      continue;
    }
    const live = await liveGbpGrid(kw.keyword, projectDomain(project.website_url), gridPoints(lat, lng, 2));
    if (!live.configured) break;
    if (!live.ok) { failures.push(`GBP "${kw.keyword}": ${live.error}`); continue; }
    // 3x3 grid = 9 searches. The grid is deliberately capped at 3x3 (never
    // larger) to keep DataForSEO cost low: 9 searches per GBP keyword.
    await logDataForSEOUsage(service, project.id, 'gbp', kw.keyword, 9);
    await service.from('gbp_grid_snapshots').insert({
      project_id: project.id, keyword: kw.keyword, centre_lat: lat, centre_lng: lng,
      centre_name: centreName, grid_json: live.data.points, created_at: new Date().toISOString(),
    });
    // Average Map Rank = mean of the non-null grid points, rounded to the
    // integer keywords.rank column. Null when the business was found nowhere.
    const found = live.data.points.map((p) => p.rank).filter((r): r is number => r !== null);
    const avg = found.length ? Math.round(found.reduce((a, b) => a + b, 0) / found.length) : null;
    await service.from('keywords').update({ rank: avg, checked_at: new Date().toISOString() }).eq('id', kw.id);
    ok += 1;
  }
  return ok;
}

/** DataForSEO only, for the one-click "Run full live check" button and for
 *  any caller that wants live ranks + grids without the other sources.
 *  Every stored SERP keyword gets one live check; every stored GBP keyword
 *  gets one 3x3 grid (9 searches). A failed keyword stores nothing for that
 *  keyword and is recorded in failures, never blocking the others.
 *  searchesUsed matches the usage rows actually logged (1 per successful
 *  SERP check, 9 per successful GBP grid). Callers must check
 *  isDataForSEOConfigured() first; this function returns 0s if unset. */
export async function fetchDataForSEO(service: SupabaseClient, project: FullProject): Promise<{ serpChecked: number; gbpChecked: number; searchesUsed: number; failures: string[] }> {
  const failures: string[] = [];
  let serpChecked = 0; let gbpChecked = 0;
  if (!isDataForSEOConfigured()) return { serpChecked, gbpChecked, searchesUsed: 0, failures };
  try { serpChecked = await fetchSerp(service, project, failures); }
  catch (e) { failures.push(`SERP: ${e instanceof Error ? e.message : 'fetch failed'}`); }
  try { gbpChecked = await fetchGbp(service, project, failures); }
  catch (e) { failures.push(`GBP grid: ${e instanceof Error ? e.message : 'fetch failed'}`); }
  return { serpChecked, gbpChecked, searchesUsed: serpChecked * 1 + gbpChecked * 9, failures };
}

export type AutoFetchResult = { fetched: string[]; failures: string[]; skipped: string[] };

/** Auto-fetch everything a project has actually connected, and nothing else.
 *  Unconnected sources are "skipped" (not failures, not connected). A failed
 *  source stores nothing for that source and is logged, but never blocks the
 *  other sources or the report that follows. */
export async function autoFetchProject(service: SupabaseClient, project: FullProject): Promise<AutoFetchResult> {
  const fetched: string[] = []; const failures: string[] = []; const skipped: string[] = [];
  const { data: tokens } = await service.from('integration_tokens').select('provider').eq('project_id', project.id);
  const googleConnected = (tokens ?? []).length > 0;
  if (googleConnected) {
    try { const n = await fetchGsc(service, project); fetched.push(`GSC (${n} rows)`); }
    catch (e) { failures.push(`GSC: ${e instanceof Error ? e.message : 'fetch failed'}`); }
    try { const n = await fetchGa4(service, project); fetched.push(`GA4 (${n} rows)`); }
    catch (e) { failures.push(`GA4: ${e instanceof Error ? e.message : 'fetch failed'}`); }
  } else skipped.push('Google (GSC/GA4) — not connected');
  if (process.env.BING_API_KEY) {
    try { const n = await fetchBing(service, project); fetched.push(`Bing (${n} rows)`); }
    catch (e) { failures.push(`Bing: ${e instanceof Error ? e.message : 'fetch failed'}`); }
  } else skipped.push('Bing — API key not set');
  if (isDataForSEOConfigured()) {
    try { const n = await fetchSerp(service, project, failures); if (n) fetched.push(`SERP (${n} keywords)`); }
    catch (e) { failures.push(`SERP: ${e instanceof Error ? e.message : 'fetch failed'}`); }
    try { const n = await fetchGbp(service, project, failures); if (n) fetched.push(`GBP grid (${n} keywords)`); }
    catch (e) { failures.push(`GBP grid: ${e instanceof Error ? e.message : 'fetch failed'}`); }
  } else skipped.push('DataForSEO SERP/GBP — key not set');
  return { fetched, failures, skipped };
}

/** Load a project's full row (integration settings included) by id, for
 *  cron routes that have no user JWT. Cron is scheduler-gated, not
 *  user-scoped, so this is only ever called from CRON_SECRET-gated routes. */
export async function getFullProjectById(service: SupabaseClient, projectId: string): Promise<FullProject | null> {
  const { data } = await service.from('projects')
    .select('id, owner_id, name, website_url, location, gsc_site_url, ga4_property_id, bing_site_url')
    .eq('id', projectId).single();
  return (data as FullProject | null) ?? null;
}
