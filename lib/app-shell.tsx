'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useProjects } from '@/lib/tool-page';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { apiFetch } from '@/lib/client-api';

export const BRAND = '#FF863B';
export const BG = '#111';
export const PANEL = '#1a1a1a';
export const PANEL2 = '#222';
export const BORDER = '#2a2a2a';
export const MUTED = '#9ca3af';
export const DIM = '#6b7280';

// Nightwatch sidebar order (see NIGHTWATCH_CLONE_SPEC.md). Items whose full
// page does not exist yet point at the nearest existing tool page; later parts
// give them their own pages. The ME REPORTER section keeps existing tools
// reachable (GBP grid, backlinks, integrations, setup/admin).
export const NAV_ITEMS = [
  { href: '/dashboard', key: 'dashboard', label: 'Dashboard' },
  { href: '/dashboard', key: 'insights', label: 'Insights (New)' },
  { href: '/rank', key: 'rank', label: 'Keywords', section: 'SEARCH ENGINES' },
  { href: '/rank', key: 'views', label: 'Views' },
  { href: '/competitors', key: 'competitors', label: 'Competitors' },
  { href: '/rank', key: 'graphs', label: 'Graphs' },
  { href: '/ai-visibility', key: 'ai', label: 'AI visibility', section: 'AI SEARCH' },
  { href: '/ai-visibility', key: 'prompts', label: 'Prompts' },
  { href: '/ai-visibility', key: 'brands', label: 'Brands' },
  { href: '/ai-visibility', key: 'citations', label: 'Citations' },
  { href: '/ai-visibility', key: 'sources', label: 'Sources by brand (Beta)' },
  { href: '/reports', key: 'content-studio', label: 'Content Studio', section: 'TOOLS' },
  { href: '/audit', key: 'crawler', label: 'Site Crawler' },
  { href: '/competitors', key: 'research', label: 'Research' },
  { href: '/reports', key: 'notes', label: 'Notes' },
  { href: '/reports', key: 'reports', label: 'Reports' },
  { href: '/setup', key: 'setup', label: 'Settings' },
  { href: '/gbp-local', key: 'gbp', label: 'GBP & Local', section: 'ME REPORTER' },
  { href: '/backlinks', key: 'backlinks', label: 'Backlinks' },
  { href: '/integrations', key: 'integrations', label: 'Integrations' },
  { href: '/setup', key: 'admin', label: 'Setup & Team' },
];

// URL groups for the Add URL wizard / Quick add. No groups API exists, so
// groups are stored in the browser only (default: My Rankings).
export function getStoredGroups(): string[] {
  try {
    const raw = window.localStorage.getItem('mereporter-groups');
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed) && parsed.every((g) => typeof g === 'string') && parsed.length) return parsed;
  } catch { /* fall through to default */ }
  return ['My Rankings'];
}
export function storeGroup(name: string) {
  const clean = name.trim();
  if (!clean) return;
  const groups = getStoredGroups();
  if (!groups.includes(clean)) {
    groups.push(clean);
    try { window.localStorage.setItem('mereporter-groups', JSON.stringify(groups)); } catch { /* non-fatal */ }
  }
}
export function deriveProjectName(url: string): string {
  const host = url.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
  return host || url;
}

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: BRAND, color: '#000', border: 'none', borderRadius: 10, padding: '11px 18px', fontWeight: 800, fontSize: 14, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, href }: { children: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const style: CSSProperties = { background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: disabled ? 'default' : 'pointer', textDecoration: 'none', display: 'inline-block', opacity: disabled ? 0.6 : 1 };
  if (href) return <a href={href} style={style}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: MUTED, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
      {children}
      {hint ? <div style={{ color: DIM, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: `1px solid ${BORDER}`,
  background: '#0f0f0f', color: '#fff', fontSize: 15, boxSizing: 'border-box', outline: 'none',
};

export const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
export const thStyle: CSSProperties = { textAlign: 'left', color: MUTED, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, padding: '10px 8px', borderBottom: `1px solid ${BORDER}` };
export const tdStyle: CSSProperties = { padding: '10px 8px', borderBottom: `1px solid ${BORDER}`, color: '#e5e7eb', verticalAlign: 'top' };

export function EmptyState({ title, text, actionHref, actionLabel }: { title: string; text: string; actionHref?: string; actionLabel?: string }) {
  return (
    <Panel style={{ textAlign: 'center', padding: 32 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>{title}</h2>
      <p style={{ margin: '0 0 20px', color: MUTED, lineHeight: 1.6 }}>{text}</p>
      {actionHref && actionLabel ? <PrimaryButton><a href={actionHref} style={{ color: '#000', textDecoration: 'none' }}>{actionLabel}</a></PrimaryButton> : null}
    </Panel>
  );
}

export function ErrorCard({ text }: { text: ReactNode }) {
  return (
    <Panel style={{ borderColor: '#7c2d12', background: '#1f130c' }}>
      <p style={{ margin: 0, lineHeight: 1.6, color: '#fdba74' }}>{text}</p>
    </Panel>
  );
}

export function AppShell({ active, title, subtitle, children }: { active: string; title: string; subtitle?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { projects } = useProjects();
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [queryProjectId, setQueryProjectId] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickUrl, setQuickUrl] = useState('');
  const [quickGroup, setQuickGroup] = useState('My Rankings');
  const [quickMsg, setQuickMsg] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getBrowserSupabase().auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? ''));
  }, []);
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('project_id') ?? '';
      setQueryProjectId(id);
    } catch { /* ignore */ }
  }, [pathname]);
  async function logout() {
    if (isSupabaseConfigured()) await getBrowserSupabase().auth.signOut();
    router.push('/login');
  }
  async function quickAdd() {
    setQuickMsg(''); setQuickBusy(true);
    try {
      if (!quickUrl.trim()) { setQuickMsg('Enter a website URL first.'); setQuickBusy(false); return; }
      storeGroup(quickGroup);
      const { status, json } = await apiFetch('/api/projects', 'POST', { name: deriveProjectName(quickUrl.trim()), website_url: quickUrl.trim() });
      if (status >= 400) throw new Error(String(json.error ?? `Could not add URL (${status})`));
      const id = String((json.project as { id?: unknown } | undefined)?.id ?? '');
      if (!id) throw new Error('Project was created but no id came back — open it from My Rankings.');
      window.location.href = `/dashboard?project_id=${id}&collecting=1`;
    } catch (e) { setQuickMsg(e instanceof Error ? e.message : 'Could not add URL.'); }
    setQuickBusy(false);
  }
  const pickerValue = (queryProjectId && projects.some((p) => p.id === queryProjectId) ? queryProjectId : projects[0]?.id) ?? '';
  const q = search.trim().toLowerCase();
  const visibleProjects = q
    ? projects.filter((p) => `${p.name} ${p.website_url}`.toLowerCase().includes(q))
    : projects;
  return (
    <div style={{ background: BG, color: '#fff', margin: -20, width: 'calc(100% + 40px)', minHeight: 'calc(100vh - 60px)', display: 'flex', boxSizing: 'border-box' }}>
      <style>{`
        .mr-side a { color: #d1d5db; text-decoration: none; display: block; padding: 9px 12px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .mr-side a:hover { background: #222; color: #fff; }
        .mr-side a.mr-active { background: ${BRAND}; color: #000; }
        @media (max-width: 800px) { .mr-shell { flex-direction: column !important; } .mr-side { width: auto !important; border-right: none !important; border-bottom: 1px solid ${BORDER}; } }
      `}</style>
      <aside className="mr-side" style={{ width: 240, flexShrink: 0, background: '#0f0f0f', borderRight: `1px solid ${BORDER}`, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: BRAND, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.1 }}>MeReporter</div>
            <div style={{ color: MUTED, fontSize: 11 }}>Rank · GBP Grid · AI · Reports</div>
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sites or groups…"
          aria-label="Search sites or groups"
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <a href="/projects?step=website" style={{ background: BRAND, color: '#000', borderRadius: 10, padding: '10px 14px', fontWeight: 800, fontSize: 14, textAlign: 'center' }}>+ Add URL</a>
          <button onClick={() => { setQuickMsg(''); setQuickOpen(true); }} style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Quick add</button>
          <a href="/" style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>Create view</a>
        </div>
        <div style={{ color: MUTED, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: '4px 12px' }}>My Rankings</div>
        {visibleProjects.length === 0
          ? <p style={{ color: DIM, fontSize: 13, padding: '4px 12px', lineHeight: 1.5 }}>{projects.length === 0 ? 'No projects yet — add your first URL above.' : 'No site matches that search.'}</p>
          : visibleProjects.map((p) => (
            <a key={p.id} href={`/dashboard?project_id=${p.id}`} className={p.id === pickerValue ? 'mr-active' : ''} style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${p.name} — ${p.website_url}`}>{p.name}</a>
          ))}
        <nav style={{ marginTop: 16 }}>
          {NAV_ITEMS.map((item) => (
            <span key={item.key + item.href}>
              {item.section ? <div style={{ color: MUTED, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', padding: '14px 12px 4px' }}>{item.section}</div> : null}
              <a href={item.href} className={item.key === active ? 'mr-active' : ''}>{item.label}</a>
            </span>
          ))}
        </nav>
        <p style={{ color: DIM, fontSize: 11, lineHeight: 1.6, marginTop: 20 }}>
          Only your own projects are shown. Nothing here is invented — missing data is shown as no-data.
        </p>
      </aside>
      <div style={{ flex: 1, minWidth: 0, padding: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: MUTED, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Project</span>
            {projects.length === 0
              ? <span style={{ color: DIM, fontSize: 13 }}>No project yet</span>
              : (
                <select
                  value={pickerValue}
                  onChange={(e) => { window.location.href = `${pathname || '/dashboard'}?project_id=${e.target.value}`; }}
                  aria-label="Pick a project"
                  style={{ background: '#0f0f0f', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '9px 12px', fontSize: 14 }}
                >
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
                </select>
              )}
            <a href="/projects?step=website" style={{ background: BRAND, color: '#000', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>+ Website</a>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: MUTED, fontSize: 13, wordBreak: 'break-all' }}>{email || 'Signed in'}</span>
            <button onClick={logout} style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 999, padding: '7px 14px', fontWeight: 700, cursor: 'pointer' }}>Log out</button>
          </div>
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 28 }}>{title}</h1>
        {subtitle ? <p style={{ margin: '0 0 20px', color: MUTED, lineHeight: 1.6 }}>{subtitle}</p> : null}
        {children}
      </div>
      {quickOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 440 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>Quick add</h2>
            <Field label="Website URL"><input value={quickUrl} onChange={(e) => setQuickUrl(e.target.value)} placeholder="example.com" style={inputStyle} /></Field>
            <Field label="URL Group">
              <select value={quickGroup} onChange={(e) => setQuickGroup(e.target.value)} style={inputStyle}>
                {getStoredGroups().map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <PrimaryButton onClick={quickAdd} disabled={quickBusy}>{quickBusy ? 'Adding…' : 'Add URL'}</PrimaryButton>
              <GhostButton onClick={() => setQuickOpen(false)}>Cancel</GhostButton>
            </div>
            {quickMsg ? <p style={{ color: '#fca5a5', lineHeight: 1.6 }}>{quickMsg}</p> : null}
            <p style={{ color: DIM, fontSize: 12, lineHeight: 1.6, margin: '12px 0 0' }}>Adds the URL and opens its dashboard, where first rankings are collected.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
