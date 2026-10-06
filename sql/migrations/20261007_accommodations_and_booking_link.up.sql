BEGIN;

ALTER TABLE destinations ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS region VARCHAR(150);
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS country VARCHAR(150);

CREATE TABLE IF NOT EXISTS accommodations (
    id             SERIAL PRIMARY KEY,
    country        VARCHAR(150) NOT NULL,
    area           VARCHAR(150) NOT NULL,
    name           VARCHAR(180) NOT NULL,
    address        TEXT,
    price          DECIMAL(10, 2),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_accommodations_location_active
    ON accommodations(country, area, is_active);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS accommodation_id INTEGER
    REFERENCES accommodations(id) ON DELETE RESTRICT;

COMMIT;
