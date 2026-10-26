<?php
/**
 * Product routes  (all require authentication)
 *
 *   GET    /products              — list all products (with batches)
 *   GET    /products/{id}         — single product
 *   POST   /products              — create product + batches   [inv_mgr+]
 *   PUT    /products/{id}         — update product + batches   [inv_mgr+]
 *   DELETE /products/{id}         — delete product             [inv_mgr+]
 *   GET    /products/{id}/batches — list batches for a product
 *   POST   /products/{id}/batches — add a batch                [inv_mgr+]
 *   DELETE /products/{id}/batches/{batchId} — remove a batch   [inv_mgr+]
 */

require_auth();

$pdo = db();

// ── /products/{id}/batches/{batchId} ─────────────────────────────────────────
if ($id && $sub === 'batches' && isset($sub2)) {
    $batchId = $sub2;

    if ($method === 'DELETE') {
        require_role($ADMIN_ROLES + ['inventory_manager']);
        $pdo->prepare('DELETE FROM product_batches WHERE batch_id = ? AND product_id = ?')
            ->execute([$batchId, $id]);
        sync_product_status($id);
        json_response(['message' => 'Batch deleted.']);
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── /products/{id}/batches ────────────────────────────────────────────────────
if ($id && $sub === 'batches') {
    if ($method === 'GET') {
        $stmt = $pdo->prepare(
            'SELECT batch_id, qty, expiry_date, received_date
             FROM product_batches WHERE product_id = ? AND qty > 0
             ORDER BY received_date ASC'
        );
        $stmt->execute([$id]);
        $rows = $stmt->fetchAll();
        $batches = array_map(fn($b) => [
            'batchId'      => $b['batch_id'],
            'qty'          => (int)$b['qty'],
            'expiry'       => $b['expiry_date'] ? date('m/d/Y', strtotime($b['expiry_date'])) : null,
            'expiryDate'   => $b['expiry_date'],
            'receivedDate' => date('m/d/Y', strtotime($b['received_date'])),
        ], $rows);
        json_response($batches);
    }

    if ($method === 'POST') {
        require_role(['admin/owner', 'admin', 'inventory_manager']);
        $data = body();
        require_fields($data, ['qty']);
        $expiryDate = normalize_optional_date($data['expiry_date'] ?? null);

        // Count existing batches to generate batchId
        $cnt = (int)$pdo->prepare('SELECT COUNT(*) FROM product_batches WHERE product_id = ?')
                         ->execute([$id]) ?: 0;
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM product_batches WHERE product_id = ?');
        $stmt->execute([$id]);
        $cnt     = (int)$stmt->fetchColumn();
        $batchId = $id . '-B' . ($cnt + 1);
        $received = $data['received_date'] ?? date('Y-m-d');

        $pdo->prepare(
            'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$batchId, $id, (int)$data['qty'], $expiryDate, $received]);

        sync_product_status($id);
        json_response(['message' => 'Batch added.', 'batchId' => $batchId], 201);
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── /products/{id} ────────────────────────────────────────────────────────────
if ($id) {
    // GET single product
    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $stmt->execute([$id]);
        $product = $stmt->fetch();
        if (!$product) json_response(['error' => 'Product not found.'], 404);
        json_response(enrich_product($product));
    }

    // PUT update product
    if ($method === 'PUT') {
        require_role(['admin/owner', 'admin', 'inventory_manager']);
        $data = body();
        require_fields($data, ['name', 'supplier', 'reorder', 'price']);
        $categoryNames = product_category_names($data);

        $barcode = trim((string)($data['barcode'] ?? ''));
        $barcodeCheck = $pdo->prepare('SELECT id FROM products WHERE barcode = ? AND id <> ?');
        $barcodeCheck->execute([$barcode, $id]);
        if ($barcode !== '' && $barcodeCheck->fetch()) {
            json_response(['error' => "Barcode '{$barcode}' is already assigned to another product."], 409);
        }

        $pdo->prepare(
            'UPDATE products SET barcode=?, name=?, supplier=?, reorder=?, price=?, sale_price=?, unit_label=?, units_per_pack=?, pack_price=?, updated_at=NOW()
             WHERE id = ?'
        )->execute([
            $barcode !== '' ? $barcode : null,
            $data['name'], $data['supplier'],
            (int)$data['reorder'], (float)$data['price'],
            isset($data['sale_price']) && $data['sale_price'] !== '' ? (float)$data['sale_price'] : null,
            trim((string)($data['unit_label'] ?? 'unit')) ?: 'unit',
            max(1, (int)($data['units_per_pack'] ?? 1)),
            isset($data['pack_price']) && $data['pack_price'] !== '' ? (float)$data['pack_price'] : null,
            $id,
        ]);
        sync_product_categories($pdo, $id, $categoryNames);

        // Replace batches if provided — preserving batch cost data
        if (!empty($data['batches']) && is_array($data['batches'])) {
            $pdo->prepare('DELETE FROM product_batches WHERE product_id = ?')->execute([$id]);
            $ins = $pdo->prepare(
                'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($data['batches'] as $b) {
                $qty       = (int)$b['qty'];
                $totalCost = isset($b['batchTotalCost']) && $b['batchTotalCost'] !== '' && $b['batchTotalCost'] !== null
                             ? (float)$b['batchTotalCost'] : null;
                $unitCost  = ($totalCost !== null && $qty > 0) ? round($totalCost / $qty, 4) : null;
                $ins->execute([
                    $b['batchId'], $id, $qty,
                    normalize_optional_date($b['expiryDate'] ?? $b['expiry'] ?? null),
                    date('Y-m-d', strtotime($b['receivedDate'])),
                    $totalCost,
                    $unitCost,
                ]);
            }
        }

        sync_product_status($id);

        $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $stmt->execute([$id]);
        json_response(enrich_product($stmt->fetch()));
    }

    // DELETE product
    if ($method === 'DELETE') {
        require_role(['admin/owner', 'admin', 'inventory_manager']);
        $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
        json_response(['message' => 'Product deleted.']);
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── /products ─────────────────────────────────────────────────────────────────

// GET all products
if ($method === 'GET') {
    $search = $_GET['search'] ?? '';
    $status = $_GET['status'] ?? 'all';

    $sql    = 'SELECT * FROM products WHERE 1=1';
    $params = [];

    if ($search !== '') {
        $sql    .= ' AND (name LIKE ? OR id LIKE ? OR barcode LIKE ? OR EXISTS (
            SELECT 1 FROM product_category_map pcm
            JOIN categories c ON c.id = pcm.category_id
            WHERE pcm.product_id = products.id AND c.name LIKE ?
        ))';
        $like    = "%$search%";
        $params  = array_merge($params, [$like, $like, $like, $like]);
    }
    if ($status !== 'all') {
        $sql   .= ' AND status = ?';
        $params[] = $status;
    }
    $sql .= ' ORDER BY id ASC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows     = $stmt->fetchAll();
    $products = array_map('enrich_product', $rows);
    json_response($products);
}

// POST create product
if ($method === 'POST') {
    require_role(['admin/owner', 'admin', 'inventory_manager']);
    $data = body();
    require_fields($data, ['barcode', 'name', 'supplier', 'reorder', 'price', 'batches']);
    $categoryNames = product_category_names($data);
    $barcode = trim((string)$data['barcode']);
    if ($barcode === '') {
        json_response(['error' => 'A barcode is required.'], 422);
    }

    $check = $pdo->prepare('SELECT id FROM products WHERE barcode = ?');
    $check->execute([$barcode]);
    if ($check->fetch()) {
        json_response(['error' => "Barcode '{$barcode}' is already assigned to a product."], 409);
    }

    $pdo->prepare(
        'INSERT INTO products (barcode, name, supplier, reorder, price, sale_price, unit_label, units_per_pack, pack_price, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "good")'
    )->execute([
        $barcode, $data['name'], $data['supplier'],
        (int)$data['reorder'], (float)$data['price'],
        isset($data['sale_price']) && $data['sale_price'] !== '' ? (float)$data['sale_price'] : null,
        trim((string)($data['unit_label'] ?? 'unit')) ?: 'unit',
        max(1, (int)($data['units_per_pack'] ?? 1)),
        isset($data['pack_price']) && $data['pack_price'] !== '' ? (float)$data['pack_price'] : null,
    ]);
    $productId = (string)$pdo->lastInsertId();
    sync_product_categories($pdo, $productId, $categoryNames);

    // Insert batches with optional batch cost
    $ins = $pdo->prepare(
        'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($data['batches'] as $b) {
        $qty       = (int)$b['qty'];
        $totalCost = isset($b['batchTotalCost']) && $b['batchTotalCost'] !== '' && $b['batchTotalCost'] !== null
                     ? (float)$b['batchTotalCost'] : null;
        $unitCost  = ($totalCost !== null && $qty > 0) ? round($totalCost / $qty, 4) : null;
        $ins->execute([
            $b['batchId'], $productId, $qty,
            normalize_optional_date($b['expiryDate'] ?? $b['expiry'] ?? null),
            date('Y-m-d', strtotime($b['receivedDate'])),
            $totalCost,
            $unitCost,
        ]);
    }

    sync_product_status($productId);

    $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
    $stmt->execute([$productId]);
    json_response(enrich_product($stmt->fetch()), 201);
}

json_response(['error' => 'Method not allowed.'], 405);
