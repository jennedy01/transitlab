-- Required spatial + routing extensions.
-- The pgrouting/pgrouting image ships all of these.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;
-- fuzzystrmatch supports name matching when reconciling station names.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
