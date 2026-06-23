-- Persist a display colour for reference lines (e.g. iconic TfL line colours),
-- so the map can render the existing network in its real liveries.
ALTER TABLE existing_lines ADD COLUMN IF NOT EXISTS colour TEXT;
