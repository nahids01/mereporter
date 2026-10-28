import type { SupabaseClient } from '@supabase/supabase-js';
import type { EffectiveProfile } from '@/lib/auth';
import { canViewProject } from '@/lib/auth';

export type OwnedProject = { id: string; owner_id: string; name: string; website_url: string; location: string | null };

/** Fetch a project and enforce ownership/admin access. Returns null for both missing and unauthorised (no probing). */
export async function getOwnedProject(supabase: SupabaseClient, projectId: string, profile: EffectiveProfile): Promise<OwnedProject | null> {
  if (!projectId) return null;
  const { data } = await supabase.from('projects').select('id, owner_id, name, website_url, location').eq('id', projectId).single();
  if (!data || !canViewProject(profile, data.owner_id)) return null;
  return data as OwnedProject;
}

export function projectDomain(websiteUrl: string): string {
  try { return new URL(websiteUrl).hostname.replace(/^www\./, ''); } catch { return websiteUrl; }
}
