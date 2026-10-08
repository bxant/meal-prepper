/**
 * Pure nearby-store logic: build the Overpass query, turn its JSON into
 * stores, and rank them by affordability tier then distance. The network call
 * itself lives in `lib/overpass.ts`.
 */

import { distanceKm, type LatLng } from './geo';
import { TIER_RANK, tierForStore, type PriceTier } from './storeTiers';

export const SEARCH_RADIUS_METERS = 8000;

export interface NearbyStore {
  /** OSM element identity, e.g. "node/123". */
  id: string;
  name: string;
  address: string | null;
  distanceKm: number;
  tier: PriceTier;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Overpass QL for supermarkets/grocery shops around an (already coarsened) point. */
export function buildOverpassQuery(center: LatLng, radiusMeters = SEARCH_RADIUS_METERS): string {
  return (
    `[out:json][timeout:25];` +
    `nwr["shop"~"^(supermarket|grocery)$"](around:${radiusMeters},${center.latitude},${center.longitude});` +
    `out center tags;`
  );
}

export function formatAddress(tags: Record<string, string>): string | null {
  if (tags['addr:full']) return tags['addr:full'];
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const parts = [street, tags['addr:city']].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Parse an Overpass JSON response. Distances are measured from `origin`, the
 * device's own position, which never leaves the phone. Unnamed shops and
 * malformed elements are skipped rather than failing the whole list.
 */
export function parseOverpassResponse(json: unknown, origin: LatLng): NearbyStore[] {
  const elements = (json as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return [];

  const stores: NearbyStore[] = [];
  for (const el of elements as OverpassElement[]) {
    const tags = el?.tags ?? {};
    const name = tags.name ?? tags.brand;
    const lat = el?.lat ?? el?.center?.lat;
    const lon = el?.lon ?? el?.center?.lon;
    if (!name || typeof lat !== 'number' || typeof lon !== 'number') continue;
    stores.push({
      id: `${el.type}/${el.id}`,
      name,
      address: formatAddress(tags),
      distanceKm: distanceKm(origin, { latitude: lat, longitude: lon }),
      tier: tierForStore(name, tags.brand),
    });
  }
  return stores;
}

/** Cheapest tier first, then nearest; ties broken by name for a stable order. */
export function rankStores(stores: NearbyStore[]): NearbyStore[] {
  return [...stores].sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      a.distanceKm - b.distanceKm ||
      a.name.localeCompare(b.name)
  );
}
