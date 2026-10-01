-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Move supplier cost from products to product_batches
--
-- Each batch has a total cost paid to the supplier for that delivery.
-- unit_cost is COMPUTED as batch_total_cost / original_qty — stored in the
-- batch row so it never changes even when qty is later deducted by sales.
--
-- Run this ONCE against your existing SmartTrack database.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add batch_total_cost and unit_cost columns to product_batches
ALTER TABLE `product_batches`
  ADD COLUMN `batch_total_cost` DECIMAL(12,2) NULL DEFAULT NULL
    COMMENT 'Total amount paid to supplier for this entire batch'
    AFTER `received_date`,
  ADD COLUMN `unit_cost` DECIMAL(10,4) NULL DEFAULT NULL
    COMMENT 'Cost per unit = batch_total_cost / original qty at time of receipt'
    AFTER `batch_total_cost`;

-- Step 2: Remove supplier_price from products (it now lives on batches)
-- (Only run if your DB already has this column from a previous migration)
ALTER TABLE `products`
  DROP COLUMN IF EXISTS `supplier_price`;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Seed batch costs for all 10 existing batches
--
-- Formula used: realistic pharmacy wholesale costs for Tangub Pharmacy
--
--   P001 Amoxicillin 500mg   — 284 units — batch cost ₱1,704.00 — unit ₱6.00
--   P002 Paracetamol 500mg   — 1240 units — batch cost ₱1,860.00 — unit ₱1.50
--   P003 Metformin 500mg     — 38 units  — batch cost ₱114.00   — unit ₱3.00
--   P004 Amlodipine 5mg      — 156 units — batch cost ₱702.00   — unit ₱4.50
--   P005 Cetirizine 10mg     — 22 units  — batch cost ₱77.00    — unit ₱3.50
--   P006 Omeprazole 20mg     — 203 units — batch cost ₱1,218.00 — unit ₱6.00
--   P007 Losartan 50mg       — 89 units  — batch cost ₱623.00   — unit ₱7.00
--   P008 Ibuprofen 400mg     — 445 units — batch cost ₱2,225.00 — unit ₱5.00
--   P009 Salbutamol Inhaler  — 14 units  — batch cost ₱1,680.00 — unit ₱120.00
--   P010 Vitamin C 500mg     — 892 units — batch cost ₱1,338.00 — unit ₱1.50
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE `product_batches` SET `batch_total_cost` = 1704.00,  `unit_cost` = 6.0000  WHERE `batch_id` = 'P001-B1';
UPDATE `product_batches` SET `batch_total_cost` = 1860.00,  `unit_cost` = 1.5000  WHERE `batch_id` = 'P002-B1';
UPDATE `product_batches` SET `batch_total_cost` = 114.00,   `unit_cost` = 3.0000  WHERE `batch_id` = 'P003-B1';
UPDATE `product_batches` SET `batch_total_cost` = 702.00,   `unit_cost` = 4.5000  WHERE `batch_id` = 'P004-B1';
UPDATE `product_batches` SET `batch_total_cost` = 77.00,    `unit_cost` = 3.5000  WHERE `batch_id` = 'P005-B1';
UPDATE `product_batches` SET `batch_total_cost` = 1218.00,  `unit_cost` = 6.0000  WHERE `batch_id` = 'P006-B1';
UPDATE `product_batches` SET `batch_total_cost` = 623.00,   `unit_cost` = 7.0000  WHERE `batch_id` = 'P007-B1';
UPDATE `product_batches` SET `batch_total_cost` = 2225.00,  `unit_cost` = 5.0000  WHERE `batch_id` = 'P008-B1';
UPDATE `product_batches` SET `batch_total_cost` = 1680.00,  `unit_cost` = 120.0000 WHERE `batch_id` = 'P009-B1';
UPDATE `product_batches` SET `batch_total_cost` = 1338.00,  `unit_cost` = 1.5000  WHERE `batch_id` = 'P010-B1';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query — run after migration to confirm data:
-- SELECT batch_id, product_id, qty, batch_total_cost, unit_cost,
--        ROUND(batch_total_cost / unit_cost, 0) AS original_qty_check
-- FROM product_batches ORDER BY batch_id;
-- ─────────────────────────────────────────────────────────────────────────────
