/** Core domain entities, mirroring the PostGIS schema (geometry as GeoJSON). */

import type { Electrification, LoadingGauge, Mode, StructureType, Traction } from './enums.js';
import type { LineStringGeometry, PointGeometry } from './geojson.js';

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Scheme {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A scheme with its lines (and each line's segments + stations) eagerly loaded. */
export interface SchemeWithLines extends Scheme {
  lines: Line[];
}

export interface Line {
  id: string;
  schemeId: string;
  name: string;
  colour: string;
  mode: Mode;
  gaugeMm: number;
  electrification: Electrification;
  rollingStockId: string | null;
  geom: LineStringGeometry | null;
  segments: Segment[];
  stations: Station[];
}

export interface Segment {
  id: string;
  lineId: string;
  /** Order of the segment along the line, from the start. */
  seq: number;
  structureType: StructureType;
  trackCount: number;
  maxSpeedKph: number | null;
  /** Start/end distance along the line in metres (chainage). */
  startChainageM: number;
  endChainageM: number;
  geom: LineStringGeometry | null;
}

export interface Station {
  id: string;
  lineId: string;
  name: string;
  isInterchange: boolean;
  stepFree: boolean;
  /** Distance along the line in metres. */
  chainageM: number;
  geom: PointGeometry;
}

export interface RollingStock {
  id: string;
  name: string;
  mode: Mode;
  gaugeMm: number;
  maxSpeedKph: number;
  /** Passenger capacity per unit/trainset. */
  capacity: number;
  traction: Traction;
  loadingGauge: LoadingGauge;
}

/* ----- Seeded reference network (read-only to the user) ------------------- */

export interface ExistingLine {
  id: string;
  source: string;
  mode: string;
  name: string | null;
  operator: string | null;
  electrified: string | null;
  gauge: string | null;
  geom: LineStringGeometry;
}

export interface ExistingStation {
  id: string;
  source: string;
  name: string | null;
  modes: string[];
  geom: PointGeometry;
}

export interface PopulationArea {
  id: string;
  lsoaCode: string;
  population: number;
  density: number;
  geom: import('./geojson.js').MultiPolygonGeometry;
}
