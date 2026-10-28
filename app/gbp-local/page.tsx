'use client';
import { useEffect, useState } from 'react';
import { useProjects, ProjectPicker, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
type Row = Record<string, unknown>;
type Pt = { lat: number; lng: number; rank: number | null };
function cellColor(rank: number | null): string {
  if (rank === null) return '#eee';
  if (rank <= 3) return '#2e7d32';
  if (rank <= 10) return '#ff9800';
  return '#c62828';
}
export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [snaps, setSnaps] = useState<Row[]>([]);
  const [grid, setGrid] = useState<Pt[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState(''); const [place, setPlace] = useState('');
  async function load() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/gbp-grid?project_id=${projectId}`);
    if (status === 200) setSnaps(((json.snapshots as Row[]) ?? []));
    else setMsg(String(json.error ?? 'Load failed'));
  }
  useEffect(() => { load(); }, [projectId]);
  async function run() {
    setBusy(true); setMsg(''); setGrid([]);
    try {
      const j = await callApi('/api/gbp-grid', 'POST', { project_id: projectId, keyword, place: place || undefined });
      setMsg(String((j as Row).note ?? JSON.stringify(j)));
      if (Array.isArray(j.points)) setGrid(j.points as Pt[]);
      await load();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  if (error) return <p>{error} — sign in at <a href="/login">/login</a> first.</p>;
  return (<div><h1>GBP &amp; Local — BrightLocal-style grid</h1>
    <p>Grid centre comes from a place name via Nominatim geocoding (coordinates only — never a rank) or from explicit coordinates. The 3×3 grid is then checked live ONLY if DataForSEO is configured; otherwise configured:false is returned and nothing is stored. Green = rank 1–3, orange = 4–10, red = 11+, grey = no-data (business not found at that point).</p>
    <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
    <div style={{ marginTop: 12 }}>
      <label>Keyword<br /><input value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <label>Grid centre place (Nominatim)<br /><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Downtown Toronto" style={{ width: '100%', padding: 8 }} /></label><br /><br />
      <button onClick={run} disabled={busy}>{busy ? 'Checking grid…' : 'Run GBP grid'}</button>
    </div>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>
    {grid.length === 9 ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 90px)', gap: 6, marginTop: 12 }}>
      {grid.map((p, i) => <div key={i} style={{ background: cellColor(p.rank), color: p.rank === null ? '#111' : '#fff', padding: 12, textAlign: 'center' }}>{p.rank === null ? 'No data' : `#${p.rank}`}<br /><small>{p.lat}, {p.lng}</small></div>)}
    </div> : null}
    <h2>Stored grid snapshots</h2>
    {snaps.length === 0 ? <p>No grid snapshots yet — honest empty state.</p> : <ul>{snaps.map((s) => <li key={String(s.id)}>{String(s.keyword)} — centre {String(s.centre_name ?? `${String(s.centre_lat)}, ${String(s.centre_lng)}`)} — {String(s.created_at)}</li>)}</ul>}
  </div>);
}
