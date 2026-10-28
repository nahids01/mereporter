'use client';
import { useEffect, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, MUTED, DIM, EmptyState, BRAND } from '@/lib/app-shell';

type Row = Record<string, unknown>;
type Pt = { lat: number; lng: number; rank: number | null };
function cellColor(rank: number | null): string {
  if (rank === null) return '#333';
  if (rank <= 3) return '#2e7d32';
  if (rank <= 10) return '#ff9800';
  return '#c62828';
}
function avgRank(points: Pt[]): string {
  const ranks = points.filter((p) => p.rank !== null).map((p) => p.rank as number);
  if (!ranks.length) return 'No data';
  return (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1);
}
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [snaps, setSnaps] = useState<Row[]>([]);
  const [grid, setGrid] = useState<Pt[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState(''); const [place, setPlace] = useState(''); const [step, setStep] = useState('2');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/gbp-grid?project_id=${projectId}`);
    if (status === 200) setSnaps(((json.snapshots as Row[]) ?? []));
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg(''); setGrid([]); setSelected(null);
    try {
      const j = await callApi('/api/gbp-grid', 'POST', { project_id: projectId, keyword: keyword.trim(), place: place.trim() || undefined, step_km: Number(step) || 2 });
      setMsg(String((j as Row).note ?? 'Done.'));
      if (Array.isArray(j.points)) setGrid(j.points as Pt[]);
      await load();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  function showSnapshot(s: Row) {
    const pts = s.grid_json as Pt[] | undefined;
    if (Array.isArray(pts)) { setGrid(pts); setSelected(s); setMsg(''); }
  }
  if (error) return <AppShell active="gbp" title="GBP & Local"><Panel>{error} — sign in at <a href="/login" style={{ color: BRAND, fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="gbp" title="GBP & Local" subtitle="How the business shows up on the local map around a place. Green = top 3, orange = 4–10, red = 11+, grey = not found there. Grey is no-data, never an estimate.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then check its local map grid here." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
          </Panel>
          <Panel style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px' }}>Run a local grid (3 × 3)</h3>
            <Field label="Search phrase"><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. dentist downtown toronto" style={inputStyle} /></Field>
            <Field label="Centre place" hint="The map centre — e.g. Downtown Toronto. Only the location is looked up; a location alone never creates a rank."><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Downtown Toronto" style={inputStyle} /></Field>
            <Field label="Distance between grid points (km)"><input value={step} onChange={(e) => setStep(e.target.value)} type="number" min="0.5" step="0.5" style={inputStyle} /></Field>
            <PrimaryButton onClick={run} disabled={busy || !keyword.trim() || !place.trim()}>{busy ? 'Checking grid…' : 'Run local grid'}</PrimaryButton>
            {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}
          </Panel>
          {grid.length === 9 ? (
            <Panel style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 4px' }}>{selected ? `Saved grid — ${String(selected.keyword)}` : `Grid — ${keyword}`}</h3>
              <p style={{ color: MUTED, margin: '0 0 14px' }}>Average map rank: <strong style={{ color: '#fff' }}>{avgRank(grid)}</strong> (only points where the business was found are counted).</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxWidth: 420 }}>
                {grid.map((p, i) => (
                  <div key={i} style={{ background: cellColor(p.rank), color: '#fff', padding: 14, textAlign: 'center', borderRadius: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{p.rank === null ? '—' : `#${p.rank}`}</div>
                    <small style={{ opacity: 0.85 }}>{Number(p.lat).toFixed(3)}, {Number(p.lng).toFixed(3)}</small>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
          <Panel>
            <h3 style={{ margin: '0 0 12px' }}>Saved grids ({snaps.length})</h3>
            {snaps.length === 0 ? <p style={{ color: DIM }}>No saved grids yet. Run one above — nothing is shown until a real check runs.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                {snaps.map((s) => (
                  <li key={String(s.id)}>
                    {String(s.keyword)} — {String(s.centre_name ?? `${String(s.centre_lat)}, ${String(s.centre_lng)}`)} — {String(s.created_at)}
                    {' '}<GhostButton onClick={() => showSnapshot(s)}>View grid</GhostButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}
