/**
 * Pure nearby-store logic: build the Overpass query, turn its JSON into
 * stores, filter them by distance, and order them (affordability tier first by
 * default, or nearest first). The network call itself lives in `lib/overpass.ts`.
 */

import { distanceKm, KM_PER_MILE, type LatLng } from './geo';
import { TIER_RANK, tierForStore, type PriceTier } from './storeTiers';

/** Distance choices offered on the Stores tab, in miles. */
export const DISTANCE_OPTIONS_MILES = [1, 3, 5, 10, 25] as const;
export type DistanceMiles = (typeof DISTANCE_OPTIONS_MILES)[number];
export const DEFAULT_DISTANCE_MILES: DistanceMiles = 5;

/**
 * Only a coarsened point (see `coarsen`, at most ~0.8 km off) is sent, so the
 * search circle is padded by this much to still cover every store within the
 * chosen distance of the real position; `withinMiles` trims the overshoot.
 */
const COARSEN_PADDING_METERS = 1000;

/**
 * Declared Overpass limits. overpass-api.de admits a query only if its
 * declared time and memory fit the free capacity, and answers HTTP 504 ("too
 * busy") otherwise. The defaults it assumes (180 s / 512 MiB) — and the
 * earlier `[timeout:25]` alone — were turned away most of the time under
 * normal load, while this lean declaration is admitted reliably and still
 * covers a 25-mile radius in dense cities (~1,850 stores around NYC, which
 * can take 15 s+, hence the longer limit for the widest searches).
 */
const QUERY_MAXSIZE_BYTES = 32 * 1024 * 1024;

export function queryTimeoutSeconds(radiusMeters: number): number {
  return radiusMeters > searchRadiusMeters(10) ? 25 : 15;
}

export type StoreSort = 'price' | 'distance';

export interface NearbyStore {
  /** OSM element identity, e.g. "node/123"; stable key for per-store data. */
  id: string;
  name: string;
  /** OSM `brand` tag, e.g. "Ralphs" for a store named "Ralphs Fresh Fare". */
  brand: string | null;
  address: string | null;
  /** The store's own (public, OSM) position, for routing and map links. */
  latitude: number;
  longitude: number;
  /** From the device's precise position, computed on-device. */
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

/**
 * Overpass answered, but not with a usable store list: a server-side runtime
 * error (reported as HTTP 200 plus a `remark`, with no or partial elements)
 * or a body that is not an Overpass result at all. Never an empty list.
 */
export class OverpassResponseError extends Error {
  constructor(
    message: string,
    /** True for a server-side runtime error (timeout, out of memory), i.e. load. */
    readonly isRuntimeError: boolean
  ) {
    super(message);
  }
}

export function searchRadiusMeters(miles: number): number {
  return Math.round(miles * KM_PER_MILE * 1000) + COARSEN_PADDING_METERS;
}

/**
 * Overpass QL for supermarkets/grocery shops around an (already coarsened)
 * point, plus the grocery-selling chains OSM tags as department stores
 * (Target, some Walmart Supercenters), which `shop=supermarket` misses.
 */
export function buildOverpassQuery(center: LatLng, radiusMeters: number): string {
  const around = `(around:${radiusMeters},${center.latitude},${center.longitude})`;
  return (
    `[out:json][timeout:${queryTimeoutSeconds(radiusMeters)}][maxsize:${QUERY_MAXSIZE_BYTES}];` +
    `(nwr["shop"~"^(supermarket|grocery)$"]${around};` +
    `nwr["shop"="department_store"]["brand"~"^(Target|Walmart)$"]${around};);` +
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
 * malformed elements are skipped, but a response that is itself an error or
 * not an Overpass result throws `OverpassResponseError` — it must not be
 * mistaken for "no stores nearby".
 */
export function parseOverpassResponse(json: unknown, origin: LatLng): NearbyStore[] {
  const body = json as { elements?: unknown; remark?: unknown } | null;
  // Overpass reports query timeouts / out-of-memory as HTTP 200 with a remark
  // like "runtime error: Query timed out in "query" at line 1 after 26 seconds."
  if (typeof body?.remark === 'string' && /error/i.test(body.remark)) {
    throw new OverpassResponseError(body.remark, true);
  }
  const elements = body?.elements;
  if (!Array.isArray(elements)) {
    throw new OverpassResponseError('Response has no elements list', false);
  }

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
      brand: tags.brand ?? null,
      address: formatAddress(tags),
      latitude: lat,
      longitude: lon,
      distanceKm: distanceKm(origin, { latitude: lat, longitude: lon }),
      tier: tierForStore(name, tags.brand),
    });
  }
  return stores;
}

/** Stores at most `miles` from the device. */
export function withinMiles(stores: NearbyStore[], miles: number): NearbyStore[] {
  const maxKm = miles * KM_PER_MILE;
  return stores.filter((s) => s.distanceKm <= maxKm);
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

/** Nearest first; ties broken by cheaper tier, then name. */
export function sortByDistance(stores: NearbyStore[]): NearbyStore[] {
  return [...stores].sort(
    (a, b) =>
      a.distanceKm - b.distanceKm ||
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      a.name.localeCompare(b.name)
  );
}

/**
 * What the Stores tab shows: stores within `miles`, in the chosen order.
 * Price order can take a coverage tie-break inside each tier
 * (`rankStoresWithCoverage`); otherwise tier, then distance.
 */
export function selectStores(
  stores: NearbyStore[],
  miles: number,
  sort: StoreSort,
  rankWithinTier?: (stores: NearbyStore[]) => NearbyStore[]
): NearbyStore[] {
  const nearby = withinMiles(stores, miles);
  if (sort === 'distance') return sortByDistance(nearby);
  return rankWithinTier ? rankWithinTier(nearby) : rankStores(nearby);
}
