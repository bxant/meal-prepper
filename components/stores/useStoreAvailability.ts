import { useEffect, useMemo, useState } from 'react';

import type { NearbyStore } from '@/lib/nearbyStores';
import {
  planChecks,
  type AvailabilityLine,
  type AvailabilityTable,
  type CheckPlan,
  type StoreCatalog,
} from '@/lib/storeAvailability';

export type StoreCheckState =
  | { kind: 'none' }
  | { kind: 'skipped'; catalog: StoreCatalog }
  | { kind: 'checking'; catalog: StoreCatalog }
  | { kind: 'checked'; catalog: StoreCatalog }
  | { kind: 'failed'; catalog: StoreCatalog; message: string };

export interface StoreAvailability {
  table: AvailabilityTable;
  checkState: Record<string, StoreCheckState>;
  /** True while any check is still running. */
  checking: boolean;
  /** First error per catalog, for one line of explanation above the list. */
  errors: string[];
}

function initialState(plan: Record<string, CheckPlan>): Record<string, StoreCheckState> {
  const state: Record<string, StoreCheckState> = {};
  for (const [id, entry] of Object.entries(plan)) {
    state[id] = entry.kind === 'check' ? { kind: 'checking', catalog: entry.catalog } : entry;
  }
  return state;
}

/**
 * Check each store's availability for the shopping-list lines with whichever
 * catalog covers it. Re-runs when the stores, lines, or catalogs change;
 * results from an outdated run are dropped.
 */
export function useStoreAvailability(
  stores: NearbyStore[],
  lines: AvailabilityLine[],
  catalogs: StoreCatalog[]
): StoreAvailability {
  const storeKey = stores.map((s) => s.id).join(',');
  const lineKey = lines.map((l) => l.key).join('\n');
  const plan = useMemo(
    () => (lines.length === 0 ? {} : planChecks(stores, catalogs)),
    // Keyed by content, not array identity, so re-renders don't re-check.
    [storeKey, lineKey, catalogs]
  );
  const [result, setResult] = useState<StoreAvailability>({
    table: {},
    checkState: {},
    checking: false,
    errors: [],
  });

  useEffect(() => {
    let cancelled = false;
    const checkState = initialState(plan);
    const table: AvailabilityTable = {};
    const errors = new Map<StoreCatalog, string>();
    const toCheck = stores.filter((s) => plan[s.id]?.kind === 'check');
    const publish = () => {
      if (cancelled) return;
      setResult({
        table: { ...table },
        checkState: { ...checkState },
        checking: Object.values(checkState).some((s) => s.kind === 'checking'),
        errors: [...errors.values()],
      });
    };
    publish();

    void (async () => {
      // One store at a time; each catalog parallelises its own requests.
      for (const store of toCheck) {
        if (cancelled) return;
        const entry = plan[store.id];
        if (entry.kind !== 'check') continue;
        try {
          table[store.id] = await entry.catalog.check(store, lines);
          checkState[store.id] = { kind: 'checked', catalog: entry.catalog };
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Check failed.';
          checkState[store.id] = { kind: 'failed', catalog: entry.catalog, message };
          if (!errors.has(entry.catalog)) errors.set(entry.catalog, `${entry.catalog.label}: ${message}`);
        }
        publish();
      }
    })();

    return () => {
      cancelled = true;
    };
    // `plan` already tracks the stores, lines, and catalogs.
  }, [plan]);

  return result;
}
