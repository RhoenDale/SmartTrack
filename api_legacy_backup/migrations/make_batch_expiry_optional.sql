-- Allow products with no expiry date and preserve optional expiry in sale history.
ALTER TABLE `product_batches`
  MODIFY COLUMN `expiry_date` DATE NULL DEFAULT NULL;

ALTER TABLE `transaction_batches`
  MODIFY COLUMN `expiry_date` DATE NULL DEFAULT NULL;
