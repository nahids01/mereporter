'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

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
    try { await callApi('/api/backlinks', 'POST', { project_id: projectId, source_url: source.trim(), anchor_text: anchor.trim() || null }); setMsg('Backlink saved.'); setSource(''); setAnchor(''); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <AppShell active="backlinks" title="Backlinks"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="backlinks" title="Backlinks" subtitle="Other websites linking to this one. Only links added here are shown — there is no automatic discovery, so nothing is invented.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then record its backlinks here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
          </Panel>
          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px' }}>Add a backlink</h3>
            <Field label="Linking page address"><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://referring-site.com/page" style={inputStyle} /></Field>
            <Field label="Link text (optional)"><input value={anchor} onChange={(e) => setAnchor(e.target.value)} style={inputStyle} /></Field>
            <PrimaryButton onClick={run} disabled={busy || !source.trim()}>{busy ? 'Working…' : 'Add backlink'}</PrimaryButton>
            {msg ? <p style={{ color: MUTED }}>{msg}</p> : null}
          </Panel>
          <Panel>
            <h3 style={{ margin: '0 0 12px' }}>Backlinks ({rows.length})</h3>
            {rows.length === 0 ? <p style={{ color: DIM }}>No backlinks recorded yet.</p> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Linking page</th><th style={thStyle}>Link text</th><th style={thStyle}>Status</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={String(r.id)}><td style={{ ...tdStyle, wordBreak: 'break-all' }}>{String(r.source_url)}</td><td style={tdStyle}>{String(r.anchor_text ?? '')}</td><td style={tdStyle}>{String(r.status)}</td></tr>)}</tbody></table>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
