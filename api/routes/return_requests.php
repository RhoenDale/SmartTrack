<?php
/**
 * Cashier-submitted returns and inventory-manager stock disposition.
 *
 *   GET    /return-requests       — pending queue [inventory_manager]
 *   POST   /return-requests       — record refund [cashier]
 *   PUT    /return-requests/{id}  — restock or mark broken [inventory_manager]
 */

require_auth();
$pdo = db();
$authUser = current_user();

if ($method === 'GET' && !$id) {
    require_role(['inventory_manager', 'admin', 'admin/owner']);
    $rows = $pdo->query(
        "SELECT rd.return_tx_id, rd.sale_tx_id, rd.product_id, rd.qty, rd.reason,
                rd.disposition, rd.processed_at, rd.created_at,
                t.product_name, t.amount, t.staff AS cashier
         FROM return_dispositions rd
         JOIN transactions t ON t.id = rd.return_tx_id
         ORDER BY rd.created_at ASC"
    )->fetchAll(PDO::FETCH_ASSOC);
    json_response(array_map(fn($row) => [
        'returnTxId' => $row['return_tx_id'],
        'saleTxId' => $row['sale_tx_id'],
        'productId' => (string)$row['product_id'],
        'product' => $row['product_name'],
        'qty' => (int)$row['qty'],
        'refund' => (float)$row['amount'],
        'reason' => $row['reason'],
        'cashier' => $row['cashier'],
        'createdAt' => date('m/d/Y H:i', strtotime($row['created_at'])),
        'disposition' => $row['disposition'],
        'processedAt' => $row['processed_at']
            ? date('m/d/Y H:i', strtotime($row['processed_at']))
            : null,
    ], $rows));
}

if ($method === 'POST' && !$id) {
    require_role(['cashier']);
    $data = body();
    require_fields($data, ['sale_tx_id', 'qty', 'reason']);

    $saleTxId = trim((string)$data['sale_tx_id']);
    $qty = filter_var($data['qty'], FILTER_VALIDATE_INT);
    $reason = trim((string)$data['reason']);
    if ($qty === false || $qty <= 0) json_response(['error' => 'Qty must be greater than zero.'], 422);
    if ($reason === '') json_response(['error' => 'Return reason is required.'], 422);

    $pdo->beginTransaction();
    try {
        $saleStmt = $pdo->prepare(
            'SELECT * FROM transactions WHERE id = ? AND type = ? FOR UPDATE'
        );
        $saleStmt->execute([$saleTxId, 'sale']);
        $sale = $saleStmt->fetch();
        if (!$sale) {
            $pdo->rollBack();
            json_response(['error' => 'Original sale transaction not found.'], 404);
        }
        if (empty($sale['product_id'])) {
            throw new RuntimeException('The original sale is not linked to a product and cannot be returned.');
        }

        $returnedStmt = $pdo->prepare(
            "SELECT COALESCE(SUM(qty), 0)
             FROM transactions
             WHERE type = 'return' AND returned_tx_id = ?"
        );
        $returnedStmt->execute([$saleTxId]);
        $alreadyReturned = (int)$returnedStmt->fetchColumn();
        $remainingQty = (int)$sale['qty'] - $alreadyReturned;
        if ($qty > $remainingQty) {
            throw new DomainException("Only {$remainingQty} of the sold units remain returnable.");
        }

        $batchStmt = $pdo->prepare(
            'SELECT batch_id, expiry_date FROM transaction_batches
             WHERE transaction_id = ? ORDER BY id ASC LIMIT 1'
        );
        $batchStmt->execute([$saleTxId]);
        $originalBatch = $batchStmt->fetch();

        $soldQty = max((int)$sale['qty'], 1);
        $refund = round(((float)$sale['amount'] / $soldQty) * $qty, 2);
        $vatRate = max(0.0, (float)($sale['tax_rate'] ?? 0.12));
        $preTax = $vatRate > 0 ? round($refund / (1 + $vatRate), 2) : $refund;
        $tax = round($refund - $preTax, 2);
        $returnTxId = gen_tx_id('RET');

        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, amount, pre_tax_amount, tax_amount, tax_rate,
              staff, staff_id, status, note, returned_tx_id, transacted_at)
             VALUES (?, "return", ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, ?, NOW())'
        )->execute([
            $returnTxId, $sale['product_name'], $sale['product_id'],
            $qty, $refund, $preTax, $tax, $vatRate,
            staff_abbrev($authUser['name']), $authUser['id'], $reason, $saleTxId,
        ]);

        $pdo->prepare(
            'INSERT INTO return_dispositions
             (return_tx_id, sale_tx_id, product_id, qty, reason, batch_id, expiry_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $returnTxId, $saleTxId, $sale['product_id'], $qty, $reason,
            $originalBatch['batch_id'] ?? null, $originalBatch['expiry_date'] ?? null,
        ]);

        $pdo->commit();
        $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$returnTxId]);
        json_response([
            'transaction' => format_transaction($stmt->fetch()),
            'disposition' => 'pending',
        ], 201);
    } catch (DomainException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

if ($method === 'PUT' && $id) {
    require_role(['inventory_manager']);
    if (!preg_match('/^[A-Za-z0-9\-]+$/', (string)$id)) json_response(['error' => 'Invalid return request ID.'], 422);
    $data = body();
    require_fields($data, ['disposition']);
    $disposition = (string)$data['disposition'];
    if (!in_array($disposition, ['restocked', 'broken'], true)) {
        json_response(['error' => 'Disposition must be restocked or broken.'], 422);
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            "SELECT * FROM return_dispositions
             WHERE return_tx_id = ? AND disposition = 'pending'
             FOR UPDATE"
        );
        $stmt->execute([$id]);
        $request = $stmt->fetch();
        if (!$request) {
            $pdo->rollBack();
            json_response(['error' => 'Return request was already processed or does not exist.'], 404);
        }

        if ($disposition === 'restocked') {
            $batchId = $request['batch_id'] ?: 'RET-' . $request['return_tx_id'];
            fifo_restock(
                (string)$request['product_id'],
                (int)$request['qty'],
                $batchId,
                $request['expiry_date']
            );
            sync_product_status((string)$request['product_id']);
        }

        $pdo->prepare(
            'UPDATE return_dispositions
             SET disposition = ?, processed_by = ?, processed_at = NOW()
             WHERE return_tx_id = ?'
        )->execute([$disposition, $authUser['id'], $id]);

        $pdo->commit();
        $productStmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $productStmt->execute([$request['product_id']]);
        json_response([
            'message' => $disposition === 'restocked'
                ? 'Returned product added back to stock.'
                : 'Returned product recorded as broken and kept out of stock.',
            'product' => enrich_product($productStmt->fetch()),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

json_response(['error' => 'Method not allowed.'], 405);
