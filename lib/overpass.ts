/**
 * The app's only network call: ask OpenStreetMap's Overpass API for grocery
 * stores near a COARSE location. Only the rounded coordinates are sent; the
 * precise position stays on-device and is used locally for distances.
 */

import { coarsen, type LatLng } from './geo';
import {
  buildOverpassQuery,
  OverpassResponseError,
  parseOverpassResponse,
  searchRadiusMeters,
  withinMiles,
  type NearbyStore,
} from './nearbyStores';

const PRIMARY_URL = 'https://overpass-api.de/api/interpreter';
const FALLBACK_URL = 'https://overpass.kumi.systems/api/interpreter';
/**
 * Public instances are often busy (504) and rate-limit per IP (429), so after
 * one pass over both, wait briefly and give the primary one more try.
 */
const ATTEMPTS: { url: string; delayMs: number }[] = [
  { url: PRIMARY_URL, delayMs: 0 },
  { url: FALLBACK_URL, delayMs: 0 },
  { url: PRIMARY_URL, delayMs: 3000 },
];
/** Client-side cap per attempt; the query itself declares a 15–25 s server limit. */
const TIMEOUT_MS = 40000;
// overpass-api.de answers 406 to generic client User-Agents (okhttp, curl).
const USER_AGENT = 'MealPrepper/1.0 (personal grocery app; https://github.com/bxant/meal-prepper)';

const BUSY_MESSAGE = 'The store directory (OpenStreetMap) is busy right now. Try again in a minute.';
// Overpass allows each IP two query slots, freed a little after each query ends.
const RATE_LIMITED_MESSAGE = 'Too many store searches in a row. Wait a minute, then try again.';
const UNREADABLE_MESSAGE = 'The store directory sent an unreadable response. Try again.';

export class StoreLookupError extends Error {}

async function queryOnce(url: string, body: string, origin: LatLng): Promise<NearbyStore[]> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const failed = () =>
    new StoreLookupError(
      timedOut
        ? 'The store directory took too long to answer. Try again in a minute.'
        : "Couldn't reach the store directory. Check your internet connection and try again."
    );
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body,
        signal: controller.signal,
      });
    } catch {
      throw failed();
    }
    if (!response.ok) {
      throw new StoreLookupError(
        response.status === 429
          ? RATE_LIMITED_MESSAGE
          : response.status >= 500
            ? BUSY_MESSAGE
            : `The store directory returned an error (${response.status}). Try again later.`
      );
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw timedOut ? failed() : new StoreLookupError(UNREADABLE_MESSAGE);
    }
    try {
      return parseOverpassResponse(json, origin);
    } catch (e) {
      if (!(e instanceof OverpassResponseError)) throw e;
      // A server-side timeout/out-of-memory remark is load, not "no stores here".
      throw new StoreLookupError(e.isRuntimeError ? BUSY_MESSAGE : UNREADABLE_MESSAGE);
    }
  } finally {
    clearTimeout(timer);
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Every grocery store within `radiusMiles` of `position`, unordered (order
 * with `selectStores`). Resolves to `[]` only when Overpass genuinely lists
 * none; any failure throws a `StoreLookupError` with a user-facing message.
 */
export async function fetchNearbyStores(
  position: LatLng,
  radiusMiles: number,
  { retryDelayScale = 1 }: { retryDelayScale?: number } = {}
): Promise<NearbyStore[]> {
  // Overpass answers `around:NaN,…` with HTTP 200 and zero elements, which
  // would read as "no stores nearby"; refuse it here instead.
  if (![position.latitude, position.longitude, radiusMiles].every(Number.isFinite) || radiusMiles <= 0) {
    throw new StoreLookupError("Couldn't read your location. Try again.");
  }
  const query = buildOverpassQuery(coarsen(position), searchRadiusMeters(radiusMiles));
  const body = `data=${encodeURIComponent(query)}`;
  let lastError: unknown;
  for (const { url, delayMs } of ATTEMPTS) {
    if (delayMs > 0) await wait(delayMs * retryDelayScale);
    try {
      return withinMiles(await queryOnce(url, body, position), radiusMiles);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
