-- Explicit rollback only: this removes all captured activity/session history.
BEGIN;

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS user_sessions;

COMMIT;
