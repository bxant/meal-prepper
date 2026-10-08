/**
 * Optional live availability for Kroger-family stores via the Kroger
 * Developer Public API (OAuth2 client_credentials, scope `product.compact`).
 *
 * Only used when the user has entered their own client ID and secret in
 * Settings. What leaves the phone: the credentials (to Kroger only), a store's
 * rounded coordinates to find its Kroger `locationId`, and each shopping-list
 * ingredient NAME as a search term — no quantities, recipes, or the user's
 * position. Results live in memory for the session only (Kroger's terms forbid
 * storing data derived from searches), and Kroger's product data is shown
 * verbatim inside that store's card only — never compared with other stores.
 */

import { coarsen, distanceKm } from './geo';
import type { NearbyStore } from './nearbyStores';
import { nameTokens } from './nutrition/bundledSource';
import type { AvailabilityLine, ItemResult, StoreCatalog, StoreResults } from './storeAvailability';
import { normalizeStoreName } from './storeTiers';

const API = 'https://api.kroger.com/v1';
/** Kroger product search returns 10 results by default; 10 is enough to find a match. */
const SEARCH_LIMIT = 10;
/** An OSM store counts as a Kroger location when they are this close. */
const MATCH_RADIUS_KM = 0.25;
/** Parallel product searches. */
const CONCURRENCY = 4;
/** Only this many nearest Kroger-family stores are checked per refresh (call budget). */
export const KROGER_MAX_STORES = 5;

/** Kroger Co. banners (developer.kroger.com covers all of them). */
const KROGER_FAMILY = [
  'Kroger',
  'Ralphs',
  'Food 4 Less',
  'Food4Less',
  'Foods Co',
  'Fred Meyer',
  'King Soopers',
  "Smith's",
  'QFC',
  "Fry's",
  'Dillons',
  'Harris Teeter',
  "Mariano's",
  "Pick 'n Save",
  'Metro Market',
  'City Market',
  "Baker's",
  'Gerbes',
  'Jay C',
  'Pay Less',
  'Copps',
  "Owen's",
  'Ruler',
  "Roundy's",
].map(normalizeStoreName);

export function isKrogerFamily(store: Pick<NearbyStore, 'name' | 'brand'>): boolean {
  return [store.brand, store.name].some(
    (candidate) => !!candidate && KROGER_FAMILY.some((chain) => normalizeStoreName(candidate).includes(chain))
  );
}

export class KrogerError extends Error {}

// ---- Matching (pure) -------------------------------------------------------

/** Words that describe preparation or size rather than the product. */
const FILLER = new Set([
  'a', 'an', 'and', 'or', 'of', 'the', 'to', 'for', 'fresh', 'freshly', 'chopped', 'diced',
  'minced', 'sliced', 'grated', 'shredded', 'large', 'small', 'medium', 'finely', 'roughly',
  'optional', 'taste', 'about', 'plus', 'cup', 'cups', 'whole', 'raw', 'peeled',
]);

/** The ingredient-name tokens a product description must contain. */
export function significantTokens(name: string): string[] {
  return nameTokens(name).filter((token) => !FILLER.has(token));
}

/** Kroger search is fuzzy and always returns something; accept only real matches. */
export function productMatches(description: string, ingredientName: string): boolean {
  const wanted = significantTokens(ingredientName);
  if (wanted.length === 0) return false;
  const have = new Set(nameTokens(description));
  return wanted.every((token) => have.has(token));
}

interface KrogerItem {
  price?: { regular?: number; promo?: number };
  fulfillment?: { instore?: boolean };
  inventory?: { stockLevel?: string };
}

export interface KrogerProduct {
  description?: string;
  items?: KrogerItem[];
  aisleLocations?: { description?: string }[];
}

function toCents(dollars: number | undefined): number | null {
  return typeof dollars === 'number' && dollars > 0 ? Math.round(dollars * 100) : null;
}

/**
 * Turn one search's products into a result for this ingredient: the
 * cheapest matching in-store product that isn't out of stock, else an
 * out-of-stock match, else "not-found".
 */
export function resultFromProducts(ingredientName: string, products: KrogerProduct[]): ItemResult {
  const candidates = products
    .filter((p) => typeof p.description === 'string' && productMatches(p.description, ingredientName))
    .flatMap((p) =>
      (p.items ?? [])
        .filter((item) => item.fulfillment?.instore !== false)
        .map((item) => {
          const regular = toCents(item.price?.regular);
          const promo = toCents(item.price?.promo);
          const level = item.inventory?.stockLevel;
          return {
            status: (level === 'TEMPORARILY_OUT_OF_STOCK' ? 'out' : level === 'LOW' ? 'low' : 'found') as ItemResult['status'],
            product: {
              description: p.description!,
              priceCents: regular,
              promoCents: promo !== null && regular !== null && promo < regular ? promo : null,
              aisle: p.aisleLocations?.[0]?.description ?? null,
            },
          };
        })
    );
  if (candidates.length === 0) return { status: 'not-found' };
  const price = (c: (typeof candidates)[number]) =>
    c.product.promoCents ?? c.product.priceCents ?? Number.MAX_SAFE_INTEGER;
  const inStock = candidates.filter((c) => c.status !== 'out').sort((a, b) => price(a) - price(b));
  return inStock[0] ?? candidates[0];
}

export interface KrogerLocation {
  locationId: string;
  chain?: string;
  geolocation?: { latitude?: number; longitude?: number };
}

/** The Kroger location for an OSM store: nearest within 250 m, fuel stations excluded. */
export function matchLocation(
  store: Pick<NearbyStore, 'latitude' | 'longitude'>,
  locations: KrogerLocation[]
): string | null {
  let best: { id: string; km: number } | null = null;
  for (const location of locations) {
    const { latitude, longitude } = location.geolocation ?? {};
    if (location.chain === 'SHELL COMPANY' || typeof latitude !== 'number' || typeof longitude !== 'number') {
      continue;
    }
    const km = distanceKm(store, { latitude, longitude });
    if (km <= MATCH_RADIUS_KM && (!best || km < best.km)) best = { id: location.locationId, km };
  }
  return best?.id ?? null;
}

// ---- Network ---------------------------------------------------------------

export interface KrogerCredentials {
  clientId: string;
  clientSecret: string;
}

async function getJson(url: string, init: RequestInit, what: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new KrogerError(`Couldn't reach Kroger (${what}). Check your connection.`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new KrogerError('Kroger rejected the client ID/secret. Check them in Settings.');
  }
  if (response.status === 429) throw new KrogerError("Kroger's daily request limit was reached.");
  if (!response.ok) throw new KrogerError(`Kroger returned an error (${response.status}) for ${what}.`);
  try {
    return await response.json();
  } catch {
    throw new KrogerError(`Kroger sent an unreadable response for ${what}.`);
  }
}

/** Run `task` over `items` with at most `limit` in flight. */
async function mapLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * A `StoreCatalog` backed by the Kroger API. Token, store locations, and
 * per-(store, term) results are cached in memory for the life of the catalog.
 */
export function createKrogerCatalog(credentials: KrogerCredentials): StoreCatalog & { maxStores: number } {
  let token: { value: string; expiresAt: number } | null = null;
  const locationsByArea = new Map<string, Promise<KrogerLocation[]>>();
  const results = new Map<string, ItemResult>();

  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt) return token.value;
    const basic = btoa(`${credentials.clientId.trim()}:${credentials.clientSecret.trim()}`);
    const json = (await getJson(
      `${API}/connect/oauth2/token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=product.compact',
      },
      'sign-in'
    )) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new KrogerError('Kroger sign-in returned no token.');
    // Renew a minute early.
    token = { value: json.access_token, expiresAt: Date.now() + ((json.expires_in ?? 1800) - 60) * 1000 };
    return token.value;
  }

  async function authed(url: string, what: string): Promise<unknown> {
    return getJson(
      url,
      { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' } },
      what
    );
  }

  /** Kroger locations around the store's own rounded position (never the user's). */
  function locationsNear(store: NearbyStore): Promise<KrogerLocation[]> {
    const area = coarsen(store);
    const key = `${area.latitude},${area.longitude}`;
    let pending = locationsByArea.get(key);
    if (!pending) {
      pending = authed(
        `${API}/locations?filter.latLong.near=${key}&filter.radiusInMiles=2&filter.limit=50`,
        'store lookup'
      ).then((json) => ((json as { data?: KrogerLocation[] }).data ?? []));
      pending.catch(() => locationsByArea.delete(key));
      locationsByArea.set(key, pending);
    }
    return pending;
  }

  return {
    label: 'Kroger',
    isSample: false,
    maxStores: KROGER_MAX_STORES,
    canCheck: isKrogerFamily,
    async check(store: NearbyStore, lines: AvailabilityLine[]): Promise<StoreResults> {
      const locationId = matchLocation(store, await locationsNear(store));
      // Not a Kroger location after all: unknown for every line.
      if (!locationId) return {};
      const out: StoreResults = {};
      let firstError: unknown = null;
      await mapLimited(lines, CONCURRENCY, async (line) => {
        const term = line.name.trim().toLowerCase();
        const cacheKey = `${locationId}|${term}`;
        let result = results.get(cacheKey);
        if (!result) {
          try {
            const json = await authed(
              `${API}/products?filter.term=${encodeURIComponent(term)}` +
                `&filter.locationId=${locationId}&filter.limit=${SEARCH_LIMIT}`,
              'product search'
            );
            result = resultFromProducts(line.name, (json as { data?: KrogerProduct[] }).data ?? []);
            results.set(cacheKey, result);
          } catch (e) {
            // This line stays "unknown"; the rest of the store still counts.
            firstError ??= e;
            return;
          }
        }
        out[line.key] = result;
      });
      if (firstError && Object.keys(out).length === 0) throw firstError;
      return out;
    },
  };
}
