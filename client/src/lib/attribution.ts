import { OVERLAYS } from '../map/overlays';
import { CARTO_ATTRIBUTION, hasMapTiler, MAPTILER_ATTRIBUTION } from '../map/style';

/**
 * Attribution shown in the bottom strip. Always credits the base map, plus the
 * source of any currently-visible overlay. Deduplicated, in a stable order.
 */
export function activeAttributions(visibility: Record<string, boolean>): string[] {
  const out: string[] = [hasMapTiler ? MAPTILER_ATTRIBUTION : CARTO_ATTRIBUTION];

  for (const overlay of OVERLAYS) {
    if (!overlay.attribution) continue;
    const visible = visibility[overlay.key] ?? overlay.defaultVisible;
    if (visible && !out.includes(overlay.attribution)) {
      out.push(overlay.attribution);
    }
  }
  return out;
}
