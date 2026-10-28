'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
type Row = Record<string, unknown>;
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [health, setHealth] = useState<Row | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('gsc'); const [csv, setCsv] = useState('metric,value\nclicks,120\nimpressions,3400');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/import?project_id=${projectId}`);
    if (status === 200) setRows(((json.imports as Row[]) ?? []));
    const h = await fetch('/api/health').then((r) => r.json()).catch(() => null);
    if (h) setHealth(h as Row);
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg('');
    try { const j = await callApi('/api/import', 'POST', { project_id: projectId, source, csv }); setMsg(String((j as Row).note ?? JSON.stringify(j))); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  return (<div><h1>Integrations</h1>
    <p>Free authentic fallback: import GSC / GA4 / Bing data as CSV (metric,value). Every stored row carries its source and import date, and is labelled imported — never presented as a live sync. Live GSC/GA4/Bing OAuth sync is NOT built (see Reports/Setup notes) and no integration is shown as &quot;connected&quot; unless its key is actually configured.</p>
    {health ? <p>Configured (booleans only, no values): Supabase {String(health.supabaseConfigured)} · DataForSEO {String(health.dataforseoConfigured)} · PageSpeed {String(health.pagespeedConfigured)} · Resend {String(health.resendConfigured)}</p> : null}
    <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
    <div style={{ marginTop: 12 }}>
      <label>Source <select value={source} onChange={(e) => setSource(e.target.value)}><option value="gsc">GSC</option><option value="ga4">GA4</option><option value="bing">Bing</option><option value="csv">CSV</option></select></label><br /><br />
      <label>CSV (metric,value per line)<br /><textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <button onClick={run} disabled={busy}>{busy ? 'Importing…' : 'Import CSV'}</button>
    </div>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>
    <h2>Imported rows</h2>
    {rows.length === 0 ? <p>No imported rows yet — honest empty state.</p> :
    <table><thead><tr><th>Source</th><th>Metric</th><th>Value</th><th>Imported</th></tr></thead><tbody>{rows.map((r) => <tr key={String(r.id)}><td>{String(r.source)}</td><td>{String(r.metric)}</td><td>{String(r.value)}</td><td>{String(r.imported_at)}</td></tr>)}</tbody></table>}
    <h2>How to connect live sources later</h2>
    <ul>
      <li>GSC / GA4 / Bing live OAuth sync: not built — needs the owner&apos;s Google Cloud OAuth client + Bing Webmaster API key, then a server OAuth flow. Until then, CSV import above is the authentic path.</li>
      <li>DataForSEO live ranks/grid: set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD as server env vars (pay-as-you-go; the owner pays DataForSEO themselves).</li>
      <li>PageSpeed info: set GOOGLE_PAGESPEED_API_KEY (info only).</li>
    </ul>
  </div>);
}
