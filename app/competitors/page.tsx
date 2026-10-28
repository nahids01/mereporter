'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, EmptyState } from '@/lib/app-shell';

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
    try { await callApi('/api/competitors', 'POST', { project_id: projectId, domain: domain.trim(), name: name.trim() || null }); setMsg('Competitor saved.'); setDomain(''); setName(''); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function remove(id: string) {
    setBusy(true);
    try { await apiFetch(`/api/competitors?id=${id}`, 'DELETE'); await load(); } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <AppShell active="competitors" title="Competitors"><Panel>{error} — sign in at <a href="/login" style={{ color: '#FF863B', fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="competitors" title="Competitors" subtitle="Businesses you want to compare against. A competitor here is just a website you added — no rank or traffic is invented for it. Compare it against your own live ranks on the Keywords page.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then add its competitors here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
          </Panel>
          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px' }}>Add a competitor</h3>
            <Field label="Competitor website"><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="competitor.com" style={inputStyle} /></Field>
            <Field label="Name (optional)"><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></Field>
            <PrimaryButton onClick={run} disabled={busy || !domain.trim()}>{busy ? 'Working…' : 'Add competitor'}</PrimaryButton>
            {msg ? <p style={{ color: MUTED }}>{msg}</p> : null}
          </Panel>
          <Panel>
            <h3 style={{ margin: '0 0 12px' }}>Competitors ({rows.length})</h3>
            {rows.length === 0 ? <p style={{ color: DIM }}>No competitors yet.</p> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Website</th><th style={thStyle}>Name</th><th style={thStyle}></th></tr></thead>
              <tbody>{rows.map((r) => <tr key={String(r.id)}><td style={tdStyle}>{String(r.domain)}</td><td style={tdStyle}>{String(r.name ?? '')}</td><td style={tdStyle}><GhostButton onClick={() => remove(String(r.id))} disabled={busy}>Remove</GhostButton></td></tr>)}</tbody></table>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
