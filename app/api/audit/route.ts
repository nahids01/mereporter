import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabase, hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

function notConfigured() { return NextResponse.json({ ok: false, error: 'Supabase server is not configured.' }, { status: 503 }); }
async function auth(req: NextRequest) { const a = await authenticateRequest(req); if (!a.ok) return { res: NextResponse.json({ ok: false, error: a.error }, { status: a.status }), profile: null }; return { res: null, profile: a.profile }; }

// ---------------------------------------------------------------------------
// Site Crawler: POST actually walks the project's own site.
// GET ?project_id= [&limit=] — stored scans, newest first.
// POST { project_id, url? } — breadth-first crawl starting at the project's
//   website URL (or an explicit URL on the SAME origin only). Each page is
//   fetched once and stored as one audit_scans row: URL, HTTP status,
//   indexable (robots meta / X-Robots-Tag / robots.txt), meta description,
//   first H1, load time ms, crawl depth, and issues (missing description,
//   missing H1, slow load, redirect, error). Rows of one crawl share one
//   scanned_at timestamp, so the Audit page can group them into a run.
//   Crawler settings come from project_settings (see /api/crawler-settings);
//   without that table, safe defaults are used. Asset links (images, css,
//   js, media, archives, fonts) are not crawled as pages. Rows are inserted
//   after each crawl level, so a partial crawl still leaves real data.
//   If migration 0010 has not been run, the per-page columns are missing:
//   the insert then falls back to encoding the page detail in the checks
//   array (an entry named "Page details", weight 0), which the Audit page
//   reads — nothing is invented and nothing is lost.
// ---------------------------------------------------------------------------

type CrawlSettings = {
  ignorePaths: string[]; enableUrlParams: boolean; followNofollow: boolean;
  pageLimit: number; concurrency: number;
};
const DEFAULT_CRAWL_SETTINGS: CrawlSettings = {
  ignorePaths: [], enableUrlParams: false, followNofollow: false, pageLimit: 5000, concurrency: 3,
};

async function loadCrawlSettings(service: SupabaseClient, projectId: string): Promise<CrawlSettings> {
  try {
    const { data, error } = await service.from('project_settings').select('crawler').eq('project_id', projectId).maybeSingle();
    if (error || !data) return { ...DEFAULT_CRAWL_SETTINGS };
    const c = (data as { crawler?: unknown }).crawler as Record<string, unknown> | null;
    if (!c || typeof c !== 'object') return { ...DEFAULT_CRAWL_SETTINGS };
    const asPaths = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
      if (typeof v === 'string') return v.split('\n').map((s) => s.trim()).filter(Boolean);
      return [];
    };
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback);
    return {
      ignorePaths: asPaths(c.ignorePaths),
      enableUrlParams: c.enableUrlParams === true,
      followNofollow: c.followNofollow === true,
      pageLimit: Math.min(5000, Math.max(1, num(c.pageLimit, 5000))),
      concurrency: Math.min(10, Math.max(1, num(c.concurrency, 3))),
    };
  } catch {
    return { ...DEFAULT_CRAWL_SETTINGS };
  }
}

const ASSET_EXT = /\.(css|js|mjs|json|xml|png|jpe?g|gif|svg|webp|avif|ico|mp3|mp4|webm|woff2?|ttf|eot|pdf|zip|gz|doc|docx|xls|xlsx)$/i;

function normalisePageUrl(raw: string, settings: CrawlSettings): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    if (!settings.enableUrlParams) u.search = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch { return null; }
}

function metaContent(html: string, name: string): string | null {
  const a = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html);
  if (a) return a[1] || null;
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i').exec(html);
  return b ? b[1] || null : null;
}
function firstH1(html: string): string | null {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m) return null;
  const t = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return t || null;
}
function pageTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const t = m[1].replace(/<[^>]+>/g, '').trim();
  return t || null;
}

async function loadRobotsDisallows(origin: string): Promise<string[]> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${origin}/robots.txt`, { signal: ctrl.signal, headers: { 'User-Agent': 'MeReporter/0.1 crawler' } });
    clearTimeout(t);
    if (!res.ok) return [];
    const text = await res.text();
    const disallows: string[] = [];
    let inStar = false;
    for (const rawLine of text.split('\n')) {
      const line = rawLine.split('#')[0].trim();
      if (/^user-agent:/i.test(line)) { inStar = line.split(':')[1]?.trim() === '*'; continue; }
      if (inStar) {
        const m = /^disallow:\s*(\S+)/i.exec(line);
        if (m && m[1]) disallows.push(m[1]);
      }
    }
    return disallows;
  } catch { return []; }
}

type CrawledPage = {
  url: string; status: number | null; pageStatus: 'OK' | 'REDIRECT' | 'ERROR';
  indexable: boolean; description: string | null; h1: string | null; loadTimeMs: number;
  depth: number; issues: string[]; score: number; checks: Array<{ name: string; passed: boolean; detail: string; weight: number }>;
  pageSizeBytes: number;
};


function extractLinks(html: string, base: string, origin: string, settings: CrawlSettings): string[] {
  const out: string[] = [];
  const tagRe = /<a\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html)) !== null) {
    const href = /href=["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (!href) continue;
    if (!settings.followNofollow && /\brel=["'][^"']*nofollow[^"']*["']/i.test(tag[0])) continue;
    let resolved: URL;
    try { resolved = new URL(href, base); } catch { continue; }
    if (resolved.origin !== origin) continue;
    if (ASSET_EXT.test(resolved.pathname)) continue;
    if (settings.ignorePaths.some((p) => resolved.pathname.includes(p))) continue;
    const n = normalisePageUrl(resolved.toString(), settings);
    if (n) out.push(n);
  }
  return out;
}

type CrawlSummary = {
  pages: number; ok: number; redirects: number; errors: number; health: number;
  maxDepth: number; scannedAt: string;
};

// The crawl: each page is fetched exactly once, its record comes from that
// fetch, and its same-origin links are extracted from that same body —
// no page is ever fetched twice.
async function crawlWithHtml(
  service: SupabaseClient, projectId: string, startUrl: string, settings: CrawlSettings,
): Promise<{ summary: CrawlSummary; pages: CrawledPage[] }> {
  const start = normalisePageUrl(startUrl, settings);
  if (!start) throw new Error('Project website URL is not a valid URL.');
  const origin = new URL(start).origin;
  const robotsDisallows = await loadRobotsDisallows(origin);
  const scannedAt = new Date().toISOString();
  const visited = new Set<string>([start]);
  const allPages: CrawledPage[] = [];
  let level: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];

  async function insertLevel(pages: CrawledPage[]): Promise<void> {
    if (pages.length === 0) return;
    const full = pages.map((p) => ({
      project_id: projectId, url: p.url, score: p.score, checks: p.checks,
      response_time_ms: p.loadTimeMs, page_size_bytes: p.pageSizeBytes,
      pagespeed: null, scanned_at: scannedAt,
      page_status: p.pageStatus, indexable: p.indexable, description: p.description,
      h1_text: p.h1, depth: p.depth, issues: p.issues,
    }));
    const { error } = await service.from('audit_scans').insert(full);
    if (!error) return;
    // Migration 0010 not run (missing columns): fall back to the legacy
    // columns, with the page detail encoded as a weight-0 checks entry.
    const legacy = pages.map((p) => ({
      project_id: projectId, url: p.url, score: p.score,
      checks: [...p.checks, {
        name: 'Page details', passed: p.pageStatus === 'OK',
        detail: JSON.stringify({
          pageStatus: p.pageStatus, indexable: p.indexable, description: p.description,
          h1: p.h1, depth: p.depth, issues: p.issues, status: p.status,
        }),
        weight: 0,
      }],
      response_time_ms: p.loadTimeMs, page_size_bytes: p.pageSizeBytes,
      pagespeed: null, scanned_at: scannedAt,
    }));
    const { error: legacyError } = await service.from('audit_scans').insert(legacy);
    if (legacyError) throw new Error(legacyError.message);
  }

  while (level.length > 0 && allPages.length < settings.pageLimit) {
    const levelPages: CrawledPage[] = [];
    const nextLevel: Array<{ url: string; depth: number }> = [];
    for (let i = 0; i < level.length; i += settings.concurrency) {
      const chunk = level.slice(i, i + settings.concurrency);
      const fetched = await Promise.all(chunk.map(async (p) => {
        const started = Date.now();
        let html = ''; let status: number | null = null; let redirected = false; let xRobots = '';
        try {
          const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
          const res = await fetch(p.url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'MeReporter/0.1 crawler' } });
          clearTimeout(t);
          status = res.status;
          redirected = res.redirected || (() => { try { return new URL(res.url).toString() !== p.url; } catch { return false; } })();
          xRobots = (res.headers.get('x-robots-tag') ?? '').toLowerCase();
          html = await res.text().catch(() => '');
        } catch {
          status = null;
        }
        const loadTimeMs = Date.now() - started;
        const title = pageTitle(html);
        const description = metaContent(html, 'description');
        const h1 = firstH1(html);
        const robotsMeta = (metaContent(html, 'robots') ?? '').toLowerCase();
        const noindex = robotsMeta.includes('noindex') || xRobots.includes('noindex');
        let pathname = p.url;
        try { pathname = new URL(p.url).pathname; } catch { /* keep raw */ }
        const robotsBlocked = robotsDisallows.some((d) => pathname.startsWith(d));
        const indexable = status !== null && status < 400 ? !noindex && !robotsBlocked : false;
        const issues: string[] = [];
        if (status === null) issues.push('Fetch failed');
        else {
          if (!description) issues.push('Missing meta description');
          if (!h1) issues.push('Missing H1');
          if (loadTimeMs > 2000) issues.push('Slow load');
          if (redirected) issues.push('Redirect');
          if (status >= 400) issues.push(`Error (HTTP ${status})`);
        }
        const pageStatus: CrawledPage['pageStatus'] = status === null || status >= 400 ? 'ERROR' : redirected ? 'REDIRECT' : 'OK';
        const https = p.url.startsWith('https://');
        const checks: CrawledPage['checks'] = [
          { name: 'HTTPS', passed: https, detail: https ? 'Served over HTTPS' : 'Not HTTPS', weight: 15 },
          { name: 'Site reachable (HTTP 200)', passed: status === 200, detail: status === null ? 'Fetch failed' : `HTTP ${status}`, weight: 20 },
          { name: 'Title tag present', passed: Boolean(title), detail: title ?? 'No <title> found', weight: 15 },
          { name: 'Meta description present', passed: Boolean(description), detail: description ? `${description.length} characters` : 'No meta description', weight: 15 },
          { name: 'H1 present', passed: Boolean(h1), detail: h1 ?? 'No H1 found', weight: 15 },
          { name: 'Response time under 2s', passed: loadTimeMs <= 2000, detail: `${loadTimeMs} ms`, weight: 10 },
          { name: 'Indexable', passed: indexable, detail: indexable ? 'Indexable' : (noindex ? 'Blocked by robots meta / header' : robotsBlocked ? 'Blocked by robots.txt' : 'Not indexable'), weight: 10 },
        ];
        const score = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
        const page: CrawledPage = {
          url: p.url, status, pageStatus, indexable, description, h1, loadTimeMs,
          depth: p.depth, issues, score, checks, pageSizeBytes: Buffer.byteLength(html),
        };
        const links = status !== null && status < 400 ? extractLinks(html, p.url, origin, settings) : [];
        return { page, links };
      }));
      for (const { page, links } of fetched) {
        levelPages.push(page);
        for (const link of links) {
          if (allPages.length + levelPages.length + nextLevel.length >= settings.pageLimit) break;
          if (!visited.has(link)) { visited.add(link); nextLevel.push({ url: link, depth: page.depth + 1 }); }
        }
      }
      if (allPages.length + levelPages.length >= settings.pageLimit) break;
    }
    await insertLevel(levelPages);
    allPages.push(...levelPages);
    level = nextLevel;
  }
  const ok = allPages.filter((p) => p.pageStatus === 'OK' && p.issues.length === 0).length;
  const summary: CrawlSummary = {
    pages: allPages.length,
    ok: allPages.filter((p) => p.pageStatus === 'OK').length,
    redirects: allPages.filter((p) => p.pageStatus === 'REDIRECT').length,
    errors: allPages.filter((p) => p.pageStatus === 'ERROR').length,
    health: allPages.length ? Math.round((ok / allPages.length) * 100) : 0,
    maxDepth: allPages.reduce((m, p) => Math.max(m, p.depth), 0),
    scannedAt,
  };
  return { summary, pages: allPages };
}

export async function GET(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const params = new URL(req.url).searchParams;
  const projectId = params.get('project_id') ?? '';
  const limit = Math.min(1000, Math.max(1, Number(params.get('limit') ?? 200) || 200));
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, projectId, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  const { data, error } = await supabase.from('audit_scans').select('*').eq('project_id', projectId).order('scanned_at', { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const { count } = await supabase.from('audit_scans').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
  return NextResponse.json({ ok: true, scans: data ?? [], total: count ?? (data ?? []).length, limit, pagespeedConfigured: Boolean(process.env.GOOGLE_PAGESPEED_API_KEY) });
}

export async function POST(req: NextRequest) {
  if (!hasServerSupabase()) return notConfigured();
  const { res, profile } = await auth(req); if (res || !profile) return res!;
  const body = await req.json().catch(() => null);
  if (!body?.project_id) return NextResponse.json({ ok: false, error: 'project_id is required.' }, { status: 400 });
  const supabase = getServerSupabase();
  const project = await getOwnedProject(supabase, body.project_id, profile);
  if (!project) return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  let startUrl = project.website_url;
  if (body.url) {
    const explicit = String(body.url);
    try {
      if (new URL(explicit).origin !== new URL(project.website_url).origin) {
        return NextResponse.json({ ok: false, error: 'url must be on the same origin as the project website.' }, { status: 400 });
      }
    } catch { return NextResponse.json({ ok: false, error: 'url is not a valid URL.' }, { status: 400 }); }
    startUrl = explicit;
  }
  const settings = await loadCrawlSettings(supabase, body.project_id);
  try {
    const { summary, pages } = await crawlWithHtml(supabase, body.project_id, startUrl, settings);
    const home = pages[0] ?? null;
    return NextResponse.json({
      ok: true, crawl: summary, settings,
      pages: pages.slice(0, 50).map((p) => ({ url: p.url, status: p.status, pageStatus: p.pageStatus, indexable: p.indexable, description: p.description, h1: p.h1, loadTimeMs: p.loadTimeMs, depth: p.depth, issues: p.issues, score: p.score })),
      // Back-compat for the old single-audit response shape:
      scan: home ? { url: home.url, score: home.score, checks: home.checks, response_time_ms: home.loadTimeMs, page_size_bytes: home.pageSizeBytes, scanned_at: summary.scannedAt } : null,
      audit: home ? { url: home.url, score: home.score, checks: home.checks, status: home.status, responseTimeMs: home.loadTimeMs, pageSizeBytes: home.pageSizeBytes } : null,
      note: 'Crawl results are real fetches of this project\'s own site only. Health % = pages with status OK and no issues.',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Crawl failed.' }, { status: 400 });
  }
}
