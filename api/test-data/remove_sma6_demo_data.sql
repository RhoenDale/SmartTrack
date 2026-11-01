-- Removes only the temporary SMA-6 demo item and its marked transactions.

START TRANSACTION;

DELETE tb FROM transaction_batches tb
JOIN transactions t ON t.id = tb.transaction_id
WHERE t.note = 'SMA6_TEST_ONLY';

DELETE FROM transactions WHERE note = 'SMA6_TEST_ONLY';

DELETE n FROM notifications n
JOIN products p ON p.id = n.product_id
WHERE p.barcode = 'SMA6-TEST-ONLY';

DELETE pcm FROM product_category_map pcm
JOIN products p ON p.id = pcm.product_id
WHERE p.barcode = 'SMA6-TEST-ONLY';

DELETE b FROM product_batches b
JOIN products p ON p.id = b.product_id
WHERE p.barcode = 'SMA6-TEST-ONLY';

DELETE FROM products WHERE barcode = 'SMA6-TEST-ONLY';

COMMIT;
