import type { NearbyStore } from '../lib/nearbyStores';
import type { ShoppingListLine } from '../lib/shoppingList';
import type { AvailabilityTable, ItemStatus } from '../lib/storeAvailability';
import {
  alternativesForStop,
  planTrip,
  recommendStores,
  storeMapsUrl,
  swapStore,
  tripMapsUrl,
} from '../lib/tripPlanner';

const home = { latitude: 34.0, longitude: -118.0 };

function line(name: string): ShoppingListLine {
  return { key: `${name}|`, name, quantity: null, unit: null, label: name, recipeIds: [], recipeTitles: [] };
}
const lines = ['romaine', 'croutons', 'tomatoes', 'parmesan', 'dressing'].map(line);

// Stores laid out north of home; 0.01° latitude ≈ 1.11 km.
function store(id: string, tier: NearbyStore['tier'], latOffset: number, lonOffset = 0): NearbyStore {
  const latitude = home.latitude + latOffset;
  const longitude = home.longitude + lonOffset;
  return {
    id,
    name: id,
    brand: null,
    address: null,
    latitude,
    longitude,
    distanceKm: Math.hypot(latOffset, lonOffset) * 111.19,
    tier,
  };
}

function table(entries: Record<string, Record<string, ItemStatus>>): AvailabilityTable {
  return Object.fromEntries(
    Object.entries(entries).map(([storeId, statuses]) => [
      storeId,
      Object.fromEntries(Object.entries(statuses).map(([name, status]) => [`${name}|`, { status }])),
    ])
  );
}

/** $2.00 per line, except dressing which has no estimate. */
const estimate = (l: ShoppingListLine) => (l.name === 'dressing' ? null : 200);

const walmart = store('walmart', 'discount', 0.02);
const kroger = store('kroger', 'standard', 0.03);
const ralphs = store('ralphs', 'standard', 0.01);
const wholeFoods = store('wholefoods', 'premium', 0.005);

const verified = table({
  // 4/5 at Walmart: no croutons.
  walmart: { romaine: 'found', croutons: 'not-found', tomatoes: 'found', parmesan: 'found', dressing: 'found' },
  // 4/5 at both Kroger and Ralphs; both have croutons.
  kroger: { romaine: 'found', croutons: 'found', tomatoes: 'found', parmesan: 'not-found', dressing: 'found' },
  ralphs: { romaine: 'found', croutons: 'found', tomatoes: 'found', parmesan: 'out', dressing: 'found' },
  wholefoods: { romaine: 'not-found', croutons: 'found', tomatoes: 'not-found', parmesan: 'not-found', dressing: 'not-found' },
});

describe('recommendStores', () => {
  it('covers the list with the fewest, cheapest stores: Walmart for 4/5, then one for the 5th', () => {
    const picked = recommendStores([wholeFoods, ralphs, kroger, walmart], lines, verified);
    expect(picked[0]).toBe('walmart');
    // Kroger and Ralphs tie on tier and confirmed lines; Ralphs is nearer.
    expect(picked).toEqual(['walmart', 'ralphs']);
  });

  it('with no availability data at all, sends you to the cheapest nearest store alone', () => {
    const picked = recommendStores([ralphs, walmart, store('aldi', 'discount', 0.04)], lines, {});
    expect(picked).toEqual(['walmart']);
  });

  it('stops when nothing more can be covered', () => {
    const none = table({ walmart: { romaine: 'not-found', croutons: 'not-found', tomatoes: 'not-found', parmesan: 'not-found', dressing: 'not-found' } });
    expect(recommendStores([walmart], lines, none)).toEqual([]);
  });
});

describe('planTrip', () => {
  it('chains home → nearest chosen store → next nearest, not separate round trips', () => {
    // Walmart is nearer to home than Kroger; Kroger is chosen first in the list.
    const plan = planTrip(home, [kroger, walmart], ['kroger', 'walmart'], lines, verified, estimate);
    expect(plan.stops.map((s) => s.store.id)).toEqual(['walmart', 'kroger']);
    expect(plan.stops[0].legKm).toBeCloseTo(walmart.distanceKm, 2);
    // Second leg is Walmart → Kroger (0.01° apart), not home → Kroger.
    expect(plan.stops[1].legKm).toBeCloseTo(1.11, 1);
    expect(plan.totalKm).toBeCloseTo(plan.stops[0].legKm + plan.stops[1].legKm, 9);
  });

  it('gets confirmed lines at the cheapest-tier store and only the gap elsewhere', () => {
    const plan = planTrip(home, [kroger, walmart], ['kroger', 'walmart'], lines, verified, estimate);
    const at = (id: string) =>
      plan.stops.find((s) => s.store.id === id)!.purchases.map((p) => p.line.name);
    expect(at('walmart')).toEqual(['romaine', 'tomatoes', 'parmesan', 'dressing']);
    expect(at('kroger')).toEqual(['croutons']);
    expect(plan.missing).toEqual([]);
  });

  it('adds expected prices from the estimator and counts unpriced lines separately', () => {
    const plan = planTrip(home, [kroger, walmart], ['kroger', 'walmart'], lines, verified, estimate);
    expect(plan.totalCents).toBe(4 * 200);
    expect(plan.unpricedCount).toBe(1);
    expect(plan.stops.find((s) => s.store.id === 'walmart')!.subtotalCents).toBe(3 * 200);
  });

  it('lists lines no chosen store has, and drops chosen stores with nothing to get', () => {
    const plan = planTrip(home, [walmart, wholeFoods], ['walmart'], lines, verified, estimate);
    expect(plan.missing.map((l) => l.name)).toEqual(['croutons']);

    const both = planTrip(home, [walmart, wholeFoods, kroger], ['walmart', 'kroger', 'wholefoods'], lines, verified, estimate);
    // Croutons are confirmed at both Kroger and Whole Foods; the cheaper tier wins.
    expect(both.unusedStoreIds).toEqual(['wholefoods']);
  });

  it('prefers a confirmed store over one with unknown availability', () => {
    const unknownAldi = store('aldi', 'discount', 0.001);
    const plan = planTrip(home, [unknownAldi, kroger], ['aldi', 'kroger'], lines, { kroger: verified.kroger }, estimate);
    const krogerStop = plan.stops.find((s) => s.store.id === 'kroger')!;
    expect(krogerStop.purchases.map((p) => p.line.name)).toEqual(['romaine', 'croutons', 'tomatoes', 'dressing']);
    expect(krogerStop.purchases.every((p) => p.verified)).toBe(true);
    const aldiStop = plan.stops.find((s) => s.store.id === 'aldi')!;
    expect(aldiStop.purchases.map((p) => [p.line.name, p.verified])).toEqual([['parmesan', false]]);
  });

  it('recomputes from the user’s choice when several stores cover the same items', () => {
    const viaRalphs = planTrip(home, [walmart, kroger, ralphs], ['walmart', 'ralphs'], lines, verified, estimate);
    const viaKroger = planTrip(home, [walmart, kroger, ralphs], ['walmart', 'kroger'], lines, verified, estimate);
    expect(viaRalphs.stops.map((s) => s.store.id)).toEqual(['ralphs', 'walmart']);
    expect(viaKroger.stops.map((s) => s.store.id)).toEqual(['walmart', 'kroger']);
    expect(viaRalphs.totalCents).toBe(viaKroger.totalCents);
  });
});

describe('alternativesForStop / swapStore', () => {
  it('offers stores that can supply everything that stop is getting, confirmed first', () => {
    const plan = planTrip(home, [walmart, kroger, ralphs, wholeFoods], ['walmart', 'ralphs'], lines, verified, estimate);
    const ralphsStop = plan.stops.find((s) => s.store.id === 'ralphs')!;
    expect(ralphsStop.purchases.map((p) => p.line.name)).toEqual(['croutons']);
    const alternatives = alternativesForStop(ralphsStop, [walmart, kroger, ralphs, wholeFoods], ['walmart', 'ralphs'], verified);
    expect(alternatives.map((s) => s.id)).toEqual(['kroger', 'wholefoods']);
  });

  it('swaps one store for another without touching the rest', () => {
    expect(swapStore(['walmart', 'ralphs'], 'ralphs', 'kroger')).toEqual(['walmart', 'kroger']);
  });
});

describe('Google Maps links', () => {
  it('pins a store by its coordinates', () => {
    expect(storeMapsUrl({ latitude: 34.06, longitude: -118.24 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=34.06,-118.24'
    );
  });

  it('routes through every stop in order, starting from wherever the phone is', () => {
    const url = tripMapsUrl([{ store: walmart }, { store: kroger }])!;
    expect(url).toContain('/maps/dir/?api=1');
    expect(url).toContain(`destination=${kroger.latitude},${kroger.longitude}`);
    expect(decodeURIComponent(url)).toContain(`waypoints=${walmart.latitude},${walmart.longitude}`);
    expect(url).not.toContain('origin=');
    expect(tripMapsUrl([])).toBeNull();
  });
});
