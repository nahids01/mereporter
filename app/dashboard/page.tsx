'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { useProjects } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, BRAND, MUTED, DIM } from '@/lib/app-shell';

type AnyRow = Record<string, unknown>;
type Kpi = { label: string; value: string; note: string };

function fmtDate(v: unknown): string {
  if (!v) return '';
  try { return new Date(String(v)).toLocaleDateString(); } catch { return String(v); }
}

export default function DashboardPage() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [kpis, setKpis] = useState<Kpi[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [striking, setStriking] = useState<AnyRow[]>([]);
  const [sliding, setSliding] = useState<{ keyword: string; from: number | null; to: number | null }[]>([]);
  const [overallCtr, setOverallCtr] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!projectId) { setKpis(null); setStriking([]); setSliding([]); setOverallCtr(null); setLoading(false); return; }
    (async () => {
      setLoading(true); setMsg('');
      try {
        const [rank, audit, imp, rep, ai, links] = await Promise.all([
          apiFetch(`/api/rank?project_id=${projectId}`),
          apiFetch(`/api/audit?project_id=${projectId}`),
          apiFetch(`/api/import?project_id=${projectId}`),
          apiFetch(`/api/report?project_id=${projectId}`),
          apiFetch(`/api/ai-visibility?project_id=${projectId}`),
          apiFetch(`/api/backlinks?project_id=${projectId}`),
        ]);
        const kws = (rank.json.keywords as AnyRow[] | undefined) ?? [];
        const serp = kws.filter((k) => k.kind === 'serp');
        const serpRanked = serp.filter((k) => typeof k.rank === 'number');
        const scans = (audit.json.scans as AnyRow[] | undefined) ?? [];
        const imports = (imp.json.imports as AnyRow[] | undefined) ?? [];
        const reports = (rep.json.reports as unknown[]) ?? [];
        const prompts = (ai.json.prompts as AnyRow[] | undefined) ?? [];
        const backlinks = (links.json.backlinks as unknown[]) ?? [];
        const snapshots = (rank.json.snapshots as AnyRow[] | undefined) ?? [];

        const avgPos = serpRanked.length
          ? (serpRanked.reduce((s, k) => s + (k.rank as number), 0) / serpRanked.length).toFixed(1)
          : '—';
        const top10 = serpRanked.filter((k) => (k.rank as number) <= 10).length;
        const visibility = serpRanked.length ? `${Math.round((top10 / serpRanked.length) * 100)}%` : '—';
        const clickVal = imports
          .filter((r) => /click/i.test(String(r.metric)))
          .reduce((s, r) => s + (typeof r.value === 'number' ? r.value : 0), 0);
        const clicks = imports.some((r) => /click/i.test(String(r.metric))) ? clickVal.toLocaleString() : '—';
        const latestScan = scans[0];
        const checks = ((latestScan?.checks as AnyRow[] | undefined) ?? []);
        const openIssues = latestScan ? String(checks.filter((c) => !c.passed).length) : '—';
        const top3 = serpRanked.filter((k) => (k.rank as number) <= 3).length;
        const checkedPrompts = prompts.filter((p) => p.result_json !== null);
        const aiRate = prompts.length ? `${Math.round((checkedPrompts.length / prompts.length) * 100)}%` : '—';

        setKpis([
          { label: 'Search Visibility', value: visibility, note: 'Share of tracked search keywords with a recorded rank in the top 10. “—” means no rank recorded yet.' },
          { label: 'Average Position', value: avgPos, note: 'Average of recorded search ranks only. Keywords with no rank are left out, never counted as a rank.' },
          { label: 'Clicks (imported)', value: clicks, note: 'Total clicks from imported Search Console / Bing rows only. No live click data is estimated.' },
          { label: 'Conversions (GA4)', value: '—', note: 'No conversion number imported yet. This stays “—” until a conversion metric is actually imported.' },
          { label: 'Keywords in Top 3', value: String(top3), note: 'Tracked search keywords with a recorded rank of 1, 2 or 3.' },
          { label: 'AI Mention Rate', value: aiRate, note: 'Share of AI prompts with a stored check result. A prompt with no stored result is “not checked”, never shown as mentioned.' },
          { label: 'Open Audit Issues', value: openIssues, note: 'Failed checks in the latest live site audit. “—” means no audit has been run yet.' },
          { label: 'Live Backlinks', value: String(backlinks.length), note: 'Stored backlinks only. There is no live backlink discovery, so nothing is added automatically.' },
        ]);

        // Opportunities — ONLY from this project's own stored data.
        setStriking(serp.filter((k) => typeof k.rank === 'number' && (k.rank as number) >= 11 && (k.rank as number) <= 20));
        const byKw = new Map<string, AnyRow[]>();
        for (const s of snapshots) {
          const key = String(s.keyword ?? '');
          if (!byKw.has(key)) byKw.set(key, []);
          byKw.get(key)!.push(s);
        }
        const slid: { keyword: string; from: number | null; to: number | null }[] = [];
        for (const [keyword, rows] of byKw) {
          const sorted = [...rows].sort((a, b) => String(a.checked_at ?? '').localeCompare(String(b.checked_at ?? '')));
          const first = sorted[0]; const last = sorted[sorted.length - 1];
          if (typeof first?.rank === 'number' && typeof last?.rank === 'number' && (last.rank as number) > (first.rank as number)) {
            slid.push({ keyword, from: first.rank as number, to: last.rank as number });
          }
        }
        setSliding(slid);
        const clicksRow = imports.filter((r) => /click/i.test(String(r.metric))).reduce((s, r) => s + (typeof r.value === 'number' ? r.value : 0), 0);
        const imprRow = imports.filter((r) => /impression/i.test(String(r.metric))).reduce((s, r) => s + (typeof r.value === 'number' ? r.value : 0), 0);
        setOverallCtr(imprRow > 0 ? `${((clicksRow / imprRow) * 100).toFixed(1)}%` : null);
        void reports;
      } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not load dashboard data.'); }
      setLoading(false);
    })();
  }, [projectId]);

  const selected = projects.find((p) => p.id === projectId);
  const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 16 };

  if (error) {
    return (
      <AppShell active="dashboard" title="Dashboard" subtitle="Your projects, at a glance.">
        <Panel>
          {/no profile|no approved profile/i.test(error)
            ? <>No profile found. Go to <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a>, sign in again (or sign up if you have not yet), then come back to the dashboard.</>
            : <>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</>}
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell
      active="dashboard"
      title={selected ? selected.name : 'Dashboard'}
      subtitle={selected ? `${selected.website_url}${selected.location ? ` · ${selected.location}` : ''}` : 'Add a project to see its numbers here. No demo project is pre-filled.'}
    >
      {projects.length === 0 ? (
        <Panel style={{ textAlign: 'center', padding: 32 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>No projects yet</h2>
          <p style={{ margin: '0 0 20px', color: MUTED, lineHeight: 1.6 }}>Add your first client website and its keywords to see KPIs here. Everything you see will be your own data.</p>
          <PrimaryButton><a href="/projects" style={{ color: '#000', textDecoration: 'none' }}>Create a project</a></PrimaryButton>
        </Panel>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: MUTED, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ background: '#0f0f0f', color: '#fff', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
            </select>
          </div>

          {loading ? <p style={{ color: MUTED }}>Loading your numbers…</p> : kpis ? (
            <div style={gridStyle}>
              {kpis.map((k) => (
                <Panel key={k.label} style={{ borderTop: `4px solid ${BRAND}` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: MUTED }}>{k.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, margin: '8px 0' }}>{k.value}</div>
                  <small style={{ color: MUTED, lineHeight: 1.5 }}>{k.note}</small>
                </Panel>
              ))}
            </div>
          ) : null}
          {msg ? <p style={{ color: '#fca5a5' }}>{msg}</p> : null}

          <h2 style={{ margin: '32px 0 4px', fontSize: 22 }}>Opportunities — analysed from this project&apos;s own stored data</h2>
          <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 16px' }}>
            These come only from recorded ranks and imported Search Console / Analytics rows. Nothing is guessed, and any benchmark below is labelled as an estimate, not your data.
          </p>
          <div style={gridStyle}>
            <Panel>
              <h3 style={{ margin: '0 0 8px' }}>Striking Distance</h3>
              <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px', fontSize: 14 }}>Keywords ranked 11–20 — close to page 1. Improving these pages could move them onto page 1.</p>
              {striking.length === 0
                ? <p style={{ color: DIM, fontSize: 14 }}>No keywords in striking distance yet — either none are ranked 11–20, or no ranks have been recorded.</p>
                : <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>{striking.map((k) => <li key={String(k.id ?? k.keyword)}>{String(k.keyword)} — #{String(k.rank)} (checked {fmtDate(k.checked_at)})</li>)}</ul>}
            </Panel>
            <Panel>
              <h3 style={{ margin: '0 0 8px' }}>CTR Gaps</h3>
              <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px', fontSize: 14 }}>
                Overall imported click-through rate: <strong style={{ color: '#fff' }}>{overallCtr ?? 'No data'}</strong>.
                Per-keyword CTR gaps cannot be shown from totals alone — that needs per-keyword Search Console data.
              </p>
              <p style={{ color: DIM, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                Benchmark (estimate, not your data): a typical page-1 result is often quoted around 30% CTR. Use it only as a rough comparison, never as a promise.
              </p>
            </Panel>
            <Panel>
              <h3 style={{ margin: '0 0 8px' }}>Sliding</h3>
              <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px', fontSize: 14 }}>Keywords whose latest recorded rank is worse than their earliest recorded rank.</p>
              {sliding.length === 0
                ? <p style={{ color: DIM, fontSize: 14 }}>No sliding keywords found — either ranks are stable/improving, or there is not enough recorded history yet.</p>
                : <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>{sliding.map((s) => <li key={s.keyword}>{s.keyword} — #{s.from} → #{s.to}</li>)}</ul>}
            </Panel>
          </div>
          <p style={{ marginTop: 20, color: DIM, fontSize: 13, lineHeight: 1.6 }}>
            Pending accounts see only the locked pending screen — that check happens at sign-in; approved users see only their own projects (admins see all projects via Setup/Admin).
          </p>
        </>
      )}
    </AppShell>
  );
}
