<?php
/**
 * Transaction routes
 *
 *   GET  /transactions              — list all (filter: type, date_from, date_to)
 *   GET  /transactions/{id}         — single transaction
 *   POST /transactions/sale         — record a new sale  (FIFO deduction)
 *   POST /transactions/return       — process a return   (FIFO restock)
 *   POST /transactions/adjustment   — record adjustment  (FIFO deduction)
 *   GET  /transactions/export       — CSV export (admin only)
 */

require_auth();
$pdo     = db();
$authUser = current_user();

// ── Special sub-routes on /transactions/{action} ─────────────────────────────
if ($id && $sub === null) {

    // Export CSV — /transactions/export
    if ($id === 'export' && $method === 'GET') {
        require_role(['admin/owner', 'admin']);
        $stmt = $pdo->query(
            'SELECT id, type, product_name, product_id, qty, amount, staff, status,
                    note, returned_tx_id, adjustment_reason, damaged_qty, transacted_at
             FROM transactions ORDER BY transacted_at DESC'
        );
        $rows = $stmt->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="transactions-' . date('Y-m-d') . '.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['Transaction ID','Type','Product','Product ID','Qty','Amount','Staff','Status','Date','Note']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['id'], $r['type'], $r['product_name'], $r['product_id'],
                $r['qty'], $r['amount'], $r['staff'], $r['status'],
                $r['transacted_at'], $r['note'] ?? '',
            ]);
        }
        fclose($out);
        exit;
    }

    // GET single transaction
    if ($method === 'GET') {
        $stmt = $pdo->prepare(
            'SELECT t.*, 
             COALESCE(u.name, t.staff) as current_staff_name,
             GROUP_CONCAT(
                JSON_OBJECT("batchId",tb.batch_id,"expiry",tb.expiry_date,"qty",tb.qty)
             ) AS batches_json
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             LEFT JOIN transaction_batches tb ON tb.transaction_id = t.id
             WHERE t.id = ?
             GROUP BY t.id'
        );
        $stmt->execute([$id]);
        $tx = $stmt->fetch();
        if (!$tx) json_response(['error' => 'Transaction not found.'], 404);
        $tx = format_transaction($tx);
        json_response($tx);
    }

    // POST /transactions/sale | return | adjustment
    if ($method === 'POST') {
        if ($id === 'sale') {
            handle_sale($pdo, $authUser);
        } elseif ($id === 'return') {
            handle_return($pdo, $authUser);
        } elseif ($id === 'adjustment') {
            handle_adjustment($pdo, $authUser);
        } else {
            json_response(['error' => 'Unknown transaction type.'], 404);
        }
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── GET /transactions — list with optional filters ────────────────────────────
if ($method === 'GET') {
    $type      = $_GET['type']      ?? 'all';
    $dateFrom  = $_GET['date_from'] ?? '';
    $dateTo    = $_GET['date_to']   ?? '';

    $sql    = 'SELECT t.*, 
               COALESCE(u.name, t.staff) as current_staff_name
               FROM transactions t
               LEFT JOIN users u ON t.staff_id = u.id
               WHERE 1=1';
    $params = [];

    if ($type !== 'all') {
        $sql    .= ' AND t.type = ?';
        $params[] = $type;
    }
    if ($dateFrom) {
        $sql    .= ' AND DATE(t.transacted_at) >= ?';
        $params[] = $dateFrom;
    }
    if ($dateTo) {
        $sql    .= ' AND DATE(t.transacted_at) <= ?';
        $params[] = $dateTo;
    }

    $sql .= ' ORDER BY t.transacted_at DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    json_response(array_map('format_transaction', $rows));
}

json_response(['error' => 'Method not allowed.'], 405);

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handle_sale(PDO $pdo, array $authUser): void {
    // Only cashiers and inventory managers can create sales, not admins
    if (in_array($authUser['role'], ['admin', 'admin/owner'], true)) {
        json_response(['error' => 'Admins cannot create sales. Only cashiers and inventory managers have this permission.'], 403);
    }
    
    $data = body();
    require_fields($data, ['product_id', 'qty']);

    $productId = $data['product_id'];
    $qty       = (int)$data['qty'];
    if ($qty <= 0) json_response(['error' => 'Qty must be > 0.'], 422);

    // Fetch product for price
    $prod = $pdo->prepare('SELECT * FROM products WHERE id = ?');
    $prod->execute([$productId]);
    $product = $prod->fetch();
    if (!$product) json_response(['error' => 'Product not found.'], 404);

    $unitPrice = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
    $amount    = round($unitPrice * $qty, 2);

    $pdo->beginTransaction();
    try {
        $consumed = fifo_deduct($productId, $qty);

        $txId = gen_tx_id('TXN');
        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, amount, staff, staff_id, status, transacted_at)
             VALUES (?, "sale", ?, ?, ?, ?, ?, ?, "completed", NOW())'
        )->execute([$txId, $product['name'], $productId, $qty, $amount,
                    staff_abbrev($authUser['name']), $authUser['id']]);

        // Record FIFO audit trail
        $ins = $pdo->prepare(
            'INSERT INTO transaction_batches (transaction_id, batch_id, expiry_date, qty)
             VALUES (?, ?, ?, ?)'
        );
        foreach ($consumed as $c) {
            $ins->execute([$txId, $c['batchId'], $c['expiry'], $c['qty']]);
        }

        sync_product_status($productId);
        $pdo->commit();

        // Return the new transaction + updated product
        $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$txId]);
        $tx = format_transaction($stmt->fetch());
        $tx['batchesConsumed'] = $consumed;

        $pStmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $pStmt->execute([$productId]);

        json_response([
            'transaction' => $tx,
            'product'     => enrich_product($pStmt->fetch()),
        ], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 422);
    }
}

function handle_return(PDO $pdo, array $authUser): void {
    // Only cashiers and inventory managers can process returns, not admins
    if (in_array($authUser['role'], ['admin', 'admin/owner'], true)) {
        json_response(['error' => 'Admins cannot process returns. Only cashiers and inventory managers have this permission.'], 403);
    }
    
    $data = body();
    require_fields($data, ['sale_tx_id', 'qty', 'reason']);

    $saleTxId = $data['sale_tx_id'];
    $qty      = (int)$data['qty'];
    $reason   = trim($data['reason']);

    if ($qty <= 0)         json_response(['error' => 'Qty must be > 0.'], 422);
    if ($reason === '')    json_response(['error' => 'Return reason is required.'], 422);

    // Fetch original sale
    $saleStmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ? AND type = "sale"');
    $saleStmt->execute([$saleTxId]);
    $sale = $saleStmt->fetch();
    if (!$sale) json_response(['error' => 'Original sale transaction not found.'], 404);
    if ($qty > (int)$sale['qty']) {
        json_response(['error' => "Cannot return more than sold qty ({$sale['qty']})."], 422);
    }

    $productId = $sale['product_id'];

    // Fetch original batch for restock
    $batchStmt = $pdo->prepare(
        'SELECT batch_id, expiry_date FROM transaction_batches
         WHERE transaction_id = ? ORDER BY id ASC LIMIT 1'
    );
    $batchStmt->execute([$saleTxId]);
    $origBatch = $batchStmt->fetch();
    $batchId   = $origBatch['batch_id']    ?? ($productId . '-B1');
    $expiry    = $origBatch['expiry_date'] ?? date('Y-m-d');

    // Fetch product for unit price
    $pStmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
    $pStmt->execute([$productId]);
    $product   = $pStmt->fetch();
    $unitPrice = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
    $refund    = round($unitPrice * $qty, 2);

    $pdo->beginTransaction();
    try {
        fifo_restock($productId, $qty, $batchId, $expiry);

        $retId = gen_tx_id('RET');
        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, amount, staff, staff_id, status,
              note, returned_tx_id, transacted_at)
             VALUES (?, "return", ?, ?, ?, ?, ?, ?, "completed", ?, ?, NOW())'
        )->execute([
            $retId, $sale['product_name'], $productId,
            $qty, $refund, staff_abbrev($authUser['name']), $authUser['id'],
            $reason, $saleTxId,
        ]);

        sync_product_status($productId);
        $pdo->commit();

        $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$retId]);
        $tx = format_transaction($stmt->fetch());

        $pStmt->execute([$productId]);
        json_response([
            'transaction' => $tx,
            'product'     => enrich_product($pStmt->fetch()),
        ], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 422);
    }
}

function handle_adjustment(PDO $pdo, array $authUser): void {
    $data = body();
    require_fields($data, ['product_id', 'qty', 'reason', 'adjust_type']);

    $productId  = $data['product_id'];
    $qty        = (int)$data['qty'];
    $reason     = trim($data['reason']);
    $adjustType = $data['adjust_type']; // 'damage' | 'correction'

    if ($qty <= 0)      json_response(['error' => 'Qty must be > 0.'], 422);
    if ($reason === '') json_response(['error' => 'Reason is required.'], 422);

    $adjReason  = $adjustType === 'damage'
        ? "Damaged — $reason"
        : "Stock Correction — $reason";

    $pdo->beginTransaction();
    try {
        $consumed = fifo_deduct($productId, $qty);

        $adjId = gen_tx_id('ADJ');
        $pStmt = $pdo->prepare('SELECT name FROM products WHERE id = ?');
        $pStmt->execute([$productId]);
        $productName = $pStmt->fetchColumn();

        $pdo->prepare(
            'INSERT INTO transactions
             (id, type, product_name, product_id, qty, amount, staff, staff_id, status,
              note, adjustment_reason, damaged_qty, transacted_at)
             VALUES (?, "adjustment", ?, ?, ?, 0, ?, ?, "completed", ?, ?, ?, NOW())'
        )->execute([
            $adjId, $productName, $productId, $qty,
            staff_abbrev($authUser['name']), $authUser['id'],
            $reason, $adjReason,
            $adjustType === 'damage' ? $qty : 0,
        ]);

        sync_product_status($productId);
        $pdo->commit();

        $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$adjId]);
        $tx = format_transaction($stmt->fetch());

        $pStmt2 = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $pStmt2->execute([$productId]);
        json_response([
            'transaction' => $tx,
            'product'     => enrich_product($pStmt2->fetch()),
        ], 201);
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 422);
    }
}

/** Format a raw transaction row for API output. */
function format_transaction(array $tx): array {
    // Use current_staff_name if available (from JOIN), otherwise fall back to staff field
    $staffName = $tx['current_staff_name'] ?? $tx['staff'];
    
    // Abbreviate the staff name if it's a full name
    if (strpos($staffName, ' ') !== false && !strpos($staffName, '.')) {
        $staffName = staff_abbrev($staffName);
    }
    
    return [
        'id'               => $tx['id'],
        'type'             => $tx['type'],
        'product'          => $tx['product_name'],
        'productId'        => $tx['product_id'],
        'qty'              => (int)$tx['qty'],
        'amount'           => (float)$tx['amount'],
        'staff'            => $staffName,
        'status'           => $tx['status'],
        'date'             => date('m/d/Y H:i', strtotime($tx['transacted_at'])),
        'note'             => $tx['note'] ?? null,
        'returnedTxId'     => $tx['returned_tx_id'] ?? null,
        'adjustmentReason' => $tx['adjustment_reason'] ?? null,
        'damagedQty'       => isset($tx['damaged_qty']) ? (int)$tx['damaged_qty'] : null,
    ];
}
