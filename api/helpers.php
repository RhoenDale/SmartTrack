<?php
/**
 * SmartTrack — Shared helper functions
 */

/** Send a JSON response and exit. */
function json_response(mixed $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
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

/**
 * Compute stock status from stock and reorder point.
 * Mirrors the frontend computeStatus() in shared.tsx.
 */
function compute_status(int $stock, int $reorder): string {
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
        'SELECT id, batch_id, qty, expiry_date, received_date
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
function fifo_restock(string $productId, int $qty, string $batchId, string $expiryDate): void {
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
        'SELECT p.reorder, COALESCE(SUM(b.qty),0) AS stock
         FROM products p
         LEFT JOIN product_batches b ON b.product_id = p.id
         WHERE p.id = ?
         GROUP BY p.reorder'
    );
    $stmt->execute([$productId]);
    $row = $stmt->fetch();
    if (!$row) return;

    $status = compute_status((int)$row['stock'], (int)$row['reorder']);
    $pdo->prepare('UPDATE products SET status = ? WHERE id = ?')
        ->execute([$status, $productId]);
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
        if ($earliestExpiry === null || $b['expiry_date'] < $earliestExpiry) {
            $earliestExpiry = $b['expiry_date'];
        }
        $batchArr[] = [
            'batchId'        => $b['batch_id'],
            'qty'            => (int)$b['qty'],
            'expiry'         => date('m/d/Y', strtotime($b['expiry_date'])),
            'expiryDate'     => $b['expiry_date'],
            'receivedDate'   => date('m/d/Y', strtotime($b['received_date'])),
            'batchTotalCost' => $b['batch_total_cost'] !== null ? (float)$b['batch_total_cost'] : null,
            'unitCost'       => $b['unit_cost']        !== null ? (float)$b['unit_cost']        : null,
        ];
    }

    $product['stock']      = $stock;
    $product['expiry']     = $earliestExpiry ? date('m/d/Y', strtotime($earliestExpiry)) : '—';
    $product['batches']    = $batchArr;
    $product['price']      = (float)$product['price'];
    $product['sale_price'] = $product['sale_price'] !== null ? (float)$product['sale_price'] : null;
    $product['is_vat_exempt'] = (int)($product['is_vat_exempt'] ?? 0);
    $product['reorder']    = (int)$product['reorder'];

    return $product;
}
