-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Philippine 12% VAT / Tax System
-- Ecount Philippines-style: pre-tax amount, tax amount, total per transaction
--
-- Run this ONCE against your existing SmartTrack database.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Tax settings table (configurable VAT rate and TIN) ────────────────
CREATE TABLE IF NOT EXISTS `tax_settings` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(60)   NOT NULL UNIQUE,
  `value`       VARCHAR(255)  NOT NULL,
  `description` VARCHAR(255)  NOT NULL DEFAULT '',
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

INSERT INTO `tax_settings` (`setting_key`, `value`, `description`) VALUES
  ('vat_rate',          '12',                 'Standard VAT rate in percent (BIR Philippines: 12%)'),
  ('vat_enabled',       '1',                  '1 = VAT applied on all non-exempt products, 0 = VAT disabled'),
  ('business_tin',      '123-456-789-000',    'BIR Tax Identification Number — shown on receipts'),
  ('business_name',     'Tangub Pharmacy',    'Business name shown on official receipts'),
  ('business_address',  'Tangub City, Misamis Occidental', 'Business address on receipts'),
  ('or_prefix',         'OR-',                'Official Receipt prefix (for BIR OR numbering)')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- ── Step 2: Add VAT-exempt flag to products ───────────────────────────────────
-- VAT-exempt products: essential medicines under Republic Act No. 10963 (TRAIN Law)
-- and RA 11534 (Corporate Recovery and Tax Incentives), discounted for senior/PWD
ALTER TABLE `products`
  ADD COLUMN `is_vat_exempt` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = VAT-exempt (e.g. senior/PWD medicines), 0 = VAT-inclusive (standard 12%)'
    AFTER `sale_price`;

-- ── Step 3: Add tax columns to transactions ───────────────────────────────────
-- amount         = total paid by customer (VAT-inclusive)  ← already exists
-- pre_tax_amount = amount ÷ 1.12 (net of VAT, taxable base)
-- tax_amount     = pre_tax_amount × 0.12 (VAT collected)
-- tax_rate       = rate applied (0.12 standard, 0 if exempt)
ALTER TABLE `transactions`
  ADD COLUMN `pre_tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'Net amount before VAT (taxable base)'
    AFTER `amount`,
  ADD COLUMN `tax_amount`     DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'VAT amount collected (12% of pre-tax)'
    AFTER `pre_tax_amount`,
  ADD COLUMN `tax_rate`       DECIMAL(5,4)  NOT NULL DEFAULT 0.1200
    COMMENT 'VAT rate applied at time of sale (e.g. 0.1200 = 12%)'
    AFTER `tax_amount`;

-- ── Step 4: Back-fill existing transactions (assume all were VAT-inclusive 12%) ─
-- pre_tax = amount / 1.12,  tax = amount - pre_tax
UPDATE `transactions`
SET
  `pre_tax_amount` = ROUND(`amount` / 1.12, 2),
  `tax_amount`     = ROUND(`amount` - ROUND(`amount` / 1.12, 2), 2),
  `tax_rate`       = 0.1200
WHERE `type` IN ('sale', 'return');

-- Adjustments carry no monetary value (amount = 0)
UPDATE `transactions`
SET `pre_tax_amount` = 0, `tax_amount` = 0, `tax_rate` = 0
WHERE `type` = 'adjustment';

-- ── Step 5: Mark VAT-exempt products (essential medicines) ───────────────────
-- Per DOH & BIR guidelines, the following categories are typically VAT-exempt:
-- Analgesics, Antidiabetics, Antihypertensives used by senior citizens / PWD.
-- Adjust this list to match your actual BIR Certificate of VAT Exemption.
UPDATE `products`
SET `is_vat_exempt` = 1
WHERE `category` IN ('Analgesic', 'Antidiabetic', 'Antihypertensive');

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run after migration):
--
-- SELECT setting_key, value FROM tax_settings;
--
-- SELECT id, amount, pre_tax_amount, tax_amount, tax_rate
-- FROM transactions LIMIT 10;
--
-- SELECT id, name, category, is_vat_exempt FROM products;
-- ─────────────────────────────────────────────────────────────────────────────
