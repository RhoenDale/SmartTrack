-- Supplier purchase and delivery tracking for existing SmartTrack databases.
-- Run once against the SmartTrack database before using the Purchases page.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier VARCHAR(120) NOT NULL,
  ordered_at DATE NOT NULL,
  expected_delivery_date DATE NULL,
  status ENUM('ordered', 'partially_received', 'received', 'cancelled') NOT NULL DEFAULT 'ordered',
  created_by VARCHAR(10) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_purchase_orders_supplier_date (supplier, ordered_at),
  KEY idx_purchase_orders_status (status),
  KEY idx_purchase_orders_created_by (created_by),
  CONSTRAINT fk_purchase_orders_created_by
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_id BIGINT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty_ordered INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_purchase_order_items_order (purchase_order_id),
  KEY idx_purchase_order_items_product (product_id),
  CONSTRAINT fk_purchase_order_items_order
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each row is one received batch, allowing an order line to arrive in parts.
CREATE TABLE IF NOT EXISTS purchase_order_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_item_id BIGINT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  batch_id VARCHAR(120) NOT NULL,
  qty_received INT UNSIGNED NOT NULL,
  received_date DATE NOT NULL,
  expiry_date DATE NULL,
  batch_total_cost DECIMAL(12,2) NULL,
  received_by VARCHAR(10) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_receipts_batch (batch_id),
  KEY idx_purchase_receipts_item (purchase_order_item_id),
  KEY idx_purchase_receipts_product_date (product_id, received_date),
  KEY idx_purchase_receipts_received_by (received_by),
  CONSTRAINT fk_purchase_receipts_item
    FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_receipts_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_receipts_received_by
    FOREIGN KEY (received_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
