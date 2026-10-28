'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, EmptyState } from '@/lib/app-shell';

type Row = Record<string, unknown>;
function fmt(v: unknown): string { if (!v) return ''; try { return new Date(String(v)).toLocaleDateString(); } catch { return String(v); } }

export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [kw, setKw] = useState(''); const [kind, setKind] = useState('serp'); const [filter, setFilter] = useState<'all' | 'serp' | 'gbp'>('all');
  const [bulk, setBulk] = useState(''); const [bulkKind, setBulkKind] = useState('serp');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/rank?project_id=${projectId}`);
    if (status === 200) { setRows(((json.keywords as Row[]) ?? [])); setIsAdmin(Boolean(json.isAdmin)); }
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function addOne(keyword: string, k: string) {
    const j = await callApi('/api/rank', 'POST', { project_id: projectId, keyword: keyword.trim(), kind: k });
    return String((j as Row).note ?? 'Saved.');
  }
  async function run() {
    setBusy(true); setMsg('');
    try { setMsg(await addOne(kw, kind)); setKw(''); await load(); } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function runBulk() {
    const lines = bulk.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) { setMsg('Paste at least one keyword first, one per line.'); return; }
    setBusy(true); setMsg(`Adding ${lines.length} keywords…`);
    let ok = 0; let last = '';
    for (const line of lines) { try { last = await addOne(line, bulkKind); ok++; } catch (e) { last = showError(e); break; } }
    setMsg(`${ok} of ${lines.length} keywords saved. ${last}`); setBulk(''); await load(); setBusy(false);
  }
  async function runFullLiveCheck() {
    setBusy(true); setMsg('Running the full live check — every stored search keyword once, every stored local keyword on a 3×3 grid…');
    try {
      const j = await callApi('/api/integrations/dataforseo/run-all', 'POST', { project_id: projectId });
      const r = j as Record<string, unknown>;
      setMsg(`Full live check done: ${String(r.serpChecked)} search keywords, ${String(r.gbpChecked)} local keywords, ${String(r.searchesUsed)} searches used. Ranks below are the latest recorded values — generate the report from Reports.`);
      await load();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function recheckAll() {
    const list = rows.filter((r) => filter === 'all' || r.kind === filter);
    if (!list.length) { setMsg('No keywords to re-check in this view.'); return; }
    setBusy(true); setMsg(`Re-checking ${list.length} keywords…`);
    for (const r of list) { try { await callApi('/api/rank', 'POST', { project_id: projectId, keyword: String(r.keyword), kind: String(r.kind) }); } catch { /* keep going */ } }
    setMsg('Re-check finished. Ranks below are the latest recorded values.'); await load(); setBusy(false);
  }
  if (error) return <AppShell active="rank" title="Keywords"><Panel>{error} — sign in at <a href="/login" style={{ color: '#FF863B', fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  const visible = rows.filter((r) => filter === 'all' || r.kind === filter);
  return (
    <AppShell active="rank" title="Keywords" subtitle="Search keywords and local (Google Business) keywords are kept completely separate. A rank is only shown when it was actually recorded — otherwise it stays “No data”.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then come back here to add its keywords." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
          </Panel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['all', 'serp', 'gbp'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? '#FF863B' : 'transparent', color: filter === f ? '#000' : '#fff', border: '1px solid #2a2a2a', borderRadius: 999, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                {f === 'all' ? 'All keywords' : f === 'serp' ? 'Search keywords' : 'Local keywords'}
              </button>
            ))}
            <GhostButton onClick={recheckAll} disabled={busy}>Re-check all in this view</GhostButton>
            {/* ADMIN-ONLY: non-admins never see this button or any provider clue. */}
            {isAdmin ? <PrimaryButton onClick={runFullLiveCheck} disabled={busy}>Run full live check</PrimaryButton> : null}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
            <Panel>
              <h3 style={{ margin: '0 0 14px' }}>Add one keyword</h3>
              <Field label="Keyword"><input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="e.g. dentist downtown toronto" style={inputStyle} /></Field>
              <Field label="Type">
                <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}><option value="serp">Search keyword</option><option value="gbp">Local keyword</option></select>
              </Field>
              <PrimaryButton onClick={run} disabled={busy || !kw.trim()}>{busy ? 'Working…' : 'Add keyword + check rank'}</PrimaryButton>
            </Panel>
            <Panel>
              <h3 style={{ margin: '0 0 14px' }}>Add many at once</h3>
              <Field label="Keywords — one per line"><textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={5} placeholder={'dentist downtown toronto\nemergency dentist toronto'} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
              <Field label="Type for all of these">
                <select value={bulkKind} onChange={(e) => setBulkKind(e.target.value)} style={inputStyle}><option value="serp">Search keywords</option><option value="gbp">Local keywords</option></select>
              </Field>
              <PrimaryButton onClick={runBulk} disabled={busy || !bulk.trim()}>{busy ? 'Working…' : 'Add all keywords'}</PrimaryButton>
            </Panel>
          </div>
          {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
          <Panel>
            <h3 style={{ margin: '0 0 12px' }}>Keyword list ({visible.length})</h3>
            {visible.length === 0 ? <p style={{ color: DIM }}>No keywords in this view yet. Add one above — nothing here is pre-filled or estimated.</p> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Keyword</th><th style={thStyle}>Type</th><th style={thStyle}>Rank</th><th style={thStyle}>Last checked</th></tr></thead>
              <tbody>{visible.map((r, i) => <tr key={String(r.id ?? i)}><td style={tdStyle}>{String(r.keyword)}</td><td style={tdStyle}>{r.kind === 'gbp' ? 'Local' : 'Search'}</td><td style={tdStyle}>{r.rank === null || r.rank === undefined ? 'No data' : `#${String(r.rank)}`}</td><td style={tdStyle}>{fmt(r.checked_at)}</td></tr>)}</tbody></table>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
