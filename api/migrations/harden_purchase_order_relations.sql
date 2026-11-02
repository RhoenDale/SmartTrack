-- Align purchase-order references with the application schema.
-- Back up the database and verify both counts are zero before running this once:
-- SELECT COUNT(*) AS orphan_order_items
-- FROM purchase_order_items i
-- LEFT JOIN purchase_orders po ON po.id = i.purchase_order_id
-- WHERE po.id IS NULL;
-- SELECT COUNT(*) AS orphan_order_products
-- FROM purchase_order_items i
-- LEFT JOIN products p ON p.id = i.product_id
-- WHERE p.id IS NULL;
-- SELECT COUNT(*) AS orphan_receipts
-- FROM purchase_order_receipts r
-- LEFT JOIN purchase_order_items i ON i.id = r.purchase_order_item_id
-- WHERE i.id IS NULL;
-- SELECT COUNT(*) AS orphan_receipt_products
-- FROM purchase_order_receipts r
-- LEFT JOIN products p ON p.id = r.product_id
-- WHERE p.id IS NULL;

-- Older route code cast U-prefixed user IDs to integers, storing unusable zeros.
-- Preserve valid references and clear only actor IDs that cannot match a user.
UPDATE purchase_orders po
LEFT JOIN users u ON u.id = CAST(po.created_by AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
SET po.created_by = NULL
WHERE po.created_by IS NOT NULL AND u.id IS NULL;

UPDATE purchase_order_receipts r
LEFT JOIN users u ON u.id = CAST(r.received_by AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
SET r.received_by = NULL
WHERE r.received_by IS NOT NULL AND u.id IS NULL;

ALTER TABLE purchase_orders
  MODIFY COLUMN created_by VARCHAR(10) NULL,
  ADD KEY idx_purchase_orders_created_by (created_by),
  ADD CONSTRAINT fk_purchase_orders_created_by
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE purchase_order_items
  MODIFY COLUMN product_id INT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_purchase_order_items_order
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_purchase_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT;

ALTER TABLE purchase_order_receipts
  MODIFY COLUMN product_id INT UNSIGNED NOT NULL,
  MODIFY COLUMN received_by VARCHAR(10) NULL,
  ADD KEY idx_purchase_receipts_received_by (received_by),
  ADD CONSTRAINT fk_purchase_receipts_item
    FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_purchase_receipts_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_receipts_received_by
    FOREIGN KEY (received_by) REFERENCES users (id) ON DELETE SET NULL;
