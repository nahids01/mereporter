'use client';
import { useEffect, useMemo, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

type Row = Record<string, unknown>;
type PageDetail = {
  url: string; status: number | null; pageStatus: 'OK' | 'REDIRECT' | 'ERROR';
  indexable: boolean | null; description: string | null; h1: string | null;
  loadTimeMs: number | null; depth: number; issues: string[]; score: number;
  checks: Array<{ name: string; passed: boolean; detail: string; weight: number }>;
  scannedAt: string;
};
type Check = { name: string; passed: boolean; detail: string; weight: number };

function fmt(v: unknown): string { if (!v) return ''; try { return new Date(String(v)).toLocaleString(); } catch { return String(v); } }
function trunc(s: string | null, n: number): string {
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// One audit_scans row -> one crawled-page record. Prefers the migration
// 0010 columns; falls back to the "Page details" checks entry the crawl
// route writes on un-migrated databases; last, derives what it can from
// an old single-page audit row (those show '—' for fields they never had).
function toPage(r: Row): PageDetail {
  const checks = (Array.isArray(r.checks) ? (r.checks as Check[]) : []);
  const detailEntry = checks.find((c) => c.name === 'Page details');
  let detail: Record<string, unknown> | null = null;
  if (detailEntry) { try { detail = JSON.parse(String(detailEntry.detail)); } catch { detail = null; } }
  const issues = (Array.isArray(r.issues) ? (r.issues as string[])
    : Array.isArray(detail?.issues) ? (detail!.issues as string[])
    : checks.filter((c) => !c.passed && c.name !== 'Page details').map((c) => c.name));
  const status = typeof r.status === 'number' ? r.status
    : typeof detail?.status === 'number' ? detail.status as number : null;
  const pageStatus: PageDetail['pageStatus'] = typeof r.page_status === 'string' && ['OK', 'REDIRECT', 'ERROR'].includes(r.page_status)
    ? r.page_status as PageDetail['pageStatus']
    : typeof detail?.pageStatus === 'string' ? detail.pageStatus as PageDetail['pageStatus']
    : (typeof r.score === 'number' && r.score > 0 ? 'OK' : 'ERROR');
  return {
    url: String(r.url ?? ''), status, pageStatus,
    indexable: typeof r.indexable === 'boolean' ? r.indexable
      : typeof detail?.indexable === 'boolean' ? detail.indexable as boolean : null,
    description: typeof r.description === 'string' ? r.description
      : typeof detail?.description === 'string' ? detail.description as string : null,
    h1: typeof r.h1_text === 'string' ? r.h1_text
      : typeof detail?.h1 === 'string' ? detail.h1 as string : null,
    loadTimeMs: typeof r.response_time_ms === 'number' ? r.response_time_ms : null,
    depth: typeof r.depth === 'number' ? r.depth
      : typeof detail?.depth === 'number' ? detail.depth as number : 0,
    issues, score: typeof r.score === 'number' ? r.score : 0,
    checks: checks.filter((c) => c.name !== 'Page details'),
    scannedAt: String(r.scanned_at ?? ''),
  };
}

function statusStyle(s: string): Record<string, string> {
  if (s === 'OK') return { background: '#14532d', color: '#fff' };
  if (s === 'REDIRECT') return { background: '#713f12', color: '#fff' };
  return { background: '#7f1d1d', color: '#fff' };
}

export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [tab, setTab] = useState<'overview' | 'checks' | 'pages'>('overview');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/audit?project_id=${projectId}&limit=1000`);
    if (status === 200) {
      const s = (json.scans as Row[]) ?? [];
      setRows(s); setTotal(Number(json.total ?? s.length));
      setTruncated(s.length >= Number(json.limit ?? 1000));
    } else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);

  async function run() {
    setBusy(true); setMsg('');
    try {
      const j = await callApi('/api/audit', 'POST', { project_id: projectId });
      const c = j.crawl as Record<string, unknown> | undefined;
      setMsg(c ? `Crawl done: ${String(c.pages)} pages — ${String(c.ok)} OK, ${String(c.redirects)} redirected, ${String(c.errors)} errors, health ${String(c.health)}%, max depth ${String(c.maxDepth)}.` : 'Crawl done.');
      await load();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }

  const pages = useMemo(() => rows.map(toPage), [rows]);
  const latestAt = pages[0]?.scannedAt ?? '';
  const latest = useMemo(() => pages.filter((p) => p.scannedAt === latestAt), [pages, latestAt]);
  const history = useMemo(() => {
    const map = new Map<string, PageDetail[]>();
    for (const p of pages) { const arr = map.get(p.scannedAt) ?? []; arr.push(p); map.set(p.scannedAt, arr); }
    return [...map.entries()].filter(([at]) => at !== latestAt);
  }, [pages, latestAt]);

  const health = latest.length ? Math.round((latest.filter((p) => p.pageStatus === 'OK' && p.issues.length === 0).length / latest.length) * 100) : 0;
  const maxDepth = latest.reduce((m, p) => Math.max(m, p.depth), 0);
  const opportunities = useMemo(() => {
    if (!latest.length) return [];
    const count = (pred: (p: PageDetail) => boolean) => latest.filter(pred).length;
    const examples = (pred: (p: PageDetail) => boolean) => latest.filter(pred).slice(0, 3).map((p) => p.url);
    const list: Array<{ title: string; count: number; examples: string[] }> = [];
    const missingDesc = count((p) => !p.description);
    if (missingDesc) list.push({ title: 'Add meta descriptions', count: missingDesc, examples: examples((p) => !p.description) });
    const missingH1 = count((p) => !p.h1);
    if (missingH1) list.push({ title: 'Add an H1 heading', count: missingH1, examples: examples((p) => !p.h1) });
    const slow = count((p) => (p.loadTimeMs ?? 0) > 2000);
    if (slow) list.push({ title: 'Speed up slow pages (over 2s)', count: slow, examples: examples((p) => (p.loadTimeMs ?? 0) > 2000) });
    const errors = count((p) => p.pageStatus === 'ERROR');
    if (errors) list.push({ title: 'Fix error pages', count: errors, examples: examples((p) => p.pageStatus === 'ERROR') });
    const redirects = count((p) => p.pageStatus === 'REDIRECT');
    if (redirects) list.push({ title: 'Review redirected pages', count: redirects, examples: examples((p) => p.pageStatus === 'REDIRECT') });
    const notIndexable = count((p) => p.indexable === false);
    if (notIndexable) list.push({ title: 'Check pages that are not indexable', count: notIndexable, examples: examples((p) => p.indexable === false) });
    return list;
  }, [latest]);

  const checkAgg = useMemo(() => {
    const map = new Map<string, { passed: number; total: number }>();
    for (const p of latest) for (const c of p.checks) {
      const cur = map.get(c.name) ?? { passed: 0, total: 0 };
      cur.total += 1; if (c.passed) cur.passed += 1; map.set(c.name, cur);
    }
    return [...map.entries()];
  }, [latest]);

  if (error) return <AppShell active="audit" title="Site Crawler"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  const tabBtn = (key: typeof tab, label: string) => (
    <button key={key} onClick={() => setTab(key)} style={{ background: tab === key ? BRAND : 'transparent', color: tab === key ? '#000' : '#fff', border: `1px solid ${tab === key ? BRAND : '#2a2a2a'}`, borderRadius: 999, padding: '8px 16px', fontWeight: 800, cursor: 'pointer' }}>{label}</button>
  );
  return (
    <AppShell active="audit" title="Site Crawler" subtitle="A real crawl of the website itself — every page it links to, its status, whether it can be indexed, its description and heading, how fast it loads, and what needs fixing. Nothing here is estimated.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then crawl it here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <PrimaryButton onClick={run} disabled={busy}>{busy ? 'Crawling…' : 'Run crawl'}</PrimaryButton>
              <GhostButton href="/setup?section=crawler">Crawl settings</GhostButton>
            </div>
            {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
          </Panel>
          {rows.length === 0 ? (
            <EmptyState title="No crawls yet" text="No crawl has been run for this website yet. Set up how the crawl should behave first, or run it now with the default settings." actionHref="/setup?section=crawler" actionLabel="Set Up Crawl" />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {tabBtn('overview', 'Overview')}{tabBtn('checks', 'Audit Checks')}{tabBtn('pages', 'All Pages')}
              </div>
              {tab === 'overview' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
                    <Panel style={{ borderTop: `4px solid ${BRAND}` }}><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Crawled pages</div><div style={{ fontSize: 32, fontWeight: 800 }}>{latest.length}</div><div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Latest crawl {fmt(latestAt)}{truncated ? ' — list truncated at 1,000 rows' : ''}</div></Panel>
                    <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Site health</div><div style={{ fontSize: 32, fontWeight: 800 }}>{health}%</div><div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Pages with status OK and no issues</div></Panel>
                    <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Page depth</div><div style={{ fontSize: 32, fontWeight: 800 }}>{maxDepth}</div><div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Deepest page from the home page</div></Panel>
                    <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Status</div><div style={{ marginTop: 8, lineHeight: 1.8 }}>{latest.filter((p) => p.pageStatus === 'OK').length} OK · {latest.filter((p) => p.pageStatus === 'REDIRECT').length} redirected · {latest.filter((p) => p.pageStatus === 'ERROR').length} errors</div></Panel>
                  </div>
                  <Panel style={{ marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 12px' }}>Opportunities — from this crawl only</h3>
                    {opportunities.length === 0 ? <p style={{ color: DIM, margin: 0 }}>No opportunities found in the latest crawl — every page has a description, an H1, a fast load and no errors or redirects.</p> : (
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                        {opportunities.map((o) => (
                          <li key={o.title}><strong>{o.title}</strong> — {o.count} page{o.count === 1 ? '' : 's'}
                            <div style={{ color: DIM, fontSize: 13, wordBreak: 'break-all' }}>{o.examples.join(' · ')}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                  {history.length > 0 && (
                    <Panel>
                      <h3 style={{ margin: '0 0 12px' }}>Previous crawls ({total} stored rows in total)</h3>
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                        {history.map(([at, ps]) => (
                          <li key={at}>{fmt(at)} — {ps.length} page{ps.length === 1 ? '' : 's'}, {ps.filter((p) => p.pageStatus === 'OK' && p.issues.length === 0).length} healthy, {ps.filter((p) => p.pageStatus === 'ERROR').length} errors</li>
                        ))}
                      </ul>
                    </Panel>
                  )}
                </>
              )}
              {tab === 'checks' && (
                <Panel>
                  <h3 style={{ margin: '0 0 12px' }}>Audit checks — latest crawl ({latest.length} pages)</h3>
                  {checkAgg.length === 0 ? <p style={{ color: DIM, margin: 0 }}>No checks recorded for the latest crawl.</p> : (
                    <table style={tableStyle}><thead><tr><th style={thStyle}>Check</th><th style={thStyle}>Pages passing</th><th style={thStyle}>Pages checked</th></tr></thead>
                    <tbody>{checkAgg.map(([name, v]) => (
                      <tr key={name}><td style={tdStyle}>{name}</td><td style={tdStyle}>{v.passed}</td><td style={tdStyle}>{v.total}</td></tr>
                    ))}</tbody></table>
                  )}
                </Panel>
              )}
              {tab === 'pages' && (
                <Panel>
                  <h3 style={{ margin: '0 0 12px' }}>Pages &amp; issues — latest crawl</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}><thead><tr>
                      <th style={thStyle}>URL</th><th style={thStyle}>Indexable</th><th style={thStyle}>Description</th><th style={thStyle}>H1</th><th style={thStyle}>Load time</th><th style={thStyle}>Depth</th><th style={thStyle}>Status</th><th style={thStyle}>Issues</th>
                    </tr></thead>
                    <tbody>{latest.map((p) => (
                      <tr key={p.url}>
                        <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{p.url}</td>
                        <td style={tdStyle}>{p.indexable === null ? '—' : p.indexable ? 'Yes' : 'No'}</td>
                        <td style={{ ...tdStyle, wordBreak: 'break-word' }}>{trunc(p.description, 80)}</td>
                        <td style={{ ...tdStyle, wordBreak: 'break-word' }}>{trunc(p.h1, 60)}</td>
                        <td style={tdStyle}>{p.loadTimeMs === null ? '—' : `${p.loadTimeMs} ms`}</td>
                        <td style={tdStyle}>{p.depth}</td>
                        <td style={tdStyle}><span style={{ ...statusStyle(p.pageStatus), borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{p.pageStatus}{p.status !== null ? ` (${p.status})` : ''}</span></td>
                        <td style={tdStyle}>{p.issues.length ? p.issues.join(', ') : '—'}</td>
                      </tr>
                    ))}</tbody></table>
                  </div>
                </Panel>
              )}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
