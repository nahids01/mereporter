'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjects, callApi, showError } from '@/lib/tool-page';
import { apiFetch } from '@/lib/client-api';
import { AppShell, Panel, PrimaryButton, GhostButton, Field, inputStyle, tableStyle, thStyle, tdStyle, MUTED, DIM, BRAND, BORDER, EmptyState } from '@/lib/app-shell';

type BulkRow = { id: number; keyword: string; country: string; language: string; searchEngine: string; device: string; tags: string; translation: string; kind: 'serp' | 'gbp'; selected: boolean };
type GscPreviewRow = { keyword: string; position: number | null; clicks: number | null; impressions: number | null; ctr: number | null };
type StoredKw = { keyword: string; kind: string };

let rowSeq = 1;
function emptyRow(kind: 'serp' | 'gbp' = 'serp'): BulkRow {
  return { id: rowSeq++, keyword: '', country: 'United States', language: 'English', searchEngine: 'Google', device: 'desktop', tags: '', translation: '', kind, selected: false };
}
function fmtPct(v: number | null): string { return v === null ? '–' : `${(v * 100).toFixed(2)}%`; }
function fmtPos(v: number | null): string { return v === null ? '–' : v.toFixed(1); }
// Minimal quoted-field CSV split for the mapping step (client preview only;
// the server re-parses the uploaded text with its own parser).
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export default function Page() {
  const { projects, projectId, setProjectId, error } = useProjects();
  const [tab, setTab] = useState<'manual' | 'suggestions'>('manual');
  const [rows, setRows] = useState<BulkRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [bulkKind, setBulkKind] = useState<'serp' | 'gbp'>('serp');
  const [precise, setPrecise] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [stored, setStored] = useState<StoredKw[]>([]);
  const [gscProperty, setGscProperty] = useState('');

  // GSC import dialog
  const [gscOpen, setGscOpen] = useState(false);
  const [gscRows, setGscRows] = useState<GscPreviewRow[]>([]);
  const [gscPicked, setGscPicked] = useState<Set<string>>(new Set());
  const [gscLoading, setGscLoading] = useState(false);
  const [gscPropertyInput, setGscPropertyInput] = useState('');
  const [gscProperties, setGscProperties] = useState<string[]>([]);

  // CSV upload + mapping step
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState({ keyword: '', country: '', language: '', searchEngine: '', device: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  // Suggestions tab (GSC queries not already stored — no AI engine is connected)
  const [suggRows, setSuggRows] = useState<GscPreviewRow[]>([]);
  const [suggPicked, setSuggPicked] = useState<Set<string>>(new Set());
  const [suggLoading, setSuggLoading] = useState(false);

  async function loadStored() {
    if (!projectId) return;
    const { status, json } = await apiFetch(`/api/rank?project_id=${projectId}`);
    if (status === 200) setStored(((json.keywords as StoredKw[]) ?? []).map((k) => ({ keyword: k.keyword, kind: k.kind })));
    const st = await apiFetch(`/api/integrations/status?project_id=${projectId}`);
    if (st.status === 200) {
      const p = (st.json.project as { gsc_site_url?: string | null; website_url?: string } | undefined);
      const prop = p?.gsc_site_url ?? '';
      setGscProperty(prop);
      setGscPropertyInput(prop);
    }
    const props = await apiFetch(`/api/integrations/google/properties?project_id=${projectId}`);
    if (props.status === 200) {
      const sites = (props.json.searchConsoleSites as Array<{ siteUrl?: string }> | undefined) ?? [];
      setGscProperties(sites.map((s) => s.siteUrl ?? '').filter(Boolean));
    }
  }
  useEffect(() => { loadStored(); }, [projectId]);

  const filled = useMemo(() => rows.filter((r) => r.keyword.trim() !== ''), [rows]);
  const filledCount = filled.length;
  const selectedRows = rows.filter((r) => r.selected);
  const storedSet = useMemo(() => new Set(stored.map((s) => `${s.kind}:${s.keyword}`)), [stored]);

  function updateRow(id: number, patch: Partial<BulkRow>) {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      const edited = next.find((r) => r.id === id);
      // Typing a keyword into the last row appends a fresh empty row below.
      if (edited && edited.keyword.trim() !== '' && next[next.length - 1].id === id) {
        next.push(emptyRow(edited.kind));
      }
      return next;
    });
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }
  function applyKindToAll() {
    setRows((prev) => prev.map((r) => ({ ...r, kind: bulkKind })));
    setMsg(`Type set to ${bulkKind === 'gbp' ? 'Local (GBP)' : 'Search (SERP)'} for all ${rows.length} rows.`);
  }
  function applyBatch(field: 'country' | 'language' | 'searchEngine' | 'device' | 'kind', value: string) {
    setRows((prev) => prev.map((r) => (r.selected ? { ...r, [field]: value } as BulkRow : r)));
  }
  function applyBatchTags(value: string) {
    setRows((prev) => prev.map((r) => (r.selected ? { ...r, tags: value } : r)));
  }

  async function save() {
    if (!projectId) return;
    if (filledCount === 0) { setMsg('Type at least one keyword first.'); return; }
    setBusy(true); setMsg(`Saving ${filledCount} keywords…`);
    let saved = 0; let skipped = 0; let failed = 0; let last = '';
    for (const r of filled) {
      const key = `${r.kind}:${r.keyword.trim()}`;
      if (!updateExisting && storedSet.has(key)) { skipped++; continue; }
      try {
        // Country/language/search engine/device/tags/translation are sent
        // with the save and stored on the keyword row (migration 0011).
        await callApi('/api/rank', 'POST', {
          project_id: projectId, keyword: r.keyword.trim(), kind: r.kind,
          country: r.country, language: r.language, searchEngine: r.searchEngine,
          device: r.device, tags: r.tags, translation: r.translation, precise_location: precise,
        });
        saved++;
      } catch (e) { failed++; last = showError(e); }
    }
    setMsg(`Saved ${saved} of ${filledCount} keywords${skipped ? `, ${skipped} skipped (already stored, "Update existing keywords" off)` : ''}${failed ? `, ${failed} failed: ${last}` : ''}. ${saved ? 'Live rank grabbing starts from the saved rows — see their ranks on the Keywords page.' : ''}`);
    if (saved > 0) { await loadStored(); }
    setBusy(false);
  }

  async function loadGscPreview(): Promise<GscPreviewRow[] | null> {
    if (!projectId) return null;
    const { status, json } = await apiFetch('/api/integrations/gsc/import', 'POST', {
      project_id: projectId, property: gscPropertyInput.trim() || undefined, preview: true,
    });
    if (status !== 200) { setMsg(String(json.error ?? 'Search Console preview failed. Connect Google on the Integrations page first.')); return null; }
    return ((json.rows as GscPreviewRow[]) ?? []);
  }
  async function openGsc() {
    setGscOpen(true); setGscLoading(true); setMsg('');
    const preview = await loadGscPreview();
    if (preview) { setGscRows(preview); setGscPicked(new Set(preview.map((r) => r.keyword))); }
    setGscLoading(false);
  }
  async function importGsc(selectedOnly: boolean) {
    const picked = selectedOnly ? gscRows.filter((r) => gscPicked.has(r.keyword)) : gscRows;
    if (picked.length === 0) { setMsg('Select at least one Search Console query first, or use Import all.'); return; }
    setBusy(true);
    try {
      const j = await callApi('/api/integrations/gsc/import', 'POST', {
        project_id: projectId, property: gscPropertyInput.trim() || undefined,
        keywords: picked.map((r) => ({ keyword: r.keyword, position: r.position, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr })),
      });
      const r = j as Record<string, unknown>;
      setMsg(`Imported ${String(r.imported)} keywords from Search Console (${String(r.created)} new, ${String(r.updated)} updated) — each keeps its GSC position as its initial rank.`);
      setGscOpen(false); await loadStored();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }
  async function loadSuggestions() {
    setSuggLoading(true); setMsg('');
    const preview = await loadGscPreview();
    if (preview) {
      const fresh = preview.filter((r) => !storedSet.has(`serp:${r.keyword}`));
      setSuggRows(fresh); setSuggPicked(new Set(fresh.map((r) => r.keyword)));
      if (fresh.length === 0) setMsg('No new suggestions: every Search Console query is already stored as a keyword.');
    }
    setSuggLoading(false);
  }
  function addSuggestionsToManual() {
    const picked = suggRows.filter((r) => suggPicked.has(r.keyword));
    if (picked.length === 0) { setMsg('Select at least one suggestion first.'); return; }
    setRows((prev) => {
      const base = prev.filter((r) => r.keyword.trim() !== '');
      const added = picked.map((r) => ({ ...emptyRow('serp'), keyword: r.keyword }));
      return [...base, ...added, emptyRow()];
    });
    setTab('manual');
    setMsg(`${picked.length} suggestions moved into the Manual table — press "Save ${picked.length} Keywords" to store them.`);
  }

  function onCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
      const headers = splitCsvLine(firstLine);
      setCsvHeaders(headers);
      const guess = (names: string[]) => headers.find((h) => names.includes(h.trim().toLowerCase())) ?? '';
      setCsvMapping({
        keyword: guess(['keyword', 'query', 'key word']),
        country: guess(['country', 'location', 'geo']),
        language: guess(['language', 'lang']),
        searchEngine: guess(['search engine', 'searchengine', 'engine']),
        device: guess(['device']),
      });
      setCsvOpen(true);
    };
    reader.readAsText(file);
  }
  async function uploadCsv() {
    if (!csvMapping.keyword) { setMsg('Map the Keyword column first.'); return; }
    setBusy(true);
    try {
      const mapping: Record<string, string> = { keyword: csvMapping.keyword };
      if (csvMapping.country) mapping.country = csvMapping.country;
      if (csvMapping.language) mapping.language = csvMapping.language;
      if (csvMapping.searchEngine) mapping.searchEngine = csvMapping.searchEngine;
      if (csvMapping.device) mapping.device = csvMapping.device;
      const j = await callApi('/api/import', 'POST', { project_id: projectId, source: 'csv', csv: csvText, kind: bulkKind, mapping });
      const r = j as Record<string, unknown>;
      setMsg(`CSV import done: ${String(r.imported)} keywords imported, ${String(r.skipped)} skipped (already stored), ${String(r.duplicates)} duplicate rows in the file ignored. Country/language/search engine/device are stored with each keyword (migration 0011).`);
      setCsvOpen(false); await loadStored();
    } catch (e) { setMsg(showError(e)); }
    setBusy(false);
  }

  if (error) return <AppShell active="rank" title="Add Keywords"><Panel>{error} — sign in at <a href="/login" style={{ color: '#FF863B', fontWeight: 700 }}>/login</a> first.</Panel></AppShell>;
  return (
    <AppShell active="rank" title="Add Keywords" subtitle="Add search (SERP) and local (GBP) keywords in bulk. SERP and GBP are separate kinds — a row's type decides which check it gets. Nothing is invented: a saved keyword shows no rank until a real check or a Search Console import records one.">
      {projects.length === 0 ? <EmptyState title="No projects yet" text="Add a website first, then come back here to add its keywords." actionHref="/projects" actionLabel="Create a project" /> : (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <Field label="Website">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}
              </select>
            </Field>
          </Panel>

          {/* Tabs: Manual / Suggestions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['manual', 'suggestions'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? '#FF863B' : 'transparent', color: tab === t ? '#000' : '#fff', border: '1px solid #2a2a2a', borderRadius: 999, padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}>
                {t === 'manual' ? `Manual${filledCount ? ` ${filledCount}` : ''}` : 'Suggestions'}
              </button>
            ))}
            <span style={{ color: MUTED, fontSize: 13, alignSelf: 'center', marginLeft: 4 }}>
              {filledCount} keywords remaining to save
            </span>
          </div>

          {tab === 'suggestions' ? (
            <Panel>
              <h3 style={{ margin: '0 0 8px' }}>Suggestions</h3>
              <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 16px' }}>
                No AI suggestion engine is connected, so suggestions here are your own Search Console queries that are not stored as keywords yet — real queries from your property, nothing generated.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <PrimaryButton onClick={loadSuggestions} disabled={suggLoading}>{suggLoading ? 'Loading…' : 'Load suggestions from Search Console'}</PrimaryButton>
                <GhostButton onClick={addSuggestionsToManual} disabled={suggPicked.size === 0}>Add selected to Manual ({suggPicked.size})</GhostButton>
              </div>
              {suggRows.length === 0 ? <p style={{ color: DIM }}>No suggestions loaded yet — press the button above.</p> : (
                <table style={tableStyle}><thead><tr><th style={thStyle}></th><th style={thStyle}>Keyword</th><th style={thStyle}>Position</th><th style={thStyle}>Clicks</th><th style={thStyle}>Impressions</th></tr></thead>
                <tbody>{suggRows.map((r) => (
                  <tr key={r.keyword}>
                    <td style={tdStyle}><input type="checkbox" checked={suggPicked.has(r.keyword)} onChange={(e) => { const next = new Set(suggPicked); if (e.target.checked) next.add(r.keyword); else next.delete(r.keyword); setSuggPicked(next); }} /></td>
                    <td style={tdStyle}>{r.keyword}</td><td style={tdStyle}>{fmtPos(r.position)}</td><td style={tdStyle}>{r.clicks ?? '–'}</td><td style={tdStyle}>{r.impressions ?? '–'}</td>
                  </tr>
                ))}</tbody></table>
              )}
              {msg ? <p style={{ color: MUTED, lineHeight: 1.6, marginTop: 14 }}>{msg}</p> : null}
            </Panel>
          ) : (
            <>
              {/* Toolbar */}
              <Panel style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button disabled title="AI tagging is not connected — no AI service is set up for tags, so this stays honestly disabled" style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px', fontWeight: 700, opacity: 0.5, cursor: 'default' }}>Apply AI Tags</button>
                  <GhostButton onClick={openGsc}>Import from Search Console</GhostButton>
                  <GhostButton onClick={() => fileRef.current?.click()}>Upload CSV File</GhostButton>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsvFile(f); e.target.value = ''; }} />
                  <GhostButton onClick={() => setRows((prev) => [...prev, emptyRow(bulkKind)])}>Add Manually</GhostButton>
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 16 }}>
                  <label style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} /> Enable Precise Location
                  </label>
                  <label style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} /> Update existing keywords
                  </label>
                  <label style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center', opacity: 0.6 }} title="Keyword views are not built yet">
                    <input type="checkbox" disabled /> Create Keyword views
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                  <label style={{ fontSize: 13, color: MUTED }}>Type for all rows
                    <select value={bulkKind} onChange={(e) => setBulkKind(e.target.value as 'serp' | 'gbp')} style={{ ...inputStyle, width: 170, marginLeft: 6 }}>
                      <option value="serp">Search (SERP)</option><option value="gbp">Local (GBP)</option>
                    </select>
                  </label>
                  <GhostButton onClick={applyKindToAll}>Apply to all rows</GhostButton>
                  <span style={{ color: DIM, fontSize: 12 }}>Stored keywords for this project: {stored.length} (SERP {stored.filter((s) => s.kind === 'serp').length} · GBP {stored.filter((s) => s.kind === 'gbp').length})</span>
                </div>
              </Panel>

              {/* Batch edit bar */}
              {selectedRows.length > 0 ? (
                <Panel style={{ marginBottom: 16 }}>
                  <strong>{selectedRows.length} rows selected — batch edit</strong>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <BatchSelect label="Country" onApply={(v) => applyBatch('country', v)} />
                    <BatchSelect label="Language" onApply={(v) => applyBatch('language', v)} />
                    <BatchSelect label="Search engine" onApply={(v) => applyBatch('searchEngine', v)} />
                    <BatchSelect label="Device" values={['desktop', 'mobile']} onApply={(v) => applyBatch('device', v)} />
                    <BatchSelect label="Type" values={['serp', 'gbp']} labels={{ serp: 'Search (SERP)', gbp: 'Local (GBP)' }} onApply={(v) => applyBatch('kind', v)} />
                    <BatchTags onApply={applyBatchTags} />
                  </div>
                  <p style={{ color: DIM, fontSize: 12, margin: '10px 0 0' }}>Batch edits change this form only until you press Save — then tags, country, language, engine and device are stored with each keyword.</p>
                </Panel>
              ) : null}

              {msg ? <p style={{ color: MUTED, lineHeight: 1.6 }}>{msg}</p> : null}

              {/* Bulk table */}
              <Panel>
                <h3 style={{ margin: '0 0 12px' }}>Keywords ({filledCount})</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}><thead><tr>
                    <th style={thStyle}></th><th style={thStyle}>Keyword</th><th style={thStyle}>Country</th><th style={thStyle}>Language</th><th style={thStyle}>Search Engine</th><th style={thStyle}>Device</th><th style={thStyle}>Tags</th><th style={thStyle}>Translation</th><th style={thStyle}>Type</th><th style={thStyle}>Actions</th>
                  </tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.id}>
                      <td style={tdStyle}><input type="checkbox" checked={r.selected} onChange={(e) => updateRow(r.id, { selected: e.target.checked })} /></td>
                      <td style={tdStyle}><input value={r.keyword} onChange={(e) => updateRow(r.id, { keyword: e.target.value })} placeholder="Type a keyword…" style={{ ...inputStyle, minWidth: 160 }} /></td>
                      <td style={tdStyle}><input value={r.country} onChange={(e) => updateRow(r.id, { country: e.target.value })} style={{ ...inputStyle, minWidth: 110 }} /></td>
                      <td style={tdStyle}><input value={r.language} onChange={(e) => updateRow(r.id, { language: e.target.value })} style={{ ...inputStyle, minWidth: 100 }} /></td>
                      <td style={tdStyle}><input value={r.searchEngine} onChange={(e) => updateRow(r.id, { searchEngine: e.target.value })} style={{ ...inputStyle, minWidth: 100 }} /></td>
                      <td style={tdStyle}>
                        <select value={r.device} onChange={(e) => updateRow(r.id, { device: e.target.value })} style={inputStyle}>
                          <option value="desktop">desktop</option><option value="mobile">mobile</option>
                        </select>
                      </td>
                      <td style={tdStyle}><input value={r.tags} onChange={(e) => updateRow(r.id, { tags: e.target.value })} placeholder="tag1, tag2" style={{ ...inputStyle, minWidth: 100 }} /></td>
                      <td style={tdStyle}><input value={r.translation} onChange={(e) => updateRow(r.id, { translation: e.target.value })} placeholder="—" style={{ ...inputStyle, minWidth: 100 }} /></td>
                      <td style={tdStyle}>
                        <select value={r.kind} onChange={(e) => updateRow(r.id, { kind: e.target.value as 'serp' | 'gbp' })} style={inputStyle}>
                          <option value="serp">SERP</option><option value="gbp">GBP</option>
                        </select>
                      </td>
                      <td style={tdStyle}><button onClick={() => removeRow(r.id)} style={{ background: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: 13 }}>Remove</button></td>
                    </tr>
                  ))}</tbody></table>
                </div>
                <p style={{ color: DIM, fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
                  Note: only keyword + type (SERP/GBP) are saved to the database. Country, language, search engine, device, tags and translation are kept in this form and sent with each save, but the keywords table has no columns for them yet — a migration is needed before they can be stored. Translation is not generated (no translation service is connected); type one manually if you need it.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
                  <GhostButton onClick={() => setRows((prev) => [...prev, emptyRow(bulkKind)])}>+ Add Keyword</GhostButton>
                  <GhostButton href="/rank">Cancel</GhostButton>
                  <PrimaryButton onClick={save} disabled={busy || filledCount === 0}>{busy ? 'Saving…' : `Save ${filledCount} Keywords`}</PrimaryButton>
                  <span style={{ color: MUTED, fontSize: 13 }}>{filledCount} keywords remaining to save</span>
                </div>
                <div style={{ marginTop: 20, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                  <strong>Tips for adding keywords</strong>
                  <ul style={{ color: MUTED, lineHeight: 1.7, margin: '8px 0 0', paddingLeft: 20 }}>
                    <li>Type one keyword per row — a new empty row appears automatically as you type.</li>
                    <li>Use the per-row Type selector for a mix, or "Type for all rows" when the whole batch is one kind: SERP for search rankings, GBP for local map (3×3 grid) rankings.</li>
                    <li>With "Update existing keywords" on, saving a keyword that is already stored updates it; with it off, already-stored rows are skipped.</li>
                    <li>Prefer "Import from Search Console" for queries your site already gets — their real GSC positions become the initial ranks.</li>
                    <li>A saved keyword shows no rank until a real check records one — nothing here is estimated.</li>
                  </ul>
                </div>
              </Panel>
            </>
          )}

          {/* GSC import dialog */}
          {gscOpen ? (
            <Panel style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px' }}>Import from Search Console</h3>
              <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px' }}>
                Property pre-set from this project's saved Search Console property{gscProperty ? ` (${gscProperty})` : ' — none saved, so the project URL is used'}. Rows below are live Search Console queries (last 28 days) — tick what to import.
              </p>
              <Field label="Search Console property — pick from your connected Google account">
                {gscProperties.length ? (
                  <select value={gscPropertyInput} onChange={(e) => setGscPropertyInput(e.target.value)} style={inputStyle}>
                    <option value="">Pick a property…</option>
                    {gscProperties.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input value={gscPropertyInput} onChange={(e) => setGscPropertyInput(e.target.value)} placeholder="https://example.com/ — fallback only; connect Google on Integrations to get the property list" style={inputStyle} />
                )}
              </Field>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <GhostButton onClick={async () => { setGscLoading(true); const p = await loadGscPreview(); if (p) { setGscRows(p); setGscPicked(new Set(p.map((r) => r.keyword))); } setGscLoading(false); }} disabled={gscLoading}>Reload preview</GhostButton>
                <GhostButton onClick={() => setGscPicked(new Set(gscRows.map((r) => r.keyword)))}>Select all</GhostButton>
                <GhostButton onClick={() => setGscPicked(new Set())}>Clear selection</GhostButton>
                <a href="/integrations" style={{ color: BRAND, fontWeight: 700, fontSize: 14, alignSelf: 'center' }}>Select another account → (reconnect Google on Integrations)</a>
              </div>
              {gscLoading ? <p style={{ color: MUTED }}>Loading live Search Console queries…</p> : gscRows.length === 0 ? (
                <p style={{ color: DIM }}>No Search Console queries returned for this property/period. Check the property is verified and matches the picked property exactly.</p>
              ) : (
                <table style={tableStyle}><thead><tr><th style={thStyle}></th><th style={thStyle}>Keyword</th><th style={thStyle}>Position</th><th style={thStyle}>Clicks</th><th style={thStyle}>Impressions</th><th style={thStyle}>CTR</th></tr></thead>
                <tbody>{gscRows.map((r) => (
                  <tr key={r.keyword}>
                    <td style={tdStyle}><input type="checkbox" checked={gscPicked.has(r.keyword)} onChange={(e) => { const next = new Set(gscPicked); if (e.target.checked) next.add(r.keyword); else next.delete(r.keyword); setGscPicked(next); }} /></td>
                    <td style={tdStyle}>{r.keyword}</td><td style={tdStyle}>{fmtPos(r.position)}</td><td style={tdStyle}>{r.clicks ?? '–'}</td><td style={tdStyle}>{r.impressions ?? '–'}</td><td style={tdStyle}>{fmtPct(r.ctr)}</td>
                  </tr>
                ))}</tbody></table>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                <PrimaryButton onClick={() => importGsc(true)} disabled={busy || gscPicked.size === 0}>Import selected ({gscPicked.size})</PrimaryButton>
                <GhostButton onClick={() => importGsc(false)} disabled={busy || gscRows.length === 0}>Import all ({gscRows.length})</GhostButton>
                <GhostButton onClick={() => setGscOpen(false)}>Close</GhostButton>
              </div>
            </Panel>
          ) : null}

          {/* CSV mapping step */}
          {csvOpen ? (
            <Panel style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px' }}>Upload CSV File — map columns</h3>
              <p style={{ color: MUTED, lineHeight: 1.6, margin: '0 0 12px' }}>
                Map each field to a column in your file. Only Keyword is required; the rest are mapped and stored with each keyword.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {([['keyword', 'Keyword *'], ['country', 'Country'], ['language', 'Language'], ['searchEngine', 'Search Engine'], ['device', 'Device']] as const).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <select value={csvMapping[key]} onChange={(e) => setCsvMapping({ ...csvMapping, [key]: e.target.value })} style={inputStyle}>
                      <option value="">— not mapped —</option>
                      {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
              <p style={{ color: DIM, fontSize: 12 }}>Detected columns: {csvHeaders.join(', ') || '—'}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <PrimaryButton onClick={uploadCsv} disabled={busy || !csvMapping.keyword}>{busy ? 'Importing…' : 'Import mapped CSV'}</PrimaryButton>
                <GhostButton onClick={() => setCsvOpen(false)}>Cancel</GhostButton>
              </div>
            </Panel>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function BatchSelect({ label, values, labels, onApply }: { label: string; values?: string[]; labels?: Record<string, string>; onApply: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <label style={{ fontSize: 13, color: MUTED }}>{label}
      {values ? (
        <select value={v} onChange={(e) => setV(e.target.value)} style={{ ...inputStyle, marginTop: 4, width: 150 }}>
          <option value="">— choose —</option>
          {values.map((x) => <option key={x} value={x}>{labels?.[x] ?? x}</option>)}
        </select>
      ) : (
        <input value={v} onChange={(e) => setV(e.target.value)} style={{ ...inputStyle, marginTop: 4, width: 150 }} />
      )}
      <button onClick={() => { if (v) onApply(v); }} style={{ background: BRAND, color: '#000', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', marginLeft: 6 }}>Set for selected</button>
    </label>
  );
}

function BatchTags({ onApply }: { onApply: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <label style={{ fontSize: 13, color: MUTED }}>Tags
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="tag1, tag2" style={{ ...inputStyle, marginTop: 4, width: 150 }} />
      <button onClick={() => { if (v) onApply(v); }} style={{ background: BRAND, color: '#000', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', marginLeft: 6 }}>Set for selected</button>
    </label>
  );
}
