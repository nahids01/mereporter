'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';

type AnyRow = Record<string, unknown>;
export default function DashboardPage() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [kpis, setKpis] = useState<{ avgSerp: string; latestAudit: string; imports: string; reports: string; keywords: string } | null>(null);
  const [msg, setMsg] = useState('Loading…');
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setMsg('Loading…');
      const [rank, audit, imp, rep] = await Promise.all([
        apiFetch(`/api/rank?project_id=${projectId}`),
        apiFetch(`/api/audit?project_id=${projectId}`),
        apiFetch(`/api/import?project_id=${projectId}`),
        apiFetch(`/api/report?project_id=${projectId}`),
      ]);
      const kws = (rank.json.keywords as AnyRow[] | undefined) ?? [];
      const serp = kws.filter((k) => k.kind === 'serp' && typeof k.rank === 'number');
      const scans = (audit.json.scans as AnyRow[] | undefined) ?? [];
      setKpis({
        avgSerp: serp.length ? (serp.reduce((s, k) => s + (k.rank as number), 0) / serp.length).toFixed(1) : 'No data',
        latestAudit: scans[0] ? String(scans[0].score) + '/100' : 'No scan yet',
        imports: String(((imp.json.imports as unknown[]) ?? []).length),
        reports: String(((rep.json.reports as unknown[]) ?? []).length),
        keywords: String(kws.length),
      });
      setMsg('');
    })();
  }, [projectId]);
  if (error) {
    // Actionable version of the no-profile failure: this happens when the
    // caller has an Auth account but no profiles row (previously caused by
    // the missing RLS insert policy). Signing in again now runs the server
    // profile-ensure step, which creates/repairs that row.
    if (/no profile|no approved profile/i.test(error)) {
      return <p>No profile found. Go to <a href="/login">/login</a>, sign in again (or sign up if you have not yet), then come back to the dashboard.</p>;
    }
    return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  }
  return (
    <div>
      <h1>Dashboard — KPI first</h1>
      <nav style={{ marginBottom: 16 }}><a href="/projects">Projects</a> · <a href="/rank">Rank Tracker</a> · <a href="/competitors">Competitors</a> · <a href="/audit">Site Audit</a> · <a href="/backlinks">Backlinks</a> · <a href="/ai-visibility">AI Visibility</a> · <a href="/gbp-local">GBP &amp; Local</a> · <a href="/integrations">Integrations</a> · <a href="/reports">Reports</a> · <a href="/setup">Setup/Admin</a></nav>
      <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
      {msg ? <p>{msg}</p> : kpis ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginTop: 16 }}>
          <div style={{ border: '1px solid #ddd', padding: 12 }}><strong>Average SERP rank</strong><div style={{ fontSize: 28 }}>{kpis.avgSerp}</div><small>Stored/live ranks only; null ranks excluded. &quot;No data&quot; means no rank has been recorded — never an estimate.</small></div>
          <div style={{ border: '1px solid #ddd', padding: 12 }}><strong>Latest audit score</strong><div style={{ fontSize: 28 }}>{kpis.latestAudit}</div><small>From a live scan of the project&apos;s own URL, or &quot;No scan yet&quot;.</small></div>
          <div style={{ border: '1px solid #ddd', padding: 12 }}><strong>Tracked keywords</strong><div style={{ fontSize: 28 }}>{kpis.keywords}</div><small>SERP + GBP keywords stored for this project.</small></div>
          <div style={{ border: '1px solid #ddd', padding: 12 }}><strong>Imported metric rows</strong><div style={{ fontSize: 28 }}>{kpis.imports}</div><small>GSC / GA4 / Bing / CSV imports, each with source + date.</small></div>
          <div style={{ border: '1px solid #ddd', padding: 12 }}><strong>Monthly reports</strong><div style={{ fontSize: 28 }}>{kpis.reports}</div><small>Draft reports only until email sending is configured.</small></div>
        </div>
      ) : null}
      <p style={{ marginTop: 16 }}>Pending accounts see only the locked pending screen — that check happens at sign-in; approved users see only their own projects (admins see all projects via Setup/Admin).</p>
    </div>
  );
}
