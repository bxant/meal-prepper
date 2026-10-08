import {
  createKrogerCatalog,
  isKrogerFamily,
  KrogerError,
  matchLocation,
  productMatches,
  resultFromProducts,
  type KrogerProduct,
} from '../lib/kroger';
import type { NearbyStore } from '../lib/nearbyStores';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ralphs: NearbyStore = {
  id: 'node/1',
  name: 'Ralphs',
  brand: 'Ralphs',
  address: null,
  latitude: 34.0612,
  longitude: -118.2453,
  distanceKm: 1,
  tier: 'standard',
};

function product(description: string, regular: number, extra: Partial<{ promo: number; stockLevel: string; instore: boolean; aisle: string }> = {}): KrogerProduct {
  return {
    description,
    aisleLocations: extra.aisle ? [{ description: extra.aisle }] : [],
    items: [
      {
        price: { regular, promo: extra.promo ?? 0 },
        fulfillment: { instore: extra.instore ?? true },
        inventory: extra.stockLevel ? { stockLevel: extra.stockLevel } : undefined,
      },
    ],
  };
}

describe('isKrogerFamily', () => {
  it('recognises Kroger banners by brand or name, whole words only', () => {
    expect(isKrogerFamily({ name: 'Ralphs Fresh Fare', brand: null })).toBe(true);
    expect(isKrogerFamily({ name: 'Supermarket #12', brand: 'Fred Meyer' })).toBe(true);
    expect(isKrogerFamily({ name: "Smith's Food and Drug", brand: null })).toBe(true);
    expect(isKrogerFamily({ name: 'ALDI', brand: 'Aldi' })).toBe(false);
    expect(isKrogerFamily({ name: 'Krogerville Market', brand: null })).toBe(false);
  });
});

describe('productMatches', () => {
  it('needs every significant ingredient word, plural-tolerant', () => {
    expect(productMatches('Simple Truth Organic Romaine Lettuce Hearts', 'romaine lettuce')).toBe(true);
    expect(productMatches('Kroger Cherry Tomatoes', 'cherry tomato')).toBe(true);
    expect(productMatches('Kroger Grated Parmesan Cheese', 'freshly grated parmesan')).toBe(true);
  });

  it('rejects the fuzzy search’s near-misses', () => {
    expect(productMatches('Kroger Potato Chips', 'croutons')).toBe(false);
    expect(productMatches('Caesar Salad Kit', 'caesar dressing')).toBe(false);
  });
});

describe('resultFromProducts', () => {
  it('picks the cheapest matching in-stock product, promo price included', () => {
    const result = resultFromProducts('parmesan', [
      product('Kroger Grated Parmesan Cheese', 3.99),
      product('Private Selection Parmesan Wedge', 6.49, { promo: 3.49, aisle: 'Aisle 12' }),
      product('Mozzarella Cheese', 1.99),
    ]);
    expect(result.status).toBe('found');
    expect(result.product).toEqual({
      description: 'Private Selection Parmesan Wedge',
      priceCents: 649,
      promoCents: 349,
      aisle: 'Aisle 12',
    });
  });

  it('reports low stock and out of stock from stockLevel', () => {
    expect(resultFromProducts('croutons', [product('Croutons', 2, { stockLevel: 'LOW' })]).status).toBe('low');
    expect(
      resultFromProducts('croutons', [product('Croutons', 2, { stockLevel: 'TEMPORARILY_OUT_OF_STOCK' })]).status
    ).toBe('out');
    // Any in-stock match beats an out-of-stock one.
    expect(
      resultFromProducts('croutons', [
        product('Cheap Croutons', 1, { stockLevel: 'TEMPORARILY_OUT_OF_STOCK' }),
        product('Croutons', 3),
      ]).product?.description
    ).toBe('Croutons');
  });

  it('is "not-found" when nothing matches or nothing is sold in store', () => {
    expect(resultFromProducts('croutons', [product('Potato Chips', 2)])).toEqual({ status: 'not-found' });
    expect(resultFromProducts('croutons', [product('Croutons', 2, { instore: false })])).toEqual({
      status: 'not-found',
    });
  });
});

describe('matchLocation', () => {
  it('takes the nearest Kroger location within 250 m and skips fuel stations', () => {
    const near = { locationId: '70300001', chain: 'RALPHS', geolocation: { latitude: 34.0613, longitude: -118.2454 } };
    const fuel = { locationId: '70300002', chain: 'SHELL COMPANY', geolocation: { latitude: 34.0612, longitude: -118.2453 } };
    const far = { locationId: '70300003', chain: 'RALPHS', geolocation: { latitude: 34.07, longitude: -118.2453 } };
    expect(matchLocation(ralphs, [far, fuel, near])).toBe('70300001');
    expect(matchLocation(ralphs, [far, fuel])).toBeNull();
  });
});

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('createKrogerCatalog', () => {
  const lines = [
    { key: 'romaine lettuce|head', name: 'Romaine lettuce' },
    { key: 'croutons|cup', name: 'croutons' },
  ];

  function mockKroger() {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/connect/oauth2/token')) return json({ access_token: 'tok', expires_in: 1800 });
      if (url.includes('/locations')) {
        return json({
          data: [{ locationId: '70300001', chain: 'RALPHS', geolocation: { latitude: 34.0612, longitude: -118.2453 } }],
        });
      }
      if (url.includes('filter.term=romaine%20lettuce')) return json({ data: [product('Romaine Lettuce Hearts', 2.99)] });
      if (url.includes('filter.term=croutons')) return json({ data: [product('Potato Chips', 3.49)] });
      throw new Error(`unexpected ${url} ${String(init?.method)}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('signs in, finds the location, and checks each ingredient by name only', async () => {
    const fetchMock = mockKroger();
    const catalog = createKrogerCatalog({ clientId: 'id', clientSecret: 'secret' });

    const results = await catalog.check(ralphs, lines);

    expect(results['romaine lettuce|head'].status).toBe('found');
    expect(results['croutons|cup']).toEqual({ status: 'not-found' });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://api.kroger.com/v1/connect/oauth2/token');
    expect((tokenInit!.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('id:secret')}`);
    expect(tokenInit!.body).toBe('grant_type=client_credentials&scope=product.compact');

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    // The store's own rounded position, not the user's.
    expect(urls.find((u) => u.includes('/locations'))).toContain('filter.latLong.near=34.06,-118.25');
    const searches = urls.filter((u) => u.includes('/products'));
    expect(searches).toHaveLength(2);
    for (const url of searches) {
      expect(url).toContain('filter.locationId=70300001');
      // Names only: no units, quantities, or list keys.
      expect(url).not.toMatch(/head|cup|%7C/);
    }
  });

  it('reuses the token and caches results for the session', async () => {
    const fetchMock = mockKroger();
    const catalog = createKrogerCatalog({ clientId: 'id', clientSecret: 'secret' });
    await catalog.check(ralphs, lines);
    const callsAfterFirst = fetchMock.mock.calls.length;
    await catalog.check(ralphs, lines);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('leaves every line unknown when the store is not a Kroger location', async () => {
    mockKroger();
    const catalog = createKrogerCatalog({ clientId: 'id', clientSecret: 'secret' });
    const elsewhere = { ...ralphs, latitude: 34.2, longitude: -118.5 };
    await expect(catalog.check(elsewhere, lines)).resolves.toEqual({});
  });

  it('fails clearly on bad credentials', async () => {
    globalThis.fetch = jest.fn(async () => json({ error: 'invalid_client' }, 401)) as unknown as typeof fetch;
    const catalog = createKrogerCatalog({ clientId: 'id', clientSecret: 'wrong' });
    const error = await catalog.check(ralphs, lines).catch((e) => e);
    expect(error).toBeInstanceOf(KrogerError);
    expect(error.message).toMatch(/client ID\/secret/);
  });
});
