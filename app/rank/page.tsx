'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
type Row = Record<string, unknown>;
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [kw, setKw] = useState(''); const [kind, setKind] = useState('serp');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/rank?project_id=${projectId}`);
    if (status === 200) setRows(((json.keywords as Row[]) ?? []));
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg('');
    try { const j = await callApi('/api/rank', 'POST', { project_id: projectId, keyword: kw, kind }); setMsg(String((j as Row).note ?? JSON.stringify(j))); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  return (<div><h1>Rank Tracker</h1>
    <p>Live SERP rank via DataForSEO plus stored history. SERP and GBP keywords are kept separate. Without DataForSEO keys, a live check returns configured:false and stores nothing — the keyword keeps a null rank (no-data).</p>
    <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
    <div style={{ marginTop: 12 }}>
      <label>Keyword<br /><input value={kw} onChange={(e) => setKw(e.target.value)} style={{ width: '100%', padding: 8 }} /></label><br />
      <label>Kind <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="serp">SERP</option><option value="gbp">GBP</option></select></label><br /><br />
      <button onClick={run} disabled={busy}>{busy ? 'Working…' : 'Add keyword + live check'}</button>
    </div>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>
    {rows.length === 0 ? <p>No data yet — honest empty state. Nothing here is estimated or pre-filled.</p> :
    <table><thead><tr><th>Keyword</th><th>Kind</th><th>Rank</th><th>Checked</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{String(r.keyword)}</td><td>{String(r.kind)}</td><td>{r.rank === null || r.rank === undefined ? 'No data' : String(r.rank)}</td><td>{String(r.checked_at ?? '')}</td></tr>)}</tbody></table>}
  </div>);
}
