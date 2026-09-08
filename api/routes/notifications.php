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
    $stmt = $pdo->query(
        'SELECT id, type, title, body, product_id, is_read, created_at
         FROM notifications
         ORDER BY is_read ASC, created_at DESC
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

    $products = $pdo->query(
        'SELECT p.id, p.name, p.status, p.reorder,
                COALESCE(SUM(b.qty),0) AS stock,
                MIN(b.expiry_date) AS earliest_expiry
         FROM products p
         LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
         GROUP BY p.id, p.name, p.status, p.reorder'
    )->fetchAll();

    foreach ($products as $p) {
        // Stock alerts
        if (in_array($p['status'], ['critical', 'low'])) {
            $title = ucfirst($p['status']) . " Stock: {$p['name']}";
            $body  = "{$p['name']} is {$p['status']} with {$p['stock']} units left "
                   . "and reorder point at {$p['reorder']}.";
            upsert_notification($pdo, 'alert', $title, $body, $p['id']);
        }

        // Expiry alerts
        if ($p['earliest_expiry']) {
            $expTs    = strtotime($p['earliest_expiry']);
            $daysLeft = ($expTs - $today) / 86400;

            if ($daysLeft <= 0) {
                $title = "Expired: {$p['name']}";
                $body  = "Batch expired on " . date('m/d/Y', $expTs) . ". Remove from shelf immediately.";
                upsert_notification($pdo, 'alert', $title, $body, $p['id']);
            } elseif ($daysLeft <= 30) {
                $title = "Expiring Soon: {$p['name']}";
                $body  = "Expires " . date('m/d/Y', $expTs) . " — within 30 days. Prioritize sales.";
                upsert_notification($pdo, 'alert', $title, $body, $p['id']);
            } elseif ($daysLeft <= 90) {
                $title = "Expiry Alert: {$p['name']}";
                $body  = "Expires " . date('m/d/Y', $expTs) . " — within 90 days.";
                upsert_notification($pdo, 'alert', $title, $body, $p['id']);
            }
        }
    }
}

function upsert_notification(PDO $pdo, string $type, string $title, string $body, ?string $productId): void {
    // Avoid duplicating existing unread notifications with the same title
    $check = $pdo->prepare('SELECT id FROM notifications WHERE title = ? AND is_read = 0 LIMIT 1');
    $check->execute([$title]);
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
