/** Result shapes returned by the server-side analysis tools. */

import type { Feature, LineStringGeometry, PointGeometry } from './geojson.js';
import type { StructureType } from './enums.js';

/** 1. Catchment population (walk radius around each station). */
export interface CatchmentResult {
  walkRadiusM: number;
  stations: CatchmentStation[];
  lineTotalPopulation: number;
  /** Population counted once even where station catchments overlap. */
  lineUniquePopulation: number;
}

export interface CatchmentStation {
  stationId: string;
  name: string;
  population: number;
  /** Buffer polygon (EPSG:4326) for rendering catchment on the map. */
  buffer: Feature<import('./geojson.js').MultiPolygonGeometry>;
}

/** 4. Cost estimate (indicative capital cost). */
export interface CostResult {
  currency: 'GBP';
  /** Total indicative capital cost in pounds. */
  total: number;
  perKm: number;
  lengthKm: number;
  tunnelProportion: number;
  /** True if tunnel proportion pushes cost past the warning threshold. */
  overThreshold: boolean;
  breakdown: CostLineItem[];
}

export interface CostLineItem {
  label: string;
  category: 'structure' | 'stations' | 'electrification' | 'rolling_stock';
  /** Quantity (km for structure/electrification, count for stations). */
  quantity: number;
  unit: string;
  ratePerUnit: number;
  subtotal: number;
  structureType?: StructureType;
}

/** 5. Journey time estimate. */
export interface JourneyTimeResult {
  /** End-to-end run time in seconds. */
  runTimeS: number;
  /** Average speed over the line in km/h. */
  averageSpeedKph: number;
  lengthKm: number;
  dwellTimeS: number;
  stops: number;
  /** Per inter-station leg breakdown. */
  legs: JourneyLeg[];
}

export interface JourneyLeg {
  fromStation: string;
  toStation: string;
  distanceM: number;
  /** Limiting speed for the leg (min of stock and segment limits). */
  speedKph: number;
  travelTimeS: number;
}

/** 6. Coverage overlap with existing same-mode lines. */
export interface CoverageResult {
  bufferM: number;
  lengthKm: number;
  /** Length running within buffer of an existing same-mode line. */
  duplicatedKm: number;
  /** Length serving otherwise-uncovered area. */
  uncoveredKm: number;
  duplicationProportion: number;
  /** GeoJSON of the duplicated spans, for amber map highlight. */
  duplicatedSpans: Feature<LineStringGeometry>[];
}

/** 3. Network connectivity / missing links. */
export interface MissingLink {
  id: string;
  fromName: string;
  toName: string;
  from: PointGeometry;
  to: PointGeometry;
  straightLineKm: number;
  networkKm: number | null;
  /** networkKm / straightLineKm — higher means more poorly connected. */
  detourRatio: number | null;
  combinedPopulation: number;
  /** Set when recomputed with a proposed line present. */
  improvedRatio?: number | null;
  improvementPct?: number | null;
}

export interface ConnectivityResult {
  links: MissingLink[];
  /** Summary of how the proposed line closes flagged links, if evaluated. */
  improvements: ConnectivityImprovement[];
}

export interface ConnectivityImprovement {
  linkId: string;
  fromName: string;
  toName: string;
  beforeRatio: number;
  afterRatio: number;
  improvementPct: number;
}

/** 7. Vertical profile (the signature strip). */
export interface ProfileResult {
  lengthM: number;
  segments: ProfileSegment[];
  stations: ProfileStation[];
}

export interface ProfileSegment {
  structureType: StructureType;
  startChainageM: number;
  endChainageM: number;
  /** Relative vertical level for drawing (negative = below grade). */
  level: number;
}

export interface ProfileStation {
  name: string;
  chainageM: number;
  isInterchange: boolean;
}

/** Bundle returned by the "run all analysis" endpoint for a line. */
export interface LineAnalysis {
  lineId: string;
  catchment?: CatchmentResult;
  cost?: CostResult;
  journeyTime?: JourneyTimeResult;
  coverage?: CoverageResult;
  connectivity?: ConnectivityResult;
  profile?: ProfileResult;
}
