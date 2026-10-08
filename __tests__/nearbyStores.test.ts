import { coarsen, distanceKm, formatDistance } from '../lib/geo';
import {
  buildOverpassQuery,
  formatAddress,
  parseOverpassResponse,
  rankStores,
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
  it('embeds the given point and radius', () => {
    const q = buildOverpassQuery({ latitude: 34.05, longitude: -118.24 }, 5000);
    expect(q).toContain('around:5000,34.05,-118.24');
    expect(q).toContain('[out:json]');
    expect(q).toContain('out center');
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

  it('tolerates malformed responses', () => {
    expect(parseOverpassResponse(null, origin)).toEqual([]);
    expect(parseOverpassResponse({ elements: 'nope' }, origin)).toEqual([]);
    expect(parseOverpassResponse({ elements: [null] }, origin)).toEqual([]);
  });
});

describe('rankStores', () => {
  const store = (name: string, tier: NearbyStore['tier'], distanceKm: number): NearbyStore => ({
    id: name,
    name,
    address: null,
    distanceKm,
    tier,
  });

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
