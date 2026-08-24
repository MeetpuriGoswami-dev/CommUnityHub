/**
 * Nominatim geocoding helper. Respects 1 req/sec rate limit and sets a proper User-Agent.
 * No API key required.
 */
import { logger } from "./logger";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "CommUnityHub/1.0 (community-coordination)";

let lastCall = 0;
const MIN_INTERVAL_MS = 1100; // Slightly above 1 second

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = lastCall + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

const cache = new Map<string, GeocodeResult | null>();

export async function geocode(query: string): Promise<GeocodeResult | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  await rateLimit();
  try {
    const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
    if (!res.ok) {
      logger.warn({ status: res.status, query }, "Nominatim non-OK");
      cache.set(key, null);
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) {
      cache.set(key, null);
      return null;
    }
    const result: GeocodeResult = {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    logger.warn({ err, query }, "Nominatim request failed");
    cache.set(key, null);
    return null;
  }
}
