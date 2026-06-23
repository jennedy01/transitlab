/** Formatting + small geodesy helpers shared across readouts. */

/** Ground resolution (metres per CSS pixel) at a given latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Human distance: metres under 1 km, otherwise kilometres. */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return '—';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 2 : 1)} km`;
}

/** Latitude/longitude to a fixed-precision DMS-free readout. */
export function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}  ${Math.abs(lng).toFixed(4)}° ${ew}`;
}
