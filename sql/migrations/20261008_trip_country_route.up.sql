-- Persist the ordered country itinerary independently of city destinations.
BEGIN;
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS country_route JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMIT;