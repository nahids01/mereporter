'use client';
// Public visitors see the marketing page below (PublicHome). Signed-in users
// see Pinned items instead — their projects as pinned cards, each showing the
// domain and its average position from /api/rank. Pinned state is stored in
// the browser; nothing here is invented.
import { useEffect, useState } from 'react';
import { useProjects } from '@/lib/tool-page';
import { apiFetch, type ProjectRow } from '@/lib/client-api';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { AppShell, Panel, PrimaryButton, GhostButton, MUTED, DIM, BRAND } from '@/lib/app-shell';

const brand = '#FF863B';
const dark = '#1a1a1a';

const features = [
  { title: 'Dashboard', text: 'KPI-first overview of every project you own — rankings, visibility and movement in one place.' },
  { title: 'Rank Tracker', text: 'Track SERP and GBP keywords separately, with stored history for every keyword.' },
  { title: 'GBP & Local Grid', text: 'See local presence on a map-style grid, centre by centre, without guessing at a single rank.' },
  { title: 'Site Audit', text: 'Live, check-by-check audit of a project’s own pages, with a clear score breakdown.' },
  { title: 'Competitors', text: 'Keep stored competitor records alongside your own projects for honest comparison.' },
  { title: 'Backlinks', text: 'Record and review stored backlink data for each project, source and date included.' },
  { title: 'AI Visibility', text: 'Track AI-search prompts for a project and see which ones have actually been checked.' },
  { title: 'Monthly Reports', text: 'Frozen, draft monthly reports built only from stored or live data — ready to review before sending.' },
];

const steps = [
  { n: '1', title: 'Add a project', text: 'Add your client’s website and its keywords. SERP and GBP keywords stay separate from the start.' },
  { n: '2', title: 'Import & track', text: 'Import GSC, GA4 or Bing data from CSV, run a live site audit, and track ranks as data arrives.' },
  { n: '3', title: 'Get the monthly report', text: 'Each month a draft report is built from that project’s verified data — no-data stays no-data, never invented.' },
];

function PublicHome() {
  return (
    <div>
      <style>{`
        @keyframes mrFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes mrGlow { 0%,100% { box-shadow: 0 0 0 6px rgba(255,134,59,.25), 0 0 34px rgba(255,134,59,.45); } 50% { box-shadow: 0 0 0 12px rgba(255,134,59,.12), 0 0 52px rgba(255,134,59,.65); } }
        @keyframes mrChip { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes mrBar { 0% { transform: scaleY(.35); } 100% { transform: scaleY(1); } }
        .mr-hero { display: flex; gap: 32px; align-items: center; flex-wrap: wrap; padding: 32px 0 8px; }
        .mr-hero-text { flex: 1 1 340px; min-width: 280px; }
        .mr-hero-side { flex: 0 1 340px; margin: 0 auto; text-align: center; }
        .mr-badge { display: inline-block; background: #fff3ea; color: #b45309; border: 1px solid #ffd9b8; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }
        .mr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
        .mr-card { border: 1px solid #eee; border-radius: 16px; padding: 18px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.04); }
        .mr-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
        .mr-builder { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; background: #fff7f1; border: 1px solid #ffe0c7; border-radius: 20px; padding: 24px; margin-top: 36px; }
        .mr-builder-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 20px; }
        .mr-photo-wrap { position: relative; width: 240px; height: 240px; margin: 0 auto; animation: mrFloat 5s ease-in-out infinite; }
        .mr-photo { width: 240px; height: 240px; object-fit: cover; border-radius: 50%; animation: mrGlow 4s ease-in-out infinite; }
        .mr-chip { position: absolute; background: #fff; border: 1px solid #ffe0c7; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 700; box-shadow: 0 4px 14px rgba(0,0,0,.08); animation: mrChip 4s ease-in-out infinite; white-space: nowrap; }
        .mr-bars { display: flex; align-items: flex-end; gap: 6px; height: 44px; justify-content: center; margin-top: 14px; }
        .mr-bar { width: 18px; border-radius: 6px 6px 0 0; background: ${brand}; transform-origin: bottom; animation: mrBar 1.2s ease-out both; }
        @media (max-width: 800px) {
          .mr-grid, .mr-steps, .mr-builder-grid { grid-template-columns: 1fr; }
          .mr-hero { padding-top: 16px; }
        }
      `}</style>

      {/* Hero */}
      <section className="mr-hero">
        <div className="mr-hero-text">
          <span className="mr-badge">Authentic SEO reporting — no fabricated data</span>
          <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: '16px 0', color: dark }}>
            Clear, honest reports for SEO experts — and the clients who trust them.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: '#444' }}>
            MeReporter is built to help SEO experts report with confidence. Track rankings, local
            presence, site health, competitors, backlinks and AI visibility — then turn that work
            into a monthly report your client can actually understand and believe.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: '#444' }}>
            Every report uses stored or live data only. If data is missing, it is shown as{' '}
            <strong>no-data</strong> — never invented, never smoothed over.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <a href="/login" style={{ background: brand, color: '#fff', padding: '12px 24px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>
              Login
            </a>
            <a href="/login" style={{ border: `2px solid ${brand}`, color: '#c25a12', padding: '10px 22px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>
              Sign up free
            </a>
          </div>
          <p style={{ color: '#666', fontSize: 14, marginTop: 16 }}>
            New accounts stay <strong>Pending</strong> until an admin approves them. Approved users see only their own projects.
          </p>
        </div>
        <div className="mr-hero-side" aria-hidden="true">
          <div className="mr-bars">
            <div className="mr-bar" style={{ height: 18, animationDelay: '0s' }} />
            <div className="mr-bar" style={{ height: 28, animationDelay: '.15s' }} />
            <div className="mr-bar" style={{ height: 22, animationDelay: '.3s' }} />
            <div className="mr-bar" style={{ height: 36, animationDelay: '.45s' }} />
            <div className="mr-bar" style={{ height: 44, animationDelay: '.6s' }} />
          </div>
          <p style={{ color: '#888', fontSize: 12 }}>Decorative illustration — not client data</p>
        </div>
      </section>

      {/* Features */}
      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 28, marginBottom: 4 }}>Everything an SEO report needs, in one tool</h2>
        <p style={{ color: '#555' }}>Dashboard, Rank Tracker, GBP/Local grid, Site Audit, Competitors, Backlinks, AI Visibility, and monthly reports.</p>
        <div className="mr-grid">
          {features.map((f) => (
            <div key={f.title} className="mr-card">
              <h3 style={{ margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ margin: 0, color: '#555', lineHeight: 1.55 }}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 28, marginBottom: 4 }}>How it works</h2>
        <div className="mr-steps">
          {steps.map((s) => (
            <div key={s.n} className="mr-card">
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>
                {s.n}
              </div>
              <h3 style={{ margin: '12px 0 8px' }}>{s.title}</h3>
              <p style={{ margin: 0, color: '#555', lineHeight: 1.55 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Builders — public section, no dashboard/setup links */}
      <section style={{ marginTop: 36 }}>
        <p style={{ color: brand, fontWeight: 800, letterSpacing: 1, margin: 0, fontSize: 13, textAlign: 'center' }}>BUILT BY</p>
        <h2 style={{ fontSize: 30, margin: '8px 0 4px', textAlign: 'center' }}>Built by Nurul Nahid and Md. Amran Ahmed</h2>
        <p style={{ color: '#555', lineHeight: 1.65, textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          MeReporter was built for SEO experts who need reporting they can stand behind: real
          data, clear local visibility, and monthly reports that show the work — without
          inventing a single rank.
        </p>
        <div className="mr-builder-grid">
          <div className="mr-builder">
            <div style={{ position: 'relative', margin: '0 auto' }}>
              <div className="mr-photo-wrap">
                <img src="/nurul-nahid.jpg" alt="Nurul Nahid" className="mr-photo" />
                <span className="mr-chip" style={{ top: 8, left: -18 }}>SEO ↗</span>
                <span className="mr-chip" style={{ top: 70, right: -24, animationDelay: '1s' }}>AI Search</span>
                <span className="mr-chip" style={{ bottom: 24, left: -12, animationDelay: '2s' }}>Local SEO</span>
                <span className="mr-chip" style={{ bottom: 4, right: 8, animationDelay: '.5s' }}>Rank Tracker ↑</span>
              </div>
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
              <h3 style={{ fontSize: 24, margin: '8px 0' }}>Nurul Nahid</h3>
              <p style={{ fontSize: 17, color: '#444', margin: '0 0 12px' }}>Senior SEO Expert &amp; Web Strategist</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="https://www.linkedin.com/in/nurulnahid-uk-seo-expert" target="_blank" rel="noopener noreferrer" style={{ background: brand, color: '#fff', padding: '10px 18px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>LinkedIn</a>
                <a href="https://www.instagram.com/seonurulnahid" target="_blank" rel="noopener noreferrer" style={{ border: `2px solid ${brand}`, color: '#c25a12', padding: '8px 16px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>Instagram</a>
              </div>
            </div>
          </div>
          <div className="mr-builder">
            <div style={{ position: 'relative', margin: '0 auto' }}>
              <div className="mr-photo-wrap">
                <img src="/amran-ahmed.jpg" alt="Md. Amran Ahmed" className="mr-photo" />
                <span className="mr-chip" style={{ top: 8, left: -18 }}>SEO ↗</span>
                <span className="mr-chip" style={{ top: 70, right: -24, animationDelay: '1s' }}>AI Search</span>
                <span className="mr-chip" style={{ bottom: 24, left: -12, animationDelay: '2s' }}>Local SEO</span>
                <span className="mr-chip" style={{ bottom: 4, right: 8, animationDelay: '.5s' }}>Rank Tracker ↑</span>
              </div>
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
              <h3 style={{ fontSize: 24, margin: '8px 0' }}>Md. Amran Ahmed</h3>
              <p style={{ fontSize: 17, color: '#444', margin: '0 0 12px' }}>SEO &amp; AI Search Expert with over 5 years of experience</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="https://www.linkedin.com/in/amranahmedseo/" target="_blank" rel="noopener noreferrer" style={{ background: brand, color: '#fff', padding: '10px 18px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>LinkedIn</a>
                <a href="https://www.instagram.com/amranahmedseo/" target="_blank" rel="noopener noreferrer" style={{ border: `2px solid ${brand}`, color: '#c25a12', padding: '8px 16px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>Instagram</a>
              </div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/login" style={{ background: brand, color: '#fff', padding: '10px 20px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>Start with MeReporter</a>
        </div>
      </section>

      {/* Footer — public only, no dashboard/setup links */}
      <footer style={{ marginTop: 40, borderTop: '1px solid #eee', paddingTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>MeReporter</strong> — authentic SEO reporting.
          <span style={{ color: '#666' }}> <a href="/api/health">API health</a></span>
        </div>
        <p style={{ color: '#888', fontSize: 12, maxWidth: 560, margin: 0, lineHeight: 1.5 }}>
          Note: live SERP ranks, live GBP grid, live GSC/GA4/Bing sync and monthly email sending
          need the owner’s keys and are not ready without them — until then those areas honestly
          show no-data or draft reports.
        </p>
      </footer>
    </div>
  );
}

type AvgRow = { project: ProjectRow; avg: string | null; kwCount: number };

function domainOf(url: string, fallback: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return fallback; }
}

function PinnedHome() {
  const { projects, error } = useProjects();
  const [grouping, setGrouping] = useState<'Day' | 'Week' | 'Month'>('Day');
  const [rows, setRows] = useState<AvgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinned, setPinned] = useState<string[] | null>(null);
  const [toPin, setToPin] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('mereporter-pinned-ids');
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) setPinned(parsed);
      else setPinned(null);
    } catch { setPinned(null); }
  }, []);
  useEffect(() => {
    if (projects.length && pinned === null) setPinned(projects.map((p) => p.id));
  }, [projects, pinned]);
  useEffect(() => {
    if (!projects.length) { setRows([]); return; }
    const days = grouping === 'Day' ? 1 : grouping === 'Week' ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    (async () => {
      setLoading(true);
      const out: AvgRow[] = [];
      for (const project of projects) {
        try {
          const { status, json } = await apiFetch(`/api/rank?project_id=${project.id}`);
          if (status >= 400) { out.push({ project, avg: null, kwCount: 0 }); continue; }
          const kws = (json.keywords as Record<string, unknown>[] | undefined) ?? [];
          const serp = kws.filter((k) => k.kind === 'serp');
          const snaps = (json.snapshots as Record<string, unknown>[] | undefined) ?? [];
          const inWindow = snaps.filter((s) => {
            const t = Date.parse(String(s.checked_at ?? ''));
            return Number.isFinite(t) && t >= cutoff && typeof s.rank === 'number' && s.kind !== 'gbp';
          });
          // Prefer history inside the grouping window; fall back to the latest
          // recorded rank per keyword only when the window has no history, and
          // say so via "No data" when there is no rank at all.
          const ranks = inWindow.length
            ? inWindow.map((s) => s.rank as number)
            : serp.map((k) => k.rank).filter((r): r is number => typeof r === 'number');
          out.push({
            project,
            avg: ranks.length ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1) : null,
            kwCount: serp.length,
          });
        } catch { out.push({ project, avg: null, kwCount: 0 }); }
      }
      setRows(out);
      setLoading(false);
    })();
  }, [projects, grouping]);

  function savePinned(next: string[]) {
    setPinned(next);
    try { window.localStorage.setItem('mereporter-pinned-ids', JSON.stringify(next)); } catch { /* ignore */ }
  }
  const pinnedSet = new Set(pinned ?? projects.map((p) => p.id));
  const pinnedRows = rows.filter((r) => pinnedSet.has(r.project.id));
  const unpinned = projects.filter((p) => !pinnedSet.has(p.id));

  if (error) {
    return (
      <AppShell active="dashboard" title="Pinned items" subtitle="Your pinned URLs, views and projects.">
        <Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel>
      </AppShell>
    );
  }
  return (
    <AppShell active="dashboard" title="Pinned items" subtitle="Pin a URL, view or project to keep it here. Average position comes from recorded ranks only — no-data stays no-data.">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ color: MUTED, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Group by</span>
        {(['Day', 'Week', 'Month'] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGrouping(g)}
            style={{ background: grouping === g ? BRAND : 'transparent', color: grouping === g ? '#000' : '#fff', border: `1px solid ${grouping === g ? BRAND : '#2a2a2a'}`, borderRadius: 999, padding: '7px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
          >
            {g}
          </button>
        ))}
      </div>
      {loading ? <p style={{ color: MUTED }}>Loading pinned items…</p> : null}
      {projects.length === 0 ? (
        <Panel style={{ textAlign: 'center', padding: 32 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Nothing pinned yet</h2>
          <p style={{ margin: '0 0 20px', color: MUTED, lineHeight: 1.6 }}>Add your first URL, then pin it here.</p>
          <PrimaryButton><a href="/projects?step=website" style={{ color: '#000', textDecoration: 'none' }}>Add a URL</a></PrimaryButton>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {pinnedRows.map(({ project, avg, kwCount }) => (
            <Panel key={project.id}>
              <h3 style={{ margin: '0 0 6px', wordBreak: 'break-all' }}>{domainOf(project.website_url, project.name)}</h3>
              <p style={{ margin: '0 0 4px', color: MUTED, fontSize: 13 }}>{project.name}</p>
              <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
                Average position ({grouping}): <strong>{avg ?? 'No data'}</strong>
                <span style={{ color: DIM, fontSize: 13 }}> · {kwCount} SERP keyword{kwCount === 1 ? '' : 's'} tracked</span>
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href={`/dashboard?project_id=${project.id}`} style={{ color: BRAND, fontWeight: 700, fontSize: 13 }}>Open dashboard →</a>
                <button onClick={() => savePinned([...pinnedSet].filter((id) => id !== project.id))} style={{ background: 'transparent', color: DIM, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Unpin</button>
              </div>
            </Panel>
          ))}
          <Panel style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 style={{ margin: '0 0 8px' }}>+ Add item</h3>
            <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px', fontSize: 14 }}>Pin a URL, view or project from your own projects.</p>
            {unpinned.length === 0 ? (
              <>
                <p style={{ color: DIM, fontSize: 13, lineHeight: 1.6, margin: '0 0 12px' }}>All your projects are already pinned. Add a new URL to pin something else.</p>
                <div><GhostButton href="/projects?step=website">Add a URL</GhostButton></div>
              </>
            ) : (
              <>
                <select value={toPin || unpinned[0]?.id || ''} onChange={(e) => setToPin(e.target.value)} style={{ background: '#0f0f0f', color: '#fff', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px', fontSize: 14, marginBottom: 12 }}>
                  {unpinned.map((p) => <option key={p.id} value={p.id}>{p.name} — {domainOf(p.website_url, p.name)}</option>)}
                </select>
                <div><PrimaryButton onClick={() => { const id = toPin || unpinned[0]?.id; if (id) savePinned([...pinnedSet, id]); }}>Pin item</PrimaryButton></div>
              </>
            )}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}

export default function Home() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) { setSignedIn(false); return; }
    getBrowserSupabase().auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session))).catch(() => setSignedIn(false));
  }, []);
  if (signedIn === null) return <div style={{ padding: 32, color: '#666' }}>Loading…</div>;
  return signedIn ? <PinnedHome /> : <PublicHome />;
}
