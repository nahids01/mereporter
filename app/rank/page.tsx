'use client';
import { useEffect, useMemo, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, BRAND, BORDER, EmptyState } from '@/lib/app-shell';

type Row = Record<string, unknown>;
type Snap = { keyword: string; kind: string; rank: number | null; checked_at: string };
type GridSnap = { keyword: string; grid_json: Array<{ rank: number | null }> | null; created_at: string };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function time(v: unknown): number {
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : 0;
}
function fmtDate(v: unknown): string {
  if (!v) return '—';
  try { return new Date(String(v)).toLocaleDateString(); } catch { return '—'; }
}
// Latest-vs-previous snapshot movement for one keyword: 'up' means the rank
// number fell (improved), 'down' means it rose, 'same' means unchanged.
function movement(snaps: Snap[]): 'up' | 'down' | 'same' | null {
  const ordered = snaps.filter((s) => s.rank !== null).sort((a, b) => time(b.checked_at) - time(a.checked_at));
  if (ordered.length < 2) return null;
  const diff = (ordered[0].rank as number) - (ordered[1].rank as number);
  if (diff < 0) return 'up';
  if (diff > 0) return 'down';
  return 'same';
}
// Change vs a snapshot near (now - windowDays): returns rank delta
// (negative = improved) or null when no usable snapshot exists.
function windowChange(snaps: Snap[], latestRank: number | null, windowDays: number): number | null {
  if (latestRank === null) return null;
  const target = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const candidates = snaps.filter((s) => s.rank !== null && time(s.checked_at) > 0);
  if (candidates.length < 2) return null;
  let best = candidates[0]; let bestDist = Math.abs(time(best.checked_at) - target);
  for (const s of candidates) {
    const d = Math.abs(time(s.checked_at) - target);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  // Only count it if the comparison point is genuinely older than the latest.
  const latest = [...candidates].sort((a, b) => time(b.checked_at) - time(a.checked_at))[0];
  if (best === latest) return null;
  return latestRank - (best.rank as number);
}
function changeLabel(delta: number | null): string {
  if (delta === null) return '–';
  if (delta === 0) return '0';
  return delta < 0 ? `↑${Math.abs(delta)}` : `↓${delta}`;
}
function Sparkline({ snaps }: { snaps: Snap[] }) {
  const pts = snaps.filter((s) => s.rank !== null).sort((a, b) => time(a.checked_at) - time(b.checked_at));
  if (pts.length < 2) return <span style={{ color: DIM }}>–</span>;
  const ranks = pts.map((p) => p.rank as number);
  const min = Math.min(...ranks); const max = Math.max(...ranks);
  const span = max - min || 1;
  const coords = pts.map((p, i) => {
    const x = pts.length === 1 ? 0 : (i / (pts.length - 1)) * 96;
    const y = 4 + ((p.rank as number) - min) / span * 22; // lower rank = higher on the line
    return `${x},${28 - y}`;
  }).join(' ');
  return (
    <svg width="100" height="30" viewBox="0 0 100 30" aria-label="Rank history">
      <polyline points={coords} fill="none" stroke={BRAND} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [grids, setGrids] = useState<GridSnap[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [kindTab, setKindTab] = useState<'all' | 'serp' | 'gbp'>('all');
  const [moveFilter, setMoveFilter] = useState<'all' | 'up' | 'down'>('all');
  const [search, setSearch] = useState('');
  const [rankFilter, setRankFilter] = useState<'all' | 'ranked' | 'unranked'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [dynamic, setDynamic] = useState(false); // Dynamic: hide the all-"–" SV/Tags columns to focus on real data
  const [cols, setCols] = useState({ evolution: true, dwm: true, sv: true, tags: true });
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [openMore, setOpenMore] = useState<string | null>(null);

  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/rank?project_id=${projectId}`);
    if (status === 200) {
      setRows(((json.keywords as Row[]) ?? []));
      setSnaps(((json.snapshots as Snap[]) ?? []));
      setIsAdmin(Boolean(json.isAdmin));
    } else setMsg(String(json.error ?? 'Load failed'));
    const g = await apiFetch(`/api/gbp-grid?project_id=${projectId}`);
    if (g.status === 200) setGrids(((g.json.snapshots as GridSnap[]) ?? []));
  }
  useEffect(() => { load(); setPage(1); }, [projectId]);

  const snapsByKw = useMemo(() => {
    const m = new Map<string, Snap[]>();
    for (const s of snaps) {
      const key = `${s.kind}:${s.keyword}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  }, [snaps]);
  const gridAvgByKw = useMemo(() => {
    const m = new Map<string, { avg: number; points: number; found: number }>();
    const sorted = [...grids].sort((a, b) => time(b.created_at) - time(a.created_at));
    for (const g of sorted) {
      if (m.has(g.keyword)) continue;
      const pts = Array.isArray(g.grid_json) ? g.grid_json : [];
      const found = pts.map((p) => p.rank).filter((r): r is number => r !== null);
      m.set(g.keyword, { avg: found.length ? found.reduce((a, b) => a + b, 0) / found.length : NaN, points: pts.length, found: found.length });
    }
    return m;
  }, [grids]);
  const moveByKw = useMemo(() => {
    const m = new Map<string, 'up' | 'down' | 'same' | null>();
    for (const r of rows) m.set(`${r.kind}:${r.keyword}`, movement(snapsByKw.get(`${r.kind}:${r.keyword}`) ?? []));
    return m;
  }, [rows, snapsByKw]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindTab !== 'all' && r.kind !== kindTab) return false;
      const mv = moveByKw.get(`${r.kind}:${r.keyword}`);
      if (moveFilter === 'up' && mv !== 'up') return false;
      if (moveFilter === 'down' && mv !== 'down') return false;
      if (rankFilter === 'ranked' && num(r.rank) === null) return false;
      if (rankFilter === 'unranked' && num(r.rank) !== null) return false;
      if (q && !String(r.keyword).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, kindTab, moveFilter, rankFilter, search, moveByKw]);

  const counts = useMemo(() => {
    let up = 0; let down = 0;
    for (const r of rows) {
      const mv = moveByKw.get(`${r.kind}:${r.keyword}`);
      if (mv === 'up') up++;
      if (mv === 'down') down++;
    }
    return { all: rows.length, up, down };
  }, [rows, moveByKw]);

  const kpis = useMemo(() => {
    const pool = kindTab === 'all' ? rows : rows.filter((r) => r.kind === kindTab);
    const ranked = pool.map((r) => num(r.rank)).filter((v): v is number => v !== null);
    const avg = ranked.length ? ranked.reduce((a, b) => a + b, 0) / ranked.length : null;
    const top3 = ranked.filter((v) => v <= 3).length;
    const top10 = ranked.filter((v) => v <= 10).length;
    const top100 = ranked.filter((v) => v <= 100).length;
    return { avg, indexed: ranked.length, total: pool.length, pct: pool.length ? Math.round(ranked.length / pool.length * 100) : 0, top3, top10, top100, noRank: pool.length - ranked.length };
  }, [rows, kindTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  async function recheckOne(r: Row) {
    setBusy(true);
    try {
      await callApi('/api/rank', 'POST', { project_id: projectId, keyword: String(r.keyword), kind: String(r.kind) });
      setMsg(`Re-checked "${String(r.keyword)}".`);
      await load();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false); setOpenMore(null);
  }
  async function runFullLiveCheck() {
    setBusy(true); setMsg('Running the full live check — every stored search keyword once, every stored local keyword on a 3×3 grid…');
    try {
      const j = await callApi('/api/integrations/dataforseo/run-all', 'POST', { project_id: projectId });
      const r = j as Record<string, unknown>;
      setMsg(`Full live check done: ${String(r.serpChecked)} search keywords, ${String(r.gbpChecked)} local keywords, ${String(r.searchesUsed)} searches used. Ranks below are the latest recorded values.`);
      await load();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }

  if (error) return <AppShell active="rank" title="Keywords"><Panel>{error} — sign in at <a href="/login" style={{ color: '#FF863B', fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="rank" title="Keywords" subtitle="Search keywords and local (Google Business) keywords are kept completely separate. A rank is only shown when it was actually recorded — otherwise it stays “No data”. Search volume, tags and ranking URLs show “–” where no value was stored for that keyword.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then come back here to add its keywords." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Website</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
            </select>
          </Panel>

          {/* SERP vs GBP split tabs — everywhere on this page */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            {(['all', 'serp', 'gbp'] as const).map((f) => (
              <button key={f} onClick={() => { setKindTab(f); setPage(1); }} style={{ background: kindTab === f ? '#FF863B' : 'transparent', color: kindTab === f ? '#000' : '#fff', border: '1px solid #2a2a2a', borderRadius: 999, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                {f === 'all' ? `All Keywords (${rows.length})` : f === 'serp' ? `SERP (${rows.filter((r) => r.kind === 'serp').length})` : `GBP (${rows.filter((r) => r.kind === 'gbp').length})`}
              </button>
            ))}
            <a href="/rank/add" style={{ background: BRAND, color: '#000', borderRadius: 999, padding: '8px 18px', fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>+ Add Keywords</a>
            {/* ADMIN-ONLY: non-admins never see this button or any provider clue. */}
            {isAdmin ? <PrimaryButton onClick={runFullLiveCheck} disabled={busy}>Run full live check</PrimaryButton> : null}
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
            <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>AVERAGE POSITION</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{kpis.avg === null ? '–' : kpis.avg.toFixed(1)}</div><div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Mean of recorded ranks only</div></Panel>
            <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>SEARCH VISIBILITY</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{kpis.pct}%</div><div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Indexed Pages: {kpis.indexed} of {kpis.total} · Click Potential: – (no search-volume data stored)</div></Panel>
            <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>KEYWORD DISTRIBUTION</div><div style={{ fontSize: 15, fontWeight: 700, marginTop: 8, lineHeight: 1.8 }}>Top 3: {kpis.top3} · Top 10: {kpis.top10}<br />Top 100: {kpis.top100} · No rank: {kpis.noRank}</div></Panel>
            <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>TRAFFIC VALUE</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>–</div><div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>No CPC / search-volume data stored</div></Panel>
            <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>KEYWORDS UP / DOWN</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}><span style={{ color: '#4ade80' }}>↑{counts.up}</span> / <span style={{ color: '#f87171' }}>↓{counts.down}</span></div><div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Latest vs previous stored snapshot</div></Panel>
          </div>

          {showChart ? (
            <Panel style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px' }}>Keyword distribution chart</h3>
              {([['Top 3', kpis.top3], ['Top 10', kpis.top10], ['Top 100', kpis.top100], ['No rank', kpis.noRank]] as const).map(([label, v]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 70, color: MUTED, fontSize: 13 }}>{label}</span>
                  <div style={{ flex: 1, background: '#0f0f0f', borderRadius: 8, height: 18, overflow: 'hidden' }}>
                    <div style={{ width: `${kpis.total ? Math.round(v / kpis.total * 100) : 0}%`, background: BRAND, height: '100%' }} />
                  </div>
                  <span style={{ width: 30, textAlign: 'right', fontWeight: 700 }}>{v}</span>
                </div>
              ))}
              <p style={{ color: DIM, fontSize: 12, margin: '8px 0 0' }}>Counts only — no estimated traffic or value is charted.</p>
            </Panel>
          ) : null}

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Sidebar: movement filters with counts */}
            <div style={{ width: 200, flexShrink: 0 }}>
              <Panel>
                <div style={{ color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>KEYWORDS</div>
                {([['all', `All Keywords (${counts.all})`], ['up', `Keywords went up (${counts.up})`], ['down', `Keywords went down (${counts.down})`]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => { setMoveFilter(key); setPage(1); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: moveFilter === key ? BRAND : 'transparent', color: moveFilter === key ? '#000' : '#e5e7eb', border: 'none', borderRadius: 8, padding: '9px 10px', fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>{label}</button>
                ))}
                <p style={{ color: DIM, fontSize: 11, lineHeight: 1.5, margin: '10px 0 0' }}>Movement compares the latest stored snapshot with the previous one. Keywords with fewer than two snapshots appear only under All Keywords.</p>
              </Panel>
            </div>

            <div style={{ flex: 1, minWidth: 300 }}>
              {/* Controls */}
              <Panel style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>
                    <input type="checkbox" checked={showChart} onChange={(e) => setShowChart(e.target.checked)} /> Show chart
                  </label>
                  <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search keywords…" style={{ ...inputStyle, width: 220 }} />
                  <select disabled title="Filter by a stored tag" style={{ ...inputStyle, width: 160, opacity: 0.6 }}>
                    <option>All tags</option>
                  </select>
                  <GhostButton onClick={() => setShowFilters(!showFilters)}>Filters</GhostButton>
                  <GhostButton onClick={() => setDynamic(!dynamic)}>Dynamic: {dynamic ? 'On' : 'Off'}</GhostButton>
                  <label style={{ fontSize: 13, color: MUTED }}>Per page
                    <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} style={{ ...inputStyle, width: 80, marginLeft: 6 }}>
                      {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                  <span style={{ color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>COLUMNS:</span>
                  {([['evolution', 'Evolution'], ['dwm', 'D/W/M Change'], ['sv', 'SV (Global)'], ['tags', 'Tags']] as const).map(([key, label]) => (
                    <label key={key} style={{ fontSize: 13, display: 'flex', gap: 5, alignItems: 'center' }}>
                      <input type="checkbox" checked={cols[key]} onChange={(e) => setCols({ ...cols, [key]: e.target.checked })} /> {label}
                    </label>
                  ))}
                </div>
                {showFilters ? (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                    <label style={{ fontSize: 13, color: MUTED }}>Rank
                      <select value={rankFilter} onChange={(e) => { setRankFilter(e.target.value as typeof rankFilter); setPage(1); }} style={{ ...inputStyle, marginTop: 4 }}>
                        <option value="all">All</option><option value="ranked">Has a recorded rank</option><option value="unranked">No rank yet</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 13, color: MUTED }}>Type
                      <select value={kindTab} onChange={(e) => { setKindTab(e.target.value as typeof kindTab); setPage(1); }} style={{ ...inputStyle, marginTop: 4 }}>
                        <option value="all">SERP + GBP</option><option value="serp">SERP only</option><option value="gbp">GBP only</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </Panel>

              {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}

              <Panel>
                <h3 style={{ margin: '0 0 12px' }}>All Keywords ({filtered.length})</h3>
                {filtered.length === 0 ? <p style={{ color: DIM }}>No keywords in this view yet. Add some from <a href="/rank/add" style={{ color: BRAND, fontWeight: 700 }}>Add Keywords</a> — nothing here is pre-filled or estimated.</p> : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={tableStyle}><thead><tr>
                        <th style={thStyle}>Keywords</th><th style={thStyle}>Rank</th>
                        {cols.evolution ? <th style={thStyle}>Evolution</th> : null}
                        {cols.dwm ? <th style={thStyle}>D / W / M Change</th> : null}
                        {cols.sv && !dynamic ? <th style={thStyle}>SV (Global)</th> : null}
                        {cols.tags && !dynamic ? <th style={thStyle}>Tags</th> : null}
                        <th style={thStyle}>Actions</th>
                      </tr></thead>
                      <tbody>{pageRows.map((r) => {
                        const key = `${r.kind}:${r.keyword}`;
                        const kwSnaps = snapsByKw.get(key) ?? [];
                        const rank = num(r.rank);
                        const grid = r.kind === 'gbp' ? gridAvgByKw.get(String(r.keyword)) : undefined;
                        const gbpAvg = grid && Number.isFinite(grid.avg) ? grid.avg : null;
                        const rowId = String(r.id ?? key);
                        const d = windowChange(kwSnaps, rank, 1);
                        const w = windowChange(kwSnaps, rank, 7);
                        const m = windowChange(kwSnaps, rank, 30);
                        const q = encodeURIComponent(String(r.keyword));
                        return (
                          <tr key={rowId}>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ width: 22, height: 22, borderRadius: 6, background: '#0f0f0f', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>G</span>
                                <div>
                                  <div style={{ fontWeight: 700 }}>{String(r.keyword)}</div>
                                  <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>No Ranking URL · Language: – · {r.kind === 'gbp' ? 'Local (GBP)' : 'Search (SERP)'}</div>
                                </div>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              {r.kind === 'gbp' ? (
                                <>
                                  <div style={{ fontWeight: 800 }}>{gbpAvg !== null ? `#${gbpAvg.toFixed(1)}` : rank !== null ? `#${rank}` : '–'}</div>
                                  <div style={{ color: DIM, fontSize: 12 }}>Average Map Rank</div>
                                  <a href="/gbp-local" style={{ color: BRAND, fontSize: 12, fontWeight: 700 }}>View 3×3 grid →</a>
                                </>
                              ) : (<span style={{ fontWeight: 800 }}>{rank === null ? '–' : `#${rank}`}</span>)}
                              <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>Checked: {fmtDate(r.checked_at)}</div>
                            </td>
                            {cols.evolution ? <td style={tdStyle}><Sparkline snaps={kwSnaps} /></td> : null}
                            {cols.dwm ? <td style={tdStyle}>{changeLabel(d)} / {changeLabel(w)} / {changeLabel(m)}</td> : null}
                            {cols.sv && !dynamic ? <td style={tdStyle}>–</td> : null}
                            {cols.tags && !dynamic ? <td style={tdStyle}>–</td> : null}
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer" style={{ color: BRAND, fontWeight: 700, fontSize: 13 }}>Open SERP Preview</a>
                                <a href="/audit" style={{ color: '#e5e7eb', fontSize: 13 }}>Optimize</a>
                                <button onClick={() => setOpenMore(openMore === rowId ? null : rowId)} style={{ background: 'transparent', color: '#e5e7eb', border: 'none', cursor: 'pointer', fontSize: 13 }}>More ▾</button>
                              </div>
                              {openMore === rowId ? (
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                  <button onClick={() => recheckOne(r)} disabled={busy} style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>Re-check this keyword</button>
                                  {r.kind === 'gbp' ? <a href="/gbp-local" style={{ color: BRAND, fontSize: 13, fontWeight: 700 }}>View 3×3 grid</a> : null}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}</tbody></table>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                      <GhostButton onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>← Previous</GhostButton>
                      <span style={{ color: MUTED, fontSize: 13 }}>Page {safePage} of {totalPages} · {filtered.length} keywords</span>
                      <GhostButton onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}>Next →</GhostButton>
                    </div>
                  </>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
