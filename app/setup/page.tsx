'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, BRAND, EmptyState } from '@/lib/app-shell';

type Row = Record<string, unknown>;
const GUIDE = [
  'Create a project with its real website address.',
  'Add search keywords and local keywords separately.',
  'Run a live audit — the score comes only from real checks.',
  'Run a live rank check — without the live rank key, keywords honestly stay “No data”.',
  'Run a local grid — grey cells are no-data, never estimates.',
  'Connect Google once and add the Bing key on Integrations — daily auto-fetch and the monthly run then pull Search Console, Analytics and Bing automatically. File import there is a backup only.',
  'Add competitors and backlinks as recorded rows only — nothing is invented for them.',
  'Add AI questions — they stay “Not checked” until a real AI-answer check is connected.',
  'Generate the monthly draft report — check which sections have no data and why.',
  'Only when email sending is set up can a report ever leave draft; until then it is never marked sent.',
];
const COUNTRIES = ['United Kingdom', 'United States', 'Canada', 'Australia', 'Ireland', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Poland', 'Portugal', 'Sweden', 'Norway', 'Denmark', 'Finland', 'New Zealand', 'India', 'Pakistan', 'Bangladesh', 'United Arab Emirates', 'Singapore', 'South Africa', 'Brazil', 'Mexico', 'Japan'];
const LANGUAGES = ['English', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Dutch', 'Polish', 'Welsh', 'Hindi', 'Urdu', 'Bengali', 'Arabic', 'Japanese'];
const TRACKING = [
  { key: 'localPack', label: 'Local Pack' },
  { key: 'imageCarousel', label: 'Image Carousel' },
  { key: 'featuredSnippet', label: 'Featured Snippet' },
  { key: 'knowledgePanel', label: 'Knowledge Panel' },
  { key: 'aiOverviewSnippet', label: 'AI Overview Snippet' },
] as const;

export default function Page() {
  const { projects, projectId, setProjectId, error: projectsError } = useProjects();
  // --- Admin (gated: admin panels render only when the admin APIs allow) ---
  const [users, setUsers] = useState<Row[]>([]);
  const [adminProjects, setAdminProjects] = useState<Row[]>([]);
  const [usage, setUsage] = useState<Row | null>(null);
  const [health, setHealth] = useState<Row | null>(null);
  const [admin, setAdmin] = useState(false);
  // --- Per-project Settings ---
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsStored, setSettingsStored] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [matchSubdomains, setMatchSubdomains] = useState(false);
  const [matchNestedUrls, setMatchNestedUrls] = useState(false);
  const [country, setCountry] = useState('United Kingdom');
  const [language, setLanguage] = useState('English');
  const [group, setGroup] = useState('');
  const [googlePlace, setGooglePlace] = useState('');
  const [carouselTitle, setCarouselTitle] = useState('');
  const [tracking, setTracking] = useState<Record<string, boolean>>({ localPack: true, imageCarousel: true, featuredSnippet: true, knowledgePanel: true, aiOverviewSnippet: true });
  // Google pickers (ONE connected account list — never a typed URL alone)
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [gscSites, setGscSites] = useState<Array<{ siteUrl: string; permissionLevel: string | null }>>([]);
  const [ga4Props, setGa4Props] = useState<Array<{ property: string; propertyId: string; displayName: string; account: string | null }>>([]);
  const [gscPick, setGscPick] = useState('');
  const [ga4Pick, setGa4Pick] = useState('');
  const [gscFallback, setGscFallback] = useState('');
  // Crawler
  const [ignorePaths, setIgnorePaths] = useState('');
  const [enableUrlParams, setEnableUrlParams] = useState(false);
  const [followNofollow, setFollowNofollow] = useState(false);
  const [pageLimit, setPageLimit] = useState(5000);
  const [concurrency, setConcurrency] = useState(3);
  const [autoRun, setAutoRun] = useState(false);
  const [frequency, setFrequency] = useState('Disabled');
  const [crawlMsg, setCrawlMsg] = useState('');

  async function loadAdmin() {
    const u = await apiFetch('/api/admin/users');
    const p = await apiFetch('/api/admin/projects');
    if (u.status === 403 || p.status === 403) { setAdmin(false); return; }
    if (u.status !== 200) return;
    setAdmin(true);
    setUsers(((u.json.users as Row[]) ?? []));
    setAdminProjects(((p.json.projects as Row[]) ?? []));
    const us = await apiFetch('/api/admin/usage');
    if (us.status === 200) setUsage(us.json as Row);
    const h = await apiFetch('/api/health');
    if (h.status === 200) setHealth(h.json as Row);
  }
  useEffect(() => { loadAdmin(); }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const section = q.get('section') ?? (window.location.hash === '#site-crawler' ? 'crawler' : '');
    if (section === 'crawler') {
      // Settings load first; scroll once the section exists.
      const t = setTimeout(() => document.getElementById('site-crawler')?.scrollIntoView({ behavior: 'smooth' }), 600);
      return () => clearTimeout(t);
    }
  }, []);

  async function loadSettings() {
    if (!projectId) return;
    setSettingsLoaded(false);
    const proj = projects.find((p) => p.id === projectId);
    if (proj) { setProjectName(proj.name); setProjectUrl(proj.website_url); }
    const { status, json } = await apiFetch(`/api/crawler-settings?project_id=${projectId}`);
    if (status === 200) {
      const s = json.settings as Row | undefined;
      const g = json.general as Row | undefined;
      const pr = json.project as Row | undefined;
      setSettingsStored(json.settingsStored !== false);
      if (pr) { setProjectName(String(pr.name ?? '')); setProjectUrl(String(pr.website_url ?? '')); setGscPick(String(pr.gsc_site_url ?? '')); setGa4Pick(pr.ga4_property_id ? `properties/${String(pr.ga4_property_id)}` : ''); }
      if (s) {
        setIgnorePaths(Array.isArray(s.ignorePaths) ? (s.ignorePaths as string[]).join('\n') : '');
        setEnableUrlParams(s.enableUrlParams === true);
        setFollowNofollow(s.followNofollow === true);
        setPageLimit(typeof s.pageLimit === 'number' ? s.pageLimit : 5000);
        setConcurrency(typeof s.concurrency === 'number' ? s.concurrency : 3);
      }
      if (g) {
        setMatchSubdomains(g.matchSubdomains === true);
        setMatchNestedUrls(g.matchNestedUrls === true);
        if (typeof g.country === 'string' && g.country) setCountry(g.country);
        if (typeof g.language === 'string' && g.language) setLanguage(g.language);
        setGroup(typeof g.group === 'string' ? g.group : '');
        setGooglePlace(typeof g.googlePlace === 'string' ? g.googlePlace : '');
        setCarouselTitle(typeof g.carouselTitle === 'string' ? g.carouselTitle : '');
        setAutoRun(g.autoRun === true);
        if (typeof g.frequency === 'string') setFrequency(g.frequency);
        const pt = g.positionTracking as Row | undefined;
        if (pt) setTracking({ localPack: pt.localPack !== false, imageCarousel: pt.imageCarousel !== false, featuredSnippet: pt.featuredSnippet !== false, knowledgePanel: pt.knowledgePanel !== false, aiOverviewSnippet: pt.aiOverviewSnippet !== false });
      }
    }
    const gp = await apiFetch(`/api/integrations/google/properties?project_id=${projectId}`);
    if (gp.status === 200) {
      setGoogleConnected(true); setGoogleError('');
      setGscSites(((gp.json.searchConsoleSites as typeof gscSites) ?? []));
      setGa4Props(((gp.json.ga4Properties as typeof ga4Props) ?? []));
      if (typeof gp.json.searchConsoleError === 'string' && gp.json.searchConsoleError) setGoogleError(`Search Console list: ${gp.json.searchConsoleError}`);
      if (typeof gp.json.ga4Error === 'string' && gp.json.ga4Error) setGoogleError((prev) => prev ? `${prev} · Analytics list: ${gp.json.ga4Error}` : `Analytics list: ${gp.json.ga4Error}`);
    } else {
      setGoogleConnected(false);
      setGscSites([]); setGa4Props([]);
      setGoogleError(String(gp.json.error ?? 'Google properties could not be loaded.'));
    }
    setSettingsLoaded(true);
  }
  useEffect(() => { loadSettings(); }, [projectId, projects.length]);

  async function connectGoogle() {
    setBusy(true); setMsg('');
    try {
      const { status, json } = await apiFetch(`/api/integrations/google/start?project_id=${projectId}&provider=gsc`);
      if (status !== 200) throw new Error(String(json.error ?? `Connect failed (${status})`));
      window.location.href = String(json.url);
    } catch (e) { setMsg(showError(e)); setBusy(false); }
  }

  function generalPayload() {
    return {
      project_id: projectId, name: projectName.trim(),
      gsc_site_url: gscFallback.trim() || gscPick,
      ga4_property_id: ga4Pick.replace(/^properties\//, ''),
      general: {
        matchSubdomains, matchNestedUrls, country, language, group,
        googlePlace, carouselTitle, positionTracking: tracking,
      },
    };
  }
  async function saveGeneral() {
    setBusy(true); setMsg('');
    try {
      const j = await callApi('/api/crawler-settings', 'POST', generalPayload());
      setMsg((j as Row).settingsWarning ? `Saved. Note: ${String((j as Row).settingsWarning)}` : 'Settings saved. The Search Console and Analytics picks are stored for this project and reused for its fetches.');
      await loadSettings();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function deleteProject() {
    if (!window.confirm(`Delete this website (${projectName || projectUrl}) and all of its stored data? This cannot be undone.`)) return;
    setBusy(true); setMsg('');
    try {
      const { status, json } = await apiFetch(`/api/crawler-settings?project_id=${projectId}`, 'DELETE');
      if (status !== 200) throw new Error(String(json.error ?? `Delete failed (${status})`));
      window.location.href = '/projects';
    } catch (e) { setMsg(showError(e)); setBusy(false); }
  }
  function crawlerPayload(start: boolean) {
    return {
      project_id: projectId, start_crawl: start,
      crawler: {
        ignorePaths: ignorePaths.split('\n').map((s) => s.trim()).filter(Boolean),
        enableUrlParams, followNofollow, pageLimit, concurrency, autoRun, frequency,
      },
    };
  }
  async function saveCrawler(start: boolean) {
    setBusy(true); setCrawlMsg('');
    try {
      const j = await callApi('/api/crawler-settings', 'POST', crawlerPayload(start)) as Row;
      if (start) {
        if (j.crawlStarted) {
          const c = j.crawl as Row | undefined;
          setCrawlMsg(c ? `Crawl finished: ${String(c.pages)} pages — health ${String(c.health)}%. See the results on the Site Crawler page.` : 'Crawl finished.');
        } else setCrawlMsg(`Settings saved, but the crawl did not start: ${String(j.crawlError ?? 'unknown error')}`);
      } else setCrawlMsg((j as Row).settingsWarning ? `Saved. Note: ${String((j as Row).settingsWarning)}` : 'Crawler settings saved.');
      await loadSettings();
    } catch (e) { setCrawlMsg(showError(e)); }
    setBusy(false);
  }
  async function act(userId: string, action: string) {
    const { status, json } = await apiFetch('/api/admin/users', 'POST', { user_id: userId, action });
    setMsg(status === 200 ? `User ${action}ed.` : String(json.error ?? 'Action failed'));
    await loadAdmin();
  }

  if (projectsError) return <AppShell active="setup" title="Settings"><Panel>{projectsError} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="setup" title="Settings" subtitle="Per-website settings: what the site is, which Google properties belong to it, what position features to track, and how the Site Crawler should behave. Admin team and usage sections are at the bottom and only appear for admins.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then change its settings here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
            {!settingsLoaded ? <p style={{ color: DIM, margin: 0 }}>Loading settings…</p> : !settingsStored ? <p style={{ color: MUTED, margin: 0, lineHeight: 1.6 }}>Note: crawler / General extras need Supabase migration 0010 to be saved — until then, the project name and Google picks below still save, and the crawler runs on defaults.</p> : null}
          </Panel>

          <Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 14px' }}>General</h2>
            <Field label="URL" hint="The website address itself cannot be changed here — it is the identity of this project."><input value={projectUrl} disabled style={{ ...inputStyle, opacity: 0.6 }} /></Field>
            <label style={{ display: 'block', marginBottom: 10, lineHeight: 1.6 }}><input type="checkbox" checked={matchSubdomains} onChange={(e) => setMatchSubdomains(e.target.checked)} /> Match subdomains</label>
            <label style={{ display: 'block', marginBottom: 14, lineHeight: 1.6 }}><input type="checkbox" checked={matchNestedUrls} onChange={(e) => setMatchNestedUrls(e.target.checked)} /> Match nested URLs</label>
            <Field label="Name (optional)"><input value={projectName} onChange={(e) => setProjectName(e.target.value)} style={inputStyle} /></Field>
            <Field label="Country">
              <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Language">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Group" hint="A name to group this website with others, e.g. My Rankings."><input value={group} onChange={(e) => setGroup(e.target.value)} style={inputStyle} /></Field>
          </Panel>

          <Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 14px' }}>Google Places &amp; carousel</h2>
            <Field label="Google Place" hint="Search for the business as it appears on Google — use * as a wildcard in the search, e.g. * Dental Studio. This is a search, not a typed address: pick the matching business once Google is connected."><input value={googlePlace} onChange={(e) => setGooglePlace(e.target.value)} placeholder="Search for your business…" style={inputStyle} /></Field>
            <Field label="Google Carousel title"><input value={carouselTitle} onChange={(e) => setCarouselTitle(e.target.value)} style={inputStyle} /></Field>
          </Panel>

          <Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 14px' }}>Google integration</h2>
            <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 14px' }}>Select the Analytics and Search Console properties that match this website — selecting matching properties enables traffic and keyword discovery for this project. Both lists come from the one connected Google account, and the picks are stored for this project, so a new website under the same Google account reuses the same account list without reconnecting.</p>
            {!googleConnected ? (
              <>
                <p style={{ color: MUTED, lineHeight: 1.6 }}>{googleError || 'No Google account is connected for this project yet.'}</p>
                <PrimaryButton onClick={connectGoogle} disabled={busy}>Connect Google</PrimaryButton>
              </>
            ) : (
              <>
                {googleError ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{googleError}</p> : null}
                <Field label="Analytics property">
                  <select value={ga4Pick} onChange={(e) => setGa4Pick(e.target.value)} style={inputStyle}>
                    <option value="">None</option>
                    {ga4Props.map((p) => <option key={p.property} value={p.property}>{p.displayName} ({p.propertyId}){p.account ? ` — ${p.account}` : ''}</option>)}
                  </select>
                </Field>
                <Field label="Search Console property">
                  <select value={gscPick} onChange={(e) => setGscPick(e.target.value)} style={inputStyle}>
                    <option value="">None</option>
                    {gscSites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}{s.permissionLevel ? ` (${s.permissionLevel})` : ''}</option>)}
                  </select>
                </Field>
                <GhostButton onClick={connectGoogle} disabled={busy}>Connect a different Google account</GhostButton>
              </>
            )}
            <div style={{ marginTop: 14 }}>
              <Field label="Fallback: Search Console site (only if your property is not listed above)" hint="Only use this if the property picker above does not list your site — e.g. sc-domain:example.com. When filled, it overrides the picker above. This is a fallback, not the main connect path."><input value={gscFallback} onChange={(e) => setGscFallback(e.target.value)} placeholder="Leave blank to use the picker above" style={inputStyle} /></Field>
            </div>
            <h3 style={{ margin: '16px 0 10px' }}>Position tracking</h3>
            {TRACKING.map((t) => (
              <label key={t.key} style={{ display: 'block', marginBottom: 8, lineHeight: 1.6 }}>
                <input type="checkbox" checked={tracking[t.key] ?? false} onChange={(e) => setTracking({ ...tracking, [t.key]: e.target.checked })} /> {t.label}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <PrimaryButton onClick={saveGeneral} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</PrimaryButton>
              <GhostButton onClick={deleteProject} disabled={busy}>Delete URL</GhostButton>
            </div>
            {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
          </Panel>

          <div id="site-crawler"><Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 14px' }}>Site Crawler</h2>
            <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 14px' }}>How the crawl walks this website. The crawl starts at the website address, follows same-origin links, and stops at the page limit. Scheduling below only stores the choice — automatic runs are not wired to a cron in this build, so use “Save &amp; Start crawling” for a run now.</p>
            <Field label="Ignore link paths" hint="One path per line. Any link whose path contains one of these lines is skipped, e.g. /tag/ or /wp-admin/."><textarea value={ignorePaths} onChange={(e) => setIgnorePaths(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
            <label style={{ display: 'block', marginBottom: 10, lineHeight: 1.6 }}><input type="checkbox" checked={enableUrlParams} onChange={(e) => setEnableUrlParams(e.target.checked)} /> Enable URL params — keep ?query strings as separate pages (off treats the same path with different params as one page)</label>
            <label style={{ display: 'block', marginBottom: 14, lineHeight: 1.6 }}><input type="checkbox" checked={followNofollow} onChange={(e) => setFollowNofollow(e.target.checked)} /> Follow nofollow — follow links marked rel="nofollow" (off skips them)</label>
            <Field label="Page limit" hint="Maximum pages per crawl. Default 5,000."><input type="number" min={1} max={5000} value={pageLimit} onChange={(e) => setPageLimit(Number(e.target.value) || 5000)} style={inputStyle} /></Field>
            <Field label="Concurrency" hint="How many pages to fetch at once. Default 3."><input type="number" min={1} max={10} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value) || 3)} style={inputStyle} /></Field>
            <label style={{ display: 'block', marginBottom: 10, lineHeight: 1.6 }}><input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} /> Auto run — run this crawl automatically on the schedule below</label>
            <Field label="Frequency">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle}>
                <option>Disabled</option><option>Weekly</option><option>Monthly</option>
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <GhostButton onClick={() => { setCrawlMsg('Unsaved crawler changes discarded — the form now shows the last saved settings.'); loadSettings(); }}>Cancel crawling</GhostButton>
              <GhostButton onClick={() => saveCrawler(false)} disabled={busy}>Save crawler settings</GhostButton>
              <PrimaryButton onClick={() => saveCrawler(true)} disabled={busy}>{busy ? 'Crawling…' : 'Save & Start crawling'}</PrimaryButton>
              <GhostButton href="/audit">View crawl results</GhostButton>
            </div>
            {crawlMsg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{crawlMsg}</p> : null}
          </Panel></div>
        </>
      )}

      {admin ? (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px' }}>Team ({users.length})</h2>
            {users.length === 0 ? <p style={{ color: DIM }}>No users yet.</p> : (
              <table style={tableStyle}><thead><tr><th style={thStyle}>Email</th><th style={thStyle}>Role</th><th style={thStyle}>Status</th><th style={thStyle}>Actions</th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={String(u.id)}>
                  <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{String(u.email)}</td>
                  <td style={tdStyle}>{String(u.effective_role)}</td>
                  <td style={tdStyle}>{String(u.status)}</td>
                  <td style={tdStyle}><GhostButton onClick={() => act(String(u.id), 'approve')}>Approve</GhostButton>{' '}<GhostButton onClick={() => act(String(u.id), 'reject')}>Reject</GhostButton>{' '}<GhostButton onClick={() => act(String(u.id), 'revoke')}>Revoke</GhostButton></td>
                </tr>
              ))}</tbody></table>
            )}
            <p style={{ color: DIM, fontSize: 13, margin: '12px 0 0' }}>Revoke returns an account to pending. Approved users see only their own projects.</p>
          </Panel>
          <Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px' }}>All projects ({adminProjects.length})</h2>
            {adminProjects.length === 0 ? <p style={{ color: DIM }}>No projects yet.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>{adminProjects.map((p) => <li key={String(p.id)}>{String(p.name)} — {String(p.website_url)} — owner: {String(p.owner_email ?? p.owner_id)}</li>)}</ul>
            )}
          </Panel>
          <Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px' }}>Live-rank usage this month (counts only — no keys shown)</h2>
            {usage ? (
              <>
                <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px' }}>
                  Month {String(usage.month)}: <strong style={{ color: '#fff' }}>{String(usage.totalSearches)} searches</strong> total — search {String(usage.serpSearches)}, local grid {String(usage.gbpSearches)}.
                  A search check is 1 search per keyword; a local grid is fixed at 3×3 = 9 searches per keyword, never larger.
                  Live ranks are only spent from a button or an automatic run, never when a page is opened, and only for keywords you added.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>{((usage.perProject as Row[]) ?? []).map((pr) => <li key={String(pr.project_id)}>{String(pr.name)} — {String(pr.searches)} searches (search {String(pr.serp)}, local {String(pr.gbp)})</li>)}</ul>
              </>
            ) : <p style={{ color: DIM }}>No usage recorded yet.</p>}
          </Panel>
          <Panel style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px' }}>Launch checklist</h2>
            {health ? (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                <li>Database connected: {health.supabaseConfigured ? 'Yes' : 'No'}</li>
                <li>Live rank key set: {health.dataforseoConfigured ? 'Yes' : 'No — ranks stay “No data” until it is set'}</li>
                <li>Email sending set: {health.resendConfigured ? 'Yes' : 'No — reports stay drafts until it is set'}</li>
                <li>Page-speed info set: {health.pagespeedConfigured ? 'Yes' : 'No — info only, never part of the audit score'}</li>
              </ul>
            ) : <p style={{ color: DIM }}>Checklist could not be loaded.</p>}
            <p style={{ color: DIM, fontSize: 13, margin: '12px 0 0', lineHeight: 1.6 }}>
              Settings such as keys are stored in the hosting settings, never shown back here, never saved in the code, and never shared in chat.
            </p>
          </Panel>
        </>
      ) : null}
      <Panel>
        <h2 id="report-guide" style={{ margin: '0 0 12px' }}>Report Guide — 10 steps</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: MUTED }}>
          {GUIDE.map((g, i) => <li key={i} style={{ color: '#e5e7eb' }}>{g}</li>)}
        </ol>
      </Panel>
    </AppShell>
  );
}
