-- Migration: Create standalone product_returns table
-- This table is the single source of truth for the Returns & Broken page.
-- It stores all fields needed for display without joining transactions.
-- Run ONCE against your existing database.

-- ── 1. Create the new table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `product_returns` (
  `id`               VARCHAR(20)   NOT NULL,
  `record_type`      ENUM('return','broken') NOT NULL
                     COMMENT 'return = customer refund, broken = damaged/broken stock',
  `product_id`       INT UNSIGNED  NOT NULL,
  `product_name`     VARCHAR(255)  NOT NULL,
  `qty`              INT           NOT NULL COMMENT 'base units',
  `sale_unit`        VARCHAR(10)   NOT NULL DEFAULT 'unit',
  `units_per_sale`   INT           NOT NULL DEFAULT 1,
  `refund_amount`    DECIMAL(12,2) NOT NULL DEFAULT 0.00
                     COMMENT 'refund paid to customer; 0 for broken records',
  `loss_amount`      DECIMAL(12,2) NULL DEFAULT NULL
                     COMMENT 'recorded batch cost for standalone broken stock; NULL when cost is unknown',
  `reason`           TEXT          NOT NULL,
  `sale_tx_id`       VARCHAR(20)   NULL  COMMENT 'original sale tx; NULL for broken records',
  `batch_id`         VARCHAR(30)   NULL,
  `expiry_date`      DATE          NULL,
  `disposition`      VARCHAR(20)   NOT NULL DEFAULT 'pending',
  `recorded_by`      VARCHAR(20)   NULL  COMMENT 'users.id of staff who submitted',
  `recorded_by_name` VARCHAR(100)  NULL  COMMENT 'staff name at time of recording',
  `processed_by`     VARCHAR(20)   NULL  COMMENT 'users.id of inventory manager who acted',
  `processed_at`     DATETIME      NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_pr_record_type` (`record_type`, `created_at`),
  KEY `idx_pr_product`     (`product_id`),
  KEY `idx_pr_disposition` (`disposition`),
  KEY `idx_pr_sale_tx`     (`sale_tx_id`),

  CONSTRAINT `fk_pr_product`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Migrate existing return_dispositions data ──────────────────────────────
-- Skip rows already migrated (INSERT IGNORE uses the PRIMARY KEY to skip dupes).
INSERT IGNORE INTO `product_returns`
  (`id`, `record_type`, `product_id`, `product_name`, `qty`,
   `sale_unit`, `units_per_sale`, `refund_amount`, `reason`,
   `sale_tx_id`, `batch_id`, `expiry_date`,
   `disposition`, `recorded_by_name`, `processed_by`, `processed_at`, `created_at`)
SELECT
  rd.return_tx_id                                                    AS id,
  IF(t.`type` = 'return', 'return', 'broken')                       AS record_type,
  rd.product_id,
  t.product_name,
  rd.qty,
  IFNULL(t.sale_unit, 'unit')                                        AS sale_unit,
  IFNULL(t.units_per_sale, 1)                                        AS units_per_sale,
  IF(t.`type` = 'return', t.amount, 0.00)                           AS refund_amount,
  rd.reason,
  IF(rd.sale_tx_id = rd.return_tx_id, NULL, rd.sale_tx_id)          AS sale_tx_id,
  rd.batch_id,
  rd.expiry_date,
  rd.disposition,
  t.staff                                                            AS recorded_by_name,
  rd.processed_by,
  rd.processed_at,
  rd.created_at
FROM `return_dispositions` rd
INNER JOIN `transactions` t ON t.id = rd.return_tx_id;
