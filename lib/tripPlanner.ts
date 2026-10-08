/**
 * Pure shopping-trip planning: which nearby stores to visit for the shopping
 * list, what to get where, in what order, and roughly what it will cost.
 *
 * Availability comes from `lib/storeAvailability.ts` (found / not found /
 * unknown per store and line); the expected price comes from a
 * `PriceEstimator` (the bundled average prices), never from a store's own
 * prices, so no retailer's prices are compared with another's. Nothing here
 * touches React, SQLite, or the network. Money is integer cents; `null` means
 * unknown.
 */

import { distanceKm, type LatLng } from './geo';
import type { NearbyStore } from './nearbyStores';
import type { PriceEstimator } from './planner';
import type { ShoppingListLine } from './shoppingList';
import { isAvailable, statusOf, type AvailabilityTable } from './storeAvailability';
import { TIER_RANK } from './storeTiers';

/**
 * Can this store supply this line? `yes` = the catalog found it, `maybe` = no
 * data (most stores), `no` = verified not carried or out of stock.
 */
export type Supply = 'yes' | 'maybe' | 'no';

export function supplyAt(table: AvailabilityTable, storeId: string, key: string): Supply {
  const status = statusOf(table[storeId], key);
  if (isAvailable(status)) return 'yes';
  return status === 'unknown' ? 'maybe' : 'no';
}

export interface Purchase {
  line: ShoppingListLine;
  /** True when the store's catalog confirmed it; false when availability is unknown. */
  verified: boolean;
  /** Expected (average) price, or null when there is no estimate. */
  estimateCents: number | null;
}

export interface TripStop {
  store: NearbyStore;
  /** Straight-line distance from the previous stop (from home for the first). */
  legKm: number;
  purchases: Purchase[];
  subtotalCents: number;
  unpricedCount: number;
}

export interface TripPlan {
  /** Visiting order: home → nearest chosen store → nearest next, and so on. */
  stops: TripStop[];
  /** Lines no chosen store can supply (verified not carried / out of stock everywhere chosen). */
  missing: ShoppingListLine[];
  /** Sum of known expected prices of everything bought on the trip. */
  totalCents: number;
  /** Purchases with no price estimate; excluded from `totalCents`. */
  unpricedCount: number;
  /** Home to the last stop along the chain (straight-line legs). */
  totalKm: number;
  /** Chosen stores left off the route because other chosen stores supply all their lines better. */
  unusedStoreIds: string[];
}

interface Candidate {
  store: NearbyStore;
  gain: number;
  verifiedGain: number;
}

/**
 * Suggest which stores to use: repeatedly add the store that can supply the
 * most still-uncovered lines (ties: cheaper tier, more confirmed lines,
 * nearer, id) until no store adds anything. Returns ids in pick order.
 */
export function recommendStores(
  stores: NearbyStore[],
  lines: ShoppingListLine[],
  table: AvailabilityTable
): string[] {
  const uncovered = new Set(lines.map((line) => line.key));
  const remaining = [...stores];
  const chosen: string[] = [];

  while (uncovered.size > 0) {
    let best: Candidate | null = null;
    for (const store of remaining) {
      let gain = 0;
      let verifiedGain = 0;
      for (const key of uncovered) {
        const supply = supplyAt(table, store.id, key);
        if (supply === 'no') continue;
        gain += 1;
        if (supply === 'yes') verifiedGain += 1;
      }
      if (gain === 0) continue;
      const candidate = { store, gain, verifiedGain };
      if (!best || compareCandidates(candidate, best) < 0) best = candidate;
    }
    if (!best) break;
    chosen.push(best.store.id);
    remaining.splice(remaining.indexOf(best.store), 1);
    for (const key of [...uncovered]) {
      if (supplyAt(table, best.store.id, key) !== 'no') uncovered.delete(key);
    }
  }
  return chosen;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    b.gain - a.gain ||
    TIER_RANK[a.store.tier] - TIER_RANK[b.store.tier] ||
    b.verifiedGain - a.verifiedGain ||
    a.store.distanceKm - b.store.distanceKm ||
    a.store.id.localeCompare(b.store.id)
  );
}

/** Where to get one line among the chosen stores: confirmed first, then cheaper tier, then nearer. */
function bestStoreFor(
  line: ShoppingListLine,
  chosen: NearbyStore[],
  table: AvailabilityTable
): { store: NearbyStore; verified: boolean } | null {
  let best: { store: NearbyStore; verified: boolean } | null = null;
  for (const store of chosen) {
    const supply = supplyAt(table, store.id, line.key);
    if (supply === 'no') continue;
    const verified = supply === 'yes';
    if (
      !best ||
      (Number(best.verified) - Number(verified) ||
        TIER_RANK[store.tier] - TIER_RANK[best.store.tier] ||
        store.distanceKm - best.store.distanceKm ||
        store.id.localeCompare(best.store.id)) < 0
    ) {
      best = { store, verified };
    }
  }
  return best;
}

/**
 * Plan the trip for the stores the user chose: get each line where it is
 * confirmed (else where availability is unknown) at the cheapest-tier chosen
 * store, then chain the stores that have something to get, nearest-next from
 * home, and add up the expected prices.
 */
export function planTrip(
  home: LatLng,
  stores: NearbyStore[],
  chosenIds: string[],
  lines: ShoppingListLine[],
  table: AvailabilityTable,
  estimate: PriceEstimator
): TripPlan {
  const chosenSet = new Set(chosenIds);
  const chosen = stores.filter((store) => chosenSet.has(store.id));
  const purchasesByStore = new Map<string, Purchase[]>();
  const missing: ShoppingListLine[] = [];

  for (const line of lines) {
    const best = bestStoreFor(line, chosen, table);
    if (!best) {
      missing.push(line);
      continue;
    }
    const list = purchasesByStore.get(best.store.id) ?? [];
    list.push({ line, verified: best.verified, estimateCents: estimate(line) });
    purchasesByStore.set(best.store.id, list);
  }

  const toVisit = chosen.filter((store) => purchasesByStore.has(store.id));
  const stops: TripStop[] = [];
  let here: LatLng = home;
  while (toVisit.length > 0) {
    let nextIndex = 0;
    let nextKm = Infinity;
    toVisit.forEach((store, i) => {
      const km = distanceKm(here, store);
      if (km < nextKm) {
        nextIndex = i;
        nextKm = km;
      }
    });
    const [store] = toVisit.splice(nextIndex, 1);
    const purchases = purchasesByStore.get(store.id) ?? [];
    stops.push({
      store,
      legKm: nextKm,
      purchases,
      subtotalCents: purchases.reduce((sum, p) => sum + (p.estimateCents ?? 0), 0),
      unpricedCount: purchases.filter((p) => p.estimateCents === null).length,
    });
    here = store;
  }

  return {
    stops,
    missing,
    totalCents: stops.reduce((sum, stop) => sum + stop.subtotalCents, 0),
    unpricedCount: stops.reduce((sum, stop) => sum + stop.unpricedCount, 0),
    totalKm: stops.reduce((sum, stop) => sum + stop.legKm, 0),
    unusedStoreIds: chosen.filter((store) => !purchasesByStore.has(store.id)).map((s) => s.id),
  };
}

/**
 * Stores not on the trip that could supply everything this stop is getting —
 * the "4/5 at both" case, where the user decides which one they'll visit.
 * Confirmed-for-all first, then cheaper tier, then nearer.
 */
export function alternativesForStop(
  stop: TripStop,
  stores: NearbyStore[],
  chosenIds: string[],
  table: AvailabilityTable,
  limit = 3
): NearbyStore[] {
  const chosenSet = new Set(chosenIds);
  const keys = stop.purchases.map((p) => p.line.key);
  return stores
    .filter((store) => !chosenSet.has(store.id))
    .map((store) => {
      const supplies = keys.map((key) => supplyAt(table, store.id, key));
      return { store, ok: !supplies.includes('no'), allConfirmed: supplies.every((s) => s === 'yes') };
    })
    .filter((c) => c.ok)
    .sort(
      (a, b) =>
        Number(b.allConfirmed) - Number(a.allConfirmed) ||
        TIER_RANK[a.store.tier] - TIER_RANK[b.store.tier] ||
        a.store.distanceKm - b.store.distanceKm ||
        a.store.id.localeCompare(b.store.id)
    )
    .slice(0, limit)
    .map((c) => c.store);
}

/** Replace one chosen store with another, keeping the rest of the selection. */
export function swapStore(chosenIds: string[], fromId: string, toId: string): string[] {
  const next = chosenIds.filter((id) => id !== fromId && id !== toId);
  return [...next, toId];
}

const MAPS_BASE = 'https://www.google.com/maps';

/** Google Maps (app or web) pinned on the store; no API key needed. */
export function storeMapsUrl(store: Pick<NearbyStore, 'latitude' | 'longitude'>): string {
  return `${MAPS_BASE}/search/?api=1&query=${store.latitude},${store.longitude}`;
}

/**
 * Directions through every stop in order. No origin is given, so Google Maps
 * starts from wherever the phone is — the app never puts the user's position
 * in the link.
 */
export function tripMapsUrl(stops: Pick<TripStop, 'store'>[]): string | null {
  if (stops.length === 0) return null;
  const point = ({ store }: Pick<TripStop, 'store'>) => `${store.latitude},${store.longitude}`;
  const destination = point(stops[stops.length - 1]);
  const waypoints = stops.slice(0, -1).map(point).join('|');
  return (
    `${MAPS_BASE}/dir/?api=1&destination=${destination}` +
    (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '') +
    `&travelmode=driving`
  );
}
