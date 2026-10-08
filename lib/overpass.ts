/**
 * The app's only network call: ask OpenStreetMap's Overpass API for grocery
 * stores near a COARSE location. Only the rounded coordinates are sent; the
 * precise position stays on-device and is used locally for distances.
 */

import { coarsen, type LatLng } from './geo';
import { buildOverpassQuery, parseOverpassResponse, rankStores, type NearbyStore } from './nearbyStores';

/** Public Overpass instances, tried in order; the public servers are often busy. */
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const TIMEOUT_MS = 30000;
// overpass-api.de answers 406 to generic client User-Agents (okhttp, curl).
const USER_AGENT = 'MealPrepper/1.0 (personal grocery app; https://github.com/bxant/meal-prepper)';

export class StoreLookupError extends Error {}

async function queryOnce(url: string, body: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
      throw new StoreLookupError(
        "Couldn't reach the store directory. Check your internet connection and try again."
      );
    }
    if (!response.ok) {
      throw new StoreLookupError(
        response.status === 429 || response.status >= 500
          ? 'The store directory (OpenStreetMap) is busy right now. Try again in a minute.'
          : `The store directory returned an error (${response.status}). Try again later.`
      );
    }
    try {
      return await response.json();
    } catch {
      throw new StoreLookupError('The store directory sent an unreadable response. Try again.');
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNearbyStores(position: LatLng): Promise<NearbyStore[]> {
  const body = `data=${encodeURIComponent(buildOverpassQuery(coarsen(position)))}`;
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      return rankStores(parseOverpassResponse(await queryOnce(url, body), position));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
