import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

// Per-project settings for Settings > General + Site Crawler.
// GET ?project_id= — JWT + ownership, returns the saved settings merged
//   over defaults, plus the project's name/URL and its stored GA / Search
//   Console picks. If migration 0010 has not been run, the settings table
//   is missing and defaults are returned with settingsStored:false.
// POST { project_id, crawler?, general?, name?, gsc_site_url?,
//   ga4_property_id?, start_crawl? } — saves the crawler settings and,
//   when present, the General extras (country, language, group, Google
//   Place, carousel title, position tracking) plus the project name and
//   the GA / Search Console picks on the projects row itself, so the
//   picks are exactly what the existing GSC/GA4 fetch routes read.
//   start_crawl:true saves first, then triggers a crawl of this project
//   through the audit route (same origin, same caller JWT forwarded, so
//   the audit route re-checks ownership itself). A crawl already running
//   cannot be cancelled from here — crawls run to their page limit and
//   insert after each level, so stopping the browser does not erase
//   pages already stored.
// DELETE ?project_id= — deletes the project (its rows cascade) after the
//   same ownership check. This is the Settings "Delete URL" action.
// No key, token or secret value is ever read or returned here.

const FREQUENCIES = ['Disabled', 'Weekly', 'Monthly'] as const;

// Mirrors the audit route's crawl defaults (route modules may not export
// helpers — Next validates route exports — so the defaults live here too).
type CrawlSettings = {
  ignorePaths: string[]; enableUrlParams: boolean; followNofollow: boolean;
  pageLimit: number; concurrency: number;
};
const DEFAULT_CRAWL_SETTINGS: CrawlSettings = {
  ignorePaths: [], enableUrlParams: false, followNofollow: false, pageLimit: 5000, concurrency: 3,
};

function parseCrawler(input: unknown): CrawlSettings {
  const c = (input ?? {}) as Record<string, unknown>;
  const paths = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
    if (typeof v === 'string') return v.split('\n').map((s) => s.trim()).filter(Boolean);
    return [];
  };
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback);
  return {
    ignorePaths: paths(c.ignorePaths),
    enableUrlParams: c.enableUrlParams === true,
    followNofollow: c.followNofollow === true,
    pageLimit: Math.min(5000, Math.max(1, num(c.pageLimit, DEFAULT_CRAWL_SETTINGS.pageLimit))),
    concurrency: Math.min(10, Math.max(1, num(c.concurrency, DEFAULT_CRAWL_SETTINGS.concurrency))),
  };
}

function parseGeneral(input: unknown): Record<string, unknown> {
  const g = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const text = (k: string) => { if (typeof g[k] === 'string') out[k] = g[k].slice(0, 500); };
  text('country'); text('language'); text('group'); text('googlePlace'); text('carouselTitle');
  if (typeof g.matchSubdomains === 'boolean') out.matchSubdomains = g.matchSubdomains;
  if (typeof g.matchNestedUrls === 'boolean') out.matchNestedUrls = g.matchNestedUrls;
  if (typeof g.autoRun === 'boolean') out.autoRun = g.autoRun;
  if (typeof g.frequency === 'string' && (FREQUENCIES as readonly string[]).includes(g.frequency)) out.frequency = g.frequency;
  if (g.positionTracking && typeof g.positionTracking === 'object') {
    const pt = g.positionTracking as Record<string, unknown>;
    const flags: Record<string, boolean> = {};
    for (const k of ['localPack', 'imageCarousel', 'featuredSnippet', 'knowledgePanel', 'aiOverviewSnippet']) {
      if (typeof pt[k] === 'boolean') flags[k] = pt[k];
    }
    out.positionTracking = flags;
  }
  return out;
}

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data: full } = await supabase.from('projects')
    .select('id, name, website_url, gsc_site_url, ga4_property_id').eq('id', projectId).single();
  let settings = { ...DEFAULT_CRAWL_SETTINGS };
  let general: Record<string, unknown> = {};
  let settingsStored = false;
  try {
    const { data, error } = await supabase.from('project_settings').select('crawler, general').eq('project_id', projectId).maybeSingle();
    if (!error && data) {
      settingsStored = true;
      settings = { ...DEFAULT_CRAWL_SETTINGS, ...parseCrawler((data as { crawler?: unknown }).crawler) };
      // parseCrawler already clamps; keep saved ignorePaths verbatim order.
      general = parseGeneral((data as { general?: unknown }).general);
    }
  } catch { /* table missing (migration 0010 not run) — defaults stand */ }
  return NextResponse.json({
    ok: true, settingsStored, settings, general,
    project: full ?? { id: project.id, name: project.name, website_url: project.website_url, gsc_site_url: null, ga4_property_id: null },
  });
}

export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.project_id) return NextResponse.json({ ok: false, error: 'project_id is required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });

  // Project-row fields first: these work even without migration 0010.
  const patch: Record<string, string | null> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 500);
  for (const key of ['gsc_site_url', 'ga4_property_id'] as const) {
    if (body?.[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].length > 500) {
      return NextResponse.json({ ok: false, error: `${key} must be a short text value.` }, { status: 400 });
    }
    patch[key] = body[key].trim() || null;
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('projects').update(patch).eq('id', project.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const crawlerInput = body.crawler ?? body;
  const hasCrawler = body.crawler !== undefined
    || ['ignorePaths', 'enableUrlParams', 'followNofollow', 'pageLimit', 'concurrency'].some((k) => body?.[k] !== undefined);
  const newCrawler = hasCrawler ? parseCrawler(crawlerInput) : null;
  const newGeneral = parseGeneral(body.general);
  // Scheduling extras live with the General settings (autoRun/frequency
  // are part of the crawler form in Settings, so accept them
  // from either object, crawler form wins).
  if (body.crawler && typeof body.crawler === 'object') {
    const cg = parseGeneral(body.crawler);
    if (cg.autoRun !== undefined) newGeneral.autoRun = cg.autoRun;
    if (cg.frequency !== undefined) newGeneral.frequency = cg.frequency;
  }
  // Merge with what is already stored, so a General-only save never wipes
  // saved crawler settings (and vice versa).
  let settings = { ...DEFAULT_CRAWL_SETTINGS };
  let general: Record<string, unknown> = {};
  try {
    const { data: existing } = await supabase.from('project_settings').select('crawler, general').eq('project_id', project.id).maybeSingle();
    if (existing) {
      settings = parseCrawler((existing as { crawler?: unknown }).crawler);
      general = parseGeneral((existing as { general?: unknown }).general);
    }
  } catch { /* no stored row yet — defaults stand */ }
  if (newCrawler) settings = { ...settings, ...newCrawler };
  general = { ...general, ...newGeneral };
  let settingsWarning: string | null = null;
  if (hasCrawler || Object.keys(newGeneral).length > 0) {
    const { error } = await supabase.from('project_settings').upsert({
      project_id: project.id, crawler: settings, general, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
    if (error) {
      // Missing table (migration 0010 not run): project-row picks above
      // are already saved; say so honestly instead of failing silently.
      settingsWarning = 'Crawler / General extras were not saved: run Supabase migration 0010 first. Project name and GA / Search Console picks above were saved.';
    }
  }

  if (body.start_crawl === true) {
    // Trigger the real crawl through the audit route, forwarding the
    // caller's JWT so it re-validates ownership. If that call fails, the
    // settings are still saved and the error is reported, not hidden.
    try {
      const origin = new URL(req.url).origin;
      const crawlRes = await fetch(`${origin}/api/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('authorization') ?? '' },
        body: JSON.stringify({ project_id: project.id }),
      });
      const crawlJson = await crawlRes.json().catch(() => ({})) as Record<string, unknown>;
      if (!crawlRes.ok) {
        return NextResponse.json({ ok: true, saved: true, settings, general, settingsWarning, crawlStarted: false, crawlError: String((crawlJson as { error?: unknown }).error ?? `Crawl failed (${crawlRes.status})`) });
      }
      return NextResponse.json({ ok: true, saved: true, settings, general, settingsWarning, crawlStarted: true, crawl: crawlJson.crawl ?? null });
    } catch (e) {
      return NextResponse.json({ ok: true, saved: true, settings, general, settingsWarning, crawlStarted: false, crawlError: e instanceof Error ? e.message : 'Crawl request failed.' });
    }
  }
  return NextResponse.json({ ok: true, saved: true, settings, general, settingsWarning });
}

export async function DELETE(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const projectId = new URL(req.url).searchParams.get('project_id') ?? '';
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  await supabase.from('project_settings').delete().eq('project_id', projectId);
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: true });
}
