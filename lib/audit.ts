// Live site audit: fetches the project's OWN URL and scores ONLY real checks.
// Score is 0-100 from these checks alone (weights sum to 100). No PageSpeed
// score is mixed in: optional PageSpeed data is stored separately as info.
export type AuditCheck = { name: string; passed: boolean; detail: string; weight: number };
export type AuditResult = {
  url: string; status: number | null; https: boolean; responseTimeMs: number; pageSizeBytes: number;
  score: number; checks: AuditCheck[]; title: string | null; metaDescription: string | null;
  h1Count: number; h2Count: number; imageCount: number; imagesWithAlt: number; linkCount: number; viewport: boolean;
};

function textBetween(html: string, re: RegExp): string | null {
  const m = re.exec(html); return m ? m[1].replace(/<[^>]+>/g, '').trim() || null : null;
}
function countMatches(html: string, re: RegExp): number { return html.match(re)?.length ?? 0; }

export function computeScore(checks: AuditCheck[]): number {
  return checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
}

export async function runLiveAudit(url: string): Promise<AuditResult> {
  const started = Date.now();
  let res: Response;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'MeReporter/0.1 audit' } });
    clearTimeout(t);
  } catch (e) {
    const checks: AuditCheck[] = [{ name: 'Site reachable (HTTP 200)', passed: false, detail: e instanceof Error ? e.message : 'fetch failed', weight: 10 }];
    return { url, status: null, https: url.startsWith('https://'), responseTimeMs: Date.now() - started, pageSizeBytes: 0, score: 0, checks, title: null, metaDescription: null, h1Count: 0, h2Count: 0, imageCount: 0, imagesWithAlt: 0, linkCount: 0, viewport: false };
  }
  const responseTimeMs = Date.now() - started;
  const html = await res.text().catch(() => '');
  const pageSizeBytes = Buffer.byteLength(html);
  const title = textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc = textBetween(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)
    ?? textBetween(html, /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const h1Count = countMatches(html, /<h1[\s>]/gi);
  const h2Count = countMatches(html, /<h2[\s>]/gi);
  const imgTags = html.match(/<img[^>]*>/gi) ?? [];
  const imagesWithAlt = imgTags.filter((t) => /alt=["'][^"']+["']/i.test(t)).length;
  const linkCount = countMatches(html, /<a[\s>][^>]*href=/gi);
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const https = url.startsWith('https://');
  const altScore = imgTags.length === 0 ? 15 : Math.round((imagesWithAlt / imgTags.length) * 15);
  const checks: AuditCheck[] = [
    { name: 'HTTPS', passed: https, detail: https ? 'Served over HTTPS' : 'Not HTTPS', weight: 10 },
    { name: 'Site reachable (HTTP 200)', passed: res.status === 200, detail: `HTTP ${res.status}`, weight: 10 },
    { name: 'Title tag present', passed: Boolean(title), detail: title ?? 'No <title> found', weight: 10 },
    { name: 'Meta description present', passed: Boolean(metaDesc), detail: metaDesc ? `${metaDesc.length} characters` : 'No meta description', weight: 10 },
    { name: 'Exactly one H1', passed: h1Count === 1, detail: `${h1Count} H1 tag(s) found`, weight: 10 },
    { name: 'Viewport meta tag', passed: viewport, detail: viewport ? 'Viewport present' : 'No viewport meta tag', weight: 10 },
    { name: 'Images have alt text', passed: imgTags.length === 0 || imagesWithAlt === imgTags.length, detail: `${imagesWithAlt}/${imgTags.length} images have alt text`, weight: 15 },
    { name: 'Subheadings (H2) present', passed: h2Count > 0, detail: `${h2Count} H2 tag(s) found`, weight: 5 },
    { name: 'Links present', passed: linkCount > 0, detail: `${linkCount} link(s) found`, weight: 5 },
    { name: 'Response time under 2s', passed: responseTimeMs <= 2000, detail: `${responseTimeMs} ms`, weight: 10 },
    { name: 'Page size under 500 KB', passed: pageSizeBytes <= 500 * 1024, detail: `${Math.round(pageSizeBytes / 1024)} KB`, weight: 5 },
  ];
  // Replace the proportional alt check weight with its proportional score contribution:
  const score = checks.reduce((s, c) => s + (c.name === 'Images have alt text' ? altScore : c.passed ? c.weight : 0), 0);
  return { url, status: res.status, https, responseTimeMs, pageSizeBytes, score, checks, title, metaDescription: metaDesc, h1Count, h2Count, imageCount: imgTags.length, imagesWithAlt, linkCount, viewport };
}

export async function fetchPageSpeed(url: string): Promise<unknown | null> {
  const key = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&key=${encodeURIComponent(key)}`);
    if (!res.ok) return { error: `PageSpeed HTTP ${res.status}` };
    const json = await res.json().catch(() => null);
    const cat = json?.lighthouseResult?.categories?.performance;
    return { performanceScore: cat?.score ?? null, note: 'Info only — MeReporter audit score above is computed from its own live checks, not from PageSpeed.' };
  } catch (e) { return { error: e instanceof Error ? e.message : 'PageSpeed request failed' }; }
}
