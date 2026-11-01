-- Apply pack settings and stock to the three base products.
-- Batch qty values are base units, not number of packs.

START TRANSACTION;

UPDATE products SET unit_label = 'tablet', units_per_pack = 20, pack_price = 110.00 WHERE id = 10;
UPDATE products SET unit_label = 'sachet', units_per_pack = 10, pack_price = 110.00 WHERE id = 11;
UPDATE products SET unit_label = 'tablet', units_per_pack = 10, pack_price = 40.00 WHERE id = 12;

INSERT IGNORE INTO product_batches
  (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
VALUES
  ('P010-B1', 10, 400, '2028-06-30', '2026-09-25', 1600.00, 4.0000),
  ('P011-B1', 11, 300, '2028-03-31', '2026-09-25', 1800.00, 6.0000),
  ('P012-B1', 12, 240, '2028-01-31', '2026-09-25', 720.00, 3.0000);

COMMIT;

-- Verify the inserted products and calculated pack stock.
SELECT
  p.id,
  p.name,
  p.unit_label,
  p.units_per_pack,
  COALESCE(SUM(b.qty), 0) AS total_units,
  FLOOR(COALESCE(SUM(b.qty), 0) / p.units_per_pack) AS full_packs,
  MOD(COALESCE(SUM(b.qty), 0), p.units_per_pack) AS loose_units
FROM products p
LEFT JOIN product_batches b ON b.product_id = p.id
WHERE p.id IN (10, 11, 12)
GROUP BY p.id, p.name, p.unit_label, p.units_per_pack
ORDER BY p.id;
