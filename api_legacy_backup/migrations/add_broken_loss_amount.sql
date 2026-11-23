-- Add an event-time inventory cost for standalone broken-stock records.
-- Existing records remain NULL because their exact consumed batch costs were
-- not captured and cannot be reliably reconstructed.
ALTER TABLE `product_returns`
  ADD COLUMN `loss_amount` DECIMAL(12,2) NULL DEFAULT NULL
  COMMENT 'recorded batch cost for standalone broken stock; NULL when cost is unknown'
  AFTER `refund_amount`;
