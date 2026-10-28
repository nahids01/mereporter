'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
type Row = Record<string, unknown>;
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [source, setSource] = useState(''); const [anchor, setAnchor] = useState('');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/backlinks?project_id=${projectId}`);
    if (status === 200) setRows(((json.backlinks as Row[]) ?? []));
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg('');
    try { await callApi('/api/backlinks', 'POST', { project_id: projectId, source_url: source, anchor_text: anchor || null }); setMsg('Backlink stored.'); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  return (<div><h1>Backlinks</h1>
    <p>Stored backlinks only. No live backlink-discovery provider is configured, so no backlink is shown unless it was added or imported here. Nothing is invented.</p>
    <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
    <div style={{ marginTop: 12 }}>
      <label>Source URL<br /><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://referring-site.com/page" style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <label>Anchor text (optional)<br /><input value={anchor} onChange={(e) => setAnchor(e.target.value)} style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <button onClick={run} disabled={busy}>{busy ? 'Working…' : 'Add backlink'}</button>
    </div>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>
    {rows.length === 0 ? <p>No backlinks stored yet — honest empty state.</p> :
    <table><thead><tr><th>Source</th><th>Anchor</th><th>Status</th></tr></thead><tbody>{rows.map((r) => <tr key={String(r.id)}><td>{String(r.source_url)}</td><td>{String(r.anchor_text ?? '')}</td><td>{String(r.status)}</td></tr>)}</tbody></table>}
  </div>);
}
