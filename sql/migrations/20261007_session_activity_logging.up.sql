-- Add the user session lifecycle and business activity fields without removing
-- legacy telemetry columns or existing session/activity history.
BEGIN;

ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS session_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS session_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

UPDATE user_sessions
SET session_start = COALESCE(session_start, started_at, NOW()),
    session_end = COALESCE(session_end, ended_at),
    duration_seconds = COALESCE(
        duration_seconds,
        CASE WHEN COALESCE(session_end, ended_at) IS NOT NULL
             THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(session_end, ended_at) - COALESCE(session_start, started_at))))::INTEGER)
             ELSE NULL
        END
    )
WHERE session_start IS NULL
   OR session_end IS DISTINCT FROM ended_at
   OR (ended_at IS NOT NULL AND duration_seconds IS NULL);

ALTER TABLE user_sessions
    ALTER COLUMN session_start SET DEFAULT NOW();

UPDATE user_sessions SET session_start = started_at WHERE session_start IS NULL;

ALTER TABLE user_sessions
    ALTER COLUMN session_start SET NOT NULL;

ALTER TABLE activity_logs
    ADD COLUMN IF NOT EXISTS action VARCHAR(100),
    ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS entity_id INTEGER,
    ADD COLUMN IF NOT EXISTS details JSONB;

UPDATE activity_logs
SET action = COALESCE(NULLIF(action, ''), NULLIF(event_type, ''), 'LEGACY_EVENT'),
    details = COALESCE(details, metadata, '{}'::jsonb)
WHERE action IS NULL OR details IS NULL;

ALTER TABLE activity_logs
    ALTER COLUMN action SET NOT NULL,
    ALTER COLUMN details SET DEFAULT '{}'::jsonb,
    ALTER COLUMN details SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.user_sessions'::regclass
          AND contype = 'f'
          AND confrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE user_sessions
            ADD CONSTRAINT user_sessions_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.activity_logs'::regclass
          AND contype = 'f'
          AND confrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE activity_logs
            ADD CONSTRAINT activity_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.activity_logs'::regclass
          AND contype = 'f'
          AND confrelid = 'public.user_sessions'::regclass
    ) THEN
        ALTER TABLE activity_logs
            ADD CONSTRAINT activity_logs_session_id_fkey
            FOREIGN KEY (session_id) REFERENCES user_sessions(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_sessions_session_start ON user_sessions(session_start DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

COMMIT;
