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

// ── /products/{id}/supplier ───────────────────────────────────────────────────
// Link or change a product's supplier from the Purchases page without replacing
// product batches or other product details.
if ($id && $sub === 'supplier') {
    if ($method !== 'POST') json_response(['error' => 'Method not allowed.'], 405);
    require_role(['admin/owner', 'admin', 'inventory_manager']);
    $data = body();
    require_fields($data, ['supplier']);
    $supplier = trim((string)$data['supplier']);
    if ($supplier === '' || mb_strlen($supplier) > 120) {
        json_response(['error' => 'Enter a supplier name with 1 to 120 characters.'], 422);
    }
    $stmt = $pdo->prepare('UPDATE products SET supplier = ?, updated_at = NOW() WHERE id = ?');
    $stmt->execute([$supplier, $id]);
    if ($stmt->rowCount() === 0) {
        $check = $pdo->prepare('SELECT 1 FROM products WHERE id = ?');
        $check->execute([$id]);
        if (!$check->fetchColumn()) json_response(['error' => 'Product not found.'], 404);
    }
    json_response(['message' => 'Product supplier updated.']);
}

// ── /products/{id}/batches/{batchId} ─────────────────────────────────────────
if ($id && $sub === 'batches' && isset($sub2)) {
    $batchId = $sub2;

    if ($method === 'DELETE') {
        require_role($ADMIN_ROLES + ['inventory_manager']);
        $delete = $pdo->prepare('DELETE FROM product_batches WHERE batch_id = ? AND product_id = ?');
        $delete->execute([$batchId, $id]);
        if ($delete->rowCount() === 0) json_response(['error' => 'Batch not found.'], 404);
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
        $qty = filter_var($data['qty'], FILTER_VALIDATE_INT);
        if ($qty === false || $qty <= 0) {
            json_response(['error' => 'Qty must be a positive whole number.'], 422);
        }
        $expiryDate = normalize_optional_date($data['expiry_date'] ?? null);
        $received = normalize_optional_date($data['received_date'] ?? date('Y-m-d'), 'Received date');
        $productStmt = $pdo->prepare('SELECT id FROM products WHERE id = ?');
        $productStmt->execute([$id]);
        if (!$productStmt->fetchColumn()) json_response(['error' => 'Product not found.'], 404);

        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM product_batches WHERE product_id = ?');
        $countStmt->execute([$id]);
        $nextBatchNumber = (int)$countStmt->fetchColumn() + 1;
        $batchExists = $pdo->prepare('SELECT 1 FROM product_batches WHERE batch_id = ?');
        do {
            $batchId = $id . '-B' . $nextBatchNumber++;
            $batchExists->execute([$batchId]);
        } while ($batchExists->fetchColumn());

        $pdo->prepare(
            'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$batchId, $id, $qty, $expiryDate, $received ?? date('Y-m-d')]);

        sync_product_status($id);
        json_response(['message' => 'Batch added.', 'batchId' => $batchId], 201);
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── /products/{id} — sub-routes that must come BEFORE the generic id block ────

// GET /products/deleted — recycle bin list
if ($method === 'GET' && $id === 'deleted') {
    require_role(['admin/owner', 'admin', 'inventory_manager']);
    $cols = $pdo->query("SHOW COLUMNS FROM products LIKE 'deleted_at'")->fetchAll();
    if (empty($cols)) json_response([]);
    $stmt = $pdo->query(
        "SELECT p.id, p.name, p.supplier, p.status,
                p.deleted_at, p.deleted_by, p.delete_note,
                u.name AS deleted_by_name,
                COALESCE(
                    (SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                     FROM product_category_map pcm
                     JOIN categories c ON c.id = pcm.category_id
                     WHERE pcm.product_id = p.id),
                    ''
                ) AS category_names
         FROM products p
         LEFT JOIN users u ON u.id = p.deleted_by
         WHERE p.deleted_at IS NOT NULL
         ORDER BY p.deleted_at DESC"
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    json_response(array_map(function ($r) {
        return [
            'id'              => (string)$r['id'],
            'name'            => $r['name'],
            'category'        => $r['category_names'] ?? '',
            'supplier'        => $r['supplier'],
            'stock'           => 0,
            'price'           => 0,
            'deletedAt'       => $r['deleted_at'],
            'deletedByName'   => $r['deleted_by_name'] ?? $r['deleted_by'] ?? null,
            'deleteNote'      => $r['delete_note'] ?? null,
            'daysSinceDelete' => $r['deleted_at']
                ? (int)floor((time() - strtotime($r['deleted_at'])) / 86400)
                : 0,
        ];
    }, $rows));
}

// POST /products/{id}/restore
if ($id && $id !== 'deleted' && $sub === 'restore' && $method === 'POST') {
    require_role(['admin/owner', 'admin', 'inventory_manager']);
    $t = $pdo->prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NOT NULL');
    $t->execute([$id]);
    if (!$t->fetch()) json_response(['error' => 'Product not found in recycle bin.'], 404);
    $pdo->prepare(
        "UPDATE products SET deleted_at = NULL, deleted_by = NULL, delete_note = NULL, updated_at = NOW() WHERE id = ?"
    )->execute([$id]);
    sync_product_status($id);
    json_response(['message' => 'Product restored.']);
}

// DELETE /products/{id}/purge
if ($id && $id !== 'deleted' && $sub === 'purge' && $method === 'DELETE') {
    require_role(['admin/owner', 'admin', 'inventory_manager']);
    $t = $pdo->prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NOT NULL');
    $t->execute([$id]);
    if (!$t->fetch()) json_response(['error' => 'Product not found in recycle bin.'], 404);
    $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
    json_response(['message' => 'Product permanently deleted.']);
}

// ── /products/{id} generic block (excludes reserved words) ───────────────────
if ($id && $id !== 'deleted') {
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
        $normalizedBatches = null;
        if (array_key_exists('batches', $data)) {
            if (!is_array($data['batches'])) {
                json_response(['error' => 'Batches must be a list.'], 422);
            }
            if ($data['batches']) {
                $normalizedBatches = array_map('normalize_product_batch', $data['batches']);
            }
        }

        $barcode = trim((string)($data['barcode'] ?? ''));
        $pdo->beginTransaction();
        try {
            $exists = $pdo->prepare('SELECT id FROM products WHERE id = ? FOR UPDATE');
            $exists->execute([$id]);
            if (!$exists->fetchColumn()) {
                $pdo->rollBack();
                json_response(['error' => 'Product not found.'], 404);
            }

            $barcodeCheck = $pdo->prepare('SELECT id FROM products WHERE barcode = ? AND id <> ?');
            $barcodeCheck->execute([$barcode, $id]);
            if ($barcode !== '' && $barcodeCheck->fetch()) {
                $pdo->rollBack();
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

            if ($normalizedBatches !== null) {
                $pdo->prepare('DELETE FROM product_batches WHERE product_id = ?')->execute([$id]);
                $ins = $pdo->prepare(
                    'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
                     VALUES (?, ?, ?, ?, ?, ?, ?)'
                );
                foreach ($normalizedBatches as $batch) {
                    $ins->execute([
                        $batch['batchId'], $id, $batch['qty'], $batch['expiryDate'],
                        $batch['receivedDate'], $batch['batchTotalCost'], $batch['unitCost'],
                    ]);
                }
            }

            sync_product_status($id);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $stmt->execute([$id]);
        json_response(enrich_product($stmt->fetch()));
    }

    // DELETE product — soft-delete (column now always present after migration)
    if ($method === 'DELETE') {
        require_role(['admin/owner', 'admin', 'inventory_manager']);
        $actor = current_user();
        $cols  = $pdo->query("SHOW COLUMNS FROM products LIKE 'deleted_at'")->fetchAll();
        if (!empty($cols)) {
            $existing = $pdo->prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL');
            $existing->execute([$id]);
            if (!$existing->fetchColumn()) json_response(['error' => 'Product not found.'], 404);
            $note = body()['note'] ?? null;
            $pdo->prepare(
                "UPDATE products SET deleted_at = NOW(), deleted_by = ?, delete_note = ?, status = 'out_of_stock', updated_at = NOW() WHERE id = ?"
            )->execute([$actor['id'] ?? null, $note, $id]);
            json_response(['message' => 'Product moved to recycle bin.']);
        } else {
            $stmt = $pdo->prepare('DELETE FROM products WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) json_response(['error' => 'Product not found.'], 404);
            json_response(['message' => 'Product deleted.']);
        }
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── /products ─────────────────────────────────────────────────────────────────

// GET all products
if ($method === 'GET') {
    $search = $_GET['search'] ?? '';
    $status = $_GET['status'] ?? 'all';

    $softDeleteEnabled = !empty($pdo->query("SHOW COLUMNS FROM products LIKE 'deleted_at'")->fetchAll());
    $sql    = 'SELECT * FROM products WHERE 1=1' . ($softDeleteEnabled ? ' AND (deleted_at IS NULL)' : '');
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
    if (!is_array($data['batches'])) {
        json_response(['error' => 'Batches must be a list.'], 422);
    }
    $normalizedBatches = array_map('normalize_product_batch', $data['batches']);
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

    $pdo->beginTransaction();
    try {
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

        $ins = $pdo->prepare(
            'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($normalizedBatches as $batch) {
            $ins->execute([
                $batch['batchId'], $productId, $batch['qty'], $batch['expiryDate'],
                $batch['receivedDate'], $batch['batchTotalCost'], $batch['unitCost'],
            ]);
        }

        sync_product_status($productId);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
    $stmt->execute([$productId]);
    json_response(enrich_product($stmt->fetch()), 201);
}

json_response(['error' => 'Method not allowed.'], 405);
