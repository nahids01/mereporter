'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

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
    try { const j = await callApi('/api/ai-visibility', 'POST', { project_id: projectId, prompt: prompt.trim() }); setMsg(String((j as Row).note ?? 'Saved.')); setPrompt(''); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <AppShell active="ai" title="AI Visibility"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="ai" title="AI Visibility" subtitle="Questions people might ask an AI assistant about this business. A question with no recorded answer honestly shows “Not checked” — it is never shown as mentioned, quoted or visible.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then add the questions to track here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
            {summary ? <p style={{ color: MUTED, margin: 0 }}>Questions: {String(summary.total)} · With a recorded answer: {String(summary.checked)} · Not checked: {String(summary.notChecked)}</p> : null}
          </Panel>
          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px' }}>Add a question</h3>
            <Field label="Question"><input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Best dentist in downtown Toronto" style={inputStyle} /></Field>
            <PrimaryButton onClick={run} disabled={busy || !prompt.trim()}>{busy ? 'Working…' : 'Add question'}</PrimaryButton>
            {msg ? <p style={{ color: MUTED }}>{msg}</p> : null}
          </Panel>
          <Panel>
            <h3 style={{ margin: '0 0 12px' }}>Questions ({rows.length})</h3>
            {rows.length === 0 ? <p style={{ color: DIM }}>No questions yet.</p> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Question</th><th style={thStyle}>Status</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={String(r.id)}><td style={tdStyle}>{String(r.prompt)}</td><td style={tdStyle}>{r.result_json === null ? 'Not checked' : 'Checked (recorded answer)'}</td></tr>)}</tbody></table>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
