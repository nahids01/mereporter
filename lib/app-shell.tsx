'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/lib/tool-page';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const BRAND = '#FF863B';
export const BG = '#111';
export const PANEL = '#1a1a1a';
export const PANEL2 = '#222';
export const BORDER = '#2a2a2a';
export const MUTED = '#9ca3af';
export const DIM = '#6b7280';

export const NAV_ITEMS = [
  { href: '/dashboard', key: 'dashboard', label: 'Dashboard' },
  { href: '/rank', key: 'rank', label: 'Keywords' },
  { href: '/gbp-local', key: 'gbp', label: 'GBP & Local' },
  { href: '/competitors', key: 'competitors', label: 'Competitors' },
  { href: '/integrations', key: 'integrations', label: 'Integrations' },
  { href: '/audit', key: 'audit', label: 'Audit' },
  { href: '/backlinks', key: 'backlinks', label: 'Backlinks' },
  { href: '/ai-visibility', key: 'ai', label: 'AI Visibility' },
  { href: '/reports', key: 'reports', label: 'Reports' },
  { href: '/setup#report-guide', key: 'guide', label: 'Report Guide' },
  { href: '/setup', key: 'setup', label: 'Setup & Team' },
  { href: '/setup', key: 'admin', label: 'Admin' },
];

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
  const { projects } = useProjects();
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getBrowserSupabase().auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? ''));
  }, []);
  async function logout() {
    if (isSupabaseConfigured()) await getBrowserSupabase().auth.signOut();
    router.push('/login');
  }
  const projectName = projects[0]?.name ?? 'No project yet';
  return (
    <div style={{ background: BG, color: '#fff', margin: -20, width: 'calc(100% + 40px)', minHeight: 'calc(100vh - 60px)', display: 'flex', boxSizing: 'border-box' }}>
      <style>{`
        .mr-side a { color: #d1d5db; text-decoration: none; display: block; padding: 9px 12px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .mr-side a:hover { background: #222; color: #fff; }
        .mr-side a.mr-active { background: ${BRAND}; color: #000; }
        @media (max-width: 800px) { .mr-shell { flex-direction: column !important; } .mr-side { width: auto !important; border-right: none !important; border-bottom: 1px solid ${BORDER}; } }
      `}</style>
      <aside className="mr-side" style={{ width: 220, flexShrink: 0, background: '#0f0f0f', borderRight: `1px solid ${BORDER}`, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: BRAND, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.1 }}>MeReporter</div>
            <div style={{ color: MUTED, fontSize: 11 }}>Rank · GBP Grid · AI · Reports</div>
          </div>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <a key={item.key + item.href} href={item.href} className={item.key === active ? 'mr-active' : ''}>{item.label}</a>
          ))}
        </nav>
        <p style={{ color: DIM, fontSize: 11, lineHeight: 1.6, marginTop: 20 }}>
          Only your own projects are shown. Nothing here is invented — missing data is shown as no-data.
        </p>
      </aside>
      <div style={{ flex: 1, minWidth: 0, padding: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700 }}>{projectName}</span>
            <a href="/projects" style={{ background: BRAND, color: '#000', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>+ Website</a>
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
    </div>
  );
}
