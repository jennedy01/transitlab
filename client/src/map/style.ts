import type { StyleSpecification } from 'maplibre-gl';

/**
 * Base map style.
 *
 * Design intent: a muted, desaturated backdrop so transit layers and analysis
 * overlays read clearly on top. If a MapTiler key is present we use their
 * "dataviz" vector style (designed as a quiet data backdrop); otherwise we fall
 * back to the free OSM-derived CARTO Positron raster basemap, lightly
 * desaturated.
 */

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

/** Geographic framing for the United Kingdom. */
export const UK_CENTER: [number, number] = [-2.9, 54.0];
export const UK_ZOOM = 5.1;
export const UK_BOUNDS: [[number, number], [number, number]] = [
  [-8.8, 49.7], // south-west
  [2.1, 61.0], // north-east
];

export const CARTO_ATTRIBUTION = '© OpenStreetMap contributors © CARTO';
export const MAPTILER_ATTRIBUTION = '© MapTiler © OpenStreetMap contributors';

/** Whether the muted vector base (MapTiler) is configured. */
export const hasMapTiler = MAPTILER_KEY.length > 0;

/**
 * Returns either a style URL (MapTiler vector) or an inline raster style spec.
 * MapLibre accepts both forms in `new Map({ style })`.
 */
export function buildBaseStyle(): string | StyleSpecification {
  if (hasMapTiler) {
    return `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_KEY}`;
  }

  const cartoTiles = ['a', 'b', 'c', 'd'].map(
    (s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png`,
  );

  const style: StyleSpecification = {
    version: 8,
    // Glyphs allow symbol/label layers we add later to render text.
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      'carto-base': {
        type: 'raster',
        tiles: cartoTiles,
        tileSize: 256,
        maxzoom: 20,
        attribution: CARTO_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0b0d10' },
      },
      {
        id: 'carto-base',
        type: 'raster',
        source: 'carto-base',
        paint: {
          // Keep it quiet: pull saturation down, soften contrast a touch.
          'raster-saturation': -0.3,
          'raster-contrast': -0.05,
          'raster-brightness-max': 0.96,
          'raster-opacity': 1,
        },
      },
    ],
  };
  return style;
}
