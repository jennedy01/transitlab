/**
 * Lightweight geodesy for the drawing workflow. Distances use the haversine
 * formula (sub-0.2% of the projected EPSG:27700 lengths the server uses for
 * analysis — fine for live chainage readouts and click projection).
 */

export type LngLat = [number, number];

const R = 6_371_008.8; // mean Earth radius, metres

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Great-circle distance between two [lng,lat] points, in metres. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cumulative chainage (metres) at each vertex; length = coords.length. */
export function cumulativeChainage(coords: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i += 1) {
    out.push(out[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return out;
}

/** Total length of a polyline in metres. */
export function lineLength(coords: LngLat[]): number {
  const c = cumulativeChainage(coords);
  return c[c.length - 1] ?? 0;
}

/**
 * Project a point onto the polyline, returning the nearest position as a
 * fraction (0..1) of total length, the chainage in metres, and the squared
 * planar distance (in degrees²) for comparing candidate clicks.
 */
export function projectToLine(
  coords: LngLat[],
  p: LngLat,
): { fraction: number; chainageM: number; distSq: number } {
  const chain = cumulativeChainage(coords);
  const total = chain[chain.length - 1] || 1;
  let best = { chainageM: 0, distSq: Infinity };

  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const apx = p[0] - a[0];
    const apy = p[1] - a[1];
    const lenSq = abx * abx + aby * aby || 1e-12;
    let t = (apx * abx + apy * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * abx;
    const cy = a[1] + t * aby;
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq < best.distSq) {
      // Chainage = chainage at vertex i plus the fraction along this edge.
      const edgeLen = chain[i + 1] - chain[i];
      best = { chainageM: chain[i] + t * edgeLen, distSq };
    }
  }
  return { fraction: best.chainageM / total, chainageM: best.chainageM, distSq: best.distSq };
}

/** Interpolate the [lng,lat] point at a fractional position along the line. */
export function pointAtFraction(coords: LngLat[], fraction: number): LngLat {
  const chain = cumulativeChainage(coords);
  const total = chain[chain.length - 1] || 0;
  const target = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < coords.length - 1; i += 1) {
    if (target <= chain[i + 1] || i === coords.length - 2) {
      const edgeLen = chain[i + 1] - chain[i] || 1;
      const t = (target - chain[i]) / edgeLen;
      return [
        coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + t * (coords[i + 1][1] - coords[i][1]),
      ];
    }
  }
  return coords[0];
}
