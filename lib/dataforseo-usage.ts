import type { SupabaseClient } from '@supabase/supabase-js';

// DataForSEO usage logging (server only). Records ONLY counts — project,
// kind, keyword, searches used, date — never credentials or API responses.
// Best-effort: a logging failure must never fail the rank/grid fetch itself.
// SERP = 1 search per keyword. GBP grid = 9 searches per keyword (3x3 grid).
// Only completed (ok) API results are logged, which is what successful
// DataForSEO tasks bill for; failed calls log nothing and store no rank.
export async function logDataForSEOUsage(
  service: SupabaseClient, projectId: string,
  kind: 'serp' | 'gbp', keyword: string, searches: number,
): Promise<void> {
  try {
    await service.from('dataforseo_usage').insert({ project_id: projectId, kind, keyword, searches });
  } catch {
    // Usage logging must never break a fetch. The fetch result itself is
    // already stored; a missed usage row is a reporting gap, not a data gap.
  }
}

export function dedupeKeywords<T extends { keyword: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.keyword)) return false;
    seen.add(r.keyword);
    return true;
  });
}
