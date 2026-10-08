import { coarsen, distanceKm, formatDistance } from '../lib/geo';
import {
  buildOverpassQuery,
  formatAddress,
  OverpassResponseError,
  parseOverpassResponse,
  rankStores,
  searchRadiusMeters,
  selectStores,
  sortByDistance,
  withinMiles,
  type NearbyStore,
} from '../lib/nearbyStores';
import { tierForStore } from '../lib/storeTiers';

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm({ latitude: 34, longitude: -118 }, { latitude: 34, longitude: -118 })).toBe(0);
  });

  it('matches known distances', () => {
    // One degree of latitude ≈ 111.19 km.
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
      111.19,
      1
    );
    // Los Angeles → San Francisco ≈ 559 km.
    const la = { latitude: 34.0522, longitude: -118.2437 };
    const sf = { latitude: 37.7749, longitude: -122.4194 };
    expect(distanceKm(la, sf)).toBeGreaterThan(550);
    expect(distanceKm(la, sf)).toBeLessThan(565);
  });
});

describe('coarsen', () => {
  it('rounds to 2 decimals (~1 km)', () => {
    expect(coarsen({ latitude: 34.052235, longitude: -118.243683 })).toEqual({
      latitude: 34.05,
      longitude: -118.24,
    });
  });

  it('moves a point by at most ~1 km', () => {
    const p = { latitude: 40.714999, longitude: -74.005999 };
    expect(distanceKm(p, coarsen(p))).toBeLessThan(1);
  });
});

describe('formatDistance', () => {
  it('shows miles with one decimal under 10 mi', () => {
    expect(formatDistance(1.609344)).toBe('1.0 mi');
    expect(formatDistance(0.5)).toBe('0.3 mi');
  });

  it('rounds to whole miles from 10 mi', () => {
    expect(formatDistance(20)).toBe('12 mi');
  });
});

describe('tierForStore', () => {
  it('recognises discount chains in their common spellings', () => {
    expect(tierForStore('ALDI')).toBe('discount');
    expect(tierForStore('Lidl')).toBe('discount');
    expect(tierForStore('Walmart Neighborhood Market')).toBe('discount');
    expect(tierForStore('WinCo Foods')).toBe('discount');
    expect(tierForStore('Food 4 Less')).toBe('discount');
    expect(tierForStore('Food4Less')).toBe('discount');
  });

  it('separates standard and premium chains', () => {
    expect(tierForStore('Kroger')).toBe('standard');
    expect(tierForStore("Trader Joe's")).toBe('standard');
    expect(tierForStore('Whole Foods Market')).toBe('premium');
  });

  it('prefers the brand tag over a local display name', () => {
    expect(tierForStore('Supercenter #1234', 'Walmart')).toBe('discount');
  });

  it('matches whole words only and leaves independents unrated', () => {
    expect(tierForStore('Rosaldi Market')).toBe('unrated');
    expect(tierForStore("Joe's Corner Grocery")).toBe('unrated');
  });
});

describe('buildOverpassQuery', () => {
  it('pads the search circle by 1 km for the coarsened origin', () => {
    expect(searchRadiusMeters(1)).toBe(1609 + 1000);
    expect(searchRadiusMeters(25)).toBe(40234 + 1000);
  });

  it('embeds the given point and radius', () => {
    const q = buildOverpassQuery({ latitude: 34.05, longitude: -118.24 }, 5000);
    expect(q).toContain('around:5000,34.05,-118.24');
    expect(q).toContain('[out:json]');
    expect(q).toContain('out center');
  });

  it('also asks for Target/Walmart, which OSM tags as department stores', () => {
    const q = buildOverpassQuery({ latitude: 34.05, longitude: -118.24 }, 5000);
    expect(q).toContain('nwr["shop"="department_store"]["brand"~"^(Target|Walmart)$"](around:5000,34.05,-118.24)');
  });
});

describe('formatAddress', () => {
  it('joins house number, street and city', () => {
    expect(
      formatAddress({ 'addr:housenumber': '12', 'addr:street': 'Main St', 'addr:city': 'Springfield' })
    ).toBe('12 Main St, Springfield');
  });

  it('prefers addr:full and returns null when nothing is tagged', () => {
    expect(formatAddress({ 'addr:full': '1 Elm Rd, Town' })).toBe('1 Elm Rd, Town');
    expect(formatAddress({})).toBeNull();
  });
});

describe('parseOverpassResponse', () => {
  const origin = { latitude: 34.0, longitude: -118.0 };

  it('reads nodes and way centers, skipping unnamed or position-less elements', () => {
    const stores = parseOverpassResponse(
      {
        elements: [
          { type: 'node', id: 1, lat: 34.01, lon: -118.0, tags: { name: 'Aldi', shop: 'supermarket' } },
          { type: 'way', id: 2, center: { lat: 34.0, lon: -118.01 }, tags: { brand: 'Kroger' } },
          { type: 'node', id: 3, lat: 34.0, lon: -118.0, tags: { shop: 'grocery' } },
          { type: 'way', id: 4, tags: { name: 'No center' } },
        ],
      },
      origin
    );
    expect(stores.map((s) => s.id)).toEqual(['node/1', 'way/2']);
    expect(stores[0].tier).toBe('discount');
    expect(stores[1].name).toBe('Kroger');
    expect(stores[0].distanceKm).toBeCloseTo(1.11, 1);
  });

  it('skips malformed elements inside a valid response', () => {
    expect(parseOverpassResponse({ elements: [null] }, origin)).toEqual([]);
  });

  it('throws on a body that is not an Overpass result instead of returning []', () => {
    expect(() => parseOverpassResponse(null, origin)).toThrow(OverpassResponseError);
    expect(() => parseOverpassResponse({ elements: 'nope' }, origin)).toThrow(OverpassResponseError);
  });

  it('throws on a runtime-error remark even when some elements came back', () => {
    const partial = {
      elements: [{ type: 'node', id: 1, lat: 34.01, lon: -118.0, tags: { name: 'Aldi' } }],
      remark: 'runtime error: Query run out of memory using about 32 MB of RAM.',
    };
    let error: unknown;
    try {
      parseOverpassResponse(partial, origin);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(OverpassResponseError);
    expect((error as OverpassResponseError).isRuntimeError).toBe(true);
  });

  it('keeps each store’s own coordinates', () => {
    const [store] = parseOverpassResponse(
      { elements: [{ type: 'node', id: 1, lat: 34.01, lon: -118.02, tags: { name: 'Aldi' } }] },
      origin
    );
    expect(store).toMatchObject({ latitude: 34.01, longitude: -118.02 });
  });
});

const store = (name: string, tier: NearbyStore['tier'], distanceKm: number): NearbyStore => ({
  id: name,
  name,
  brand: null,
  address: null,
  latitude: 0,
  longitude: 0,
  distanceKm,
  tier,
});

describe('rankStores', () => {
  it('orders by tier first, then distance', () => {
    const ranked = rankStores([
      store('Whole Foods', 'premium', 0.5),
      store('Corner Shop', 'unrated', 0.2),
      store('Kroger', 'standard', 1),
      store('Walmart', 'discount', 6),
      store('Aldi', 'discount', 3),
    ]);
    expect(ranked.map((s) => s.name)).toEqual([
      'Aldi',
      'Walmart',
      'Kroger',
      'Corner Shop',
      'Whole Foods',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [store('B', 'premium', 1), store('A', 'discount', 1)];
    rankStores(input);
    expect(input[0].name).toBe('B');
  });
});

describe('distance filter and sort', () => {
  const stores = [
    store('Whole Foods', 'premium', 0.5),
    store('Walmart', 'discount', 7), // ~4.3 mi
    store('Kroger', 'standard', 1.2),
    store('Aldi', 'discount', 20), // ~12.4 mi
  ];

  it('keeps stores up to and including the chosen distance', () => {
    expect(withinMiles(stores, 1).map((s) => s.name)).toEqual(['Whole Foods', 'Kroger']);
    expect(withinMiles([store('Edge', 'unrated', 1.609344)], 1)).toHaveLength(1);
  });

  it('sorts nearest first, breaking ties by cheaper tier', () => {
    expect(
      sortByDistance([...stores, store('Corner', 'unrated', 1.2)]).map((s) => s.name)
    ).toEqual(['Whole Foods', 'Kroger', 'Corner', 'Walmart', 'Aldi']);
  });

  it('ranks by affordability within the chosen distance by default', () => {
    expect(selectStores(stores, 5, 'price').map((s) => s.name)).toEqual([
      'Walmart',
      'Kroger',
      'Whole Foods',
    ]);
    expect(selectStores(stores, 25, 'price')[0].name).toBe('Walmart');
    expect(selectStores(stores, 5, 'distance').map((s) => s.name)).toEqual([
      'Whole Foods',
      'Kroger',
      'Walmart',
    ]);
  });
});
