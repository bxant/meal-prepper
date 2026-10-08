/**
 * MADE-UP availability for trying the trip planner without a live source.
 *
 * Off by default; the user turns it on in Settings ("Demo availability") and
 * every figure it produces is labelled "Sample data" in the UI. Results are
 * deterministic per (store, line) so a demo trip stays stable between
 * refreshes. It never invents prices: expected prices always come from the
 * average-price table.
 */

import type { NearbyStore } from './nearbyStores';
import type { AvailabilityLine, ItemStatus, StoreCatalog, StoreResults } from './storeAvailability';
import type { PriceTier } from './storeTiers';

/** Chance a line is carried, by tier: bigger chains carry more of a typical list. */
const CARRY_RATE: Record<PriceTier, number> = {
  discount: 0.75,
  standard: 0.85,
  unrated: 0.55,
  premium: 0.8,
};

/** FNV-1a → [0, 1). */
function unitHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

export function sampleStatus(store: NearbyStore, line: AvailabilityLine): ItemStatus {
  const roll = unitHash(`${store.id}|${line.key}`);
  const carry = CARRY_RATE[store.tier];
  if (roll >= carry) return 'not-found';
  if (roll < carry * 0.06) return 'out';
  if (roll < carry * 0.15) return 'low';
  return 'found';
}

export const sampleCatalog: StoreCatalog = {
  label: 'Sample data',
  isSample: true,
  canCheck: () => true,
  async check(store, lines) {
    const results: StoreResults = {};
    for (const line of lines) {
      const status = sampleStatus(store, line);
      results[line.key] =
        status === 'not-found'
          ? { status }
          : {
              status,
              product: {
                description: `Sample product: ${line.name}`,
                priceCents: null,
                promoCents: null,
                aisle: null,
              },
            };
    }
    return results;
  },
};
