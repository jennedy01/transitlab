/** Thin fetch wrapper around the TRANSITLAB API. */

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4010';

export interface HealthResponse {
  status: string;
  db: string;
  postgis: string | null;
  pgrouting: string | null;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Only send a JSON content-type when there's actually a body — avoids an
  // unnecessary CORS preflight on simple GETs.
  if (init.body != null) headers.set('Content-Type', 'application/json');
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    // Network-level failure (backend unreachable, CORS, DNS). Make it legible.
    throw new Error(`API unreachable at ${API_BASE} — is the backend running?`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.error ?? body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}

/** GeoJSON FeatureCollection (loosely typed for direct use as a map source). */
export type GeoJSONFC = { type: 'FeatureCollection'; features: unknown[] };

/** [west, south, east, north] in EPSG:4326. */
export type Bbox = [number, number, number, number];

function bboxParam(bbox?: Bbox): string {
  return bbox ? `?bbox=${bbox.join(',')}` : '';
}

export function getExistingLines(bbox?: Bbox): Promise<GeoJSONFC> {
  return apiFetch<GeoJSONFC>(`/api/reference/existing-lines${bboxParam(bbox)}`);
}

export function getExistingStations(bbox?: Bbox): Promise<GeoJSONFC> {
  return apiFetch<GeoJSONFC>(`/api/reference/existing-stations${bboxParam(bbox)}`);
}

export function getPopulation(bbox: Bbox): Promise<GeoJSONFC> {
  return apiFetch<GeoJSONFC>(`/api/reference/population${bboxParam(bbox)}`);
}

/* ----- Auth ---------------------------------------------------------------- */

import type {
  AuthResponse,
  Scheme,
  SchemeWithLines,
  RollingStock,
} from '@transitlab/shared';

export type { AuthResponse, Scheme, SchemeWithLines, RollingStock };

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export function register(email: string, password: string, displayName: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/* ----- Schemes ------------------------------------------------------------- */

export function listSchemes(): Promise<{ schemes: Scheme[] }> {
  return apiFetch('/api/schemes');
}

export function createScheme(name: string, description?: string): Promise<{ scheme: SchemeWithLines }> {
  return apiFetch('/api/schemes', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export function getScheme(id: string): Promise<{ scheme: SchemeWithLines }> {
  return apiFetch(`/api/schemes/${id}`);
}

export function patchScheme(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<{ scheme: Scheme }> {
  return apiFetch(`/api/schemes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteScheme(id: string): Promise<void> {
  await apiFetch<void>(`/api/schemes/${id}`, { method: 'DELETE' });
}

export function getRollingStock(): Promise<{ rollingStock: RollingStock[] }> {
  return apiFetch('/api/reference/rolling-stock');
}

/* ----- Lines --------------------------------------------------------------- */

import type { Line, LineUpsertRequest } from '@transitlab/shared';
export type { Line, LineUpsertRequest };

export function createLine(schemeId: string, body: LineUpsertRequest): Promise<{ line: Line }> {
  return apiFetch(`/api/schemes/${schemeId}/lines`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateLine(lineId: string, body: LineUpsertRequest): Promise<{ line: Line }> {
  return apiFetch(`/api/lines/${lineId}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteLine(lineId: string): Promise<void> {
  await apiFetch<void>(`/api/lines/${lineId}`, { method: 'DELETE' });
}

/* ----- Analysis ------------------------------------------------------------ */

import type { LineAnalysis, ConnectivityResult } from '@transitlab/shared';
export type { LineAnalysis, ConnectivityResult };

export function getLineAnalysis(
  lineId: string,
  opts: { walkRadius?: number; coverageBuffer?: number } = {},
): Promise<LineAnalysis> {
  const q = new URLSearchParams();
  if (opts.walkRadius) q.set('walkRadius', String(opts.walkRadius));
  if (opts.coverageBuffer) q.set('coverageBuffer', String(opts.coverageBuffer));
  const qs = q.toString();
  return apiFetch<LineAnalysis>(`/api/analysis/line/${lineId}${qs ? `?${qs}` : ''}`);
}

export function getConnectivity(lineId: string): Promise<{ connectivity: ConnectivityResult }> {
  return apiFetch(`/api/analysis/connectivity/${lineId}?proposed=1`);
}
