-- Global, destination-specific recommendation catalog. Unlike `activities`,
-- these records are not tied to a trip destination or vendor offer.
CREATE TABLE IF NOT EXISTS activity_recommendations (
  id BIGSERIAL PRIMARY KEY,
  country VARCHAR(150) NOT NULL,
  destination_name VARCHAR(150) NOT NULL,
  destination_aliases TEXT[] NOT NULL DEFAULT '{}',
  title VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL,
  category_type VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_recommendations_place_title_uq
  ON activity_recommendations (
    LOWER(country),
    REGEXP_REPLACE(LOWER(destination_name), '[^a-z0-9]+', '', 'g'),
    REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '', 'g')
  );

CREATE INDEX IF NOT EXISTS activity_recommendations_location_idx
  ON activity_recommendations (LOWER(country), LOWER(destination_name));
