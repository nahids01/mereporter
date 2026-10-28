'use client';
import { useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { AppShell, Panel, PrimaryButton, Field, inputStyle, MUTED } from '@/lib/app-shell';

export default function ProjectsPage() {
  const { projects, error } = useProjects();
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [location, setLocation] = useState('');
  const [gsc, setGsc] = useState(''); const [ga4, setGa4] = useState(''); const [bing, setBing] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function create() {
    setMsg(''); setBusy(true);
    try {
      if (!name.trim() || !url.trim()) { setMsg('Please add a name and a website address first.'); setBusy(false); return; }
      await callApi('/api/projects', 'POST', { name: name.trim(), website_url: url.trim(), location: location.trim() || null, gsc_site_url: gsc.trim() || undefined, ga4_property_id: ga4.trim() || undefined, bing_site_url: bing.trim() || undefined });
      setMsg('Project created. It is now in your list below — open it from the sidebar to add keywords, run an audit or make a report.');
      setName(''); setUrl(''); setLocation(''); setGsc(''); setGa4(''); setBing('');
      window.location.reload();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <AppShell active="dashboard" title="Projects"><Panel>{error} — sign in at <a href="/login" style={{ color: '#FF863B', fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="dashboard" title="Projects" subtitle="Your client websites. Only your own projects are listed here (admins see every project under Setup & Team). Search and local keywords are always kept separate.">
      {projects.length === 0 ? (
        <Panel style={{ textAlign: 'center', padding: 32 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>No projects yet</h2>
          <p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>This is an empty state — no demo project is pre-filled. Add your first website below.</p>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 24 }}>
          {projects.map((p) => (
            <Panel key={p.id}>
              <h3 style={{ margin: '0 0 6px' }}>{p.name}</h3>
              <p style={{ margin: '0 0 4px', color: MUTED, wordBreak: 'break-all' }}>{p.website_url}</p>
              {p.location ? <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>{p.location}</p> : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href="/rank" style={{ color: '#FF863B', fontWeight: 700, fontSize: 13 }}>Keywords →</a>
                <a href="/audit" style={{ color: '#FF863B', fontWeight: 700, fontSize: 13 }}>Audit →</a>
                <a href="/reports" style={{ color: '#FF863B', fontWeight: 700, fontSize: 13 }}>Reports →</a>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Panel>
        <h2 style={{ margin: '0 0 16px' }}>Add a website</h2>
        <Field label="Website name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Heritage Dental Studio" style={inputStyle} /></Field>
        <Field label="Website address"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" style={inputStyle} /></Field>
        <Field label="Location (optional)" hint="One line only, e.g. Downtown Toronto, Canada. Used to centre local checks."><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Downtown Toronto, Canada" style={inputStyle} /></Field>
        <Field label="Search Console site (optional)" hint="Exactly as it appears in Search Console, e.g. sc-domain:example.com — leave blank to use the website address."><input value={gsc} onChange={(e) => setGsc(e.target.value)} style={inputStyle} /></Field>
        <Field label="Analytics property ID (optional)" hint="The number from Analytics Admin, without “properties/”."><input value={ga4} onChange={(e) => setGa4(e.target.value)} style={inputStyle} /></Field>
        <Field label="Bing site address (optional)" hint="Exactly as verified in Bing Webmaster Tools."><input value={bing} onChange={(e) => setBing(e.target.value)} style={inputStyle} /></Field>
        <PrimaryButton onClick={create} disabled={busy}>{busy ? 'Saving…' : 'Create project'}</PrimaryButton>
        {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
      </Panel>
    </AppShell>
  );
}
