'use client';
// Add URL wizard ONLY — this page creates projects, it does not list them.
// Steps: Website → Keywords & Prompts → Competitors → Plan, with Exit.
// The projects API only stores name / website_url / location (+ optional
// GSC/GA4/Bing fields), so Country, Language, URL Group and local-business
// choices are kept in the browser (localStorage, per project) and shown in
// the Plan summary until a later part adds those columns to the API.
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, MUTED, DIM, BRAND, getStoredGroups, storeGroup, deriveProjectName } from '@/lib/app-shell';

type Step = 'website' | 'keywords' | 'competitors' | 'plan';
const STEPS: { id: Step; label: string }[] = [
  { id: 'website', label: 'Website' },
  { id: 'keywords', label: 'Keywords & Prompts' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'plan', label: 'Plan' },
];

function readStep(): Step {
  try {
    const s = new URLSearchParams(window.location.search).get('step');
    if (s === 'keywords' || s === 'competitors' || s === 'plan') return s;
  } catch { /* default */ }
  return 'website';
}

export default function ProjectsPage() {
  const [step, setStep] = useState<Step>('website');
  const [url, setUrl] = useState('');
  const [country, setCountry] = useState('United States');
  const [language, setLanguage] = useState('English');
  const [group, setGroup] = useState('My Rankings');
  const [newGroup, setNewGroup] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [isLocal, setIsLocal] = useState(false);
  const [business, setBusiness] = useState('');
  const [projectId, setProjectId] = useState('');
  const [groups, setGroups] = useState<string[]>(['My Rankings']);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickUrl, setQuickUrl] = useState('');
  const [quickGroup, setQuickGroup] = useState('My Rankings');

  useEffect(() => { setStep(readStep()); setGroups(getStoredGroups()); }, []);

  function saveWizardPrefs(id: string) {
    try {
      window.localStorage.setItem(`mereporter-wizard-${id}`, JSON.stringify({ country, language, group, isLocal, business }));
    } catch { /* non-fatal */ }
  }

  async function createProject(redirectNow: boolean): Promise<string | null> {
    setMsg(''); setBusy(true);
    try {
      if (!url.trim()) { setMsg('Website URL is required.'); setBusy(false); return null; }
      if (projectId) { saveWizardPrefs(projectId); setBusy(false); return projectId; }
      storeGroup(group);
      const { status, json } = await apiFetch('/api/projects', 'POST', {
        name: deriveProjectName(url.trim()),
        website_url: url.trim(),
        country: country.trim() || null, language: language.trim() || null,
        url_group: group.trim() || null, is_local_business: isLocal,
        business_name: business.trim() || null,
        location: isLocal && business.trim() ? business.trim() : (country.trim() || null),
      });
      if (status >= 400) throw new Error(String(json.error ?? `Could not add URL (${status})`));
      const id = String((json.project as { id?: unknown } | undefined)?.id ?? '');
      if (!id) throw new Error('Project was created but no id came back — open it from My Rankings in the sidebar.');
      setProjectId(id);
      saveWizardPrefs(id);
      if (redirectNow) window.location.href = `/dashboard?project_id=${id}&collecting=1`;
      return id;
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not add URL.'); }
    setBusy(false);
    return null;
  }

  async function quickAdd() {
    setMsg(''); setBusy(true);
    try {
      if (!quickUrl.trim()) { setMsg('Enter a website URL first.'); setBusy(false); return; }
      storeGroup(quickGroup);
      const { status, json } = await apiFetch('/api/projects', 'POST', { name: deriveProjectName(quickUrl.trim()), website_url: quickUrl.trim() });
      if (status >= 400) throw new Error(String(json.error ?? `Could not add URL (${status})`));
      const id = String((json.project as { id?: unknown } | undefined)?.id ?? '');
      if (!id) throw new Error('Project was created but no id came back.');
      window.location.href = `/dashboard?project_id=${id}&collecting=1`;
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not add URL.'); }
    setBusy(false);
  }

  function exit() { window.location.href = '/dashboard'; }
  function go(s: Step) { setStep(s); }

  return (
    <AppShell active="dashboard" title="Add URL" subtitle="Add a website to track. After the Plan step you land on that URL's own dashboard, where first rankings are collected.">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <span key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {i > 0 ? <span style={{ color: DIM }}>→</span> : null}
            <button
              onClick={() => { if (s.id !== 'website' && !projectId) { setMsg('Add the website URL first — later steps need the new project.'); return; } go(s.id); }}
              style={{ background: step === s.id ? BRAND : 'transparent', color: step === s.id ? '#000' : '#fff', border: `1px solid ${step === s.id ? BRAND : '#2a2a2a'}`, borderRadius: 999, padding: '7px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
            >
              {i + 1}. {s.label}
            </button>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <GhostButton onClick={exit}>Exit</GhostButton>
        <GhostButton onClick={() => setQuickOpen(true)}>Quick add</GhostButton>
      </div>

      {step === 'website' ? (
        <Panel>
          <h2 style={{ margin: '0 0 16px' }}>Website</h2>
          <Field label="Website URL" hint="Required. Type example.com or a full https:// address.">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" style={inputStyle} />
          </Field>
          <Field label="Country"><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" style={inputStyle} /></Field>
          <Field label="Language"><input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English" style={inputStyle} /></Field>
          <Field label="URL Group">
            <select value={group} onChange={(e) => setGroup(e.target.value)} style={inputStyle}>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          {!showNewGroup
            ? <button onClick={() => setShowNewGroup(true)} style={{ background: 'transparent', color: BRAND, border: 'none', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 14 }}>+ Create new group</button>
            : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group name" style={inputStyle} />
                <PrimaryButton onClick={() => { if (!newGroup.trim()) return; storeGroup(newGroup); setGroups(getStoredGroups()); setGroup(newGroup.trim()); setNewGroup(''); setShowNewGroup(false); }}>Create group</PrimaryButton>
              </div>
            )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, lineHeight: 1.5 }}>
            <input type="checkbox" checked={isLocal} onChange={(e) => setIsLocal(e.target.checked)} style={{ marginTop: 4 }} />
            <span>This is a local business</span>
          </label>
          {isLocal ? (
            <Field label="Search for your business" hint="Type the business name as it appears on Google. Live Google Business / Places lookup is not connected yet, so this is stored as the business name for now.">
              <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="e.g. Heritage Dental Studio, Toronto" style={inputStyle} />
            </Field>
          ) : null}
          {url.trim() ? <p style={{ color: MUTED, lineHeight: 1.6 }}>Tracking in {country || '—'} · {language || '—'} · {group}</p> : null}
          <PrimaryButton onClick={async () => { const id = await createProject(false); if (id) go('keywords'); }} disabled={busy}>{busy ? 'Adding…' : (projectId ? 'Continue to Keywords & Prompts' : 'Add URL & continue')}</PrimaryButton>
          {msg ? <p style={{ color: '#fca5a5', lineHeight: 1.6 }}>{msg}</p> : null}
        </Panel>
      ) : null}

      {step === 'keywords' ? (
        <Panel>
          <h2 style={{ margin: '0 0 8px' }}>Keywords & Prompts</h2>
          <p style={{ color: MUTED, lineHeight: 1.6 }}>Add the keywords and AI prompts for <strong style={{ color: '#fff' }}>{url || 'this URL'}</strong>. The keyword page opens with the new project already selected.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <PrimaryButton><a href={`/rank/add?project_id=${projectId}`} style={{ color: '#000', textDecoration: 'none' }}>Add keywords →</a></PrimaryButton>
            <GhostButton href={`/ai-visibility?project_id=${projectId}`}>Add AI prompts →</GhostButton>
            <GhostButton onClick={() => go('competitors')}>Continue to Competitors →</GhostButton>
          </div>
          <p style={{ color: DIM, fontSize: 13, lineHeight: 1.6, marginTop: 16 }}>Keywords are split SERP vs GBP on the keyword page. You can also add keywords later from the sidebar — this step does not block the wizard.</p>
        </Panel>
      ) : null}

      {step === 'competitors' ? (
        <Panel>
          <h2 style={{ margin: '0 0 8px' }}>Competitors</h2>
          <p style={{ color: MUTED, lineHeight: 1.6 }}>Add competitor domains for <strong style={{ color: '#fff' }}>{url || 'this URL'}</strong>. Until competitors are added, the dashboard shows “No competitors added”.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <PrimaryButton><a href={`/competitors?project_id=${projectId}`} style={{ color: '#000', textDecoration: 'none' }}>Add competitors →</a></PrimaryButton>
            <GhostButton onClick={() => go('plan')}>Continue to Plan →</GhostButton>
          </div>
        </Panel>
      ) : null}

      {step === 'plan' ? (
        <Panel>
          <h2 style={{ margin: '0 0 16px' }}>Plan — summary</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              <tr><td style={{ padding: '8px 8px 8px 0', color: MUTED }}>Website</td><td style={{ padding: 8 }}>{url || '—'}</td></tr>
              <tr><td style={{ padding: '8px 8px 8px 0', color: MUTED }}>Country</td><td style={{ padding: 8 }}>{country || '—'}</td></tr>
              <tr><td style={{ padding: '8px 8px 8px 0', color: MUTED }}>Language</td><td style={{ padding: 8 }}>{language || '—'}</td></tr>
              <tr><td style={{ padding: '8px 8px 8px 0', color: MUTED }}>URL Group</td><td style={{ padding: 8 }}>{group}</td></tr>
              <tr><td style={{ padding: '8px 8px 8px 0', color: MUTED }}>Local business</td><td style={{ padding: 8 }}>{isLocal ? (business || 'Yes — no business name entered') : 'No'}</td></tr>
            </tbody>
          </table>
          <p style={{ color: MUTED, lineHeight: 1.6 }}>Finish opens this URL&apos;s dashboard with first-rank collection in progress. Keywords, prompts and competitors can still be added afterwards.</p>
          <PrimaryButton onClick={() => { if (projectId) window.location.href = `/dashboard?project_id=${projectId}&collecting=1`; }}>Finish → Dashboard</PrimaryButton>
          {msg ? <p style={{ color: '#fca5a5', lineHeight: 1.6 }}>{msg}</p> : null}
        </Panel>
      ) : null}

      {quickOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>Quick add</h2>
            <Field label="Website URL"><input value={quickUrl} onChange={(e) => setQuickUrl(e.target.value)} placeholder="example.com" style={inputStyle} /></Field>
            <Field label="URL Group">
              <select value={quickGroup} onChange={(e) => setQuickGroup(e.target.value)} style={inputStyle}>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <PrimaryButton onClick={quickAdd} disabled={busy}>{busy ? 'Adding…' : 'Add URL'}</PrimaryButton>
              <GhostButton onClick={() => setQuickOpen(false)}>Cancel</GhostButton>
            </div>
            {msg ? <p style={{ color: '#fca5a5', lineHeight: 1.6 }}>{msg}</p> : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
