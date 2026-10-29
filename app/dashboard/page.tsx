'use client';
// Per-URL dashboard (Nightwatch-style). Every number below comes only from
// the project's own /api/rank, /api/audit, /api/import, /api/competitors and
// /api/ai-visibility responses. Anything with no real data shows "No data".
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useProjects } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, BRAND, MUTED, DIM, BORDER } from '@/lib/app-shell';

type AnyRow = Record<string, unknown>;
type Kpi = { label: string; value: string; note: string };

function domainOf(p: { website_url: string; name: string }): string {
  try { return new URL(p.website_url).hostname.replace(/^www\./i, ''); } catch { return p.name; }
}
function num(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function dateOf(v: unknown): string {
  if (!v) return '';
  try { return new Date(String(v)).toLocaleDateString(); } catch { return String(v); }
}

export default function DashboardPage() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rangeDays, setRangeDays] = useState(14);
  const [collecting, setCollecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [keywords, setKeywords] = useState<AnyRow[]>([]);
  const [snapshots, setSnapshots] = useState<AnyRow[]>([]);
  const [imports, setImports] = useState<AnyRow[]>([]);
  const [competitors, setCompetitors] = useState<AnyRow[]>([]);
  const [prompts, setPrompts] = useState<AnyRow[]>([]);
  const [scans, setScans] = useState<AnyRow[]>([]);

  // Honour ?project_id= and ?collecting=1, and the locally stored range.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      setCollecting(q.get('collecting') === '1');
      const stored = Number(window.localStorage.getItem('mereporter-dashboard-range') ?? '');
      if ([7, 14, 30, 90].includes(stored)) setRangeDays(stored);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('project_id');
      if (id && projects.some((p) => p.id === id) && id !== projectId) setProjectId(id);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);
  function changeRange(days: number) {
    setRangeDays(days);
    try { window.localStorage.setItem('mereporter-dashboard-range', String(days)); } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!projectId) { setKeywords([]); setSnapshots([]); setImports([]); setCompetitors([]); setPrompts([]); setScans([]); setLoading(false); return; }
    (async () => {
      setLoading(true); setMsg('');
      try {
        const [rank, audit, imp, comp, ai] = await Promise.all([
          apiFetch(`/api/rank?project_id=${projectId}`),
          apiFetch(`/api/audit?project_id=${projectId}`),
          apiFetch(`/api/import?project_id=${projectId}`),
          apiFetch(`/api/competitors?project_id=${projectId}`),
          apiFetch(`/api/ai-visibility?project_id=${projectId}`),
        ]);
        for (const r of [rank, audit, imp, comp, ai]) {
          if (r.status >= 400) throw new Error(String(r.json.error ?? `Dashboard load failed (${r.status})`));
        }
        setKeywords((rank.json.keywords as AnyRow[] | undefined) ?? []);
        setSnapshots((rank.json.snapshots as AnyRow[] | undefined) ?? []);
        setScans((audit.json.scans as AnyRow[] | undefined) ?? []);
        setImports((imp.json.imports as AnyRow[] | undefined) ?? []);
        setCompetitors((comp.json.competitors as AnyRow[] | undefined) ?? []);
        setPrompts((ai.json.prompts as AnyRow[] | undefined) ?? []);
      } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not load dashboard data.'); }
      setLoading(false);
    })();
  }, [projectId]);

  const selected = projects.find((p) => p.id === projectId);
  const data = useMemo(() => {
    const serp = keywords.filter((k) => k.kind === 'serp');
    const ranked = serp.filter((k) => num(k.rank) !== null);
    const avgPos = ranked.length
      ? (ranked.reduce((s, k) => s + (num(k.rank) ?? 0), 0) / ranked.length).toFixed(1)
      : null;
    const visibility = serp.length ? Math.round((ranked.length / serp.length) * 100) : null;
    const top3 = ranked.filter((k) => (num(k.rank) ?? 999) <= 3).length;
    const top10 = ranked.filter((k) => (num(k.rank) ?? 999) <= 10).length;
    const top100 = ranked.filter((k) => (num(k.rank) ?? 999) <= 100).length;
    const noRank = serp.length - ranked.length;
    const pct = (n: number) => (serp.length ? `${Math.round((n / serp.length) * 100)}%` : '—');

    const checked = prompts.filter((p) => p.result_json !== null);
    const mentioned = checked.filter((p) => p.brand_mentioned === true).length;
    const aiShare = checked.length ? Math.round((mentioned / checked.length) * 100) : null;
    const presence = checked.length === 0 ? 'No data' : mentioned === 0 ? 'Not mentioned' : (mentioned / checked.length) >= 0.5 ? 'Strong' : 'Occasional';

    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const inRange = snapshots.filter((s) => {
      const t = Date.parse(String(s.checked_at ?? ''));
      return Number.isFinite(t) && t >= cutoff && num(s.rank) !== null && s.kind !== 'gbp';
    });
    const byKw = new Map<string, AnyRow[]>();
    for (const s of inRange) {
      const key = String(s.keyword ?? '');
      if (!byKw.has(key)) byKw.set(key, []);
      byKw.get(key)!.push(s);
    }
    let improved = 0; let declined = 0; let unchanged = 0;
    const moves: { keyword: string; from: number; to: number; delta: number }[] = [];
    for (const [keyword, rows] of byKw) {
      const sorted = [...rows].sort((a, b) => String(a.checked_at ?? '').localeCompare(String(b.checked_at ?? '')));
      const from = num(sorted[0]?.rank); const to = num(sorted[sorted.length - 1]?.rank);
      if (from === null || to === null || sorted.length < 2) continue;
      const delta = to - from; // negative delta = rank number fell = improved
      if (delta < 0) improved++; else if (delta > 0) declined++; else unchanged++;
      if (delta !== 0) moves.push({ keyword, from, to, delta });
    }
    const gains = [...moves].filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
    const losses = [...moves].filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);

    const bySource = new Map<string, AnyRow[]>();
    for (const r of imports) {
      const src = String(r.source ?? 'import');
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src)!.push(r);
    }
    const viewRows = [...bySource.entries()].map(([source, rows]) => ({
      source,
      rows: rows.length,
      latest: rows.map((r) => String(r.imported_at ?? r.created_at ?? '')).filter(Boolean).sort().reverse()[0] ?? '',
    }));

    return {
      serp, ranked, avgPos, visibility, top3, top10, top100, noRank, pct,
      aiShare, presence, checked: checked.length, mentioned, totalPrompts: prompts.length,
      improved, declined, unchanged, gains, losses, viewRows,
      queued: serp.filter((k) => num(k.rank) === null).length,
    };
  }, [keywords, prompts, snapshots, imports, rangeDays]);

  const kpis: Kpi[] = [
    { label: 'Search visibility', value: data.visibility === null ? 'No data' : `${data.visibility}%`, note: 'Share of tracked SERP keywords with a recorded rank. “No data” means no SERP keywords are tracked yet.' },
    { label: 'AI visibility', value: data.aiShare === null ? 'No data' : `${data.aiShare}%`, note: 'Share of checked AI prompts where the brand was recorded as mentioned. Prompts with no stored result are not counted.' },
    { label: 'Average position', value: data.avgPos ?? 'No data', note: 'Average of recorded SERP ranks only, on the 100→1 scale (1 is best). Keywords with no rank are left out, never counted as a rank.' },
    { label: 'Traffic value', value: 'No data', note: 'No traffic-value (currency) data has been imported for this project, so no $ figure is shown — clicks are never converted into dollars here.' },
  ];

  const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 16 };
  const domain = selected ? domainOf(selected) : '';

  if (error) {
    return (
      <AppShell active="dashboard" title="Dashboard" subtitle="Your projects, at a glance.">
        <Panel>
          {/no profile|no approved profile/i.test(error)
            ? <>No profile found. Go to <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a>, sign in again (or sign up if you have not yet), then come back to the dashboard.</>
            : <>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</>}
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell
      active="dashboard"
      title={selected ? selected.name : 'Dashboard'}
      subtitle={selected ? `${selected.website_url}${selected.location ? ` · ${selected.location}` : ''}` : 'Add a project to see its numbers here. No demo project is pre-filled.'}
    >
      {projects.length === 0 ? (
        <Panel style={{ textAlign: 'center', padding: 32 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>No projects yet</h2>
          <p style={{ margin: '0 0 20px', color: MUTED, lineHeight: 1.6 }}>Add your first client website and its keywords to see KPIs here. Everything you see will be your own data.</p>
          <PrimaryButton><a href="/projects?step=website" style={{ color: '#000', textDecoration: 'none' }}>Add a URL</a></PrimaryButton>
        </Panel>
      ) : (
        <>
          <p style={{ color: MUTED, fontSize: 13, margin: '0 0 12px' }}>
            <a href={`/dashboard?project_id=${projectId}`} style={{ color: MUTED, textDecoration: 'none' }}>{domain || 'Dashboard'}</a>
            <span style={{ color: DIM }}> &gt; </span>Dashboard
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: MUTED, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ background: '#0f0f0f', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
            </select>
            <span style={{ color: MUTED, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Date range</span>
            <select value={rangeDays} onChange={(e) => changeRange(Number(e.target.value))} aria-label="Date range" style={{ background: '#0f0f0f', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <GhostButton href="/setup">Site settings</GhostButton>
          </div>

          {collecting ? (
            <Panel style={{ marginTop: 16, borderColor: BRAND }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Collecting first rankings</h2>
              <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px' }}>This is the new URL&apos;s first collection. Steps below are computed from this project&apos;s stored data only.</p>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                <li>Keywords queued: {data.serp.length > 0 ? `${data.serp.length} queued (${data.queued} still without a rank)` : 'No keywords added yet — add them from the Keywords page.'}</li>
                <li>Rankings collected: {data.ranked.length > 0 ? `${data.ranked.length} of ${data.serp.length} keywords have a recorded rank` : 'None collected yet.'}</li>
                <li>Visibility calculated: {data.visibility === null ? 'Not yet — needs at least one recorded rank.' : `Yes — ${data.visibility}% from recorded ranks.`}</li>
                <li>AI visibility collected: {data.checked > 0 ? `${data.checked} of ${data.totalPrompts} prompts checked` : 'None checked yet.'}</li>
              </ul>
              {data.serp.length === 0 ? <div style={{ marginTop: 12 }}><PrimaryButton><a href={`/rank/add?project_id=${projectId}`} style={{ color: '#000', textDecoration: 'none' }}>Add keywords →</a></PrimaryButton></div> : null}
            </Panel>
          ) : null}

          {loading ? <p style={{ color: MUTED }}>Loading your numbers…</p> : (
            <div style={gridStyle}>
              {kpis.map((k) => (
                <Panel key={k.label} style={{ borderTop: `4px solid ${BRAND}` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: MUTED }}>{k.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, margin: '8px 0' }}>{k.value}</div>
                  <small style={{ color: MUTED, lineHeight: 1.5 }}>{k.note}</small>
                </Panel>
              ))}
            </div>
          )}
          {msg ? <p style={{ color: '#fca5a5' }}>{msg}</p> : null}

          <div style={gridStyle}>
            <Panel>
              <h3 style={{ margin: '0 0 12px' }}>Ranking distribution</h3>
              {data.serp.length === 0 ? <p style={{ color: DIM, fontSize: 14 }}>No data — no SERP keywords tracked yet.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <tbody>
                    <tr><td style={{ padding: '6px 0' }}>Top 3</td><td style={{ padding: '6px 0', textAlign: 'right' }}>{data.top3} ({data.pct(data.top3)})</td></tr>
                    <tr><td style={{ padding: '6px 0' }}>Top 10</td><td style={{ padding: '6px 0', textAlign: 'right' }}>{data.top10} ({data.pct(data.top10)})</td></tr>
                    <tr><td style={{ padding: '6px 0' }}>Top 100</td><td style={{ padding: '6px 0', textAlign: 'right' }}>{data.top100} ({data.pct(data.top100)})</td></tr>
                    <tr><td style={{ padding: '6px 0' }}>No rank</td><td style={{ padding: '6px 0', textAlign: 'right' }}>{data.noRank} ({data.pct(data.noRank)})</td></tr>
                  </tbody>
                </table>
              )}
              <p style={{ color: DIM, fontSize: 12, lineHeight: 1.5, margin: '8px 0 0' }}>Bands are cumulative: Top 10 includes Top 3, and Top 100 includes both — so the percentages add up to more than 100% by design.</p>
            </Panel>
            <Panel>
              <h3 style={{ margin: '0 0 12px' }}>Ranking movement</h3>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>Last {rangeDays} days, from recorded ranking history. Keywords with fewer than 2 snapshots in the range are not counted.</p>
              <p style={{ margin: 0, lineHeight: 1.8 }}>Improved: <strong>{data.improved}</strong><br />Declined: <strong>{data.declined}</strong><br />Unchanged: <strong>{data.unchanged}</strong></p>
            </Panel>
            <Panel>
              <h3 style={{ margin: '0 0 12px' }}>AI answer presence</h3>
              <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>{data.presence}</p>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                {data.checked === 0
                  ? 'No data — no AI prompt has a stored check result yet.'
                  : `${data.mentioned} of ${data.checked} checked prompts record the brand as mentioned. Rule: Strong ≥50% mentioned, Occasional &gt;0%, otherwise Not mentioned.`}
              </p>
            </Panel>
          </div>

          <h2 style={{ margin: '32px 0 4px', fontSize: 22 }}>View performance</h2>
          <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px' }}>Imported data by source for this project (no keyword-view records exist yet, so this shows what has actually been imported).</p>
          {data.viewRows.length === 0 ? <p style={{ color: DIM }}>No data — nothing imported yet.</p> : (
            <Panel>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr><th style={{ textAlign: 'left', color: MUTED, fontSize: 12, padding: '8px' }}>Source</th><th style={{ textAlign: 'left', color: MUTED, fontSize: 12, padding: '8px' }}>Imported rows</th><th style={{ textAlign: 'left', color: MUTED, fontSize: 12, padding: '8px' }}>Latest import</th></tr></thead>
                <tbody>
                  {data.viewRows.map((r) => (
                    <tr key={r.source}><td style={{ padding: 8, borderTop: `1px solid ${BORDER}` }}>{r.source}</td><td style={{ padding: 8, borderTop: `1px solid ${BORDER}` }}>{r.rows}</td><td style={{ padding: 8, borderTop: `1px solid ${BORDER}` }}>{r.latest ? dateOf(r.latest) : 'No data'}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <h2 style={{ margin: '32px 0 4px', fontSize: 22 }}>Competitor performance</h2>
          {competitors.length === 0 ? (
            <Panel style={{ textAlign: 'center', padding: 28 }}>
              <p style={{ margin: '0 0 16px', color: MUTED }}>No competitors added</p>
              <PrimaryButton><a href={`/competitors?project_id=${projectId}`} style={{ color: '#000', textDecoration: 'none' }}>Add Competitors</a></PrimaryButton>
            </Panel>
          ) : (
            <Panel>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                {competitors.map((c) => <li key={String(c.id ?? c.domain)}>{String(c.domain ?? c.name ?? 'Competitor')}</li>)}
              </ul>
              <div style={{ marginTop: 12 }}><GhostButton href={`/competitors?project_id=${projectId}`}>Add Competitors</GhostButton></div>
            </Panel>
          )}

          <h2 style={{ margin: '32px 0 4px', fontSize: 22 }}>Google Analytics</h2>
          <Panel>
            {selected?.ga4_property_id
              ? <p style={{ margin: 0, lineHeight: 1.6 }}>Connected — property {selected.ga4_property_id} is stored for this project.</p>
              : <><p style={{ margin: '0 0 16px', color: MUTED }}>Not connected</p><PrimaryButton><a href={`/integrations?project_id=${projectId}`} style={{ color: '#000', textDecoration: 'none' }}>Connect Analytics</a></PrimaryButton></>}
          </Panel>

          <div style={gridStyle}>
            <Panel>
              <h3 style={{ margin: '0 0 12px' }}>Top gains</h3>
              {data.gains.length === 0 ? <p style={{ color: DIM, fontSize: 14 }}>No data — no keyword improved within the last {rangeDays} days of recorded history.</p> : (
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                  {data.gains.map((g) => <li key={g.keyword}>{g.keyword} — #{g.from} → #{g.to}</li>)}
                </ul>
              )}
            </Panel>
            <Panel>
              <h3 style={{ margin: '0 0 12px' }}>Top losses</h3>
              {data.losses.length === 0 ? <p style={{ color: DIM, fontSize: 14 }}>No data — no keyword declined within the last {rangeDays} days of recorded history.</p> : (
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                  {data.losses.map((g) => <li key={g.keyword}>{g.keyword} — #{g.from} → #{g.to}</li>)}
                </ul>
              )}
            </Panel>
            <Panel>
              <h3 style={{ margin: '0 0 12px' }}>Latest site audit</h3>
              {scans.length === 0 ? <p style={{ color: DIM, fontSize: 14 }}>No data — no audit has been run for this project yet.</p> : (
                <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  Latest scan: {dateOf(scans[0]?.created_at ?? scans[0]?.checked_at)}
                  {typeof scans[0]?.score === 'number' ? <> — score {String(scans[0].score)}</> : null}.
                  Full checks live on the Site Crawler page.
                </p>
              )}
            </Panel>
          </div>
          <p style={{ marginTop: 20, color: DIM, fontSize: 13, lineHeight: 1.6 }}>
            All figures above come from this project&apos;s stored ranks, snapshots, imports, competitors and AI prompt results. Missing data is shown as no-data, never estimated.
          </p>
        </>
      )}
    </AppShell>
  );
}
