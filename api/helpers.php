<?php
/**
 * SmartTrack — Shared helper functions
 */

/** Send a JSON response and exit. */
function json_response(mixed $data, int $status = 200): void {
    record_activity_request($status);
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Record each authenticated API request without persisting request payloads. */
function record_activity_request(int $status): void {
    global $resource, $id, $method, $uri;
    static $tableAvailable = null;

    if ($resource === 'health' || $resource === 'activity') return;

    $isLogin = $resource === 'auth' && $id === 'login';

    try {
        if ($tableAvailable === null) {
            $tableAvailable = (bool)db()->query("SHOW TABLES LIKE 'activity_logs'")->fetchColumn();
        }
        if (!$tableAvailable) return;

        $actor = $GLOBALS['smarttrack_activity_actor'] ?? current_user();
        if (!$actor && !$isLogin) return;

        $path = '/' . trim((string)$uri, '/');
        $path = mb_substr($path, 0, 500);
        $actorId = is_array($actor) && isset($actor['id']) ? (string)$actor['id'] : null;
        $actorName = is_array($actor) && !empty($actor['name'])
            ? (string)$actor['name']
            : 'Unauthenticated';

        db()->prepare(
            'INSERT INTO activity_logs (actor_user_id, actor_name, method, request_path, response_status)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$actorId, mb_substr($actorName, 0, 120), $method, $path, $status]);
    } catch (PDOException $error) {
        error_log('SmartTrack activity log write failed: ' . $error->getMessage());
    }
}

/** Read and decode the JSON request body. */
function body(): array {
    static $parsed = null;
    if ($parsed === null) {
        $raw    = file_get_contents('php://input');
        $parsed = json_decode($raw, true) ?? [];
    }
    return $parsed;
}

/** Require specific fields in input; returns 422 if missing. */
function require_fields(array $data, array $fields): void {
    foreach ($fields as $f) {
        if (!isset($data[$f]) || $data[$f] === '') {
            json_response(['error' => "Field '$f' is required."], 422);
        }
    }
}

/** Normalize an optional batch expiry date, accepting API and display formats. */
function normalize_optional_date(mixed $value, string $field = 'Expiry date'): ?string {
    if ($value === null || $value === '') return null;
    if (!is_string($value)) {
        json_response(['error' => "$field must be a valid date or left blank."], 422);
    }

    $value = trim($value);
    if ($value === '') return null;

    foreach (['!Y-m-d' => 'Y-m-d', '!m/d/Y' => 'm/d/Y'] as $inputFormat => $outputFormat) {
        $date = DateTimeImmutable::createFromFormat($inputFormat, $value);
        $errors = DateTimeImmutable::getLastErrors();
        if ($date && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))) {
            return $date->format('Y-m-d');
        }
    }

    json_response(['error' => "$field must be a valid date or left blank."], 422);
}

/** Validate and normalize a product batch before opening a write transaction. */
function normalize_product_batch(mixed $batch): array {
    if (!is_array($batch)) {
        json_response(['error' => 'Each batch must be an object.'], 422);
    }

    $batchId = trim((string)($batch['batchId'] ?? ''));
    $qty = filter_var($batch['qty'] ?? null, FILTER_VALIDATE_INT);
    if ($batchId === '' || mb_strlen($batchId) > 30 || $qty === false || $qty <= 0) {
        json_response(['error' => 'Each batch needs an ID of 1 to 30 characters and a positive whole-number quantity.'], 422);
    }

    $costValue = $batch['batchTotalCost'] ?? null;
    $totalCost = ($costValue === '' || $costValue === null)
        ? null
        : filter_var($costValue, FILTER_VALIDATE_FLOAT);
    if ($totalCost === false || ($totalCost !== null && $totalCost < 0)) {
        json_response(['error' => 'Batch cost must be zero or greater.'], 422);
    }

    $receivedDate = normalize_optional_date($batch['receivedDate'] ?? date('Y-m-d'), 'Received date');
    return [
        'batchId' => $batchId,
        'qty' => $qty,
        'expiryDate' => normalize_optional_date($batch['expiryDate'] ?? $batch['expiry'] ?? null),
        'receivedDate' => $receivedDate ?? date('Y-m-d'),
        'batchTotalCost' => $totalCost,
        'unitCost' => $totalCost !== null ? round($totalCost / $qty, 4) : null,
    ];
}

/**
 * Compute stock status from stock and reorder point.
 * Mirrors the frontend computeStatus() in shared.tsx.
 */
function compute_status(int $stock, int $reorder): string {
    if ($stock <= 0) return 'out_of_stock';
    if ($reorder <= 0) return 'good';
    if ($stock < $reorder * 0.4) return 'critical';
    if ($stock < $reorder)       return 'low';
    if ($stock < $reorder * 1.5) return 'moderate';
    return 'good';
}

/**
 * Derive initials from a full name (first 2 words).
 * Mirrors initials() in shared.tsx.
 */
function make_initials(string $name): string {
    $words = array_filter(explode(' ', $name));
    $words = array_slice(array_values($words), 0, 2);
    return implode('', array_map(fn($w) => strtoupper($w[0]), $words));
}

/**
 * Return abbreviated staff name: "Juan Dela Cruz" → "J. Dela Cruz"
 * Mirrors staffAbbrev() in shared.tsx.
 */
function staff_abbrev(string $name): string {
    $parts = explode(' ', trim($name));
    if (count($parts) === 0) return $name;
    $parts[0] = strtoupper($parts[0][0]) . '.';
    return implode(' ', $parts);
}

/** Generate a transaction ID like TXN-XXXX */
function gen_tx_id(string $prefix = 'TXN'): string {
    return $prefix . '-' . strtoupper(substr(uniqid(), -6));
}

/**
 * Run FIFO deduction on a product's batches.
 * Batches are ordered by received_date ASC (FIFO).
 * Returns ['consumed' => [...], 'updated_batches' => [...]]
 * Throws Exception if insufficient stock.
 */
function fifo_deduct(string $productId, int $qty): array {
    $pdo = db();

    // Lock rows for update to prevent race conditions
    $stmt = $pdo->prepare(
        'SELECT id, batch_id, qty, expiry_date, received_date, unit_cost
         FROM product_batches
         WHERE product_id = ? AND qty > 0
         ORDER BY received_date ASC, id ASC
         FOR UPDATE'
    );
    $stmt->execute([$productId]);
    $batches = $stmt->fetchAll();

    $totalAvailable = array_sum(array_column($batches, 'qty'));
    if ($qty > $totalAvailable) {
        throw new Exception("Insufficient stock. Requested: $qty, Available: $totalAvailable");
    }

    $remaining = $qty;
    $consumed  = [];
    $updates   = [];

    foreach ($batches as $b) {
        if ($remaining <= 0) break;
        $deduct     = min((int)$b['qty'], $remaining);
        $remaining -= $deduct;
        $newQty     = (int)$b['qty'] - $deduct;
        $consumed[] = [
            'batchId'    => $b['batch_id'],
            'expiry'     => $b['expiry_date'],
            'qty'        => $deduct,
            'unitCost'   => $b['unit_cost'] !== null ? (float)$b['unit_cost'] : null,
        ];
        $updates[]  = ['id' => $b['id'], 'qty' => $newQty];
    }

    // Apply updates
    $upd = $pdo->prepare('UPDATE product_batches SET qty = ? WHERE id = ?');
    foreach ($updates as $u) {
        $upd->execute([$u['qty'], $u['id']]);
    }

    // Remove fully exhausted batches
    $pdo->prepare('DELETE FROM product_batches WHERE product_id = ? AND qty = 0')
        ->execute([$productId]);

    return $consumed;
}

/**
 * Restock a batch (for returns).
 * If batch exists, adds qty back; otherwise re-inserts it.
 */
function fifo_restock(string $productId, int $qty, string $batchId, ?string $expiryDate): void {
    $pdo  = db();
    $stmt = $pdo->prepare('SELECT id FROM product_batches WHERE batch_id = ?');
    $stmt->execute([$batchId]);

    if ($stmt->fetchColumn()) {
        $pdo->prepare('UPDATE product_batches SET qty = qty + ? WHERE batch_id = ?')
            ->execute([$qty, $batchId]);
    } else {
        $pdo->prepare(
            'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date)
             VALUES (?, ?, ?, ?, CURDATE())'
        )->execute([$batchId, $productId, $qty, $expiryDate]);
    }
}

/**
 * Recompute and update a product's status field
 * from its current batch totals.
 */
function sync_product_status(string $productId): void {
    $pdo  = db();
    $stmt = $pdo->prepare(
        'SELECT p.name, p.reorder, p.units_per_pack, COALESCE(SUM(b.qty),0) AS stock
         FROM products p
         LEFT JOIN product_batches b ON b.product_id = p.id
         WHERE p.id = ?
         GROUP BY p.name, p.reorder, p.units_per_pack'
    );
    $stmt->execute([$productId]);
    $row = $stmt->fetch();
    if (!$row) return;

    $stock = (int)$row['stock'];
    $reorderUnits = (int)$row['reorder'] * max(1, (int)$row['units_per_pack']);
    $status = compute_status($stock, $reorderUnits);
    $pdo->prepare('UPDATE products SET status = ? WHERE id = ?')
        ->execute([$status, $productId]);

    $title = "Out of Stock: {$row['name']}";
    if ($stock <= 0) {
        $check = $pdo->prepare('SELECT id FROM notifications WHERE product_id = ? AND title = ? LIMIT 1');
        $check->execute([$productId, $title]);
        if (!$check->fetchColumn()) {
            $pdo->prepare(
                'INSERT INTO notifications (type, title, body, product_id, is_read)
                 VALUES (?, ?, ?, ?, 0)'
            )->execute(['alert', $title, "{$row['name']} has reached 0 units. Reorder now.", $productId]);
        }
    } else {
        $pdo->prepare('DELETE FROM notifications WHERE product_id = ? AND title = ?')
            ->execute([$productId, $title]);
    }
}

function product_purge_history_ready(PDO $pdo): bool {
    $itemTable = $pdo->query("SHOW TABLES LIKE 'purchase_order_items'")->fetchColumn();
    $receiptTable = $pdo->query("SHOW TABLES LIKE 'purchase_order_receipts'")->fetchColumn();
    if (!$itemTable && !$receiptTable) return true;
    if (!$itemTable || !$receiptTable) return false;

    $snapshot = $pdo->query("SHOW COLUMNS FROM purchase_order_items LIKE 'product_name_snapshot'")->fetch(PDO::FETCH_ASSOC);
    $itemProduct = $pdo->query("SHOW COLUMNS FROM purchase_order_items LIKE 'product_id'")->fetch(PDO::FETCH_ASSOC);
    $receiptProduct = $pdo->query("SHOW COLUMNS FROM purchase_order_receipts LIKE 'product_id'")->fetch(PDO::FETCH_ASSOC);
    if (!$snapshot || ($itemProduct['Null'] ?? '') !== 'YES' || ($receiptProduct['Null'] ?? '') !== 'YES') {
        return false;
    }

    $stmt = $pdo->prepare(
        "SELECT COUNT(*)
         FROM information_schema.REFERENTIAL_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE()
           AND CONSTRAINT_NAME IN ('fk_purchase_order_items_product_purge', 'fk_purchase_receipts_product_purge')
           AND DELETE_RULE = 'SET NULL'"
    );
    $stmt->execute();
    return (int)$stmt->fetchColumn() === 2;
}

function purge_expired_recycle_bin(PDO $pdo): void {
    $lock = $pdo->query("SELECT GET_LOCK('smarttrack_recycle_bin_auto_purge', 0)")->fetchColumn();
    if ((int)$lock !== 1) return;

    try {
        $userDeletedAt = $pdo->query("SHOW COLUMNS FROM users LIKE 'deleted_at'")->fetchColumn();
        if ($userDeletedAt) {
            $pdo->exec(
                'DELETE FROM users
                 WHERE deleted_at IS NOT NULL
                   AND deleted_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)'
            );
        }

        $productDeletedAt = $pdo->query("SHOW COLUMNS FROM products LIKE 'deleted_at'")->fetchColumn();
        if ($productDeletedAt && product_purge_history_ready($pdo)) {
            $pdo->exec(
                'DELETE n
                 FROM notifications n
                 INNER JOIN products p ON p.id = n.product_id
                 WHERE p.deleted_at IS NOT NULL
                   AND p.deleted_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)'
            );
            $pdo->exec(
                'DELETE FROM products
                 WHERE deleted_at IS NOT NULL
                   AND deleted_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)'
            );
        }
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('smarttrack_recycle_bin_auto_purge')");
    }
}

/**
 * Attach computed fields to a product row:
 *   stock  — sum of batch qty
 *   expiry — earliest batch expiry
 *   batches — array of batch rows
 */
function enrich_product(array $product): array {
    $pdo  = db();
    $stmt = $pdo->prepare(
        'SELECT batch_id, qty, expiry_date, received_date, batch_total_cost, unit_cost
         FROM product_batches
         WHERE product_id = ? AND qty > 0
         ORDER BY received_date ASC, id ASC'
    );
    $stmt->execute([$product['id']]);
    $batches = $stmt->fetchAll();

    $stock = 0;
    $earliestExpiry = null;
    $batchArr = [];

    foreach ($batches as $b) {
        $stock += (int)$b['qty'];
        if ($b['expiry_date'] !== null && ($earliestExpiry === null || $b['expiry_date'] < $earliestExpiry)) {
            $earliestExpiry = $b['expiry_date'];
        }
        $batchArr[] = [
            'batchId'        => $b['batch_id'],
            'qty'            => (int)$b['qty'],
            'expiry'         => $b['expiry_date'] ? date('m/d/Y', strtotime($b['expiry_date'])) : null,
            'expiryDate'     => $b['expiry_date'],
            'receivedDate'   => date('m/d/Y', strtotime($b['received_date'])),
            'batchTotalCost' => $b['batch_total_cost'] !== null ? (float)$b['batch_total_cost'] : null,
            'unitCost'       => $b['unit_cost']        !== null ? (float)$b['unit_cost']        : null,
        ];
    }

    $product['stock']      = $stock;
    $product['expiry']     = $earliestExpiry ? date('m/d/Y', strtotime($earliestExpiry)) : '—';
    $product['batches']    = $batchArr;
    $categoryStmt = $pdo->prepare(
        'SELECT c.name
         FROM product_category_map pcm
         JOIN categories c ON c.id = pcm.category_id
         WHERE pcm.product_id = ?
         ORDER BY c.name ASC'
    );
    $categoryStmt->execute([$product['id']]);
    $categories = array_column($categoryStmt->fetchAll(PDO::FETCH_ASSOC), 'name');
    $product['categories'] = $categories;
    $product['category'] = implode(', ', $categories);
    $product['price']      = (float)$product['price'];
    $product['sale_price'] = $product['sale_price'] !== null ? (float)$product['sale_price'] : null;
    $product['unit_label'] = $product['unit_label'] ?? 'unit';
    $product['units_per_pack'] = max(1, (int)($product['units_per_pack'] ?? 1));
    $product['pack_price'] = $product['pack_price'] !== null ? (float)$product['pack_price'] : null;
    $product['reorder']    = (int)$product['reorder'];

    return $product;
}

/** Validate category names supplied when creating or updating a product. */
function product_category_names(array $data): array {
    $input = $data['categories'] ?? ($data['category'] ?? []);
    if (is_string($input)) $input = preg_split('/\s*\/\s*/u', $input);
    if (!is_array($input)) {
        json_response(['error' => 'Categories must be a list of category names.'], 422);
    }

    $names = [];
    $seen = [];
    foreach ($input as $value) {
        if (!is_string($value)) {
            json_response(['error' => 'Each category must be a text value.'], 422);
        }
        foreach (preg_split('/\s*\/\s*/u', $value) as $name) {
            $name = trim($name);
            if ($name === '') continue;
            if (mb_strlen($name) > 80) {
                json_response(['error' => 'Category names must be 80 characters or fewer.'], 422);
            }
            $key = mb_strtolower($name);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $names[] = $name;
        }
    }
    if (!$names) {
        json_response(['error' => 'Select or add at least one category.'], 422);
    }
    return $names;
}

/** Replace a product's category links and retain a joined legacy category field. */
function sync_product_categories(PDO $pdo, string|int $productId, array $names): void {
    $pdo->prepare('DELETE FROM product_category_map WHERE product_id = ?')->execute([$productId]);
    $findCategory = $pdo->prepare('SELECT id FROM categories WHERE name = ?');
    $linkCategory = $pdo->prepare(
        'INSERT INTO product_category_map (product_id, category_id) VALUES (?, ?)'
    );
    foreach ($names as $name) {
        $pdo->prepare('INSERT IGNORE INTO categories (name) VALUES (?)')->execute([$name]);
        $findCategory->execute([$name]);
        $categoryId = $findCategory->fetchColumn();
        if ($categoryId === false) {
            throw new RuntimeException("Unable to find saved category '{$name}'.");
        }
        $linkCategory->execute([$productId, $categoryId]);
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

    $customerVatExempt = false;
    $customerExemptionType = null;
    $customerIdNumber = null;
    if (($tx['type'] ?? '') === 'sale') {
        // Prefer dedicated columns (added in add_customer_id_to_transactions migration)
        if (!empty($tx['customer_vat_exempt'])) {
            $customerVatExempt     = true;
            $customerExemptionType = $tx['customer_exemption_type'] ?? null;
            $customerIdNumber      = $tx['customer_id_number']      ?? null;
        } elseif (!empty($tx['note'])) {
            // Fallback: parse legacy note for rows that pre-date the migration
            if (preg_match('/^Customer (?:VAT exemption|discount): (.+) ID (.+)$/', $tx['note'], $matches)) {
                $customerVatExempt     = true;
                $customerExemptionType = $matches[1];
                $customerIdNumber      = $matches[2];
            }
        }
    }

    return [
        'id'               => $tx['id'],
        'type'             => $tx['type'],
        'saleGroupId'      => $tx['sale_group_id'] ?? null,
        'product'          => $tx['product_name'],
        'productId'        => $tx['product_id'],
        'qty'              => (int)$tx['qty'],
        'saleQty'          => isset($tx['sale_qty']) && $tx['sale_qty'] !== null ? (int)$tx['sale_qty'] : (int)$tx['qty'],
        'saleUnit'         => $tx['sale_unit'] ?? 'unit',
        'unitsPerSale'     => isset($tx['units_per_sale']) ? (int)$tx['units_per_sale'] : 1,
        'amount'           => (float)$tx['amount'],
        'discountAmount'   => (float)($tx['discount_amount'] ?? 0),
        'preTaxAmount'     => isset($tx['pre_tax_amount']) ? (float)$tx['pre_tax_amount'] : null,
        'taxAmount'        => isset($tx['tax_amount'])     ? (float)$tx['tax_amount']     : null,
        'taxRate'          => isset($tx['tax_rate'])       ? (float)$tx['tax_rate']       : null,
        'customerVatExempt' => $customerVatExempt,
        'customerExemptionType' => $customerExemptionType,
        'customerIdNumber' => $customerIdNumber,
        'staff'            => $staffName,
        'staffId'          => $tx['staff_id'] ?? null,
        'status'           => $tx['status'],
        'date'             => date('m/d/Y H:i', strtotime($tx['transacted_at'])),
        'note'             => $tx['note'] ?? null,
        'returnedTxId'     => $tx['returned_tx_id'] ?? null,
        'adjustmentReason' => $tx['adjustment_reason'] ?? null,
        'damagedQty'       => isset($tx['damaged_qty']) ? (int)$tx['damaged_qty'] : null,
    ];
}
