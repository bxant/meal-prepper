/**
 * Pure per-store availability: "3 of 5 found at this store".
 *
 * Every shopping-list line gets one of five honest states per store. Data
 * comes only from a `StoreCatalog` adapter (`lib/kroger.ts` for live Kroger
 * data, `lib/sampleAvailability.ts` for the opt-in demo); a store no catalog
 * can check is "unknown" for every line — never "0 of N".
 *
 * A store's own product data (description, its price) is display-only inside
 * that store's card: catalog prices are never compared across stores or added
 * into totals (Kroger's terms forbid cross-retailer price comparison). Trip
 * totals use the neutral average-price estimator instead.
 */

import type { NearbyStore } from './nearbyStores';
import type { ShoppingListLine } from './shoppingList';
import { TIER_RANK } from './storeTiers';

export type ItemStatus = 'found' | 'low' | 'out' | 'not-found' | 'unknown';

/** The store's own product, shown verbatim only inside that store's card. */
export interface StoreProduct {
  description: string;
  /** Regular shelf price in cents at this store, or null if not given. */
  priceCents: number | null;
  /** Promotional price in cents, when lower than the regular one. */
  promoCents: number | null;
  aisle: string | null;
}

export interface ItemResult {
  status: ItemStatus;
  product?: StoreProduct;
}

/** Line key → result for one store. A missing key means "unknown". */
export type StoreResults = Record<string, ItemResult>;

/** Store id → its results. A missing store means "unknown" for every line. */
export type AvailabilityTable = Record<string, StoreResults>;

export type AvailabilityLine = Pick<ShoppingListLine, 'key' | 'name'>;

/** One data source for per-store availability. */
export interface StoreCatalog {
  /** Short source name shown with its figures, e.g. "Kroger" or "Sample data". */
  label: string;
  /** Made-up data; the UI must say so wherever it shows these figures. */
  isSample: boolean;
  /** Check at most this many of its stores per refresh, nearest first (API call budget). */
  maxStores?: number;
  canCheck(store: NearbyStore): boolean;
  check(store: NearbyStore, lines: AvailabilityLine[]): Promise<StoreResults>;
}

/** The first catalog able to check this store, or null ("availability unknown"). */
export function catalogFor(store: NearbyStore, catalogs: StoreCatalog[]): StoreCatalog | null {
  return catalogs.find((catalog) => catalog.canCheck(store)) ?? null;
}

export type CheckPlan =
  | { kind: 'check'; catalog: StoreCatalog }
  /** A catalog covers this store, but it is past the catalog's `maxStores`. */
  | { kind: 'skipped'; catalog: StoreCatalog }
  /** No catalog covers this store: availability unknown. */
  | { kind: 'none' };

/** Which catalog (if any) checks each store, honouring each catalog's `maxStores`. */
export function planChecks(stores: NearbyStore[], catalogs: StoreCatalog[]): Record<string, CheckPlan> {
  const plan: Record<string, CheckPlan> = {};
  const used = new Map<StoreCatalog, number>();
  for (const store of [...stores].sort((a, b) => a.distanceKm - b.distanceKm)) {
    const catalog = catalogFor(store, catalogs);
    if (!catalog) {
      plan[store.id] = { kind: 'none' };
      continue;
    }
    const count = used.get(catalog) ?? 0;
    if (catalog.maxStores !== undefined && count >= catalog.maxStores) {
      plan[store.id] = { kind: 'skipped', catalog };
      continue;
    }
    used.set(catalog, count + 1);
    plan[store.id] = { kind: 'check', catalog };
  }
  return plan;
}

export function statusOf(results: StoreResults | undefined, key: string): ItemStatus {
  return results?.[key]?.status ?? 'unknown';
}

/** Found (including low stock) counts as available; out of stock does not. */
export function isAvailable(status: ItemStatus): boolean {
  return status === 'found' || status === 'low';
}

export interface AvailabilitySummary {
  total: number;
  /** Includes `low`. */
  found: number;
  low: number;
  out: number;
  notFound: number;
  unknown: number;
}

export function summarizeAvailability(
  lines: AvailabilityLine[],
  results: StoreResults | undefined
): AvailabilitySummary {
  const summary: AvailabilitySummary = { total: lines.length, found: 0, low: 0, out: 0, notFound: 0, unknown: 0 };
  for (const line of lines) {
    const status = statusOf(results, line.key);
    if (status === 'found') summary.found += 1;
    else if (status === 'low') {
      summary.found += 1;
      summary.low += 1;
    } else if (status === 'out') summary.out += 1;
    else if (status === 'not-found') summary.notFound += 1;
    else summary.unknown += 1;
  }
  return summary;
}

/** Lines with a definite answer; unknown ones are left out of "N of M". */
export function checkedCount(summary: AvailabilitySummary): number {
  return summary.total - summary.unknown;
}

/**
 * Card wording: "3 of 5 found · 1 out of stock · 1 not carried",
 * "3 of 4 checked found · 1 unknown", or "Availability unknown".
 */
export function describeAvailability(summary: AvailabilitySummary): string {
  const checked = checkedCount(summary);
  if (summary.total === 0 || checked === 0) return 'Availability unknown';
  const parts = [
    summary.unknown > 0
      ? `${summary.found} of ${checked} checked found`
      : `${summary.found} of ${summary.total} found`,
  ];
  if (summary.low > 0) parts.push(`${summary.low} low stock`);
  if (summary.out > 0) parts.push(`${summary.out} out of stock`);
  if (summary.notFound > 0) parts.push(`${summary.notFound} not carried`);
  if (summary.unknown > 0) parts.push(`${summary.unknown} unknown`);
  return parts.join(' · ');
}

/**
 * Coverage as a tie-break inside an affordability tier: verified-complete
 * first, then unknown or at least half found, then verified-poor. Unknown data
 * neither promotes nor demotes a store.
 */
export type CoverageBucket = 'complete' | 'neutral' | 'poor';

const BUCKET_RANK: Record<CoverageBucket, number> = { complete: 0, neutral: 1, poor: 2 };

export function coverageBucket(summary: AvailabilitySummary): CoverageBucket {
  const checked = checkedCount(summary);
  if (summary.total === 0 || checked === 0) return 'neutral';
  if (summary.unknown === 0 && summary.found === summary.total) return 'complete';
  return summary.found * 2 >= checked ? 'neutral' : 'poor';
}

/** Cheapest tier first, then better coverage, then nearest, then name. */
export function rankStoresWithCoverage(
  stores: NearbyStore[],
  bucketOf: (store: NearbyStore) => CoverageBucket
): NearbyStore[] {
  return [...stores].sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      BUCKET_RANK[bucketOf(a)] - BUCKET_RANK[bucketOf(b)] ||
      a.distanceKm - b.distanceKm ||
      a.name.localeCompare(b.name)
  );
}
