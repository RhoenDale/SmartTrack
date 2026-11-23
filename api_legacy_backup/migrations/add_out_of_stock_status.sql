-- Add a distinct product status for inventory with no sellable units.
ALTER TABLE products
  MODIFY status ENUM('good','moderate','low','critical','out_of_stock') NOT NULL DEFAULT 'good';

UPDATE products p
SET p.status = 'out_of_stock'
WHERE NOT EXISTS (
  SELECT 1
  FROM product_batches b
  WHERE b.product_id = p.id AND b.qty > 0
);