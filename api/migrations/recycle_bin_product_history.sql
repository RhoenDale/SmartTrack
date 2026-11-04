-- Back up the smarttrack database before applying this migration.
-- Apply create_supplier_purchase_orders.sql and
-- harden_purchase_order_relations.sql first.
--
-- This preserves purchase-order line names while allowing permanently purged
-- products to be unlinked from historical orders and receipts.
--
-- If a previous attempt already added product_name_snapshot, skip the
-- ADD COLUMN and UPDATE statements and continue at the first ALTER TABLE
-- purchase_order_items below.

ALTER TABLE purchase_order_items
  ADD COLUMN product_name_snapshot VARCHAR(255) NULL AFTER product_id;

UPDATE purchase_order_items i
JOIN products p ON p.id = i.product_id
SET i.product_name_snapshot = p.name;

ALTER TABLE purchase_order_items
  MODIFY COLUMN product_name_snapshot VARCHAR(255) NOT NULL,
  MODIFY COLUMN product_id INT UNSIGNED NULL,
  DROP FOREIGN KEY fk_purchase_order_items_product,
  ADD CONSTRAINT fk_purchase_order_items_product_purge
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;

ALTER TABLE purchase_order_receipts
  MODIFY COLUMN product_id INT UNSIGNED NULL,
  DROP FOREIGN KEY fk_purchase_receipts_product,
  ADD CONSTRAINT fk_purchase_receipts_product_purge
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL;
