'use client';
import { useEffect, useState } from 'react';
import { useProjects } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, Field, inputStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

type Row = Record<string, unknown>;

function builderOf(r: Row): Record<string, unknown> {
  const j = r.report_json as Row | undefined;
  return (j?.builder as Row | undefined) ?? {};
}

export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    const { status, json } = await apiFetch(`/api/report?project_id=${id}`);
    if (status === 200) setRows(((json.reports as Row[]) ?? []));
    else setMsg(String(json.error ?? 'Load failed'));
    setLoading(false);
  }
  useEffect(() => { load(projectId); }, [projectId]);

  if (error) return <AppShell active="reports" title="Reports"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  const project = projects.find((p) => p.id === projectId);

  return (
    <AppShell active="reports" title="Reports" subtitle="Build reports and email them on a schedule.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then build its report here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', justifyContent: 'space-between' }}>
            <div style={{ flex: '1 1 320px' }}>
              <Field label="Website">
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
                </select>
              </Field>
            </div>
            <a href={`/reports/new?project_id=${projectId}`} style={{ background: BRAND, color: '#000', borderRadius: 10, padding: '11px 18px', fontWeight: 800, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Create Report</a>
          </Panel>
          {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
          <Panel>
            <h3 style={{ margin: '0 0 4px' }}>All Reports</h3>
            <p style={{ color: DIM, fontSize: 13, margin: '0 0 14px' }}>Click a report to open it in the builder. Reports are built only from recorded data — sections with no data are labelled “No data”, never filled in.</p>
            {loading ? <p style={{ color: MUTED }}>Loading…</p> : rows.length === 0 ? (
              <p style={{ color: DIM }}>No reports found. Create your first report for {project ? project.website_url : 'this website'}.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {rows.map((r) => {
                  const b = builderOf(r);
                  const stored = r.report_json as Row | undefined;
                  const sched = b.schedule as Row | undefined;
                  return (
                    <li key={String(r.id)} style={{ borderTop: '1px solid #2a2a2a', padding: '12px 0' }}>
                      <a href={`/reports/new?project_id=${projectId}&report_id=${String(r.id)}`} style={{ color: '#fff', fontWeight: 700, textDecoration: 'none' }}>
                        {String(b.report_name ?? `Report for ${project?.website_url ?? ''} — ${String(r.month)}`)}
                      </a>
                      <div style={{ color: MUTED, fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
                        {String(r.month)} · {String(r.status)}{stored?.isPartial ? ' (partial — some sections have no data)' : ''}
                        {b.template ? ` · Template: ${String(b.template)}` : ''}
                        {sched && sched.enabled === true ? ` · Scheduled: ${String(sched.frequency)} on ${String(sched.day)} at ${String(sched.time)} to ${Array.isArray(sched.recipients) ? sched.recipients.length : 0} recipient(s)` : ' · Schedule off'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
