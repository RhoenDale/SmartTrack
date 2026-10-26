-- Migration: Add dedicated SC/PWD exemption columns to transactions table
-- Previously these were only encoded inside the `note` freetext column.
-- This migration adds proper columns so the data is queryable and receipts
-- can read them directly without regex-parsing the note.
-- Run this ONCE against your existing database.

-- 1. Add the three new columns
ALTER TABLE `transactions`
  ADD COLUMN `customer_vat_exempt`    TINYINT(1)   NOT NULL DEFAULT 0
    COMMENT '1 = SC/PWD discount applied at checkout'
    AFTER `tax_rate`,
  ADD COLUMN `customer_exemption_type` VARCHAR(50)  NULL DEFAULT NULL
    COMMENT 'Senior Citizen | PWD | Other Qualified ID'
    AFTER `customer_vat_exempt`,
  ADD COLUMN `customer_id_number`      VARCHAR(100) NULL DEFAULT NULL
    COMMENT 'ID number of the SC/PWD card presented at checkout'
    AFTER `customer_exemption_type`;

-- 2. Back-fill existing rows from the note column
--    Handles both note formats:
--      "Customer VAT exemption: Senior Citizen ID 1234567"  (single-item)
--      "Customer discount: Senior Citizen ID 1234567"       (multi-item / cart)
UPDATE `transactions`
SET
    `customer_vat_exempt`     = 1,
    `customer_exemption_type` = TRIM(REGEXP_REPLACE(
        REGEXP_SUBSTR(`note`, 'Customer (?:VAT exemption|discount): .+ ID '),
        'Customer (?:VAT exemption|discount): | ID $', ''
    )),
    `customer_id_number`      = TRIM(REGEXP_REPLACE(
        `note`,
        '^Customer (?:VAT exemption|discount): .+ ID ', ''
    ))
WHERE
    `type` IN ('sale', 'return')
    AND (`note` LIKE 'Customer VAT exemption:%' OR `note` LIKE 'Customer discount:%');
