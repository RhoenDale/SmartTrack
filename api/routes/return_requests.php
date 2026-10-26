<?php
/**
 * Cashier-submitted returns and inventory-manager stock disposition.
 *
 *   GET    /return-requests              — full queue [inventory_manager / admin]
 *   POST   /return-requests              — record customer refund [cashier]
 *   POST   /return-requests/broken       — staff reports a broken product [any staff]
 *   PUT    /return-requests/{id}         — restock or mark broken [inventory_manager]
 */

require_auth();
$pdo = db();
$authUser = current_user();

// ── GET list ──────────────────────────────────────────────────────────────────
if ($method === 'GET' && !$id) {
    require_role(['inventory_manager', 'admin', 'admin/owner']);
    $rows = $pdo->query(
        "SELECT rd.return_tx_id, rd.sale_tx_id, rd.product_id, rd.qty, rd.reason,
                rd.disposition, rd.processed_at, rd.created_at,
                t.product_name, t.amount, t.staff AS cashier,
                t.sale_unit, t.units_per_sale,
                t.type AS return_type
         FROM return_dispositions rd
         JOIN transactions t ON t.id = rd.return_tx_id
         ORDER BY rd.created_at DESC"
    )->fetchAll(PDO::FETCH_ASSOC);

    json_response(array_map(fn($row) => [
        'returnTxId'   => $row['return_tx_id'],
        'saleTxId'     => $row['sale_tx_id'],
        'productId'    => (string)$row['product_id'],
        'product'      => $row['product_name'],
        'qty'          => (int)$row['qty'],
        'refund'       => (float)$row['amount'],
        'reason'       => $row['reason'],
        'cashier'      => $row['cashier'],
        'createdAt'    => date('m/d/Y H:i', strtotime($row['created_at'])),
        'disposition'  => $row['disposition'],
        'processedAt'  => $row['processed_at']
            ? date('m/d/Y H:i', strtotime($row['processed_at']))
            : null,
        'saleUnit'     => $row['sale_unit'] ?? 'unit',
        'unitsPerSale' => (int)($row['units_per_sale'] ?? 1),
        'returnType'   => $row['return_type'] ?? 'return',
    ], $rows));
}

// ── POST /return-requests/broken — staff reports a broken product ─────────────
if ($method === 'POST' && $id === 'broken') {
    require_role(['cashier', 'inventory_manager', 'admin', 'admin/owner']);
    $data = body();
    require_fields($data, ['product_id', 'qty', 'reason']);

    $productId = trim((string)$data['product_id']);
    $qty       = filter_var($data['qty'], FILTER_VALIDATE_INT);
    $reason    = trim((string)$data['reason']);

    if ($qty === false || $qty <= 0) json_response(['error' => 'Qty must be greater than zero.'], 422);
    if ($reason === '') json_response(['error' => 'Reason is required.'], 422);

    $pdo->beginTransaction();
    try {
        $productStmt = $pdo->prepare('SELECT * FROM products WHERE id = ? FOR UPDATE');
        $productStmt->execute([$productId]);
        $product = $productStmt->fetch();
        if (!$product) {
            $pdo->rollBack();
            json_response(['error' => 'Product not found.'], 404);
        }

        // Get current stock
        $stockStmt = $pdo->prepare('SELECT COALESCE(SUM(qty),0) FROM product_batches WHERE product_id = ?');
        $stockStmt->execute([$productId]);
        $currentStock = (int)$stockStmt->fetchColumn();

        if ($qty > $currentStock) {
            $pdo->rollBack();
            json_response(['error' => "Cannot record {$qty} broken — only {$currentStock} units in stock."], 422);
        }

        // Deduct from stock via FIFO
        $consumed = fifo_deduct($productId, $qty);

        // Record as an adjustment transaction (type=broken_return so it's distinguishable)
        $brokenTxId = gen_tx_id('BRK');
        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, amount, pre_tax_amount, tax_amount, tax_rate,
              staff, staff_id, status, note, transacted_at)
             VALUES (?, "adjustment", ?, ?, ?, 0, 0, 0, 0, ?, ?, "completed", ?, NOW())'
        )->execute([
            $brokenTxId, $product['name'], $productId,
            $qty, staff_abbrev($authUser['name']), $authUser['id'],
            "Broken — {$reason}",
        ]);

        // Record as a return_disposition with disposition=broken directly
        // sale_tx_id references itself (no original customer sale)
        $pdo->prepare(
            'INSERT INTO return_dispositions
             (return_tx_id, sale_tx_id, product_id, qty, reason, batch_id, expiry_date,
              disposition, processed_by, processed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, "broken", ?, NOW())'
        )->execute([
            $brokenTxId, $brokenTxId, $productId, $qty,
            "Broken by staff — {$reason}",
            $consumed[0]['batchId'] ?? null,
            $consumed[0]['expiry']  ?? null,
            $authUser['id'],
        ]);

        sync_product_status($productId);
        $pdo->commit();

        $updatedProduct = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $updatedProduct->execute([$productId]);

        json_response([
            'message' => "{$qty} unit(s) of {$product['name']} recorded as broken and removed from stock.",
            'product' => enrich_product($updatedProduct->fetch()),
        ], 201);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// ── POST /return-requests — cashier submits customer return ───────────────────
if ($method === 'POST' && !$id) {
    require_role(['cashier']);
    $data = body();
    require_fields($data, ['sale_tx_id', 'qty', 'reason']);

    $saleTxId = trim((string)$data['sale_tx_id']);
    $qty      = filter_var($data['qty'], FILTER_VALIDATE_INT);
    $reason   = trim((string)$data['reason']);

    if ($qty === false || $qty <= 0) json_response(['error' => 'Qty must be greater than zero.'], 422);
    if ($reason === '') json_response(['error' => 'Return reason is required.'], 422);

    $pdo->beginTransaction();
    try {
        $saleStmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ? AND type = ? FOR UPDATE');
        $saleStmt->execute([$saleTxId, 'sale']);
        $sale = $saleStmt->fetch();
        if (!$sale) {
            $pdo->rollBack();
            json_response(['error' => 'Original sale transaction not found.'], 404);
        }
        if (empty($sale['product_id'])) {
            throw new RuntimeException('The original sale is not linked to a product and cannot be returned.');
        }

        // How many base units have already been returned for this sale?
        $returnedStmt = $pdo->prepare(
            "SELECT COALESCE(SUM(qty), 0) FROM transactions WHERE type = 'return' AND returned_tx_id = ?"
        );
        $returnedStmt->execute([$saleTxId]);
        $alreadyReturned = (int)$returnedStmt->fetchColumn();
        $remainingQty    = (int)$sale['qty'] - $alreadyReturned;

        if ($qty > $remainingQty) {
            throw new DomainException("Only {$remainingQty} of the sold units remain returnable.");
        }

        // Fetch the original batch used in this sale (for restock reference)
        $batchStmt = $pdo->prepare(
            'SELECT batch_id, expiry_date FROM transaction_batches
             WHERE transaction_id = ? ORDER BY id ASC LIMIT 1'
        );
        $batchStmt->execute([$saleTxId]);
        $originalBatch = $batchStmt->fetch();

        // Refund = proportional per base-unit from original sale amount
        $soldQty = max((int)$sale['qty'], 1);
        $refund  = round(((float)$sale['amount'] / $soldQty) * $qty, 2);
        $vatRate = max(0.0, (float)($sale['tax_rate'] ?? 0.12));
        $preTax  = $vatRate > 0 ? round($refund / (1 + $vatRate), 2) : $refund;
        $tax     = round($refund - $preTax, 2);

        $returnTxId = gen_tx_id('RET');

        // Store sale_unit and units_per_sale on the return transaction for display
        $saleUnit     = $sale['sale_unit']     ?? 'unit';
        $unitsPerSale = max(1, (int)($sale['units_per_sale'] ?? 1));

        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, sale_unit, units_per_sale, amount,
              pre_tax_amount, tax_amount, tax_rate, staff, staff_id, status, note,
              returned_tx_id, transacted_at)
             VALUES (?, "return", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, ?, NOW())'
        )->execute([
            $returnTxId, $sale['product_name'], $sale['product_id'],
            $qty, $saleUnit, $unitsPerSale,
            $refund, $preTax, $tax, $vatRate,
            staff_abbrev($authUser['name']), $authUser['id'],
            $reason, $saleTxId,
        ]);

        $pdo->prepare(
            'INSERT INTO return_dispositions
             (return_tx_id, sale_tx_id, product_id, qty, reason, batch_id, expiry_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $returnTxId, $saleTxId, $sale['product_id'], $qty, $reason,
            $originalBatch['batch_id'] ?? null,
            $originalBatch['expiry_date'] ?? null,
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

// ── PUT /return-requests/{id} — inventory manager sets disposition ─────────────
if ($method === 'PUT' && $id) {
    require_role(['inventory_manager']);
    if (!preg_match('/^[A-Za-z0-9\-]+$/', (string)$id)) {
        json_response(['error' => 'Invalid return request ID.'], 422);
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
            "SELECT rd.*, t.sale_unit, t.units_per_sale, p.units_per_pack, p.name AS product_name
             FROM return_dispositions rd
             JOIN transactions t ON t.id = rd.return_tx_id
             JOIN products p ON p.id = rd.product_id
             WHERE rd.return_tx_id = ? AND rd.disposition = 'pending'
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

            // qty in return_dispositions is always base units
            $restockQty = (int)$request['qty'];

            fifo_restock(
                (string)$request['product_id'],
                $restockQty,
                $batchId,
                $request['expiry_date']
            );
            sync_product_status((string)$request['product_id']);

            // Build a human-readable restock note showing pack info if applicable
            $saleUnit     = $request['sale_unit']     ?? 'unit';
            $unitsPerSale = max(1, (int)($request['units_per_sale'] ?? $request['units_per_pack'] ?? 1));
            if ($saleUnit === 'pack' && $unitsPerSale > 1) {
                $packCount   = (int)floor($restockQty / $unitsPerSale);
                $remainder   = $restockQty % $unitsPerSale;
                $restockNote = "Restocked {$restockQty} units";
                if ($packCount > 0) {
                    $restockNote .= " ({$packCount} pack" . ($packCount !== 1 ? 's' : '') . " × {$unitsPerSale} units";
                    if ($remainder > 0) $restockNote .= " + {$remainder} loose";
                    $restockNote .= ")";
                }
            } else {
                $restockNote = "Restocked {$restockQty} individual unit" . ($restockQty !== 1 ? 's' : '');
            }
        }

        $pdo->prepare(
            'UPDATE return_dispositions
             SET disposition = ?, processed_by = ?, processed_at = NOW()
             WHERE return_tx_id = ?'
        )->execute([$disposition, $authUser['id'], $id]);

        $pdo->commit();

        $productStmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $productStmt->execute([$request['product_id']]);

        $message = $disposition === 'restocked'
            ? ($restockNote ?? 'Returned product added back to stock.')
            : 'Returned product recorded as broken and removed from stock.';

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
