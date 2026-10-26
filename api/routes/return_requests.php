<?php
/**
 * Returns & Broken Products — reads/writes product_returns table.
 *
 *   GET    /return-requests              — list all records [inventory_manager / admin]
 *   POST   /return-requests              — record customer return [cashier / inventory_manager]
 *   POST   /return-requests/broken       — record broken/damaged stock [inventory_manager]
 *   PUT    /return-requests/{id}         — set disposition (restock / broken) [inventory_manager]
 */

require_auth();
$pdo      = db();
$authUser = current_user();

// ── Helper: format a product_returns row for API output ──────────────────────
function format_return_record(array $row): array {
    return [
        'returnTxId'   => $row['id'],
        'saleTxId'     => $row['sale_tx_id'] ?? $row['id'],
        'productId'    => (string)$row['product_id'],
        'product'      => $row['product_name'],
        'qty'          => (int)$row['qty'],
        'refund'       => (float)$row['refund_amount'],
        'reason'       => $row['reason'],
        'cashier'      => $row['recorded_by_name'] ?? '',
        'createdAt'    => date('m/d/Y H:i', strtotime($row['created_at'])),
        'disposition'  => $row['disposition'],
        'processedAt'  => $row['processed_at']
            ? date('m/d/Y H:i', strtotime($row['processed_at']))
            : null,
        'saleUnit'     => $row['sale_unit'] ?? 'unit',
        'unitsPerSale' => (int)($row['units_per_sale'] ?? 1),
        'returnType'   => $row['record_type'] === 'broken' ? 'adjustment' : 'return',
    ];
}

// ── GET /return-requests ─────────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    require_role(['inventory_manager', 'admin', 'admin/owner']);

    $stmt = $pdo->query(
        'SELECT id, record_type, product_id, product_name, qty, sale_unit, units_per_sale,
                refund_amount, reason, sale_tx_id, batch_id, expiry_date,
                disposition, recorded_by_name, processed_by, processed_at, created_at
         FROM product_returns
         ORDER BY created_at DESC'
    );
    json_response(array_map('format_return_record', $stmt->fetchAll(PDO::FETCH_ASSOC)));
}

// ── POST /return-requests/broken — record broken/damaged stock ────────────────
if ($method === 'POST' && $id === 'broken') {
    require_role(['inventory_manager', 'admin', 'admin/owner']);
    $data = body();
    require_fields($data, ['product_id', 'qty', 'reason']);

    $productId = trim((string)$data['product_id']);
    $qty       = filter_var($data['qty'], FILTER_VALIDATE_INT);
    $reason    = trim((string)$data['reason']);
    $saleUnit  = (string)($data['sale_unit'] ?? 'unit');
    $saleQty   = filter_var($data['sale_qty'] ?? $data['qty'], FILTER_VALIDATE_INT);

    if ($qty === false || $qty <= 0) json_response(['error' => 'Qty must be greater than zero.'], 422);
    if ($saleQty === false || $saleQty <= 0) json_response(['error' => 'Sale qty must be greater than zero.'], 422);
    if (!in_array($saleUnit, ['unit', 'pack'], true)) {
        json_response(['error' => 'Sale unit must be unit or pack.'], 422);
    }
    if ($reason === '')              json_response(['error' => 'Reason is required.'], 422);

    $pdo->beginTransaction();
    try {
        $productStmt = $pdo->prepare('SELECT * FROM products WHERE id = ? FOR UPDATE');
        $productStmt->execute([$productId]);
        $product = $productStmt->fetch();
        if (!$product) {
            $pdo->rollBack();
            json_response(['error' => 'Product not found.'], 404);
        }

        $unitsPerSale = $saleUnit === 'pack'
            ? max(1, (int)$product['units_per_pack'])
            : 1;
        if ($saleUnit === 'pack' && $unitsPerSale <= 1) {
            $pdo->rollBack();
            json_response(['error' => 'This product does not have a pack size.'], 422);
        }
        if ((int)$qty !== (int)$saleQty * $unitsPerSale) {
            $pdo->rollBack();
            json_response(['error' => 'The base-unit quantity does not match the selected unit or pack quantity.'], 422);
        }

        $stockStmt = $pdo->prepare('SELECT COALESCE(SUM(qty),0) FROM product_batches WHERE product_id = ?');
        $stockStmt->execute([$productId]);
        $currentStock = (int)$stockStmt->fetchColumn();

        if ($qty > $currentStock) {
            $pdo->rollBack();
            json_response(['error' => "Cannot record {$qty} broken — only {$currentStock} units in stock."], 422);
        }

        // Deduct stock via FIFO
        $consumed   = fifo_deduct($productId, $qty);
        $lossAmount = 0.0;
        $hasCompleteCost = true;
        foreach ($consumed as $batch) {
            if ($batch['unitCost'] === null) {
                $hasCompleteCost = false;
                break;
            }
            $lossAmount += $batch['qty'] * $batch['unitCost'];
        }
        $lossAmount = $hasCompleteCost ? round($lossAmount, 2) : null;
        $recordId   = gen_tx_id('BRK');
        $staffName  = staff_abbrev($authUser['name']);

        // Write to product_returns (standalone record)
        $pdo->prepare(
            'INSERT INTO product_returns
             (id, record_type, product_id, product_name, qty, sale_unit, units_per_sale,
              refund_amount, loss_amount, reason, sale_tx_id, batch_id, expiry_date,
              disposition, recorded_by, recorded_by_name, processed_by, processed_at)
             VALUES (?, "broken", ?, ?, ?, ?, ?,
                     0.00, ?, ?, NULL, ?, ?,
                     "broken", ?, ?, ?, NOW())'
        )->execute([
            $recordId,
            $productId, $product['name'], $qty, $saleUnit, $unitsPerSale,
            $lossAmount,
            $reason,
            $consumed[0]['batchId'] ?? null,
            $consumed[0]['expiry']  ?? null,
            $authUser['id'], $staffName,
            $authUser['id'],
        ]);

        // Also write an adjustment transaction so it shows up in the Transactions page
        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, sale_qty, sale_unit, units_per_sale,
              amount, pre_tax_amount, tax_amount,
              tax_rate, staff, staff_id, status, note, transacted_at)
             VALUES (?, "adjustment", ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, "completed", ?, NOW())'
        )->execute([
            $recordId, $product['name'], $productId, $qty, $saleQty, $saleUnit, $unitsPerSale,
            $lossAmount ?? 0,
            $staffName, $authUser['id'],
            "Broken — {$reason}",
        ]);

        sync_product_status($productId);
        $pdo->commit();

        $updated = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $updated->execute([$productId]);

        $row = $pdo->prepare('SELECT * FROM product_returns WHERE id = ?');
        $row->execute([$recordId]);

        json_response([
            'message' => "{$qty} unit(s) of {$product['name']} recorded as broken and removed from stock.",
            'record'  => format_return_record($row->fetch(PDO::FETCH_ASSOC)),
            'product' => enrich_product($updated->fetch()),
        ], 201);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// ── POST /return-requests — record customer return ────────────────────────────
if ($method === 'POST' && !$id) {
    require_role(['cashier', 'inventory_manager', 'admin', 'admin/owner']);
    $data = body();
    require_fields($data, ['sale_tx_id', 'qty', 'reason']);

    $saleTxId = trim((string)$data['sale_tx_id']);
    $qty      = filter_var($data['qty'], FILTER_VALIDATE_INT);
    $reason   = trim((string)$data['reason']);

    if ($qty === false || $qty <= 0) json_response(['error' => 'Qty must be greater than zero.'], 422);
    if ($reason === '')              json_response(['error' => 'Return reason is required.'], 422);

    $pdo->beginTransaction();
    try {
        $saleStmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ? AND type = "sale" FOR UPDATE');
        $saleStmt->execute([$saleTxId]);
        $sale = $saleStmt->fetch();
        if (!$sale) {
            $pdo->rollBack();
            json_response(['error' => 'Original sale transaction not found.'], 404);
        }
        if (empty($sale['product_id'])) {
            throw new RuntimeException('The original sale is not linked to a product and cannot be returned.');
        }

        // How many base units already returned for this sale?
        $returnedStmt = $pdo->prepare(
            'SELECT COALESCE(SUM(qty), 0) FROM product_returns WHERE sale_tx_id = ?'
        );
        $returnedStmt->execute([$saleTxId]);
        $alreadyReturned = (int)$returnedStmt->fetchColumn();
        $remainingQty    = (int)$sale['qty'] - $alreadyReturned;

        if ($qty > $remainingQty) {
            throw new DomainException("Only {$remainingQty} of the sold units remain returnable.");
        }

        // Get original batch for later restocking
        $batchStmt = $pdo->prepare(
            'SELECT batch_id, expiry_date FROM transaction_batches
             WHERE transaction_id = ? ORDER BY id ASC LIMIT 1'
        );
        $batchStmt->execute([$saleTxId]);
        $originalBatch = $batchStmt->fetch();

        // Proportional refund
        $soldQty      = max((int)$sale['qty'], 1);
        $refund       = round(((float)$sale['amount'] / $soldQty) * $qty, 2);
        $vatRate      = max(0.0, (float)($sale['tax_rate'] ?? 0.12));
        $preTax       = $vatRate > 0 ? round($refund / (1 + $vatRate), 2) : $refund;
        $tax          = round($refund - $preTax, 2);
        $saleUnit     = $sale['sale_unit']     ?? 'unit';
        $unitsPerSale = max(1, (int)($sale['units_per_sale'] ?? 1));
        $returnTxId   = gen_tx_id('RET');
        $staffName    = staff_abbrev($authUser['name']);

        // Write to product_returns
        $pdo->prepare(
            'INSERT INTO product_returns
             (id, record_type, product_id, product_name, qty, sale_unit, units_per_sale,
              refund_amount, reason, sale_tx_id, batch_id, expiry_date,
              disposition, recorded_by, recorded_by_name)
             VALUES (?, "return", ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     "pending", ?, ?)'
        )->execute([
            $returnTxId,
            $sale['product_id'], $sale['product_name'], $qty, $saleUnit, $unitsPerSale,
            $refund, $reason, $saleTxId,
            $originalBatch['batch_id']    ?? null,
            $originalBatch['expiry_date'] ?? null,
            $authUser['id'], $staffName,
        ]);

        // Also write a return transaction for Transactions page / financials
        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, sale_unit, units_per_sale, amount,
              pre_tax_amount, tax_amount, tax_rate, staff, staff_id, status, note,
              returned_tx_id, transacted_at)
             VALUES (?, "return", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, ?, NOW())'
        )->execute([
            $returnTxId,
            $sale['product_name'], $sale['product_id'],
            $qty, $saleUnit, $unitsPerSale,
            $refund, $preTax, $tax, $vatRate,
            $staffName, $authUser['id'],
            $reason, $saleTxId,
        ]);

        $pdo->commit();

        $row = $pdo->prepare('SELECT * FROM product_returns WHERE id = ?');
        $row->execute([$returnTxId]);
        $transactionStmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $transactionStmt->execute([$returnTxId]);

        json_response([
            'record'      => format_return_record($row->fetch(PDO::FETCH_ASSOC)),
            'transaction' => format_transaction($transactionStmt->fetch(PDO::FETCH_ASSOC)),
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

// ── PUT /return-requests/{id} — set disposition ───────────────────────────────
if ($method === 'PUT' && $id) {
    require_role(['inventory_manager']);
    if (!preg_match('/^[A-Za-z0-9\-]+$/', (string)$id)) {
        json_response(['error' => 'Invalid return record ID.'], 422);
    }
    $data = body();
    require_fields($data, ['disposition']);
    $disposition = (string)$data['disposition'];
    if (!in_array($disposition, ['restocked', 'broken'], true)) {
        json_response(['error' => 'Disposition must be restocked or broken.'], 422);
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            "SELECT pr.*, p.units_per_pack
             FROM product_returns pr
             JOIN products p ON p.id = pr.product_id
             WHERE pr.id = ? AND pr.disposition = 'pending' AND pr.record_type = 'return'
             FOR UPDATE"
        );
        $stmt->execute([$id]);
        $request = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$request) {
            $pdo->rollBack();
            json_response(['error' => 'Return record was already processed or does not exist.'], 404);
        }

        if ($disposition === 'restocked') {
            $batchId    = $request['batch_id'] ?: 'RET-' . $request['id'];
            $restockQty = (int)$request['qty'];

            fifo_restock(
                (string)$request['product_id'],
                $restockQty,
                $batchId,
                $request['expiry_date']
            );
            sync_product_status((string)$request['product_id']);
        }

        $pdo->prepare(
            'UPDATE product_returns
             SET disposition = ?, processed_by = ?, processed_at = NOW()
             WHERE id = ?'
        )->execute([$disposition, $authUser['id'], $id]);

        $pdo->commit();

        $productStmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $productStmt->execute([$request['product_id']]);

        $restockQty = (int)$request['qty'];
        $message = $disposition === 'restocked'
            ? "Restocked {$restockQty} unit" . ($restockQty !== 1 ? 's' : '') . " of {$request['product_name']}."
            : "Returned product recorded as broken.";

        json_response([
            'message' => $message,
            'product' => enrich_product($productStmt->fetch()),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

json_response(['error' => 'Method not allowed.'], 405);
