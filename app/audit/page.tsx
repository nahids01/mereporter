'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
type Row = Record<string, unknown>;
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [latest, setLatest] = useState<Row | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/audit?project_id=${projectId}`);
    if (status === 200) { const s = (json.scans as Row[]) ?? []; setRows(s); setLatest(s[0] ?? null); }
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg('');
    try { const j = await callApi('/api/audit', 'POST', { project_id: projectId }); const a = j.audit as Row; setMsg(`Score: ${String(a.score)}/100 — computed only from the live checks below. ${String(j.note ?? '')}`); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  return (<div><h1>Site Audit</h1>
    <p>Live scan of the project&apos;s own URL: title, meta description, H1, headings, image alt text, links, viewport, HTTPS, response time and page size. Score 0–100 is computed from those real checks only. Optional PageSpeed data (GOOGLE_PAGESPEED_API_KEY) is info only and never mixed into the score.</p>
    <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
    <div style={{ marginTop: 12 }}><button onClick={run} disabled={busy}>{busy ? 'Scanning…' : 'Run live audit'}</button></div>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>
    {latest ? <div><h2>Latest scan: {String(latest.score)}/100 — {String(latest.url)}</h2>
      <ul>{((latest.checks as Row[]) ?? []).map((c, i) => <li key={i}>{c.passed ? 'Pass' : 'Fail'} {String(c.name)} ({String(c.weight)} pts) — {String(c.detail)}</li>)}</ul>
      <p>Response time: {String(latest.response_time_ms)} ms · Page size: {String(latest.page_size_bytes)} bytes · Scanned: {String(latest.scanned_at)}</p></div>
    : <p>No scan yet — honest empty state. Run a live audit to get a real score.</p>}
    {rows.length > 1 ? <><h3>Scan history</h3><ul>{rows.slice(1).map((r) => <li key={String(r.id)}>{String(r.scanned_at)} — {String(r.score)}/100 — {String(r.url)}</li>)}</ul></> : null}
  </div>);
}
