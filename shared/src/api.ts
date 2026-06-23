/** Request/response payloads for the HTTP API. */

import type { Electrification, Mode, StructureType } from './enums.js';
import type { LineStringGeometry, Position } from './geojson.js';
import type { Scheme, SchemeWithLines, User } from './entities.js';

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateSchemeRequest {
  name: string;
  description?: string;
}

export interface SchemeListResponse {
  schemes: Scheme[];
}

export interface SchemeResponse {
  scheme: SchemeWithLines;
}

export interface CreateLineRequest {
  name: string;
  colour?: string;
  mode?: Mode;
  gaugeMm?: number;
  electrification?: Electrification;
  rollingStockId?: string | null;
  /** Ordered [lng, lat] vertices from the drawing tool. */
  coordinates?: Position[];
}

export interface UpdateLineRequest {
  name?: string;
  colour?: string;
  mode?: Mode;
  gaugeMm?: number;
  electrification?: Electrification;
  rollingStockId?: string | null;
  geom?: LineStringGeometry;
}

/** One structural segment per polyline edge (length = coordinates - 1). */
export interface SegmentInput {
  structureType: StructureType;
  trackCount: number;
  maxSpeedKph?: number | null;
}

/** A station placed at a fractional position (0..1) along the line. */
export interface StationInput {
  id?: string;
  name: string;
  /** Distance along the line as a fraction of its length. */
  fraction: number;
  isInterchange?: boolean;
  stepFree?: boolean;
}

/**
 * Full upsert payload for a line: geometry plus its per-edge segments and its
 * stations. The server computes metric chainage (EPSG:27700), segment geometry,
 * station points, and interchange auto-detection.
 */
export interface LineUpsertRequest {
  name: string;
  colour: string;
  mode: Mode;
  gaugeMm: number;
  electrification: Electrification;
  rollingStockId?: string | null;
  coordinates: Position[];
  segments: SegmentInput[];
  stations: StationInput[];
}

export interface ApiError {
  error: string;
  detail?: string;
}
