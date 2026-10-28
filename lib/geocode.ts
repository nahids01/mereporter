// Nominatim geocoding — for grid CENTRE coordinates only. Never a rank.
// Usage policy requires a proper User-Agent identifying the application.
export async function geocodePlace(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'MeReporter/0.1 (mereporter.nurulnahid.com)', Accept: 'application/json' } });
  } catch { return null; }
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const first = Array.isArray(json) ? json[0] : null;
  if (!first?.lat || !first?.lon) return null;
  return { lat: Number(first.lat), lng: Number(first.lon), displayName: String(first.display_name ?? query) };
}
