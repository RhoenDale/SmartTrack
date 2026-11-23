SET @discount_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'discount_amount'
);

SET @discount_migration_sql = IF(
  @discount_column_exists = 0,
  'ALTER TABLE transactions ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''Customer discount amount applied to this sale line'' AFTER amount',
  'SELECT ''transactions.discount_amount already exists'' AS migration_status'
);

PREPARE discount_migration FROM @discount_migration_sql;
EXECUTE discount_migration;
DEALLOCATE PREPARE discount_migration;