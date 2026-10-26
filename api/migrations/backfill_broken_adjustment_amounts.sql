-- Reflect previously recorded batch-cost write-offs in the transaction ledger.
-- Safe to rerun; records with unknown loss_amount remain unchanged at zero.
UPDATE `transactions` t
JOIN `product_returns` pr ON pr.id = t.id
SET t.amount = pr.loss_amount
WHERE t.type = 'adjustment'
  AND pr.record_type = 'broken'
  AND pr.loss_amount IS NOT NULL;
