import { fetchNearbyStores, StoreLookupError } from '../lib/overpass';

const position = { latitude: 34.052235, longitude: -118.243683 };
const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('fetchNearbyStores', () => {
  it('sends only the coarsened location and ranks the result', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        elements: [
          { type: 'node', id: 1, lat: 34.06, lon: -118.24, tags: { name: 'Ralphs' } },
          { type: 'node', id: 2, lat: 34.08, lon: -118.24, tags: { name: 'ALDI' } },
        ],
      })
    );
    globalThis.fetch = fetchMock;

    const stores = await fetchNearbyStores(position);

    const body = decodeURIComponent(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('34.05,-118.24');
    expect(body).not.toContain('34.0522');
    expect(body).not.toContain('118.2436');
    expect(stores.map((s) => s.name)).toEqual(['ALDI', 'Ralphs']);
  });

  it('falls back to the next server when one is busy', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 504))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    globalThis.fetch = fetchMock;

    await expect(fetchNearbyStores(position)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a friendly StoreLookupError when every server fails', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    const error = await fetchNearbyStores(position).catch((e) => e);
    expect(error).toBeInstanceOf(StoreLookupError);
    expect(error.message).toMatch(/internet connection/);
  });
});
