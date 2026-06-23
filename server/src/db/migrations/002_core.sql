-- ---------------------------------------------------------------------------
-- User-created planning data.
-- All geometry is stored in EPSG:4326; analysis queries reproject to 27700.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- We avoid the citext extension to keep the image portable; emails are lowercased
-- in the application layer and uniqueness is enforced case-insensitively here.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (lower(email));

CREATE TABLE IF NOT EXISTS schemes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schemes_user_idx ON schemes (user_id);

-- Reference rolling stock (seeded; read-only to users).
CREATE TABLE IF NOT EXISTS rolling_stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  mode          TEXT NOT NULL,
  gauge_mm      INTEGER NOT NULL DEFAULT 1435,
  max_speed_kph INTEGER NOT NULL,
  capacity      INTEGER NOT NULL,
  traction      TEXT NOT NULL,
  loading_gauge TEXT NOT NULL,
  source_key    TEXT UNIQUE                            -- idempotent seed upserts
);

CREATE TABLE IF NOT EXISTS lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id        UUID NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  colour           TEXT NOT NULL DEFAULT '#FFFFFF',
  mode             TEXT NOT NULL DEFAULT 'heavy_rail',
  gauge_mm         INTEGER NOT NULL DEFAULT 1435,
  electrification  TEXT NOT NULL DEFAULT 'ohle_25kv',
  rolling_stock_id UUID REFERENCES rolling_stock(id) ON DELETE SET NULL,
  geom             geometry(LineString, 4326),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lines_scheme_idx ON lines (scheme_id);
CREATE INDEX IF NOT EXISTS lines_geom_gist ON lines USING GIST (geom);

CREATE TABLE IF NOT EXISTS segments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id          UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  seq              INTEGER NOT NULL DEFAULT 0,
  structure_type   TEXT NOT NULL DEFAULT 'surface',
  track_count      INTEGER NOT NULL DEFAULT 2,
  max_speed_kph    INTEGER,
  start_chainage_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  end_chainage_m   DOUBLE PRECISION NOT NULL DEFAULT 0,
  geom             geometry(LineString, 4326)
);
CREATE INDEX IF NOT EXISTS segments_line_idx ON segments (line_id);
CREATE INDEX IF NOT EXISTS segments_geom_gist ON segments USING GIST (geom);

CREATE TABLE IF NOT EXISTS stations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id        UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  is_interchange BOOLEAN NOT NULL DEFAULT false,
  step_free      BOOLEAN NOT NULL DEFAULT false,
  chainage_m     DOUBLE PRECISION NOT NULL DEFAULT 0,
  geom           geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS stations_line_idx ON stations (line_id);
CREATE INDEX IF NOT EXISTS stations_geom_gist ON stations USING GIST (geom);

-- Touch updated_at on scheme/line changes.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schemes_touch ON schemes;
CREATE TRIGGER schemes_touch BEFORE UPDATE ON schemes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS lines_touch ON lines;
CREATE TRIGGER lines_touch BEFORE UPDATE ON lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
