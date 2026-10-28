'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
type Row = Record<string, unknown>;
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState(''); const [name, setName] = useState('');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/competitors?project_id=${projectId}`);
    if (status === 200) setRows(((json.competitors as Row[]) ?? []));
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg('');
    try { await callApi('/api/competitors', 'POST', { project_id: projectId, domain, name: name || null }); setMsg('Competitor added (stored row only — no rank or traffic is invented for it).'); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  return (<div><h1>Competitors</h1>
    <p>Stored competitors only. MeReporter does not invent competitor ranks or traffic: a competitor row is just a domain you added. Compare it against your own live ranks on the Rank Tracker page.</p>
    <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
    <div style={{ marginTop: 12 }}>
      <label>Competitor domain<br /><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="competitor.com" style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <label>Name (optional)<br /><input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <button onClick={run} disabled={busy}>{busy ? 'Working…' : 'Add competitor'}</button>
    </div>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>
    {rows.length === 0 ? <p>No competitors yet — honest empty state.</p> : <ul>{rows.map((r) => <li key={String(r.id)}>{String(r.domain)}{r.name ? ` — ${String(r.name)}` : ''}</li>)}</ul>}
  </div>);
}
