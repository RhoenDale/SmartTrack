-- Three new pack-enabled pharmacy products.
-- Run add_product_packaging.sql before this script.
-- Batch qty values are base units, not number of packs.

START TRANSACTION;

INSERT INTO products
  (id, name, category, supplier, reorder, price, sale_price,
   unit_label, units_per_pack, pack_price, is_vat_exempt, status)
VALUES
  ('P010', 'Vitamin C 500mg', 'Supplement', 'Healthline Supplies',
    5, 6.50, 6.00, 'tablet', 20, 110.00, 0, 'good'),
  ('P011', 'Oral Rehydration Salts', 'Supplement', 'Medline Distributors',
  5, 12.00, NULL, 'sachet', 10, 110.00, 0, 'good'),
  ('P012', 'Loperamide 2mg', 'Antidiarrheal', 'PharmaSource',
  6, 4.50, NULL, 'tablet', 10, 40.00, 0, 'good');

INSERT INTO product_batches
  (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
VALUES
  ('P010-B1', 'P010', 400, '2028-06-30', '2026-09-25', 1600.00, 4.0000),
  ('P011-B1', 'P011', 300, '2028-03-31', '2026-09-25', 1800.00, 6.0000),
  ('P012-B1', 'P012', 240, '2028-01-31', '2026-09-25', 720.00, 3.0000);

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
WHERE p.id IN ('P010', 'P011', 'P012')
GROUP BY p.id, p.name, p.unit_label, p.units_per_pack
ORDER BY p.id;
