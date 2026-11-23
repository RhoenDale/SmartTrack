-- Migration: Create roles table and allow custom roles in users table
ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) DEFAULT '',
  `permissions` LONGTEXT DEFAULT NULL,
  `is_system` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`id`, `name`, `description`, `permissions`, `is_system`)
VALUES
  ('admin/owner', 'Admin / Owner', 'Full system access and store ownership controls', '["dashboard","inventory","stock-alerts","transactions","analytics","reports","returns","financial","purchases","users"]', 1),
  ('admin', 'Admin', 'Administrative store management and user maintenance', '["dashboard","inventory","stock-alerts","transactions","analytics","reports","returns","financial","purchases","users"]', 1),
  ('inventory_manager', 'Inventory Manager', 'Manages products, stocks, batches, purchase orders, and returns', '["dashboard","inventory","stock-alerts","reports","returns","purchases"]', 1),
  ('cashier', 'Cashier / Pharmacist', 'Point of sale, dispensing medicines, and sales transactions', '["dashboard","inventory","stock-alerts","transactions","analytics","reports"]', 1)
ON DUPLICATE KEY UPDATE 
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `permissions` = VALUES(`permissions`),
  `is_system` = VALUES(`is_system`);

