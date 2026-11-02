-- Adds a 'cancelled' status so purchase orders can be soft-deleted (cancelled)
-- instead of hard-deleting rows. Run once against the SmartTrack database.
--
-- Prerequisite: create_supplier_purchase_orders.sql must already be applied.

ALTER TABLE purchase_orders
  MODIFY COLUMN status ENUM('ordered', 'partially_received', 'received', 'cancelled')
  NOT NULL DEFAULT 'ordered';
