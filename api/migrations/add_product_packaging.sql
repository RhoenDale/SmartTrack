-- Product packaging and mixed unit sales
-- Inventory remains stored in base units. A pack/box sale deducts units_per_pack.
ALTER TABLE products
  ADD COLUMN unit_label VARCHAR(30) NOT NULL DEFAULT 'unit' AFTER sale_price,
  ADD COLUMN units_per_pack INT NOT NULL DEFAULT 1 AFTER unit_label,
  ADD COLUMN pack_price DECIMAL(10,2) NULL DEFAULT NULL AFTER units_per_pack;

ALTER TABLE transactions
  ADD COLUMN sale_qty INT NULL DEFAULT NULL AFTER qty,
  ADD COLUMN sale_unit VARCHAR(20) NOT NULL DEFAULT 'unit' AFTER sale_qty,
  ADD COLUMN units_per_sale INT NOT NULL DEFAULT 1 AFTER sale_unit;

-- Optional examples:
-- UPDATE products SET unit_label='tablet', units_per_pack=10, pack_price=95.00 WHERE id='P001';
-- UPDATE products SET unit_label='bottle', units_per_pack=6, pack_price=420.00 WHERE id='P002';

-- Configure pack contents for all existing products.
-- Only run this when every product uses the same pack size.
-- Change 10 to the actual number of base units inside each box/pack.
-- UPDATE products
-- SET units_per_pack = 10;

-- Use product-specific values when box sizes are different.
-- UPDATE products
-- SET units_per_pack = CASE id
--     WHEN 'P001' THEN 10
--     WHEN 'P002' THEN 6
--     WHEN 'P003' THEN 20
--     ELSE units_per_pack
-- END;

-- If existing reorder values were entered as base units, convert them to packs
-- after setting units_per_pack. Review the result before running this update.
-- UPDATE products
-- SET reorder = CEIL(reorder / units_per_pack)
-- WHERE units_per_pack > 1;

-- Check every product's full boxes, loose units, and total stock.
SELECT
  p.id,
  p.name,
  p.unit_label,
  p.units_per_pack,
  COALESCE(SUM(b.qty), 0) AS total_units,
  FLOOR(COALESCE(SUM(b.qty), 0) / p.units_per_pack) AS full_packs_or_boxes,
  MOD(COALESCE(SUM(b.qty), 0), p.units_per_pack) AS loose_units
FROM products p
LEFT JOIN product_batches b ON b.product_id = p.id
GROUP BY p.id, p.name, p.unit_label, p.units_per_pack
ORDER BY p.id;
