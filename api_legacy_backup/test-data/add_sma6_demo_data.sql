-- TEMPORARY TEST DATA ONLY. Do not treat these transactions as pharmacy sales.
-- Adds one clearly named test product with 9 monthly sales periods (Jan-Sep 2026).
-- This lets Analytics show SMA-3, full SMA-6, and 3 shared past comparisons.
-- To remove it after testing, run remove_sma6_demo_data.sql.

START TRANSACTION;

-- Make this seed repeatable by removing only its own uniquely marked records.
DELETE tb FROM transaction_batches tb
JOIN transactions t ON t.id = tb.transaction_id
WHERE t.note = 'SMA6_TEST_ONLY';

DELETE FROM transactions WHERE note = 'SMA6_TEST_ONLY';

DELETE n FROM notifications n
JOIN products p ON p.id = n.product_id
WHERE p.barcode = 'SMA6-TEST-ONLY';

DELETE pcm FROM product_category_map pcm
JOIN products p ON p.id = pcm.product_id
WHERE p.barcode = 'SMA6-TEST-ONLY';

DELETE b FROM product_batches b
JOIN products p ON p.id = b.product_id
WHERE p.barcode = 'SMA6-TEST-ONLY';

DELETE FROM products WHERE barcode = 'SMA6-TEST-ONLY';

INSERT INTO products
  (barcode, name, supplier, reorder, price, sale_price, unit_label,
   units_per_pack, pack_price, status)
VALUES
  ('SMA6-TEST-ONLY', 'SMA-6 TEST ITEM - REMOVE AFTER TEST', 'TEST DATA ONLY',
   100, 100.00, NULL, 'unit', 1, NULL, 'good');

SET @sma6_test_product_id = LAST_INSERT_ID();

INSERT INTO product_category_map (product_id, category_id)
SELECT @sma6_test_product_id, id FROM categories WHERE name = 'Analgesic' LIMIT 1;

INSERT INTO product_batches
  (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
VALUES
  ('SMA6-TEST-BATCH', @sma6_test_product_id, 1000, '2028-12-31', '2026-01-01', 50000.00, 50.0000);

INSERT INTO transactions
  (id, type, sale_group_id, product_name, product_id, qty, sale_qty,
   sale_unit, units_per_sale, amount, discount_amount, pre_tax_amount,
   tax_amount, tax_rate, staff, staff_id, status, note, transacted_at)
SELECT
  CONCAT('SMA6TEST', DATE_FORMAT(s.period, '%Y%m')),
  'sale',
  CONCAT('SMA6TEST', DATE_FORMAT(s.period, '%Y%m')),
  p.name,
  p.id,
  s.qty,
  s.qty,
  'unit',
  1,
  ROUND(p.price * s.qty, 2),
  0.00,
  ROUND((p.price * s.qty) / 1.12, 2),
  ROUND((p.price * s.qty) - ((p.price * s.qty) / 1.12), 2),
  0.1200,
  'SMA-6 TEST DATA',
  NULL,
  'completed',
  'SMA6_TEST_ONLY',
  s.period
FROM (
  SELECT CAST('2026-01-15 12:00:00' AS DATETIME) AS period, 20 AS qty UNION ALL
  SELECT '2026-02-15 12:00:00', 25 UNION ALL
  SELECT '2026-03-15 12:00:00', 30 UNION ALL
  SELECT '2026-04-15 12:00:00', 40 UNION ALL
  SELECT '2026-05-15 12:00:00', 45 UNION ALL
  SELECT '2026-06-15 12:00:00', 50 UNION ALL
  SELECT '2026-07-15 12:00:00', 60 UNION ALL
  SELECT '2026-08-15 12:00:00', 55 UNION ALL
  SELECT '2026-09-15 12:00:00', 65
) AS s
JOIN products p ON p.id = @sma6_test_product_id;

COMMIT;

-- Expected when filtering Analytics to the test product:
-- SMA-3 next-period estimate: 60 units (60 + 55 + 65) / 3
-- SMA-6 next-period estimate: 53 units (40 + 45 + 50 + 60 + 55 + 65) / 6
-- Three past periods can be compared for each model.
