-- Create a disposition queue so cashiers can record refunds while inventory
-- managers decide whether returned products are restocked or marked broken.
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
