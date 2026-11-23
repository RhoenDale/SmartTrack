-- Migration: Remove is_vat_exempt from products table
--            Fix existing transactions that were recorded as VAT-exempt due to product-level flag
-- VAT exemption is now a sale-level option (SC/PWD discount at checkout), not per-product.
-- Run this ONCE against your existing database.

-- 1. Drop is_vat_exempt column from products
ALTER TABLE `products` DROP COLUMN IF EXISTS `is_vat_exempt`;

-- 2. Fix old sale/return transactions that were stored with tax_rate = 0
--    because the PRODUCT was marked VAT-exempt (not because of a customer SC/PWD discount).
--    These rows have tax_rate = 0 but no customer discount note — recalculate as standard 12% VAT.
UPDATE `transactions`
SET
    `tax_rate`       = 0.1200,
    `pre_tax_amount` = ROUND(`amount` / 1.12, 2),
    `tax_amount`     = ROUND(`amount` - ROUND(`amount` / 1.12, 2), 2)
WHERE
    `type`     IN ('sale', 'return')
    AND `tax_rate` = 0.0000
    -- Exclude legitimate SC/PWD discount rows (they have a note)
    AND (`note` IS NULL OR (`note` NOT LIKE 'Customer discount:%' AND `note` NOT LIKE 'Customer VAT exemption:%'));
