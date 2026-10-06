BEGIN;

ALTER TABLE destinations
    ADD COLUMN IF NOT EXISTS accommodation_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'destinations_accommodation_id_fkey'
          AND conrelid = 'destinations'::regclass
    ) THEN
        ALTER TABLE destinations
            ADD CONSTRAINT destinations_accommodation_id_fkey
            FOREIGN KEY (accommodation_id)
            REFERENCES accommodations(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_destinations_accommodation_id
    ON destinations(accommodation_id);

COMMIT;
