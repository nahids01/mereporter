'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

type Row = Record<string, unknown>;
type Status = {
  isAdmin: boolean; googleConfigured: boolean; bingConfigured: boolean; dataforseoConfigured?: boolean; resendConfigured: boolean;
  project?: { gsc_site_url: string | null; ga4_property_id: string | null; bing_site_url: string | null; website_url: string };
  connected?: Array<{ provider: string }>; googleConnected: boolean;
};
function bool(v: boolean | undefined): string { return v ? 'Yes' : 'No'; }
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('gsc'); const [csv, setCsv] = useState('metric,value\nclicks,120\nimpressions,3400');
  const [gscSite, setGscSite] = useState(''); const [ga4Prop, setGa4Prop] = useState(''); const [bingSite, setBingSite] = useState('');
  const [banner, setBanner] = useState('');
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [runMsg, setRunMsg] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected') === 'google') setBanner('Google connected. Now press Fetch Search Console / Fetch Analytics below to pull live data.');
    else if (q.get('error')) setBanner(`Google connect did not finish (${q.get('error')}). Check the setup steps below and try again — nothing was marked connected.`);
  }, []);
  async function load() {
    if (!projectId) return;
    const { status: s, json } = await apiFetch(`/api/import?project_id=${projectId}`);
    if (s === 200) setRows(((json.imports as Row[]) ?? []));
    const st = await apiFetch(`/api/integrations/status?project_id=${projectId}`);
    if (st.status === 200) {
      const j = st.json as unknown as Status; setStatus(j);
      setGscSite(j.project?.gsc_site_url ?? ''); setGa4Prop(j.project?.ga4_property_id ?? ''); setBingSite(j.project?.bing_site_url ?? '');
    }
  }
  useEffect(() => { load(); }, [projectId]);
  async function runCsv() {
    setBusy(true); setMsg('');
    try { const j = await callApi('/api/import', 'POST', { project_id: projectId, source, csv }); setMsg(String((j as Row).note ?? 'Saved.')); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function saveSettings() {
    setBusy(true); setMsg('');
    try { await callApi('/api/integrations/project-settings', 'POST', { project_id: projectId, gsc_site_url: gscSite, ga4_property_id: ga4Prop, bing_site_url: bingSite }); setMsg('Project settings saved.'); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function fetchLive(path: string) {
    setBusy(true); setMsg('');
    try { const j = await callApi(path, 'POST', { project_id: projectId }); setMsg(String((j as Row).note ?? 'Done.')); await load(); }
    catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function connectGoogle(provider: string) {
    setBusy(true); setMsg('');
    try {
      const { status: s, json } = await apiFetch(`/api/integrations/google/start?project_id=${projectId}&provider=${provider}`);
      if (s !== 200) throw new Error(String(json.error ?? `Connect failed (${s})`));
      window.location.href = String(json.url);
    } catch (e) { setMsg(showError(e)); setBusy(false); }
  }
  async function runFullLiveCheck() {
    setBusy(true); setRunMsg(''); setRunResult(null);
    try {
      const j = await callApi('/api/integrations/dataforseo/run-all', 'POST', { project_id: projectId });
      setRunResult(j as Record<string, unknown>);
      setRunMsg(`Full live check done: ${String((j as Record<string, unknown>).serpChecked)} search keywords, ${String((j as Record<string, unknown>).gbpChecked)} local keywords, ${String((j as Record<string, unknown>).searchesUsed)} searches used.`);
      await load();
    } catch (e) { setRunMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <AppShell active="integrations" title="Integrations"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="integrations" title="Integrations" subtitle={status?.isAdmin
      ? "Connect once, then it runs itself — no file export hassle. Connect Google once (Search Console + Analytics), add the Bing key once, add the live rank key once, and the tool auto-fetches every day and again right before the monthly report on the 1st. The Fetch buttons below are only for an on-demand refresh. File import at the bottom is a backup only."
      : "Connect once, then it runs itself — no file export hassle. Connect Google once (Search Console + Analytics), add the Bing key once, and the tool auto-fetches every day and again right before the monthly report on the 1st. The Fetch buttons below are only for an on-demand refresh. File import at the bottom is a backup only."}>
      {banner ? <Panel style={{ borderColor: BRAND, marginBottom: 16 }}><p style={{ margin: 0, lineHeight: 1.6 }}>{banner}</p></Panel> : null}
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then connect its tools here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
            {status ? <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Connected now: Google sign-in {bool(status.googleConfigured)} · Google connected for this website {bool(status.googleConnected)} · Bing {bool(status.bingConfigured)}{status.isAdmin ? ` · Live rank key ${bool(status.dataforseoConfigured)}` : ''} · Email sending {bool(status.resendConfigured)}. No keys or passwords are ever shown here.</p> : null}
          </Panel>

          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px' }}>Website settings for live data</h3>
            <Field label="Search Console site" hint="Exactly as it appears in Search Console, e.g. sc-domain:example.com — leave blank to use the website address."><input value={gscSite} onChange={(e) => setGscSite(e.target.value)} style={inputStyle} /></Field>
            <Field label="Analytics property ID" hint="The number from Analytics Admin, without “properties/”."><input value={ga4Prop} onChange={(e) => setGa4Prop(e.target.value)} style={inputStyle} /></Field>
            <Field label="Bing site address" hint="Exactly as verified in Bing Webmaster Tools."><input value={bingSite} onChange={(e) => setBingSite(e.target.value)} style={inputStyle} /></Field>
            <PrimaryButton onClick={saveSettings} disabled={busy}>Save settings</PrimaryButton>
          </Panel>

          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px' }}>Connect Google (Search Console + Analytics)</h3>
            {status && !status.googleConfigured ? (
              <p style={{ color: MUTED, lineHeight: 1.7, margin: 0 }}>
                Google sign-in is not set up yet — this is an owner setup step, not a missing feature. In Google Cloud: create a project, turn on “Google Search Console” and “Google Analytics Data”, set up the sign-in consent screen (read-only access), create a web sign-in client, and set its return address to this app&apos;s address + /api/integrations/google/callback. Then add the two Google settings (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET) in the hosting settings and redeploy. Until then nothing is shown as connected.
              </p>
            ) : (
              <>
                <p style={{ color: MUTED, lineHeight: 1.6 }}>One Google connect covers both Search Console and Analytics (read-only). Sign-in details are stored on the server only and refresh automatically.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <PrimaryButton onClick={() => connectGoogle('gsc')} disabled={busy}>Connect Google — Search Console</PrimaryButton>
                  <PrimaryButton onClick={() => connectGoogle('ga4')} disabled={busy}>Connect Google — Analytics</PrimaryButton>
                  <GhostButton onClick={() => fetchLive('/api/integrations/gsc/fetch')} disabled={busy}>Fetch Search Console (last 28 days)</GhostButton>
                  <GhostButton onClick={() => fetchLive('/api/integrations/ga4/fetch')} disabled={busy}>Fetch Analytics (last 28 days)</GhostButton>
                </div>
              </>
            )}
          </Panel>

          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px' }}>Bing Webmaster</h3>
            <p style={{ color: MUTED, lineHeight: 1.6 }}>Bing key set: {status ? bool(status.bingConfigured) : '…'}. Get the key from Bing Webmaster Tools → Settings → API Access, add it as BING_API_KEY in the hosting settings, and redeploy. No code change is needed.</p>
            <GhostButton onClick={() => fetchLive('/api/integrations/bing/fetch')} disabled={busy}>Fetch Bing (visits & traffic totals)</GhostButton>
          </Panel>

          {/* ADMIN-ONLY: the live-rank provider card is rendered only for
              admins. Non-admins never see this card, its name, its button,
              its cost, or its usage — they just see their ranks update. */}
          {status?.isAdmin ? (
          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px' }}>Live ranks (the only paid tool)</h3>
            <p style={{ color: MUTED, lineHeight: 1.7, margin: '0 0 14px' }}>
              Status: <strong style={{ color: '#fff' }}>{status ? (status.dataforseoConfigured ? 'Connected' : 'Not connected') : '…'}</strong> — this is a server setting only, no key is ever shown here.
              It is pay-as-you-go: top up credits, credits never expire, and there is no monthly subscription in this tool. A search check is 1 search per keyword; a local grid is fixed at 3×3 = 9 searches per keyword, never larger. So a small client with 20 search keywords + 5 local keywords costs 20 + 45 = 65 searches per full check — a few cents per check, a few dollars a month even with daily checks — against a client fee. What that buys, and what other rank tools do not have here, is authentic live ranks plus a local map grid feeding the same combined report as Search Console, Analytics and Bing. Every completed search is counted and the totals are visible to admins on the Setup page.
            </p>
            {status && !status.dataforseoConfigured ? (
              <>
                <PrimaryButton disabled>Connect DataForSEO</PrimaryButton>
                <p style={{ color: MUTED, lineHeight: 1.7, margin: '12px 0 0' }}>
                  To connect, the owner adds DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the hosting (Vercel) env vars and redeploys — that is the only secure step. Do <strong style={{ color: '#fff' }}>not</strong> type a DataForSEO login or password into this app: credentials are never entered in the browser and never stored in this app&apos;s database. Once the hosting settings are set and the app is redeployed, this card changes to “Connected” and the button below becomes “Run full live check”.
                </p>
              </>
            ) : (
              <>
                <PrimaryButton onClick={runFullLiveCheck} disabled={busy}>Run full live check</PrimaryButton>
                <p style={{ color: MUTED, lineHeight: 1.7, margin: '12px 0 0' }}>
                  One click does the whole main job automatically: every stored search keyword is live-checked once, and every stored local keyword is live-checked on a 3×3 map grid. No per-keyword work, no manual steps. Ranks appear in Keywords, grids appear in GBP &amp; Local, and the next report includes them automatically.
                </p>
              </>
            )}
            {runMsg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{runMsg} {runResult ? <a href="/reports" style={{ color: BRAND, fontWeight: 700 }}>Generate the report →</a> : null}</p> : null}
            {runResult && Array.isArray(runResult.failures) && (runResult.failures as unknown[]).length > 0 ? (
              <p style={{ color: MUTED, lineHeight: 1.6 }}>Some keywords could not be checked and stored nothing: {(runResult.failures as unknown[]).map(String).join(' · ')}</p>
            ) : null}
          </Panel>
          ) : null}

          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px' }}>File import (backup only — not the main way)</h3>
            <Field label="Source">
              <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle}><option value="gsc">Search Console</option><option value="ga4">Analytics</option><option value="bing">Bing</option><option value="csv">Other file</option></select>
            </Field>
            <Field label="Data (metric,value, one per line)"><textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
            <PrimaryButton onClick={runCsv} disabled={busy}>{busy ? 'Working…' : 'Import file'}</PrimaryButton>
            {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
          </Panel>

          <Panel>
            <h3 style={{ margin: '0 0 12px' }}>Recorded rows (live data + imports)</h3>
            {rows.length === 0 ? <p style={{ color: DIM }}>No recorded rows yet.</p> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Source</th><th style={thStyle}>Metric</th><th style={thStyle}>Value</th><th style={thStyle}>Recorded</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={String(r.id)}><td style={tdStyle}>{String(r.source)}</td><td style={tdStyle}>{String(r.metric)}</td><td style={tdStyle}>{String(r.value)}</td><td style={tdStyle}>{String(r.imported_at)}</td></tr>)}</tbody></table>
            )}
            <p style={{ color: MUTED, lineHeight: 1.6, margin: '14px 0 0' }}><strong style={{ color: '#fff' }}>Combined report:</strong> making a monthly report reads every row above together — Search Console + Analytics + Bing + file imports — so live data pulled today appears in the next report automatically.</p>
          </Panel>
        </>
      )}
    </AppShell>
  );
}
