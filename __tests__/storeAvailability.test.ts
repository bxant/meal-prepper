import type { NearbyStore } from '../lib/nearbyStores';
import { sampleCatalog, sampleStatus } from '../lib/sampleAvailability';
import {
  catalogFor,
  planChecks,
  coverageBucket,
  describeAvailability,
  rankStoresWithCoverage,
  summarizeAvailability,
  type StoreCatalog,
  type StoreResults,
} from '../lib/storeAvailability';

const lines = ['romaine', 'croutons', 'tomatoes', 'parmesan', 'dressing'].map((name) => ({
  key: `${name}|`,
  name,
}));

function store(id: string, tier: NearbyStore['tier'] = 'standard', distanceKm = 1): NearbyStore {
  return { id, name: id, brand: null, address: null, latitude: 0, longitude: 0, distanceKm, tier };
}

function results(statuses: Record<string, StoreResults[string]['status']>): StoreResults {
  return Object.fromEntries(Object.entries(statuses).map(([name, status]) => [`${name}|`, { status }]));
}

describe('summarizeAvailability / describeAvailability', () => {
  it('counts a fully checked store, low stock included in found', () => {
    const summary = summarizeAvailability(
      lines,
      results({ romaine: 'found', croutons: 'not-found', tomatoes: 'found', parmesan: 'low', dressing: 'out' })
    );
    expect(summary).toEqual({ total: 5, found: 3, low: 1, out: 1, notFound: 1, unknown: 0 });
    expect(describeAvailability(summary)).toBe(
      '3 of 5 found · 1 low stock · 1 out of stock · 1 not carried'
    );
  });

  it('leaves unknown lines out of the denominator', () => {
    const summary = summarizeAvailability(
      lines,
      results({ romaine: 'found', croutons: 'found', tomatoes: 'found', parmesan: 'not-found' })
    );
    expect(describeAvailability(summary)).toBe('3 of 4 checked found · 1 not carried · 1 unknown');
  });

  it('says "Availability unknown", never "0 of N", when nothing was checked', () => {
    expect(describeAvailability(summarizeAvailability(lines, undefined))).toBe('Availability unknown');
    expect(describeAvailability(summarizeAvailability(lines, {}))).toBe('Availability unknown');
  });

  it('still says "0 of 5 found" when every line was verified missing', () => {
    const none = results({ romaine: 'not-found', croutons: 'not-found', tomatoes: 'out', parmesan: 'not-found', dressing: 'not-found' });
    expect(describeAvailability(summarizeAvailability(lines, none))).toMatch(/^0 of 5 found/);
  });
});

describe('coverageBucket / rankStoresWithCoverage', () => {
  const complete = summarizeAvailability(lines, results({ romaine: 'found', croutons: 'found', tomatoes: 'found', parmesan: 'found', dressing: 'found' }));
  const poor = summarizeAvailability(lines, results({ romaine: 'found', croutons: 'not-found', tomatoes: 'not-found', parmesan: 'not-found', dressing: 'not-found' }));
  const unknown = summarizeAvailability(lines, undefined);

  it('buckets complete / neutral / poor, with unknown neutral', () => {
    expect(coverageBucket(complete)).toBe('complete');
    expect(coverageBucket(poor)).toBe('poor');
    expect(coverageBucket(unknown)).toBe('neutral');
  });

  it('keeps affordability first and uses coverage only inside a tier', () => {
    const buckets: Record<string, ReturnType<typeof coverageBucket>> = {
      aldi: 'neutral',
      krogerFar: 'complete',
      krogerNear: 'poor',
    };
    const ranked = rankStoresWithCoverage(
      [store('krogerNear', 'standard', 1), store('krogerFar', 'standard', 3), store('aldi', 'discount', 4)],
      (s) => buckets[s.id]
    );
    expect(ranked.map((s) => s.id)).toEqual(['aldi', 'krogerFar', 'krogerNear']);
  });
});

describe('catalogFor', () => {
  const kroger: StoreCatalog = {
    label: 'Kroger',
    isSample: false,
    canCheck: (s) => s.id.startsWith('kroger'),
    check: async () => ({}),
  };

  it('picks the first catalog that can check the store, else null', () => {
    expect(catalogFor(store('kroger-1'), [kroger, sampleCatalog])).toBe(kroger);
    expect(catalogFor(store('aldi'), [kroger, sampleCatalog])).toBe(sampleCatalog);
    expect(catalogFor(store('aldi'), [kroger])).toBeNull();
  });
});

describe('sampleCatalog', () => {
  it('is labelled as sample data and never invents prices', async () => {
    expect(sampleCatalog.isSample).toBe(true);
    const found = await sampleCatalog.check(store('node/1'), lines);
    for (const result of Object.values(found)) {
      expect(result.product?.priceCents ?? null).toBeNull();
    }
  });

  it('is deterministic per store and line, and varies between stores', () => {
    const a = store('node/1');
    expect(lines.map((l) => sampleStatus(a, l))).toEqual(lines.map((l) => sampleStatus(a, l)));
    const many = Array.from({ length: 20 }, (_, i) => store(`node/${i}`));
    const patterns = new Set(many.map((s) => lines.map((l) => sampleStatus(s, l)).join(',')));
    expect(patterns.size).toBeGreaterThan(1);
  });
});

describe('planChecks', () => {
  const kroger: StoreCatalog = {
    label: 'Kroger',
    isSample: false,
    maxStores: 2,
    canCheck: (s) => s.id.startsWith('kroger'),
    check: async () => ({}),
  };

  it('checks only each catalog’s nearest maxStores and marks the rest', () => {
    const stores = [store('kroger-far', 'standard', 9), store('kroger-near', 'standard', 1), store('kroger-mid', 'standard', 3), store('aldi', 'discount', 2)];
    const plan = planChecks(stores, [kroger]);
    expect(plan['kroger-near'].kind).toBe('check');
    expect(plan['kroger-mid'].kind).toBe('check');
    expect(plan['kroger-far'].kind).toBe('skipped');
    expect(plan.aldi.kind).toBe('none');
  });

  it('lets the sample catalog cover stores no live catalog claims', () => {
    const plan = planChecks([store('aldi', 'discount', 2), store('kroger-1', 'standard', 1)], [kroger, sampleCatalog]);
    expect(plan.aldi).toEqual({ kind: 'check', catalog: sampleCatalog });
    expect(plan['kroger-1']).toEqual({ kind: 'check', catalog: kroger });
  });
});
