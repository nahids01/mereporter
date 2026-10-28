// Server-only DataForSEO client. Reads credentials ONLY from env vars.
// NEVER scrape Google, NEVER fabricate a rank. If the env vars are unset,
// every function returns { configured: false } and the caller stores nothing.
// Billing: DataForSEO is pay-as-you-go. There is NO subscription in this code
// and Muse must NOT subscribe or pay for the user. The user pays DataForSEO
// themselves and supplies their own DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD
// as server env vars (Vercel env vars in production, .env.local locally).
// Docs: https://docs.dataforseo.com/v3/serp/google/organic/live/regular/
// and https://docs.dataforseo.com/v3/serp/google/maps/live/regular/

const BASE = 'https://api.dataforseo.com/v3';

export function isDataForSEOConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

export type DataForSEOError = { configured: false } | { configured: true; ok: false; error: string };
export type DataForSEOResult<T> = { configured: true; ok: true; data: T } | DataForSEOError;

async function post<T>(endpoint: string, payload: unknown): Promise<DataForSEOResult<T>> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return { configured: false };
  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { configured: true, ok: false, error: `DataForSEO request failed: ${e instanceof Error ? e.message : 'network error'}` };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { configured: true, ok: false, error: `DataForSEO HTTP ${res.status}` };
  const task = json?.tasks?.[0];
  if (task?.status_code && task.status_code !== 20000) {
    return { configured: true, ok: false, error: `DataForSEO error ${task.status_code}: ${task.status_message ?? 'unknown'}` };
  }
  return { configured: true, ok: true, data: json as T };
}

type SerpJson = { tasks: Array<{ result?: Array<{ items?: Array<{ rank_absolute?: number; rank_group?: number; domain?: string; url?: string }> }> }> };

/** Live SERP rank for one keyword against the project's own domain. Returns rank null when the domain is genuinely not found in the returned items — that is no-data, not rank 0. */
export async function liveSerpRank(keyword: string, domain: string, locationName?: string | null): Promise<DataForSEOResult<{ rank: number | null; itemsChecked: number }>> {
  const task: Record<string, unknown> = { keyword, language_code: 'en', device: 'desktop', os: 'windows' };
  if (locationName) task.location_name = locationName;
  const r = await post<SerpJson>('/serp/google/organic/live/regular', [task]);
  if (!r.configured || !r.ok) return r;
  const items = r.data.tasks?.[0]?.result?.[0]?.items ?? [];
  const norm = domain.toLowerCase().replace(/^www\./, '');
  const found = items.find((it) => {
    const d = (it.domain ?? '').toLowerCase().replace(/^www\./, '');
    const u = (it.url ?? '').toLowerCase();
    return d === norm || d.endsWith(`.${norm}`) || u.includes(norm);
  });
  return { configured: true, ok: true, data: { rank: found ? (found.rank_absolute ?? found.rank_group ?? null) : null, itemsChecked: items.length } };
}

export type GridPoint = { lat: number; lng: number; rank: number | null };
type MapsJson = { tasks: Array<{ result?: Array<{ items?: Array<{ rank_absolute?: number; rank_group?: number; domain?: string; url?: string; title?: string }> }> }> };

/** Live GBP/local grid: one DataForSEO Google Maps live call per grid point. Points with no matching business are rank null (no-data), never estimated. */
export async function liveGbpGrid(keyword: string, domain: string, points: Array<{ lat: number; lng: number }>): Promise<DataForSEOResult<{ points: GridPoint[] }>> {
  const norm = domain.toLowerCase().replace(/^www\./, '');
  const out: GridPoint[] = [];
  for (const p of points) {
    const r = await post<MapsJson>('/serp/google/maps/live/regular', [{ keyword, language_code: 'en', location_coordinate: `${p.lat},${p.lng},15z` }]);
    if (!r.configured) return r;
    if (!r.ok) return r;
    const items = r.data.tasks?.[0]?.result?.[0]?.items ?? [];
    const found = items.find((it) => {
      const d = (it.domain ?? '').toLowerCase().replace(/^www\./, '');
      const u = (it.url ?? '').toLowerCase();
      return d === norm || d.endsWith(`.${norm}`) || u.includes(norm);
    });
    out.push({ lat: p.lat, lng: p.lng, rank: found ? (found.rank_absolute ?? found.rank_group ?? null) : null });
  }
  return { configured: true, ok: true, data: { points: out } };
}

/** Grid centre offsets (km) for a 3x3 BrightLocal-style grid. Coordinates only — never ranks. */
export function gridPoints(lat: number, lng: number, stepKm = 2): Array<{ lat: number; lng: number }> {
  const dLat = stepKm / 111;
  const dLng = stepKm / (111 * Math.cos((lat * Math.PI) / 180));
  const pts: Array<{ lat: number; lng: number }> = [];
  for (const r of [-1, 0, 1]) for (const c of [-1, 0, 1]) {
    pts.push({ lat: Number((lat + r * dLat).toFixed(6)), lng: Number((lng + c * dLng).toFixed(6)) });
  }
  return pts;
}
