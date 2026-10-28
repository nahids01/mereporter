'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, GhostButton, tableStyle, thStyle, tdStyle, MUTED, DIM, BRAND } from '@/lib/app-shell';

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

export default function Page() {
  const [users, setUsers] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [usage, setUsage] = useState<Row | null>(null);
  const [health, setHealth] = useState<Row | null>(null);
  const [msg, setMsg] = useState('Loading…');
  const [admin, setAdmin] = useState(false);
  async function load() {
    const u = await apiFetch('/api/admin/users');
    const p = await apiFetch('/api/admin/projects');
    if (u.status === 403 || p.status === 403) { setMsg('Admin only. You are signed in as a non-admin (or not signed in) — this page lists nothing for you.'); setAdmin(false); return; }
    if (u.status !== 200) { setMsg(String(u.json.error ?? 'Failed to load admin data. Sign in as an admin first.')); return; }
    setAdmin(true);
    setUsers(((u.json.users as Row[]) ?? []));
    setProjects(((p.json.projects as Row[]) ?? []));
    const us = await apiFetch('/api/admin/usage');
    if (us.status === 200) setUsage(us.json as Row);
    const h = await apiFetch('/api/health');
    if (h.status === 200) setHealth(h.json as Row);
    setMsg('');
  }
  useEffect(() => { load(); }, []);
  async function act(userId: string, action: string) {
    const { status, json } = await apiFetch('/api/admin/users', 'POST', { user_id: userId, action });
    setMsg(status === 200 ? `User ${action}ed.` : String(json.error ?? 'Action failed'));
    await load();
  }
  return (
    <AppShell active="setup" title="Setup & Team — admin only" subtitle="Admins approve new accounts and see every project and how much live-rank usage was spent. Nobody can be promoted to admin here — admin status comes only from the two admin email addresses, and any role sent in a request is ignored.">
      {msg ? <Panel><p style={{ color: MUTED, margin: 0, lineHeight: 1.6 }}>{msg}</p></Panel> : null}
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
            <h2 style={{ margin: '0 0 12px' }}>All projects ({projects.length})</h2>
            {projects.length === 0 ? <p style={{ color: DIM }}>No projects yet.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>{projects.map((p) => <li key={String(p.id)}>{String(p.name)} — {String(p.website_url)} — owner: {String(p.owner_email ?? p.owner_id)}</li>)}</ul>
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
