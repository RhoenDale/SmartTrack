-- Convert products.id from legacy string IDs to an auto-incrementing integer,
-- preserve references, and add a separate unique barcode field.
-- Back up the smarttrack database before running this one-time migration.

CREATE TEMPORARY TABLE product_id_map (
  legacy_id VARCHAR(20) NOT NULL,
  new_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (legacy_id),
  UNIQUE KEY uq_product_id_map_new_id (new_id)
) ENGINE=InnoDB;

INSERT INTO product_id_map (legacy_id)
SELECT id FROM products ORDER BY id;

ALTER TABLE products
  ADD COLUMN barcode VARCHAR(64) NULL AFTER id,
  ADD UNIQUE KEY uq_products_barcode (barcode),
  ADD COLUMN migrated_id INT UNSIGNED NULL;

UPDATE products p
JOIN product_id_map m ON m.legacy_id = p.id
SET p.migrated_id = m.new_id;

ALTER TABLE product_batches
  DROP FOREIGN KEY fk_batch_product,
  DROP INDEX idx_product_fifo,
  ADD COLUMN migrated_product_id INT UNSIGNED NULL;

UPDATE product_batches b
JOIN product_id_map m ON m.legacy_id = b.product_id
SET b.migrated_product_id = m.new_id;

ALTER TABLE transactions
  DROP INDEX idx_tx_product,
  ADD COLUMN migrated_product_id INT UNSIGNED NULL;

UPDATE transactions t
JOIN product_id_map m ON m.legacy_id = t.product_id
SET t.migrated_product_id = m.new_id;

ALTER TABLE notifications
  ADD COLUMN migrated_product_id INT UNSIGNED NULL;

UPDATE notifications n
JOIN product_id_map m ON m.legacy_id = n.product_id
SET n.migrated_product_id = m.new_id;

ALTER TABLE products
  DROP PRIMARY KEY,
  DROP COLUMN id,
  CHANGE COLUMN migrated_id id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (id);

ALTER TABLE product_batches
  DROP COLUMN product_id,
  CHANGE COLUMN migrated_product_id product_id INT UNSIGNED NOT NULL,
  ADD KEY idx_product_fifo (product_id, received_date),
  ADD CONSTRAINT fk_batch_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE transactions
  DROP COLUMN product_id,
  CHANGE COLUMN migrated_product_id product_id INT UNSIGNED NULL,
  ADD KEY idx_tx_product (product_id);

ALTER TABLE notifications
  DROP COLUMN product_id,
  CHANGE COLUMN migrated_product_id product_id INT UNSIGNED NULL;

DROP TEMPORARY TABLE product_id_map;

SELECT id, barcode, name FROM products ORDER BY id;