import { apiFetch, loadProjects, type ProjectRow } from '@/lib/client-api';
import { useEffect, useState } from 'react';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { loadProjects().then((p) => { setProjects(p); if (p[0]) setProjectId(p[0].id); }).catch((e) => setError(e.message)); }, []);
  return { projects, projectId, setProjectId, error };
}

export function ProjectPicker({ projects, value, onChange }: { projects: ProjectRow[]; value: string; onChange: (id: string) => void }) {
  if (projects.length === 0) return <p>No projects yet. <a href="/projects">Create a project first</a> — no demo project is pre-filled.</p>;
  return <label>Project: <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: 6 }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.website_url}</option>)}</select></label>;
}

export function showError(e: unknown): string { return e instanceof Error ? e.message : 'Request failed'; }
export async function callApi(path: string, method: string, body?: unknown) {
  const { status, json } = await apiFetch(path, method, body);
  if (status >= 400) throw new Error(String(json.error ?? `Request failed (${status})`));
  return json;
}
