-- Former (closed/abandoned) railways — the "pre-Beeching" network, sourced from
-- OpenStreetMap's abandoned/disused/dismantled railway mapping. Reference data,
-- read-only to the user.
CREATE TABLE IF NOT EXISTS historic_lines (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source    TEXT NOT NULL,                 -- 'osm'
  source_id TEXT NOT NULL,                 -- e.g. 'way/12345'
  kind      TEXT,                          -- abandoned | disused | dismantled | razed
  name      TEXT,
  geom      geometry(LineString, 4326) NOT NULL,
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS historic_lines_geom_gist ON historic_lines USING GIST (geom);
