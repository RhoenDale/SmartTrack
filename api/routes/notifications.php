<?php
/**
 * Notification routes
 *
 *   GET  /notifications             — list all (unread first)
 *   POST /notifications/mark-read   — mark one or all as read
 *   POST /notifications/generate    — auto-generate stock/expiry alerts
 *   POST /notifications             — create a notification [admin]
 */

require_auth();
$pdo = db();

if ($id === 'mark-read' && $method === 'POST') {
    $data = body();
    if (!empty($data['id'])) {
        $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')
            ->execute([(int)$data['id']]);
    } else {
        // Mark all
        $pdo->exec('UPDATE notifications SET is_read = 1');
    }
    json_response(['message' => 'Marked as read.']);
}

if ($id === 'generate' && $method === 'POST') {
    // Auto-generate alerts based on current inventory state
    generate_inventory_notifications($pdo);
    json_response(['message' => 'Notifications generated.']);
}

if ($method === 'GET') {
    purge_expired_recycle_bin($pdo);
    generate_inventory_notifications($pdo);
    $stmt = $pdo->query(
        'SELECT id, type, title, body, product_id, is_read, created_at
         FROM notifications
            ORDER BY (title LIKE "Out of Stock:%") DESC, is_read ASC, created_at DESC
         LIMIT 50'
    );
    $rows = $stmt->fetchAll();
    json_response(array_map('format_notif', $rows));
}

if ($method === 'POST') {
    require_role(['admin/owner', 'admin']);
    $data = body();
    require_fields($data, ['type', 'title', 'body']);

    $pdo->prepare(
        'INSERT INTO notifications (type, title, body, product_id, is_read)
         VALUES (?, ?, ?, ?, 0)'
    )->execute([$data['type'], $data['title'], $data['body'], $data['product_id'] ?? null]);

    json_response(['message' => 'Notification created.'], 201);
}

json_response(['error' => 'Method not allowed.'], 405);

// ─── Auto-generator ───────────────────────────────────────────────────────────
function generate_inventory_notifications(PDO $pdo): void {
    $today = time();
    $softDeleteEnabled = !empty($pdo->query("SHOW COLUMNS FROM products LIKE 'deleted_at'")->fetchAll());

    $pdo->exec(
        "DELETE n
         FROM notifications n
         LEFT JOIN products p ON p.id = n.product_id
         WHERE (
             (n.product_id IS NOT NULL AND (
                 p.id IS NULL
                 " . ($softDeleteEnabled ? 'OR p.deleted_at IS NOT NULL' : '') . "
             ))
             OR (
                 n.product_id IS NULL
                 AND NOT EXISTS (
                     SELECT 1
                     FROM products active_product
                     WHERE (
                         n.title = CONCAT('Out of Stock: ', active_product.name)
                         OR n.title = CONCAT('Critical Stock: ', active_product.name)
                         OR n.title = CONCAT('Low Stock: ', active_product.name)
                         OR n.title = CONCAT('Expired: ', active_product.name)
                         OR n.title = CONCAT('Expiring Soon: ', active_product.name)
                         OR n.title = CONCAT('Expiry Alert: ', active_product.name)
                     )" . ($softDeleteEnabled ? ' AND active_product.deleted_at IS NULL' : '') . "
                 )
             )
         )
           AND (
               n.title LIKE 'Out of Stock:%'
               OR n.title LIKE 'Critical Stock:%'
               OR n.title LIKE 'Low Stock:%'
               OR n.title LIKE 'Expired:%'
               OR n.title LIKE 'Expiring Soon:%'
               OR n.title LIKE 'Expiry Alert:%'
           )"
    );

    $products = $pdo->query(
        'SELECT p.id, p.name, p.status, p.reorder, p.units_per_pack,
                COALESCE(SUM(b.qty),0) AS stock,
                MIN(b.expiry_date) AS earliest_expiry
         FROM products p
         LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
         ' . ($softDeleteEnabled ? 'WHERE p.deleted_at IS NULL' : '') . '
         GROUP BY p.id, p.name, p.status, p.reorder, p.units_per_pack'
    )->fetchAll();

    foreach ($products as $p) {
        $stock = (int)$p['stock'];
        $reorderUnits = (int)$p['reorder'] * max(1, (int)$p['units_per_pack']);
        $currentStatus = compute_status($stock, $reorderUnits);
        if ($currentStatus !== $p['status']) {
            $pdo->prepare('UPDATE products SET status = ? WHERE id = ?')
                ->execute([$currentStatus, $p['id']]);
        }

        // Stock alerts
        if (in_array($currentStatus, ['out_of_stock', 'critical', 'low'], true)) {
            $title = $currentStatus === 'out_of_stock'
                ? "Out of Stock: {$p['name']}"
                : ucfirst($currentStatus) . " Stock: {$p['name']}";
            $body  = $currentStatus === 'out_of_stock'
                ? "{$p['name']} has 0 units available. Reorder now."
                : "{$p['name']} is {$currentStatus} with {$stock} units left "
                   . "and reorder point at {$p['reorder']}.";
            upsert_notification($pdo, 'alert', $title, $body, $p['id']);
        } else {
            $pdo->prepare(
                "DELETE FROM notifications
                 WHERE product_id = ?
                   AND (title LIKE 'Out of Stock:%' OR title LIKE 'Critical Stock:%' OR title LIKE 'Low Stock:%')"
            )->execute([$p['id']]);
        }

        // Keep only the expiry notification that currently applies, if any.
        $expiryTitles = [
            "Expired: {$p['name']}",
            "Expiring Soon: {$p['name']}",
            "Expiry Alert: {$p['name']}",
        ];
        $currentExpiryTitle = null;

        if ($p['earliest_expiry']) {
            $expTs    = strtotime($p['earliest_expiry']);
            $daysLeft = ($expTs - $today) / 86400;

            if ($daysLeft <= 0) {
                $title = $currentExpiryTitle = $expiryTitles[0];
                $body  = "Batch expired on " . date('m/d/Y', $expTs) . ". Remove from shelf immediately.";
                upsert_notification($pdo, 'alert', $title, $body, $p['id']);
            } elseif ($daysLeft <= 30) {
                $title = $currentExpiryTitle = $expiryTitles[1];
                $body  = "Expires " . date('m/d/Y', $expTs) . " — within 30 days. Prioritize sales.";
                upsert_notification($pdo, 'alert', $title, $body, $p['id']);
            } elseif ($daysLeft <= 90) {
                $title = $currentExpiryTitle = $expiryTitles[2];
                $body  = "Expires " . date('m/d/Y', $expTs) . " — within 90 days.";
                upsert_notification($pdo, 'alert', $title, $body, $p['id']);
            }
        }

        if ($currentExpiryTitle === null) {
            $pdo->prepare('DELETE FROM notifications WHERE product_id = ? AND title IN (?, ?, ?)')
                ->execute([$p['id'], ...$expiryTitles]);
        } else {
            $pdo->prepare('DELETE FROM notifications WHERE product_id = ? AND title IN (?, ?, ?) AND title <> ?')
                ->execute([$p['id'], ...$expiryTitles, $currentExpiryTitle]);
        }
    }
}

function upsert_notification(PDO $pdo, string $type, string $title, string $body, ?string $productId): void {
    // Keep polling from recreating an alert after it has been marked read.
    $check = $pdo->prepare('SELECT id FROM notifications WHERE product_id <=> ? AND title = ? LIMIT 1');
    $check->execute([$productId, $title]);
    if ($check->fetchColumn()) return;

    $pdo->prepare(
        'INSERT INTO notifications (type, title, body, product_id, is_read) VALUES (?, ?, ?, ?, 0)'
    )->execute([$type, $title, $body, $productId]);
}

function format_notif(array $n): array {
    return [
        'id'        => (int)$n['id'],
        'type'      => $n['type'],
        'title'     => $n['title'],
        'body'      => $n['body'],
        'productId' => $n['product_id'],
        'read'      => (bool)$n['is_read'],
        'time'      => time_ago($n['created_at']),
    ];
}

function time_ago(string $datetime): string {
    $diff = time() - strtotime($datetime);
    if ($diff < 60)   return 'Just now';
    if ($diff < 3600) return (int)($diff/60) . ' min ago';
    if ($diff < 86400)return (int)($diff/3600) . ' hr ago';
    return date('m/d/Y', strtotime($datetime));
}
