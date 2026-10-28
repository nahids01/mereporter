'use client';
// Browser helper: every API call sends the caller's Supabase access token.
// No key value is ever handled here.
import { getBrowserSupabase } from '@/lib/supabase';

export async function apiFetch(path: string, method = 'GET', body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const supabase = getBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, unknown> };
}

export type ProjectRow = { id: string; name: string; website_url: string; location: string | null };
export async function loadProjects(): Promise<ProjectRow[]> {
  const { status, json } = await apiFetch('/api/projects');
  if (status !== 200) throw new Error(String(json.error ?? `Projects load failed (${status})`));
  return (json.projects as ProjectRow[]) ?? [];
}
