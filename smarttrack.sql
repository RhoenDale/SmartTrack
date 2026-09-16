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
  `id`           VARCHAR(20)    NOT NULL,
  `name`         VARCHAR(150)   NOT NULL,
  `category`     VARCHAR(80)    NOT NULL,
  `supplier`     VARCHAR(120)   NOT NULL DEFAULT '',
  `reorder`      INT            NOT NULL DEFAULT 0,
  `price`        DECIMAL(10,2)  NOT NULL DEFAULT 0.00  COMMENT 'VAT-inclusive selling price',
  `sale_price`   DECIMAL(10,2)  NULL                   COMMENT 'Discounted VAT-inclusive price (optional)',
  `is_vat_exempt` TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '1=VAT-exempt, 0=standard 12% VAT',
  `status`       ENUM('good','moderate','low','critical') NOT NULL DEFAULT 'good',
  `created_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- ─── Product Batches (FIFO) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `product_batches` (
  `id`              INT            NOT NULL AUTO_INCREMENT,
  `batch_id`        VARCHAR(30)    NOT NULL UNIQUE,
  `product_id`      VARCHAR(20)    NOT NULL,
  `qty`             INT            NOT NULL DEFAULT 0,
  `expiry_date`     DATE           NOT NULL,
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

-- ─── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `transactions` (
  `id`                 VARCHAR(20)   NOT NULL,
  `type`               ENUM('sale','return','adjustment') NOT NULL,
  `product_name`       VARCHAR(150)  NOT NULL,
  `product_id`         VARCHAR(20)   NULL,
  `qty`                INT           NOT NULL DEFAULT 0,
  `amount`             DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Total VAT-inclusive amount',
  `pre_tax_amount`     DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Net amount before VAT',
  `tax_amount`         DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'VAT collected',
  `tax_rate`           DECIMAL(5,4)  NOT NULL DEFAULT 0.1200 COMMENT 'VAT rate at time of sale',
  `staff`              VARCHAR(80)   NOT NULL DEFAULT '',
  `status`             ENUM('completed') NOT NULL DEFAULT 'completed',
  `note`               TEXT          NULL,
  `returned_tx_id`     VARCHAR(20)   NULL,
  `adjustment_reason`  TEXT          NULL,
  `damaged_qty`        INT           NULL DEFAULT 0,
  `transacted_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tx_product` (`product_id`),
  KEY `idx_tx_type`    (`type`),
  KEY `idx_tx_date`    (`transacted_at`)
) ENGINE=InnoDB;

-- ─── Transaction Batches Consumed (FIFO audit trail) ──────────────────────────
CREATE TABLE IF NOT EXISTS `transaction_batches` (
  `id`             INT         NOT NULL AUTO_INCREMENT,
  `transaction_id` VARCHAR(20) NOT NULL,
  `batch_id`       VARCHAR(30) NOT NULL,
  `expiry_date`    DATE        NOT NULL,
  `qty`            INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_txbatch_tx` (`transaction_id`),
  CONSTRAINT `fk_txbatch_tx`
    FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `type`       ENUM('alert','order','info') NOT NULL DEFAULT 'info',
  `title`      VARCHAR(200) NOT NULL,
  `body`       TEXT         NOT NULL,
  `product_id` VARCHAR(20)  NULL,
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
('U001','Paterno Amamio Jr.','admin/owner','admin@tangub.ph',
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

-- Tax Settings (BIR Philippines standard)
INSERT INTO `tax_settings` (`setting_key`, `value`, `description`) VALUES
  ('vat_rate',         '12',                              'Standard VAT rate in percent'),
  ('vat_enabled',      '1',                               '1=VAT enabled, 0=disabled'),
  ('business_tin',     '123-456-789-000',                 'BIR Tax Identification Number'),
  ('business_name',    'Tangub Pharmacy',                 'Business name on receipts'),
  ('business_address', 'Tangub City, Misamis Occidental', 'Business address on receipts'),
  ('or_prefix',        'OR-',                             'Official Receipt prefix');

-- Products  (is_vat_exempt: Analgesics, Antidiabetics, Antihypertensives = 1 per BIR guidelines)
INSERT INTO `products` (`id`,`name`,`category`,`supplier`,`reorder`,`price`,`sale_price`,`is_vat_exempt`,`status`) VALUES
('P001','Amoxicillin 500mg',  'Antibiotic',      'Apex Pharma',         50,  8.50, 6.00, 0,'good'),
('P002','Paracetamol 500mg',  'Analgesic',       'Medline Distributors',200, 2.50, NULL, 1,'good'),
('P003','Metformin 500mg',    'Antidiabetic',    'PharmaSource',        100, 4.20, NULL, 1,'low'),
('P004','Amlodipine 5mg',     'Antihypertensive','Apex Pharma',          80, 6.75, NULL, 1,'good'),
('P005','Cetirizine 10mg',    'Antihistamine',   'Healthline Supplies',  60, 5.00, NULL, 0,'low'),
('P006','Omeprazole 20mg',    'Antacid',         'GlobeMed Traders',    100, 9.80, NULL, 0,'good'),
('P007','Losartan 50mg',      'Antihypertensive','MetroPharm',           80,11.20, NULL, 1,'moderate'),
('P008','Ibuprofen 400mg',    'NSAID',           'PharmaSource',        150, 7.30, NULL, 0,'good'),
('P009','Salbutamol Inhaler', 'Bronchodilator',  'Medline Distributors', 30,210.00,NULL, 0,'critical'),
('P010','Vitamin C 500mg',    'Supplement',      'Healthline Supplies', 200, 3.20, NULL, 0,'good');

-- Product Batches (one batch per product as initial stock)
INSERT INTO `product_batches` (`batch_id`,`product_id`,`qty`,`expiry_date`,`received_date`,`batch_total_cost`,`unit_cost`) VALUES
('P001-B1','P001', 284,'2026-08-01','2025-06-01', 1704.00,  6.0000),
('P002-B1','P002',1240,'2027-03-01','2025-06-01', 1860.00,  1.5000),
('P003-B1','P003',  38,'2026-11-01','2025-06-01',  114.00,  3.0000),
('P004-B1','P004', 156,'2027-01-01','2025-06-01',  702.00,  4.5000),
('P005-B1','P005',  22,'2026-09-01','2025-06-01',   77.00,  3.5000),
('P006-B1','P006', 203,'2026-12-01','2025-06-01', 1218.00,  6.0000),
('P007-B1','P007',  89,'2027-04-01','2025-06-01',  623.00,  7.0000),
('P008-B1','P008', 445,'2027-02-01','2025-06-01', 2225.00,  5.0000),
('P009-B1','P009',  14,'2027-12-01','2025-06-01', 1680.00,120.0000),
('P010-B1','P010', 892,'2027-06-01','2025-06-01', 1338.00,  1.5000);

-- Transactions (with VAT tax breakdown)
-- VAT-exempt products (P002 Paracetamol, P003 Metformin, P004 Amlodipine, P007 Losartan):
--   pre_tax_amount = amount, tax_amount = 0, tax_rate = 0
-- VAT-inclusive products (P001 Amoxicillin, P006 Omeprazole, P010 Vitamin C etc.):
--   pre_tax_amount = amount / 1.12, tax_amount = amount - pre_tax_amount, tax_rate = 0.12
INSERT INTO `transactions`
  (`id`,`type`,`product_name`,`product_id`,`qty`,`amount`,`pre_tax_amount`,`tax_amount`,`tax_rate`,`staff`,`status`,`transacted_at`) VALUES
-- VAT-inclusive sales (Antibiotic, Antacid, Supplement, NSAID, Bronchodilator)
('TXN-1201','sale','Amoxicillin 500mg', 'P001',10,  85.00, 75.89,  9.11,0.1200,'M. Santos',   'completed','2025-06-25 09:14:00'),
('TXN-1203','sale','Omeprazole 20mg',   'P006',14, 137.20,122.50, 14.70,0.1200,'M. Santos',   'completed','2025-06-25 10:45:00'),
('TXN-1204','sale','Vitamin C 500mg',   'P010',30,  96.00, 85.71, 10.29,0.1200,'A. Reyes',    'completed','2025-06-25 11:12:00'),
('TXN-9743','sale','Paracetamol 500mg', 'P002', 1,   2.50,  2.50,  0.00,0.0000,'R. Dela Cruz','completed','2026-08-17 20:20:00'),
('TXN-F843','sale','Metformin 500mg',   'P003', 1,   4.20,  4.20,  0.00,0.0000,'R. Dela Cruz','completed','2026-08-17 20:26:00'),
('TXN-4D06','sale','Amoxicillin 500mg', 'P001', 5,  30.00, 26.79,  3.21,0.1200,'R. Dela Cruz','completed','2026-08-17 20:42:00'),
-- VAT-exempt sales (Antidiabetic, Antihypertensive, Analgesic)
('TXN-1202','sale','Paracetamol 500mg', 'P002',20,  50.00, 50.00,  0.00,0.0000,'J. Dela Cruz','completed','2025-06-25 09:32:00'),
('TXN-1205','sale','Amlodipine 5mg',    'P004',28, 189.00,189.00,  0.00,0.0000,'J. Dela Cruz','completed','2025-06-25 12:05:00'),
('TXN-1206','sale','Losartan 50mg',     'P007',30, 336.00,336.00,  0.00,0.0000,'M. Santos',   'completed','2025-06-25 13:20:00'),
-- Returns
('RET-24F7','return','Salbutamol Inhaler','P009',2, 420.00,375.00, 45.00,0.1200,'S. Guko',     'completed','2026-08-18 12:27:00'),
('RET-7847','return','Amlodipine 5mg',   'P004',1,   6.75,  6.75,  0.00,0.0000,'S. Guko',     'completed','2026-08-17 21:18:00');

-- Transaction batch audit (FIFO consumed for each sale)
INSERT INTO `transaction_batches` (`transaction_id`,`batch_id`,`expiry_date`,`qty`) VALUES
('TXN-1201','P001-B1','2026-08-01',10),
('TXN-1202','P002-B1','2027-03-01',20),
('TXN-1203','P006-B1','2026-12-01',14),
('TXN-1204','P010-B1','2027-06-01',30),
('TXN-1205','P004-B1','2027-01-01',28),
('TXN-1206','P007-B1','2027-04-01',30);

-- Notifications
INSERT INTO `notifications` (`type`,`title`,`body`,`product_id`,`is_read`) VALUES
('alert','Critical: Salbutamol Inhaler','Only 14 units remaining - urgent reorder needed','P009',0),
('alert','Low Stock: Metformin 500mg','38 units remaining, reorder level is 100','P003',0),
('order','Purchase Order PO-0084 Pending','Awaiting admin approval for Metformin 500mg','P003',0),
('alert','Low Stock: Cetirizine 10mg','22 units remaining, reorder level is 60','P005',1),
('info','System: Inventory synced','All stock levels updated successfully',NULL,1);
