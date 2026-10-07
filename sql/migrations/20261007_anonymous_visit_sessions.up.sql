-- Add anonymous website visit identity and explicit creation time to the
-- existing session history without removing legacy columns or records.
BEGIN;

ALTER TABLE user_sessions
    ALTER COLUMN user_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS visitor_id UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE user_sessions
SET created_at = COALESCE(created_at, session_start, started_at, NOW())
WHERE created_at IS NULL;

ALTER TABLE user_sessions
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_visitor_id
    ON user_sessions (visitor_id, last_seen_at DESC)
    WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_open_last_seen
    ON user_sessions (last_seen_at)
    WHERE session_end IS NULL;

COMMIT;
