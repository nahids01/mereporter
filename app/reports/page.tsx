'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, Field, inputStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

type Row = Record<string, unknown>;
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7));
  const [detail, setDetail] = useState<Row | null>(null);
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/report?project_id=${projectId}`);
    if (status === 200) setRows(((json.reports as Row[]) ?? []));
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg(''); setDetail(null);
    try {
      const j = await callApi('/api/report', 'POST', { project_id: projectId, month });
      setDetail((j.report as Row) ?? null);
      setMsg(`Report for ${month} saved as a draft. It is not emailed — email sending needs to be set up in Setup first, and a report is never marked sent without a confirmed delivery.`);
      await load();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <AppShell active="reports" title="Reports"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  const averages = detail?.averages as Row | undefined;
  const sections = (detail?.sections as Row[] | undefined) ?? [];
  return (
    <AppShell active="reports" title="Reports" subtitle="Monthly reports built only from recorded data. Search and local ranks stay separate, and any section with no data is labelled “No data” — the report is then marked partial, never filled in.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then make its monthly report here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
            <Field label="Month" hint="Format YYYY-MM, e.g. 2026-10.">
              <input value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
            </Field>
            <PrimaryButton onClick={run} disabled={busy}>{busy ? 'Generating…' : 'Generate draft report'}</PrimaryButton>
            {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
          </Panel>
          {detail ? (
            <Panel style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 6px' }}>Report {String(detail.month)} — {detail.isPartial ? 'Partial (some sections have no data)' : 'Complete'}</h2>
              <p style={{ color: MUTED, margin: '0 0 14px' }}>
                Average search rank: {averages?.serpAverageRank === null || averages?.serpAverageRank === undefined ? 'No data' : Number(averages.serpAverageRank).toFixed(1)} ·
                Average local rank: {averages?.gbpAverageRank === null || averages?.gbpAverageRank === undefined ? 'No data' : Number(averages.gbpAverageRank).toFixed(1)}
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                {sections.map((s, i) => <li key={i}><strong>{String(s.name)}:</strong> {String(s.status) === 'data' ? 'Has data' : 'No data'} — {String(s.note)}</li>)}
              </ul>
            </Panel>
          ) : null}
          <Panel>
            <h3 style={{ margin: '0 0 12px' }}>Saved reports ({rows.length})</h3>
            {rows.length === 0 ? <p style={{ color: DIM }}>No reports yet. Generate one above.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                {rows.map((r) => {
                  const stored = r.report_json as Row | undefined;
                  return <li key={String(r.id)}>{String(r.month)} — {String(r.status)}{stored?.isPartial ? ' (partial — some sections have no data)' : ''}</li>;
                })}
              </ul>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
