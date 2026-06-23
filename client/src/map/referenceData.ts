import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { getExistingLines, getExistingStations, getPopulation, type Bbox } from '../lib/api';

/**
 * Loads seeded reference data into the map's GeoJSON sources.
 *
 * The existing network (lines + stations) is loaded once; the population
 * choropleth is fetched per viewport (the national LSOA set is too large to
 * render at once) and refreshed on demand.
 */

function setSource(map: MlMap, id: string, data: unknown): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData(data as never);
}

export function currentBbox(map: MlMap): Bbox {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

export async function loadExistingNetwork(map: MlMap): Promise<void> {
  const bbox = currentBbox(map);
  try {
    const [lines, stations] = await Promise.all([
      getExistingLines(bbox),
      getExistingStations(bbox),
    ]);
    setSource(map, 'existing-lines', lines);
    setSource(map, 'existing-stations', stations);
  } catch (err) {
    console.warn('[reference] existing network load failed:', (err as Error).message);
  }
}

export async function refreshPopulation(map: MlMap): Promise<void> {
  try {
    const fc = await getPopulation(currentBbox(map));
    setSource(map, 'population', fc);
  } catch (err) {
    console.warn('[reference] population load failed:', (err as Error).message);
  }
}
