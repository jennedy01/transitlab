-- ---------------------------------------------------------------------------
-- Seeded reference network (read-only to the user). Populated by seed scripts.
-- source_id provides idempotent upserts (unique per source).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS existing_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,                  -- 'tfl' | 'osm'
  source_id   TEXT NOT NULL,                  -- stable id within the source
  mode        TEXT NOT NULL,
  name        TEXT,
  operator    TEXT,
  electrified TEXT,
  gauge       TEXT,
  geom        geometry(LineString, 4326) NOT NULL,
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS existing_lines_geom_gist ON existing_lines USING GIST (geom);
CREATE INDEX IF NOT EXISTS existing_lines_mode_idx ON existing_lines (mode);

CREATE TABLE IF NOT EXISTS existing_stations (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source    TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name      TEXT,
  modes     TEXT[] NOT NULL DEFAULT '{}',
  geom      geometry(Point, 4326) NOT NULL,
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS existing_stations_geom_gist ON existing_stations USING GIST (geom);

CREATE TABLE IF NOT EXISTS population_areas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lsoa_code  TEXT NOT NULL UNIQUE,
  population INTEGER NOT NULL DEFAULT 0,
  density    DOUBLE PRECISION NOT NULL DEFAULT 0,   -- persons per hectare
  geom       geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS population_areas_geom_gist ON population_areas USING GIST (geom);
CREATE INDEX IF NOT EXISTS population_areas_density_idx ON population_areas (density);

-- ---------------------------------------------------------------------------
-- pgRouting topology for the existing network. Built/refreshed by the
-- connectivity analysis from existing_lines; declared here so the schema is
-- complete after migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_edges (
  id       BIGSERIAL PRIMARY KEY,
  source   BIGINT,
  target   BIGINT,
  cost     DOUBLE PRECISION,                  -- metres (EPSG:27700 length)
  reverse_cost DOUBLE PRECISION,
  mode     TEXT,
  geom     geometry(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS network_edges_geom_gist ON network_edges USING GIST (geom);
CREATE INDEX IF NOT EXISTS network_edges_source_idx ON network_edges (source);
CREATE INDEX IF NOT EXISTS network_edges_target_idx ON network_edges (target);
