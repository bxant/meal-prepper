/** Pure geographic helpers; no React, no network. */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const KM_PER_MILE = 1.609344;

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Round to 2 decimal places (~1.1 km of latitude, less of longitude) so the
 * only location that ever leaves the phone is a coarse one.
 */
export function coarsen(point: LatLng): LatLng {
  const round = (v: number) => Math.round(v * 100) / 100;
  return { latitude: round(point.latitude), longitude: round(point.longitude) };
}

/** "0.4 mi", "3.2 mi", "12 mi" — the app's users are US-based (Walmart baseline). */
export function formatDistance(km: number): string {
  const miles = km / KM_PER_MILE;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}
