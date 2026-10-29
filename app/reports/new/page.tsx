'use client';
import { useEffect, useMemo, useState } from 'react';
import { useProjects, callApi } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { getBrowserSupabase } from '@/lib/supabase';
import { AppShell, Panel, Field, inputStyle, MUTED, DIM, BRAND, BORDER } from '@/lib/app-shell';

type Row = Record<string, unknown>;
type Kw = { id: string; kind: string; keyword: string; rank: number | null; checked_at: string | null };
type Snap = { keyword: string; kind: string; rank: number | null; checked_at: string | null };

const ELEMENT_DEFS = [
  { id: 'keyword-overview', label: 'Keyword overview', desc: 'Average position, keyword distribution and up/down movement.' },
  { id: 'keyword-list', label: 'Keyword list', desc: 'All keywords with rank, evolution and D/W/M change.' },
  { id: 'traffic-overview', label: 'Traffic overview', desc: 'Imported search/analytics rows, when any exist.' },
  { id: 'graph', label: 'Graph', desc: 'Ranking distribution chart built from real counts only.' },
  { id: 'compare-periods', label: 'Compare periods', desc: 'Average rank now vs about 30 days ago, from stored snapshots.' },
] as const;

const TEMPLATE_ELEMENTS: Record<string, string[]> = {
  basic: ['keyword-overview', 'keyword-list'],
  progress: ['keyword-overview', 'keyword-list', 'graph', 'compare-periods'],
  competitor: ['keyword-overview', 'keyword-list', 'traffic-overview'],
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function todayStr(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function daysAgoStr(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
function esc(s: unknown): string { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtRank(r: number | null): string { return r === null ? '–' : String(r); }
function fmtChange(c: number | null): string { return c === null ? '—' : c > 0 ? `+${c}` : String(c); }
// Rank falls = improved. Change is shown as latest minus reference, so a
// negative change is an improvement; the arrow makes the direction explicit.
function evolutionOf(lastChange: number | null): string {
  if (lastChange === null) return '—';
  if (lastChange < 0) return '▲ Improved';
  if (lastChange > 0) return '▼ Declined';
  return '— Unchanged';
}

type ComputedKw = Kw & { prevRank: number | null; lastChange: number | null; d: number | null; w: number | null; m: number | null; ref30: number | null };

function computeRows(keywords: Kw[], snaps: Snap[]): ComputedKw[] {
  const now = Date.now();
  const byKey = new Map<string, { rank: number; t: number }[]>();
  for (const s of snaps) {
    if (typeof s.rank !== 'number' || !s.checked_at) continue;
    const key = `${s.kind}::${s.keyword}`;
    const list = byKey.get(key) ?? [];
    list.push({ rank: s.rank, t: new Date(s.checked_at).getTime() });
    byKey.set(key, list);
  }
  for (const list of byKey.values()) list.sort((a, b) => a.t - b.t);
  function refBefore(list: { rank: number; t: number }[], days: number): number | null {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    let ref: number | null = null;
    for (const p of list) { if (p.t <= cutoff) ref = p.rank; else break; }
    return ref;
  }
  return keywords.map((k) => {
    const list = byKey.get(`${k.kind}::${k.keyword}`) ?? [];
    const latestSnap = list[list.length - 1];
    const current = typeof k.rank === 'number' ? k.rank : (latestSnap ? latestSnap.rank : null);
    const prevRank = list.length >= 2 ? list[list.length - 2].rank : null;
    const lastChange = prevRank !== null && current !== null ? current - prevRank : null;
    const d = current !== null ? (refBefore(list, 1) !== null ? current - (refBefore(list, 1) as number) : null) : null;
    const w = current !== null ? (refBefore(list, 7) !== null ? current - (refBefore(list, 7) as number) : null) : null;
    const m = current !== null ? (refBefore(list, 30) !== null ? current - (refBefore(list, 30) as number) : null) : null;
    return { ...k, rank: current, prevRank, lastChange, d, w, m, ref30: refBefore(list, 30) };
  });
}

function avgRank(rows: ComputedKw[]): number | null {
  const r = rows.map((x) => x.rank).filter((x): x is number => x !== null);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [query, setQuery] = useState<{ project_id: string; report_id: string }>({ project_id: '', report_id: '' });
  const [reportName, setReportName] = useState('');
  const [template, setTemplate] = useState('basic');
  const [format, setFormat] = useState('pdf');
  const [logo, setLogo] = useState('default'); // 'default' | data URL | 'custom-preview-only'
  const [logoNote, setLogoNote] = useState('');
  const [elements, setElements] = useState<string[]>(['keyword-overview', 'keyword-list']);
  const [addElement, setAddElement] = useState('traffic-overview');
  const [dateStart, setDateStart] = useState(daysAgoStr(30));
  const [dateEnd, setDateEnd] = useState(todayStr());
  const [includeHistoric, setIncludeHistoric] = useState(false);
  const [sortBy, setSortBy] = useState<'keyword' | 'rank' | 'lastChange' | 'd' | 'w' | 'm'>('rank');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [schedOn, setSchedOn] = useState(false);
  const [frequency, setFrequency] = useState('weekly');
  const [day, setDay] = useState('Monday');
  const [time, setTime] = useState('09:00');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [keywords, setKeywords] = useState<Kw[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [trafficRows, setTrafficRows] = useState<Row[]>([]);
  const [gridNote, setGridNote] = useState('');
  const [resendConfigured, setResendConfigured] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadedReport, setLoadedReport] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setQuery({ project_id: q.get('project_id') ?? '', report_id: q.get('report_id') ?? '' });
  }, []);
  useEffect(() => { if (query.project_id && projects.some((p) => p.id === query.project_id)) setProjectId(query.project_id); }, [query.project_id, projects]);

  const project = projects.find((p) => p.id === projectId);
  useEffect(() => {
    if (project && !reportName && !loadedReport) setReportName(`Report for ${project.website_url}`);
  }, [project, reportName, loadedReport]);

  async function loadData(id: string) {
    if (!id) return;
    try {
      const r = await apiFetch(`/api/rank?project_id=${id}`);
      if (r.status === 200) {
        setKeywords(((r.json.keywords as Kw[]) ?? []));
        setSnaps(((r.json.snapshots as Snap[]) ?? []));
      }
      const g = await apiFetch(`/api/gbp-grid?project_id=${id}`);
      if (g.status === 200) {
        const list = (g.json.snapshots as Row[]) ?? [];
        if (list.length > 0) {
          const latest = list[0];
          const points = (latest.grid_json as Row[]) ?? [];
          const ranked = points.filter((p) => typeof p.rank === 'number').length;
          setGridNote(`Latest grid snapshot: ${String(latest.keyword)} — ${ranked} of ${points.length} grid points with a recorded rank${latest.centre_name ? ` (centre: ${String(latest.centre_name)})` : ''}.`);
        } else setGridNote('');
      }
      const rep = await apiFetch(`/api/report?project_id=${id}`);
      if (rep.status === 200) {
        const list = (rep.json.reports as Row[]) ?? [];
        const first = list[0];
        const sections = ((first?.report_json as Row | undefined)?.sections as Row[] | undefined) ?? [];
        const imports = sections.find((s) => String(s.name).toLowerCase().includes('import'));
        setTrafficRows(((imports?.rows as Row[]) ?? []));
      }
      const st = await apiFetch(`/api/integrations/status?project_id=${id}`);
      if (st.status === 200) setResendConfigured(Boolean(st.json.resendConfigured));
    } catch { /* preview keeps showing No data for anything that failed to load */ }
  }
  useEffect(() => { loadData(projectId); }, [projectId]);

  // Opening an existing report from the list.
  useEffect(() => {
    if (!query.report_id) return;
    (async () => {
      const { status, json } = await apiFetch(`/api/report?id=${query.report_id}`);
      if (status !== 200) { setMsg(String(json.error ?? 'Could not open that report.')); return; }
      const row = json.report as Row;
      const stored = row.report_json as Row;
      const b = (stored.builder as Row | undefined) ?? {};
      setReportName(String(b.report_name ?? `Report for ${project?.website_url ?? ''}`));
      setTemplate(String(b.template ?? 'basic'));
      setFormat(String(b.format ?? 'pdf'));
      setElements(Array.isArray(b.elements) ? (b.elements as string[]) : ['keyword-overview', 'keyword-list']);
      const dr = b.date_range as Row | undefined;
      if (dr?.start && dr?.end) { setDateStart(String(dr.start)); setDateEnd(String(dr.end)); }
      const sch = b.schedule as Row | undefined;
      if (sch) {
        setSchedOn(sch.enabled === true);
        setFrequency(String(sch.frequency ?? 'weekly'));
        setDay(String(sch.day ?? 'Monday'));
        setTime(String(sch.time ?? '09:00'));
        setRecipients(Array.isArray(sch.recipients) ? (sch.recipients as string[]) : []);
      }
      const lg = String(b.logo ?? 'default');
      setLogo(lg.startsWith('data:') ? lg : 'default');
      setLoadedReport(true);
      setMsg(`Opened saved report for ${String(row.month)} (status: ${String(row.status)}). Saving again overwrites the stored report for that month.`);
    })();
  }, [query.report_id]);

  const rows = useMemo(() => computeRows(keywords, snaps), [keywords, snaps]);
  const serpRows = useMemo(() => rows.filter((r) => r.kind === 'serp'), [rows]);
  const gbpRows = useMemo(() => rows.filter((r) => r.kind === 'gbp'), [rows]);
  const serpAvg = avgRank(serpRows);
  const gbpAvg = avgRank(gbpRows);
  const rankedSerp = serpRows.filter((r) => r.rank !== null);
  const dist = {
    top3: rankedSerp.filter((r) => (r.rank as number) <= 3).length,
    top10: rankedSerp.filter((r) => (r.rank as number) > 3 && (r.rank as number) <= 10).length,
    top100: rankedSerp.filter((r) => (r.rank as number) > 10 && (r.rank as number) <= 100).length,
    beyond: rankedSerp.filter((r) => (r.rank as number) > 100).length,
    noRank: serpRows.filter((r) => r.rank === null).length,
  };
  const up = rows.filter((r) => r.lastChange !== null && (r.lastChange as number) < 0).length;
  const down = rows.filter((r) => r.lastChange !== null && (r.lastChange as number) > 0).length;
  const unchanged = rows.filter((r) => r.lastChange === 0).length;
  const compare = useMemo(() => {
    const pairs = rows.filter((r) => r.rank !== null && r.ref30 !== null);
    if (pairs.length === 0) return null;
    const nowAvg = pairs.reduce((a, r) => a + (r.rank as number), 0) / pairs.length;
    const thenAvg = pairs.reduce((a, r) => a + (r.ref30 as number), 0) / pairs.length;
    return { n: pairs.length, nowAvg, thenAvg, change: nowAvg - thenAvg };
  }, [rows]);
  const domain = useMemo(() => {
    if (!project) return '';
    try { return new URL(project.website_url).hostname.replace(/^www\./, ''); } catch { return project.website_url; }
  }, [project]);
  const dateLabel = `${dateStart} to ${dateEnd}`;
  const nextDelivery = schedOn
    ? frequency === 'weekly'
      ? `Next delivery: weekly on ${day} at ${time} to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`
      : `Next delivery: monthly at ${time} to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`
    : '';

  function sortRows(list: ComputedKw[]): ComputedKw[] {
    const val = (r: ComputedKw): number | string => {
      if (sortBy === 'keyword') return r.keyword.toLowerCase();
      if (sortBy === 'rank') return r.rank === null ? 99999 : r.rank;
      const v = sortBy === 'lastChange' ? r.lastChange : sortBy === 'd' ? r.d : sortBy === 'w' ? r.w : r.m;
      return v === null ? 99999 : v;
    };
    return [...list].sort((a, b) => {
      const va = val(a); const vb = val(b);
      if (typeof va === 'string') return sortDir * va.localeCompare(vb as string);
      return sortDir * ((va as number) - (vb as number));
    });
  }
  function sortHeader(label: string, key: typeof sortBy) {
    return (
      <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { if (sortBy === key) setSortDir(sortDir === 1 ? -1 : 1); else { setSortBy(key); setSortDir(1); } }}>
        {label}{sortBy === key ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
      </th>
    );
  }
  function keywordTable(title: string, list: ComputedKw[]) {
    if (list.length === 0) return <div style={{ marginTop: 12 }}><h4 style={{ margin: '0 0 6px' }}>{title}</h4><p style={{ color: MUTED }}>No data</p></div>;
    return (
      <div style={{ marginTop: 12 }}>
        <h4 style={{ margin: '0 0 6px' }}>{title} ({list.length})</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: MUTED }}>
            {sortHeader('Keyword', 'keyword')}
            {sortHeader('Rank', 'rank')}
            <th>Evolution</th>
            {includeHistoric ? <th>Previous rank</th> : null}
            {sortHeader('Last change', 'lastChange')}
            {sortHeader('D change', 'd')}{sortHeader('W change', 'w')}{sortHeader('M change', 'm')}
          </tr></thead>
          <tbody>
            {sortRows(list).map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td style={{ padding: '6px 4px' }}>{r.keyword}</td>
                <td style={{ padding: '6px 4px' }}>{fmtRank(r.rank)}</td>
                <td style={{ padding: '6px 4px' }}>{evolutionOf(r.lastChange)}</td>
                {includeHistoric ? <td style={{ padding: '6px 4px' }}>{fmtRank(r.prevRank)}</td> : null}
                <td style={{ padding: '6px 4px' }}>{fmtChange(r.lastChange)}</td>
                <td style={{ padding: '6px 4px' }}>{fmtChange(r.d)}</td>
                <td style={{ padding: '6px 4px' }}>{fmtChange(r.w)}</td>
                <td style={{ padding: '6px 4px' }}>{fmtChange(r.m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function previewElement(id: string) {
    if (id === 'keyword-overview') return (
      <div key={id}>
        <h3>Overview</h3>
        <p>Average position (SERP): {serpAvg === null ? 'No data' : serpAvg.toFixed(1)} · Average Map Rank (GBP): {gbpAvg === null ? 'No data' : gbpAvg.toFixed(1)}</p>
        <p>Keyword distribution (SERP, {serpRows.length} keywords): Top 3: {dist.top3} · Top 10: {dist.top10} · Top 100: {dist.top100}{dist.beyond ? ` · Beyond top 100: ${dist.beyond}` : ''} · No rank: {dist.noRank}</p>
        <p>Keyword change: {up} up · {down} down · {unchanged} unchanged{up + down + unchanged === 0 ? ' — No data (no keyword has two recorded ranks to compare)' : ''}</p>
      </div>
    );
    if (id === 'keyword-list') return (
      <div key={id}>
        <h3>Keywords</h3>
        <p>{domain} · Indexed pages: No data</p>
        {keywordTable('SERP keywords', serpRows)}
        {keywordTable('GBP keywords', gbpRows)}
        <p style={{ color: MUTED, fontSize: 12 }}>Rank “–” means no recorded rank, not rank 0. D/W/M change is “—” when no snapshot exists from that long ago.</p>
      </div>
    );
    if (id === 'traffic-overview') return (
      <div key={id}>
        <h3>Traffic overview</h3>
        {trafficRows.length === 0
          ? <p>No data — no imported search/analytics rows are stored for this project.</p>
          : <ul>{trafficRows.slice(0, 20).map((t, i) => <li key={i}>{String(t.source ?? '')} · {String(t.metric ?? '')}: {t.value === null || t.value === undefined ? 'No data' : String(t.value)}</li>)}</ul>}
      </div>
    );
    if (id === 'graph') return (
      <div key={id}>
        <h3>Graph — SERP ranking distribution</h3>
        {serpRows.length === 0 ? <p>No data</p> : (
          <div>
            {[['Top 3', dist.top3], ['Top 10', dist.top10], ['Top 100', dist.top100], ['No rank', dist.noRank]].map(([label, n]) => (
              <div key={String(label)} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ width: 70, fontSize: 13 }}>{label}</span>
                <span style={{ display: 'inline-block', height: 14, background: BRAND, width: `${serpRows.length ? Math.max(2, ((n as number) / serpRows.length) * 100) : 0}%`, maxWidth: 220 }} />
                <span style={{ fontSize: 13 }}>{n as number}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
    if (id === 'compare-periods') return (
      <div key={id}>
        <h3>Compare periods</h3>
        {compare === null
          ? <p>No data — no keyword has both a current rank and a snapshot from about 30 days ago.</p>
          : <p>Average rank now: {compare.nowAvg.toFixed(1)} · About 30 days ago: {compare.thenAvg.toFixed(1)} · Change: {fmtChange(Number(compare.change.toFixed(1)))} (negative = improved), across {compare.n} keyword(s) with both readings.</p>}
      </div>
    );
    return null;
  }

  function buildPreviewHtml(): string {
    const sections = elements.map((id) => {
      if (id === 'keyword-overview') return `<h2>Overview</h2><p>Average position (SERP): ${serpAvg === null ? 'No data' : serpAvg.toFixed(1)} &middot; Average Map Rank (GBP): ${gbpAvg === null ? 'No data' : gbpAvg.toFixed(1)}</p><p>Keyword distribution (SERP, ${serpRows.length} keywords): Top 3: ${dist.top3} &middot; Top 10: ${dist.top10} &middot; Top 100: ${dist.top100}${dist.beyond ? ` &middot; Beyond top 100: ${dist.beyond}` : ''} &middot; No rank: ${dist.noRank}</p><p>Keyword change: ${up} up &middot; ${down} down &middot; ${unchanged} unchanged</p>`;
      if (id === 'keyword-list') {
        const table = (title: string, list: ComputedKw[]) => list.length === 0
          ? `<h3>${title}</h3><p>No data</p>`
          : `<h3>${title} (${list.length})</h3><table border="1" cellpadding="6" cellspacing="0"><tr><th>Keyword</th><th>Rank</th><th>Evolution</th>${includeHistoric ? '<th>Previous rank</th>' : ''}<th>Last change</th><th>D change</th><th>W change</th><th>M change</th></tr>${sortRows(list).map((r) => `<tr><td>${esc(r.keyword)}</td><td>${fmtRank(r.rank)}</td><td>${esc(evolutionOf(r.lastChange))}</td>${includeHistoric ? `<td>${fmtRank(r.prevRank)}</td>` : ''}<td>${fmtChange(r.lastChange)}</td><td>${fmtChange(r.d)}</td><td>${fmtChange(r.w)}</td><td>${fmtChange(r.m)}</td></tr>`).join('')}</table>`;
        return `<h2>Keywords</h2><p>${esc(domain)} &middot; Indexed pages: No data</p>${table('SERP keywords', serpRows)}${table('GBP keywords', gbpRows)}${gridNote ? `<p>${esc(gridNote)}</p>` : ''}`;
      }
      if (id === 'traffic-overview') return `<h2>Traffic overview</h2>${trafficRows.length === 0 ? '<p>No data</p>' : `<ul>${trafficRows.slice(0, 20).map((t) => `<li>${esc(t.source)} &middot; ${esc(t.metric)}: ${t.value === null || t.value === undefined ? 'No data' : esc(t.value)}</li>`).join('')}</ul>`}`;
      if (id === 'graph') return `<h2>Graph &mdash; SERP ranking distribution</h2>${serpRows.length === 0 ? '<p>No data</p>' : `<p>Top 3: ${dist.top3} &middot; Top 10: ${dist.top10} &middot; Top 100: ${dist.top100} &middot; No rank: ${dist.noRank}</p>`}`;
      if (id === 'compare-periods') return `<h2>Compare periods</h2>${compare === null ? '<p>No data</p>' : `<p>Average rank now: ${compare.nowAvg.toFixed(1)} &middot; About 30 days ago: ${compare.thenAvg.toFixed(1)} &middot; Change: ${fmtChange(Number(compare.change.toFixed(1)))}, across ${compare.n} keyword(s).</p>`}`;
      return '';
    }).join('\n');
    const logoHtml = logo.startsWith('data:') ? `<img src="${logo}" alt="Report logo" style="max-height:60px" />` : '<strong style="color:#FF863B;font-size:22px">MeReporter</strong>';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(reportName)}</title><style>body{font-family:Arial,sans-serif;color:#111;max-width:900px;margin:24px auto;padding:0 16px}table{border-collapse:collapse}th,td{text-align:left}h1{font-size:24px}h2{margin-top:28px}</style></head><body>${logoHtml}<h1>${esc(reportName)}</h1><p>${esc(dateLabel)}${domain ? ` &middot; ${esc(domain)}` : ''}</p>${sections}<p style="color:#666;font-size:12px">Built only from recorded data. Sections with no data say so; no figure was estimated.</p></body></html>`;
  }

  function savePayload() {
    const month = (dateEnd || todayStr()).slice(0, 7);
    return {
      project_id: projectId, month,
      report_name: reportName || (project ? `Report for ${project.website_url}` : 'Report'),
      template, format, elements,
      schedule: { enabled: schedOn, frequency, day, time, recipients },
      date_range: { start: dateStart, end: dateEnd },
      logo: logo === 'default' ? 'mereporter-default' : logo,
    };
  }

  async function save() {
    if (!projectId) { setMsg('Choose a website first.'); return null; }
    setBusy(true); setMsg('');
    try {
      const j = await callApi('/api/report', 'POST', savePayload());
      setMsg(`Report saved as a draft for ${(savePayload().month)}. It is not emailed — ${String((j as Row).emailNote ?? 'email not configured')}. Note: saving again for the same project and month overwrites this stored report.`);
      return j;
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed'); return null; }
    finally { setBusy(false); }
  }

  async function send() {
    if (!projectId) { setMsg('Choose a website first.'); return; }
    if (schedOn && recipients.length === 0) { setMsg('Add at least one email recipient before sending. The report has not been sent.'); return; }
    // Delivery is only attempted when Resend AND a verified sender are
    // configured. This part has no send endpoint and no verified-sender
    // setting, so Send honestly saves a draft instead of claiming delivery.
    if (resendConfigured !== true) {
      await save();
      setMsg((m) => `${m} Send: Not sent — email not configured. Report saved as draft.`);
      return;
    }
    await save();
    setMsg((m) => `${m} Send: Not sent — no verified sender is configured for delivery. Report saved as draft.`);
  }

  async function download() {
    if (!projectId) { setMsg('Choose a website first.'); return; }
    const month = (dateEnd || todayStr()).slice(0, 7);
    try {
      if (format === 'csv') {
        const supabase = getBrowserSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/report?export=csv&project_id=${projectId}&month=${month}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
        if (!res.ok) { setMsg(`CSV export failed (${res.status}).`); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `report-${month}.csv`; a.click(); URL.revokeObjectURL(a.href);
        return;
      }
      const html = buildPreviewHtml();
      if (format === 'html') {
        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `report-${month}.html`; a.click(); URL.revokeObjectURL(a.href);
        return;
      }
      // PDF via browser print of the same print-friendly preview.
      const w = window.open('', '_blank');
      if (!w) { setMsg('Allow pop-ups for this site to print the PDF, or choose HTML download instead.'); return; }
      w.document.write(html); w.document.close(); w.focus(); w.print();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Download failed'); }
  }

  function onLogoFile(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      setLogo(url);
      setLogoNote(f.size > 200 * 1024
        ? 'This logo is larger than 200 KB, so it is used in the preview and downloads only and is not stored with the saved report.'
        : 'Custom logo selected. It appears in the preview and downloads.');
    };
    reader.readAsDataURL(f);
  }

  if (error) return <AppShell active="reports" title="New Report"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  const breadcrumb = project ? `${domain} > Reports > New Report` : 'Reports > New Report';

  return (
    <AppShell active="reports" title="New Report" subtitle={breadcrumb}>
      {projects.length === 0 ? (
        <Panel><p style={{ color: MUTED }}>No projects yet. <a href="/projects" style={{ color: BRAND, fontWeight: 700 }}>Add a website</a> first — no demo data is used.</p></Panel>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ color: MUTED, fontSize: 13 }}>{breadcrumb}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={download} style={{ background: BRAND, color: '#000', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>Download ({format.toUpperCase()})</button>
              <button onClick={send} disabled={busy} style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>Send</button>
              <button onClick={save} disabled={busy} style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
          {msg ? <Panel style={{ marginBottom: 16 }}><p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>{msg}</p></Panel> : null}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Left: builder controls */}
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <Panel style={{ marginBottom: 16 }}>
                <Field label="Website">
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
                  </select>
                </Field>
                <Field label="Report Name">
                  <input value={reportName} onChange={(e) => setReportName(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Date Range">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} style={inputStyle} />
                    <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} style={inputStyle} />
                  </div>
                </Field>
                <Field label="Template">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(['basic', 'progress', 'competitor'] as const).map((t) => (
                      <label key={t} style={{ border: `1px solid ${template === t ? BRAND : BORDER}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontWeight: template === t ? 800 : 600 }}>
                        <input type="radio" name="template" checked={template === t} onChange={() => { setTemplate(t); setElements(TEMPLATE_ELEMENTS[t]); }} style={{ marginRight: 6 }} />
                        {t === 'basic' ? 'Basic Report' : t === 'progress' ? 'Progress Report' : 'Competitor Report'}
                      </label>
                    ))}
                  </div>
                  <p style={{ color: DIM, fontSize: 12, marginTop: 6 }}>Changing the template resets the element list to that template&apos;s defaults.</p>
                </Field>
                <Field label="Format">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(['pdf', 'csv', 'html'] as const).map((f) => (
                      <label key={f} style={{ border: `1px solid ${format === f ? BRAND : BORDER}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontWeight: format === f ? 800 : 600 }}>
                        <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} style={{ marginRight: 6 }} />
                        {f.toUpperCase()}
                      </label>
                    ))}
                  </div>
                  <p style={{ color: DIM, fontSize: 12, marginTop: 6 }}>PDF downloads via the browser print dialog; CSV is the keyword table; HTML is a standalone file.</p>
                </Field>
                <Field label="Logo">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ border: `1px solid ${logo === 'default' ? BRAND : BORDER}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
                      <input type="radio" checked={logo === 'default'} onChange={() => { setLogo('default'); setLogoNote(''); }} style={{ marginRight: 6 }} /> MeReporter default logo
                    </label>
                    <input type="file" accept="image/*" onChange={(e) => onLogoFile(e.target.files?.[0])} />
                  </div>
                  {logoNote ? <p style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>{logoNote}</p> : null}
                </Field>
              </Panel>

              <Panel style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px' }}>Report elements</h3>
                {elements.length === 0 ? <p style={{ color: DIM }}>No elements selected. Add one below — an empty report previews as “No data”.</p> : null}
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {elements.map((id, i) => {
                    const def = ELEMENT_DEFS.find((d) => d.id === id);
                    if (!def) return null;
                    return (
                      <li key={id} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{def.label}</strong>
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button disabled={i === 0} onClick={() => setElements((e) => { const c = [...e]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })} style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>↑</button>
                            <button disabled={i === elements.length - 1} onClick={() => setElements((e) => { const c = [...e]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c; })} style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>↓</button>
                            <button onClick={() => setElements((e) => e.filter((x) => x !== id))} style={{ background: 'transparent', color: '#fdba74', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>Remove</button>
                          </span>
                        </div>
                        <p style={{ color: MUTED, fontSize: 13, margin: '6px 0 0' }}>{def.desc}</p>
                        {id === 'keyword-list' ? (
                          <div style={{ marginTop: 10, fontSize: 13, color: MUTED }}>
                            All Keywords, {rows.length} (SERP {serpRows.length}, GBP {gbpRows.length})
                            <label style={{ display: 'block', marginTop: 8, color: '#fff' }}>
                              <input type="checkbox" checked={includeHistoric} onChange={(e) => setIncludeHistoric(e.target.checked)} style={{ marginRight: 6 }} />
                              Include historic results (shows the previous recorded rank)
                            </label>
                            <p style={{ margin: '6px 0 0' }}>Columns: Rank / Evolution / Last Change / D / W / M Change — click a column header in the preview to sort.</p>
                          </div>
                        ) : null}
                        {id === 'keyword-overview' ? <p style={{ color: MUTED, fontSize: 13, margin: '6px 0 0' }}>All Keywords, {rows.length}</p> : null}
                      </li>
                    );
                  })}
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select value={addElement} onChange={(e) => setAddElement(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '1 1 200px' }}>
                    {ELEMENT_DEFS.map((d) => <option key={d.id} value={d.id} disabled={elements.includes(d.id)}>{d.label}{elements.includes(d.id) ? ' (added)' : ''}</option>)}
                  </select>
                  <button disabled={elements.includes(addElement)} onClick={() => setElements((e) => [...e, addElement])} style={{ background: BRAND, color: '#000', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>+ Add element</button>
                </div>
              </Panel>

              <Panel>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, cursor: 'pointer' }}>
                  <input type="checkbox" checked={schedOn} onChange={(e) => setSchedOn(e.target.checked)} /> Schedule &amp; recipients
                </label>
                <p style={{ color: DIM, fontSize: 12, margin: '6px 0 0' }}>Off by default. Scheduling is stored with the report; actual scheduled sending needs email delivery to be configured (see Send note).</p>
                {schedOn ? (
                  <div style={{ marginTop: 14 }}>
                    <Field label="Frequency">
                      <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </Field>
                    {frequency === 'weekly' ? (
                      <Field label="Day">
                        <select value={day} onChange={(e) => setDay(e.target.value)} style={inputStyle}>
                          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </Field>
                    ) : null}
                    <Field label="Time">
                      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
                    </Field>
                    <p style={{ color: MUTED, fontSize: 13 }}>{nextDelivery}</p>
                    <Field label="Email Recipients">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newRecipient.includes('@') && !recipients.includes(newRecipient.trim())) setRecipients((r) => [...r, newRecipient.trim()]); setNewRecipient(''); } }} placeholder="name@example.com" style={inputStyle} />
                        <button onClick={() => { if (newRecipient.includes('@') && !recipients.includes(newRecipient.trim())) setRecipients((r) => [...r, newRecipient.trim()]); setNewRecipient(''); }} style={{ background: BRAND, color: '#000', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
                      </div>
                    </Field>
                    {recipients.length === 0 ? <p style={{ color: DIM, fontSize: 13 }}>No recipients yet.</p> : (
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                        {recipients.map((r) => (
                          <li key={r}>{r} <button onClick={() => setRecipients((x) => x.filter((y) => y !== r))} style={{ background: 'transparent', color: '#fdba74', border: 'none', cursor: 'pointer' }}>Remove</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </Panel>
            </div>

            {/* Right: live preview */}
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <Panel style={{ background: '#fff', color: '#111', borderColor: '#ddd' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {logo.startsWith('data:') ? <img src={logo} alt="Report logo" style={{ maxHeight: 48, maxWidth: 180, objectFit: 'contain' }} /> : <span style={{ color: BRAND, fontWeight: 900, fontSize: 22 }}>MeReporter</span>}
                </div>
                <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>{reportName || 'Report'}</h2>
                <p style={{ color: '#666', fontSize: 13, margin: '0 0 20px' }}>{dateLabel}{domain ? ` · ${domain}` : ''}</p>
                {elements.length === 0 ? <p>No data</p> : elements.map((id) => (
                  <div key={id} style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 12, fontSize: 14 }}>
                    {previewElement(id)}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
                  <h3>GBP / Local grid summary</h3>
                  {gbpRows.length === 0 ? <p>No data — no GBP keywords for this project.</p> : (
                    <>
                      <p>Average Map Rank: {gbpAvg === null ? 'No data' : gbpAvg.toFixed(1)} · GBP keywords: {gbpRows.length} ({gbpRows.filter((r) => r.rank !== null).length} with a recorded rank)</p>
                      {gridNote ? <p style={{ color: '#555', fontSize: 13 }}>{gridNote}</p> : <p style={{ color: '#555', fontSize: 13 }}>No grid snapshot stored for this project.</p>}
                    </>
                  )}
                  <p style={{ color: '#666', fontSize: 12, marginTop: 16 }}>SERP and GBP are kept separate throughout this report. Sections with no data say so; no figure was estimated.</p>
                </div>
              </Panel>
              <p style={{ color: DIM, fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
                Preview re-renders on every change from this project&apos;s stored keywords and snapshots. The date range labels the report and sets its saved month ({(dateEnd || todayStr()).slice(0, 7)}); the keyword table always shows the latest stored ranks. Saving for the same project and month overwrites the previously stored report for that month.
              </p>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
