/** Minimal GeoJSON typings (EPSG:4326) used across the API boundary. */

export type Position = [number, number]; // [lng, lat]

export interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}

export interface LineStringGeometry {
  type: 'LineString';
  coordinates: Position[];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type Geometry = PointGeometry | LineStringGeometry | MultiPolygonGeometry;

export interface Feature<G extends Geometry = Geometry, P = Record<string, unknown>> {
  type: 'Feature';
  geometry: G;
  properties: P;
  id?: string | number;
}

export interface FeatureCollection<G extends Geometry = Geometry, P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: Feature<G, P>[];
}
