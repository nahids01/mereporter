'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
type Row = Record<string, unknown>;
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/ai-visibility?project_id=${projectId}`);
    if (status === 200) { setRows(((json.prompts as Row[]) ?? [])); setSummary((json.summary as Row) ?? null); }
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg('');
    try { const j = await callApi('/api/ai-visibility', 'POST', { project_id: projectId, prompt }); setMsg(String((j as Row).note ?? 'Stored.')); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  return (<div><h1>AI Visibility</h1>
    <p>Prompts are stored per project. There is NO live LLM-answer check wired in (no LLM provider key is configured for this feature), so a prompt with no recorded answer honestly shows &quot;not checked&quot; — it is never shown as mentioned, cited or visible.</p>
    <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
    {summary ? <p>Prompts: {String(summary.total)} · Checked (stored result): {String(summary.checked)} · Not checked: {String(summary.notChecked)}</p> : null}
    <div style={{ marginTop: 12 }}>
      <label>Prompt<br /><input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Best dentist in downtown Toronto" style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <button onClick={run} disabled={busy}>{busy ? 'Working…' : 'Add prompt'}</button>
    </div>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>
    {rows.length === 0 ? <p>No prompts yet — honest empty state.</p> :
    <table><thead><tr><th>Prompt</th><th>Status</th></tr></thead><tbody>{rows.map((r) => <tr key={String(r.id)}><td>{String(r.prompt)}</td><td>{r.result_json === null ? 'Not checked' : 'Checked (stored result)'}</td></tr>)}</tbody></table>}
  </div>);
}
