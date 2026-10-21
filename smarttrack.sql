-- ============================================================
--  SmartTrack — MySQL Database Schema + Seed Data
--  Database : smarttrack
--  Compatible: MySQL 5.7+ / MariaDB 10.3+
--  Run this in phpMyAdmin or via mysql -u root < smarttrack.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS `smarttrack`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `smarttrack`;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`         VARCHAR(10)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `role`       ENUM('admin/owner','admin','inventory_manager','cashier') NOT NULL,
  `email`      VARCHAR(120) NOT NULL UNIQUE,
  `password`   VARCHAR(255) NOT NULL,  -- bcrypt hash
  `position`   VARCHAR(80)  NOT NULL DEFAULT '',
  `initials`   VARCHAR(5)   NOT NULL DEFAULT '',
  `status`     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `last_login` DATETIME     NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- ─── Bearer Authentication Tokens ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `user_id`    VARCHAR(20)  NOT NULL,
  `token`      VARCHAR(128) NOT NULL UNIQUE,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auth_user` (`user_id`),
  KEY `idx_auth_expires` (`expires_at`),
  CONSTRAINT `fk_auth_token_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Tax Settings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tax_settings` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(60)   NOT NULL UNIQUE,
  `value`       VARCHAR(255)  NOT NULL,
  `description` VARCHAR(255)  NOT NULL DEFAULT '',
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- ─── Products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `products` (
  `id`           INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `barcode`      VARCHAR(64)    NULL,
  `name`         VARCHAR(150)   NOT NULL,
  `supplier`     VARCHAR(120)   NOT NULL DEFAULT '',
  `reorder`      INT            NOT NULL DEFAULT 0,
  `price`        DECIMAL(10,2)  NOT NULL DEFAULT 0.00  COMMENT 'VAT-inclusive selling price',
  `sale_price`   DECIMAL(10,2)  NULL                   COMMENT 'Discounted VAT-inclusive price (optional)',
  `unit_label`   VARCHAR(30)    NOT NULL DEFAULT 'unit',
  `units_per_pack` INT          NOT NULL DEFAULT 1,
  `pack_price`   DECIMAL(10,2)  NULL DEFAULT NULL,
  `is_vat_exempt` TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '1=VAT-exempt, 0=standard 12% VAT',
  `status`       ENUM('good','moderate','low','critical','out_of_stock') NOT NULL DEFAULT 'good',
  `created_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_barcode` (`barcode`)
) ENGINE=InnoDB;

-- ─── Product Batches (FIFO) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `product_batches` (
  `id`              INT            NOT NULL AUTO_INCREMENT,
  `batch_id`        VARCHAR(30)    NOT NULL UNIQUE,
  `product_id`      INT UNSIGNED   NOT NULL,
  `qty`             INT            NOT NULL DEFAULT 0,
  `expiry_date`     DATE           NULL DEFAULT NULL,
  `received_date`   DATE           NOT NULL,
  `batch_total_cost` DECIMAL(12,2) NULL DEFAULT NULL
    COMMENT 'Total amount paid to supplier for this entire batch',
  `unit_cost`       DECIMAL(10,4)  NULL DEFAULT NULL
    COMMENT 'Cost per unit = batch_total_cost / original qty at receipt',
  `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_fifo` (`product_id`, `received_date`),
  CONSTRAINT `fk_batch_product`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Categories ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`   INT         NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL UNIQUE,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- ─── Product Categories (many-to-many) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `product_category_map` (
  `product_id`   INT UNSIGNED NOT NULL,
  `category_id`  INT          NOT NULL,
  PRIMARY KEY (`product_id`, `category_id`),
  KEY `idx_product_category_category` (`category_id`),
  CONSTRAINT `fk_product_category_product`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_category_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `transactions` (
  `id`                 VARCHAR(20)   NOT NULL,
  `type`               ENUM('sale','return','adjustment') NOT NULL,
  `sale_group_id`      VARCHAR(20)   NULL,
  `product_name`       VARCHAR(150)  NOT NULL,
  `product_id`         INT UNSIGNED  NULL,
  `qty`                INT           NOT NULL DEFAULT 0,
  `sale_qty`           INT           NULL DEFAULT NULL,
  `sale_unit`          VARCHAR(20)   NOT NULL DEFAULT 'unit',
  `units_per_sale`     INT           NOT NULL DEFAULT 1,
  `amount`             DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Total VAT-inclusive amount',
  `discount_amount`    DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Customer discount amount applied to this sale line',
  `pre_tax_amount`     DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Net amount before VAT',
  `tax_amount`         DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'VAT collected',
  `tax_rate`           DECIMAL(5,4)  NOT NULL DEFAULT 0.1200 COMMENT 'VAT rate at time of sale',
  `staff`              VARCHAR(80)   NOT NULL DEFAULT '',
  `staff_id`           VARCHAR(20)   NULL,
  `status`             ENUM('completed') NOT NULL DEFAULT 'completed',
  `note`               TEXT          NULL,
  `returned_tx_id`     VARCHAR(20)   NULL,
  `adjustment_reason`  TEXT          NULL,
  `damaged_qty`        INT           NULL DEFAULT 0,
  `transacted_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tx_product` (`product_id`),
  KEY `idx_tx_group`   (`sale_group_id`),
  KEY `idx_tx_type`    (`type`),
  KEY `idx_tx_date`    (`transacted_at`),
  KEY `idx_tx_staff`   (`staff_id`),
  CONSTRAINT `fk_tx_staff` FOREIGN KEY (`staff_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─── Transaction Batches Consumed (FIFO audit trail) ──────────────────────────
CREATE TABLE IF NOT EXISTS `transaction_batches` (
  `id`             INT         NOT NULL AUTO_INCREMENT,
  `transaction_id` VARCHAR(20) NOT NULL,
  `batch_id`       VARCHAR(30) NOT NULL,
  `expiry_date`    DATE        NULL DEFAULT NULL,
  `qty`            INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_txbatch_tx` (`transaction_id`),
  CONSTRAINT `fk_txbatch_tx`
    FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Return Dispositions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `return_dispositions` (
  `return_tx_id`   VARCHAR(20) NOT NULL,
  `sale_tx_id`     VARCHAR(20) NOT NULL,
  `product_id`     INT UNSIGNED NOT NULL,
  `qty`            INT NOT NULL,
  `reason`         TEXT NOT NULL,
  `batch_id`       VARCHAR(30) NULL,
  `expiry_date`    DATE NULL,
  `disposition`    ENUM('pending','restocked','broken') NOT NULL DEFAULT 'pending',
  `processed_by`   VARCHAR(20) NULL,
  `processed_at`   DATETIME NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`return_tx_id`),
  KEY `idx_return_disposition_status` (`disposition`, `created_at`),
  KEY `idx_return_disposition_sale` (`sale_tx_id`),
  CONSTRAINT `fk_return_disposition_tx`
    FOREIGN KEY (`return_tx_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_return_disposition_sale`
    FOREIGN KEY (`sale_tx_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_return_disposition_product`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_return_disposition_user`
    FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `type`       ENUM('alert','order','info') NOT NULL DEFAULT 'info',
  `title`      VARCHAR(200) NOT NULL,
  `body`       TEXT         NOT NULL,
  `product_id` INT UNSIGNED NULL,
  `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_read` (`is_read`)
) ENGINE=InnoDB;

-- ============================================================
--  SEED DATA
-- ============================================================

-- Users (correct bcrypt hashes)
INSERT INTO `users` (`id`,`name`,`role`,`email`,`password`,`position`,`initials`,`status`,`last_login`) VALUES
('U101','Paterno Amamio Jr.','admin/owner','admin@tangub.ph',
  '$2y$10$EGceOOYVO4p89Egxe5V73ug0J22I.PX4cj/vwYVypq5JCVcmdKxny',
  'Owner / System Administrator','PA','active','2025-06-25 09:00:00'),
('U002','Maria Santos','inventory_manager','inv@tangub.ph',
  '$2y$10$Ufy9AxKQInb2hN8MzmXAlOyKOakDTOyyLodiyUU.pO6I4nFI5SIdi',
  'Inventory Manager','MS','active','2025-06-25 08:45:00'),
('U003','Juan Dela Cruz','cashier','cashier@tangub.ph',
  '$2y$10$4JHuZTr0AkKhKwwLvUvhX.lnJ7ffYHYb1jbSAulmWdR5oINCBtINq',
  'Cashier / Pharmacist','JD','active','2025-06-24 17:30:00'),
('U004','Ana Reyes','cashier','a.reyes@tangub.ph',
  '$2y$10$4JHuZTr0AkKhKwwLvUvhX.lnJ7ffYHYb1jbSAulmWdR5oINCBtINq',
  'Cashier / Pharmacist','AR','active','2025-06-25 09:15:00'),
('U005','Carlos Mendoza','cashier','c.mendoza@tangub.ph',
  '$2y$10$4JHuZTr0AkKhKwwLvUvhX.lnJ7ffYHYb1jbSAulmWdR5oINCBtINq',
  'Cashier / Pharmacist','CM','inactive','2025-06-20 14:00:00');

-- Categories
INSERT INTO `categories` (`name`) VALUES
('Antibiotic'),('Analgesic'),('Antidiabetic'),('Antihypertensive'),
('Antihistamine'),('Antacid'),('NSAID'),('Bronchodilator'),('Supplement');
INSERT IGNORE INTO `categories` (`name`) VALUES ('Antidiarrheal');

-- Tax Settings (BIR Philippines standard)
INSERT INTO `tax_settings` (`setting_key`, `value`, `description`) VALUES
  ('vat_rate',         '12',                              'Standard VAT rate in percent'),
  ('vat_enabled',      '1',                               '1=VAT enabled, 0=disabled'),
  ('business_tin',     '123-456-789-000',                 'BIR Tax Identification Number'),
  ('business_name',    'Tangub Pharmacy',                 'Business name on receipts'),
  ('business_address', 'Tangub City, Misamis Occidental', 'Business address on receipts'),
  ('or_prefix',        'OR-',                             'Official Receipt prefix');

-- Products  (is_vat_exempt: Analgesics, Antidiabetics, Antihypertensives = 1 per BIR guidelines)
INSERT INTO `products`
  (`id`,`name`,`supplier`,`reorder`,`price`,`sale_price`,
   `unit_label`,`units_per_pack`,`pack_price`,`is_vat_exempt`,`status`) VALUES
(1,'Amoxicillin 500mg',  'Apex Pharma',          50,  8.50, 6.00, 'capsule', 1, NULL,   0,'good'),
(2,'Paracetamol 500mg',  'Medline Distributors', 200, 2.50, NULL, 'tablet',  1, NULL,   1,'good'),
(3,'Metformin 500mg',    'PharmaSource',         100, 4.20, NULL, 'tablet',  1, NULL,   1,'low'),
(4,'Amlodipine 5mg',     'Apex Pharma',           80, 6.75, NULL, 'tablet',  1, NULL,   1,'good'),
(5,'Cetirizine 10mg',    'Healthline Supplies',   60, 5.00, NULL, 'tablet',  1, NULL,   0,'low'),
(6,'Omeprazole 20mg',    'GlobeMed Traders',      100, 9.80, NULL, 'capsule', 1, NULL,   0,'good'),
(7,'Losartan 50mg',      'MetroPharm',             80,11.20, NULL, 'tablet',  1, NULL,   1,'moderate'),
(8,'Ibuprofen 400mg',   'PharmaSource',          150, 7.30, NULL, 'tablet',  1, NULL,   0,'good'),
(9,'Salbutamol Inhaler', 'Medline Distributors',   30,210.00,NULL, 'inhaler', 1, NULL,   0,'critical'),
(10,'Vitamin C 500mg',    'Healthline Supplies',    5,  6.50, 6.00, 'tablet', 20, 110.00, 0,'good'),
(11,'Oral Rehydration Salts','Medline Distributors',5, 12.00, NULL, 'sachet', 10, 110.00, 0,'good'),
(12,'Loperamide 2mg',    'PharmaSource',            6,  4.50, NULL, 'tablet', 10,  40.00, 0,'good');

INSERT IGNORE INTO `product_category_map` (`product_id`, `category_id`)
SELECT product_id, id FROM (
  SELECT 1 AS product_id, 'Antibiotic' AS category_name UNION ALL
  SELECT 2, 'Analgesic' UNION ALL SELECT 3, 'Antidiabetic' UNION ALL
  SELECT 4, 'Antihypertensive' UNION ALL SELECT 5, 'Antihistamine' UNION ALL
  SELECT 6, 'Antacid' UNION ALL SELECT 7, 'Antihypertensive' UNION ALL
  SELECT 8, 'NSAID' UNION ALL SELECT 9, 'Bronchodilator' UNION ALL
  SELECT 10, 'Supplement' UNION ALL SELECT 11, 'Supplement' UNION ALL
  SELECT 12, 'Antidiarrheal'
) seeded_categories
JOIN `categories` ON `categories`.`name` = seeded_categories.category_name;

-- Product Batches (one batch per product as initial stock)
INSERT INTO `product_batches` (`batch_id`,`product_id`,`qty`,`expiry_date`,`received_date`,`batch_total_cost`,`unit_cost`) VALUES
('P001-B1',1, 284,'2026-08-01','2025-06-01', 1704.00,  6.0000),
('P002-B1',2,1240,'2027-03-01','2025-06-01', 1860.00,  1.5000),
('P003-B1',3,  38,'2026-11-01','2025-06-01',  114.00,  3.0000),
('P004-B1',4, 156,'2027-01-01','2025-06-01',  702.00,  4.5000),
('P005-B1',5,  22,'2026-09-01','2025-06-01',   77.00,  3.5000),
('P006-B1',6, 203,'2026-12-01','2025-06-01', 1218.00,  6.0000),
('P007-B1',7,  89,'2027-04-01','2025-06-01',  623.00,  7.0000),
('P008-B1',8, 445,'2027-02-01','2025-06-01', 2225.00,  5.0000),
('P009-B1',9,  14,'2027-12-01','2025-06-01', 1680.00,120.0000),
('P010-B1',10, 892,'2027-06-01','2025-06-01', 1338.00,  1.5000),
('P011-B1',11, 300,'2028-03-31','2026-09-25', 1800.00,  6.0000),
('P012-B1',12, 240,'2028-01-31','2026-09-25',  720.00,  3.0000);

-- Add a second batch for the seeded products in the requested P010-P012 range.
INSERT IGNORE INTO `product_batches`
  (`batch_id`,`product_id`,`qty`,`expiry_date`,`received_date`,`batch_total_cost`,`unit_cost`) VALUES
('SEED-EXTRA-P010',10,200,'2029-02-28','2026-09-28', 300.00, 1.5000),
('SEED-EXTRA-P011',11,120,'2029-09-30','2026-09-28', 720.00, 6.0000),
('SEED-EXTRA-P012',12,100,'2030-04-30','2026-09-28', 300.00, 3.0000);

-- Transactions (with VAT tax breakdown)
-- VAT-exempt products (P002 Paracetamol, P003 Metformin, P004 Amlodipine, P007 Losartan):
--   pre_tax_amount = amount, tax_amount = 0, tax_rate = 0
-- VAT-inclusive products (P001 Amoxicillin, P006 Omeprazole, P010 Vitamin C etc.):
--   pre_tax_amount = amount / 1.12, tax_amount = amount - pre_tax_amount, tax_rate = 0.12
INSERT INTO `transactions`
  (`id`,`type`,`product_name`,`product_id`,`qty`,`amount`,`pre_tax_amount`,`tax_amount`,`tax_rate`,`staff`,`status`,`transacted_at`) VALUES
-- VAT-inclusive sales (Antibiotic, Antacid, Supplement, NSAID, Bronchodilator)
('TXN-1201','sale','Amoxicillin 500mg', 1,10,  85.00, 75.89,  9.11,0.1200,'M. Santos',   'completed','2025-06-25 09:14:00'),
('TXN-1203','sale','Omeprazole 20mg',   6,14, 137.20,122.50, 14.70,0.1200,'M. Santos',   'completed','2025-06-25 10:45:00'),
('TXN-1204','sale','Vitamin C 500mg',  10,30,  96.00, 85.71, 10.29,0.1200,'A. Reyes',    'completed','2025-06-25 11:12:00'),
('TXN-9743','sale','Paracetamol 500mg', 2, 1,   2.50,  2.50,  0.00,0.0000,'R. Dela Cruz','completed','2026-08-17 20:20:00'),
('TXN-F843','sale','Metformin 500mg',   3, 1,   4.20,  4.20,  0.00,0.0000,'R. Dela Cruz','completed','2026-08-17 20:26:00'),
('TXN-4D06','sale','Amoxicillin 500mg', 1, 5,  30.00, 26.79,  3.21,0.1200,'R. Dela Cruz','completed','2026-08-17 20:42:00'),
-- VAT-exempt sales (Antidiabetic, Antihypertensive, Analgesic)
('TXN-1202','sale','Paracetamol 500mg', 2,20,  50.00, 50.00,  0.00,0.0000,'J. Dela Cruz','completed','2025-06-25 09:32:00'),
('TXN-1205','sale','Amlodipine 5mg',    4,28, 189.00,189.00,  0.00,0.0000,'J. Dela Cruz','completed','2025-06-25 12:05:00'),
('TXN-1206','sale','Losartan 50mg',     7,30, 336.00,336.00,  0.00,0.0000,'M. Santos',   'completed','2025-06-25 13:20:00'),
-- Returns
('RET-24F7','return','Salbutamol Inhaler',9,2, 420.00,375.00, 45.00,0.1200,'S. Guko',     'completed','2026-08-18 12:27:00'),
('RET-7847','return','Amlodipine 5mg',   4,1,   6.75,  6.75,  0.00,0.0000,'S. Guko',     'completed','2026-08-17 21:18:00');

-- Transaction batch audit (FIFO consumed for each sale)
INSERT INTO `transaction_batches` (`transaction_id`,`batch_id`,`expiry_date`,`qty`) VALUES
('TXN-1201','P001-B1','2026-08-01',10),
('TXN-1202','P002-B1','2027-03-01',20),
('TXN-1203','P006-B1','2026-12-01',14),
('TXN-1204','P010-B1','2027-06-01',30),
('TXN-1205','P004-B1','2027-01-01',28),
('TXN-1206','P007-B1','2027-04-01',30);
