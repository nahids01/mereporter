import type { SupabaseClient } from '@supabase/supabase-js';
import type { EffectiveProfile } from '@/lib/auth';
import { getOwnedProject } from '@/lib/project-access';

export type FullProject = {
  id: string; owner_id: string; name: string; website_url: string; location: string | null;
  gsc_site_url: string | null; ga4_property_id: string | null; bing_site_url: string | null;
};

/** Ownership check via getOwnedProject, then the full row (incl. integration
 *  settings columns) via the service client. Returns null for missing AND
 *  unauthorised projects, so ownership cannot be probed. */
export async function getFullProject(service: SupabaseClient, projectId: string, profile: EffectiveProfile): Promise<FullProject | null> {
  const owned = await getOwnedProject(service, projectId, profile);
  if (!owned) return null;
  const { data } = await service.from('projects')
    .select('id, owner_id, name, website_url, location, gsc_site_url, ga4_property_id, bing_site_url')
    .eq('id', projectId).single();
  return (data as FullProject | null) ?? null;
}

export async function insertMetrics(
  service: SupabaseClient, projectId: string,
  source: 'gsc' | 'ga4' | 'bing',
  rows: Array<{ metric: string; value: number | null }>,
): Promise<string> {
  const importedAt = new Date().toISOString();
  const { error } = await service.from('metric_imports').insert(
    rows.map((r) => ({ project_id: projectId, source, metric: r.metric, value: r.value, imported_at: importedAt })),
  );
  if (error) throw new Error(error.message);
  return importedAt;
}

export function last28Days(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function googleErrorMessage(json: unknown, status: number): string {
  const j = (json ?? {}) as { error?: { message?: unknown } };
  return String(j.error?.message ?? `Google API request failed (${status})`);
}
