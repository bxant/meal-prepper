import { fetchNearbyStores, StoreLookupError } from '../lib/overpass';

const position = { latitude: 34.052235, longitude: -118.243683 };
const realFetch = globalThis.fetch;
// Skip the real 3 s back-off before the final retry.
const fast = { retryDelayScale: 0 };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/**
 * Captured verbatim from overpass-api.de (2026-10-08): when a query runs out
 * of time or memory server-side, Overpass still answers HTTP 200 — with no
 * elements and a `remark`. The app used to show this as "No grocery stores
 * found".
 */
const LIVE_TIMEOUT_REMARK = {
  version: 0.6,
  generator: 'Overpass API 0.7.62.11 87bfad18',
  osm3s: {
    timestamp_osm_base: '2026-10-08T21:26:21Z',
    copyright:
      'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.',
  },
  elements: [],
  remark: 'runtime error: Query timed out in "query" at line 1 after 2 seconds.',
};

const ralphs = { type: 'node', id: 1, lat: 34.06, lon: -118.24, tags: { name: 'Ralphs' } };
const aldi = { type: 'node', id: 2, lat: 34.08, lon: -118.24, tags: { name: 'ALDI' } };
// ~11 miles north: outside a 5-mile search even though Overpass returned it.
const farAway = { type: 'node', id: 3, lat: 34.21, lon: -118.24, tags: { name: 'Far Foods' } };

afterEach(() => {
  globalThis.fetch = realFetch;
});

function sentQuery(fetchMock: jest.Mock, call = 0): string {
  return decodeURIComponent(fetchMock.mock.calls[call][1].body);
}

describe('fetchNearbyStores', () => {
  it('sends only the coarsened location, padded for the rounding', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ elements: [ralphs, aldi] }));
    globalThis.fetch = fetchMock;

    const stores = await fetchNearbyStores(position, 5);

    const body = sentQuery(fetchMock);
    // 5 mi = 8047 m, plus 1 km to cover the ~1 km coarsening.
    expect(body).toContain('around:9047,34.05,-118.24');
    expect(body).not.toContain('34.0522');
    expect(body).not.toContain('118.2436');
    expect(stores.map((s) => s.name).sort()).toEqual(['ALDI', 'Ralphs']);
  });

  it('declares a lean timeout and memory limit so busy servers admit the query', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ elements: [] }));
    globalThis.fetch = fetchMock;

    await fetchNearbyStores(position, 5);
    await fetchNearbyStores(position, 25);

    // The old query declared only [timeout:25], so the server assumed 512 MiB.
    expect(sentQuery(fetchMock, 0)).toContain('[timeout:15][maxsize:33554432]');
    expect(sentQuery(fetchMock, 1)).toContain('[timeout:25][maxsize:33554432]');
  });

  it('keeps only stores within the chosen distance of the precise position', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse({ elements: [ralphs, farAway] }));

    expect((await fetchNearbyStores(position, 5)).map((s) => s.name)).toEqual(['Ralphs']);
    expect((await fetchNearbyStores(position, 25)).map((s) => s.name).sort()).toEqual([
      'Far Foods',
      'Ralphs',
    ]);
  });

  it('resolves to [] only for a genuine empty result', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse({ version: 0.6, elements: [] }));
    await expect(fetchNearbyStores(position, 1)).resolves.toEqual([]);
  });

  // Regression: the live HTTP-200 timeout remark used to become an empty list.
  it('treats an HTTP 200 runtime-error remark as busy, not as "no stores"', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(LIVE_TIMEOUT_REMARK));
    globalThis.fetch = fetchMock;

    const error = await fetchNearbyStores(position, 5, fast).catch((e) => e);
    expect(error).toBeInstanceOf(StoreLookupError);
    expect(error.message).toMatch(/busy/);
    // Every server was tried before giving up.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries past a remark and returns the next server’s stores', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(LIVE_TIMEOUT_REMARK))
      .mockResolvedValueOnce(jsonResponse({ elements: [aldi] }));

    expect((await fetchNearbyStores(position, 5, fast)).map((s) => s.name)).toEqual(['ALDI']);
  });

  // Regression: overpass-api.de sheds load with 504 and the old fallback
  // (overpass.kumi.systems) answered 500 to everything, so one busy moment
  // failed the whole lookup. The primary now gets a second, delayed try.
  it('gives the primary server a second try after both servers fail', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 504))
      .mockResolvedValueOnce(jsonResponse(null, 500))
      .mockResolvedValueOnce(jsonResponse({ elements: [ralphs] }));
    globalThis.fetch = fetchMock;

    expect((await fetchNearbyStores(position, 5, fast)).map((s) => s.name)).toEqual(['Ralphs']);
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe(urls[2]);
    expect(urls[1]).not.toBe(urls[0]);
  });

  it('reports a rate limit as busy', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(null, 429));
    const error = await fetchNearbyStores(position, 5, fast).catch((e) => e);
    expect(error.message).toMatch(/busy/);
  });

  it('reports a non-Overpass body as unreadable rather than empty', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    const error = await fetchNearbyStores(position, 5, fast).catch((e) => e);
    expect(error).toBeInstanceOf(StoreLookupError);
    expect(error.message).toMatch(/unreadable/);
  });

  it('throws a friendly StoreLookupError when the network is down', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    const error = await fetchNearbyStores(position, 5, fast).catch((e) => e);
    expect(error).toBeInstanceOf(StoreLookupError);
    expect(error.message).toMatch(/internet connection/);
  });

  // Overpass answers `around:NaN,…` with HTTP 200 and zero elements.
  it('refuses a non-finite position or radius instead of querying', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    await expect(fetchNearbyStores({ latitude: NaN, longitude: 1 }, 5)).rejects.toBeInstanceOf(
      StoreLookupError
    );
    await expect(fetchNearbyStores(position, Number.NaN)).rejects.toBeInstanceOf(StoreLookupError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
