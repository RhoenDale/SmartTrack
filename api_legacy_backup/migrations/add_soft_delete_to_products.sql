-- Adds soft-delete support to the products table.
-- Run once against the SmartTrack database.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by   VARCHAR(10) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delete_note  VARCHAR(255) NULL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products (deleted_at);
