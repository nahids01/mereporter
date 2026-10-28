'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, Field, inputStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

type Row = Record<string, unknown>;
function fmt(v: unknown): string { if (!v) return ''; try { return new Date(String(v)).toLocaleString(); } catch { return String(v); } }
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
    try { const j = await callApi('/api/audit', 'POST', { project_id: projectId }); const a = j.audit as Row; setMsg(`Score: ${String(a.score)}/100 — computed only from the live checks below.`); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <AppShell active="audit" title="Audit"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  const checks = ((latest?.checks as Row[] | undefined) ?? []);
  return (
    <AppShell active="audit" title="Audit" subtitle="A live check of the website itself — title, description, headings, image text, links, mobile view, secure connection, speed and size. The score comes only from these real checks.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then run its audit here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
            <PrimaryButton onClick={run} disabled={busy}>{busy ? 'Scanning…' : 'Run live audit'}</PrimaryButton>
            {msg ? <p style={{ color: MUTED }}>{msg}</p> : null}
          </Panel>
          {latest ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
                <Panel style={{ borderTop: `4px solid ${BRAND}` }}><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Score</div><div style={{ fontSize: 32, fontWeight: 800 }}>{String(latest.score)}/100</div></Panel>
                <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Page checked</div><div style={{ fontWeight: 700, wordBreak: 'break-all', marginTop: 8 }}>{String(latest.url)}</div></Panel>
                <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Speed / Size</div><div style={{ marginTop: 8 }}>{String(latest.response_time_ms)} ms · {String(latest.page_size_bytes)} bytes</div></Panel>
                <Panel><div style={{ color: MUTED, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Checked on</div><div style={{ marginTop: 8 }}>{fmt(latest.scanned_at)}</div></Panel>
              </div>
              <Panel style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px' }}>What was checked</h3>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                  {checks.map((c, i) => (
                    <li key={i}>
                      <span style={{ display: 'inline-block', background: c.passed ? '#14532d' : '#7f1d1d', color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, marginRight: 8 }}>{c.passed ? 'Pass' : 'Needs work'}</span>
                      {String(c.name)} ({String(c.weight)} pts) — {String(c.detail)}
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          ) : <Panel style={{ marginBottom: 16 }}><p style={{ color: DIM, margin: 0 }}>No scan yet. Run a live audit above to get a real score — nothing is shown until a scan actually runs.</p></Panel>}
          {rows.length > 1 ? (
            <Panel>
              <h3 style={{ margin: '0 0 12px' }}>Scan history</h3>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>{rows.slice(1).map((r) => <li key={String(r.id)}>{fmt(r.scanned_at)} — {String(r.score)}/100 — {String(r.url)}</li>)}</ul>
            </Panel>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
