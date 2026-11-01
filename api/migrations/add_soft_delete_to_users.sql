-- Adds soft-delete support to the users table.
-- A deleted user is hidden from normal listing but can be restored or
-- permanently purged from the Recycle Bin in the Users → Settings tab.
--
-- Run once against the SmartTrack database before using the Recycle Bin feature.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by   VARCHAR(10) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delete_note  VARCHAR(255) NULL DEFAULT NULL;

-- Index so the listing query stays fast when filtering out deleted rows
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);
