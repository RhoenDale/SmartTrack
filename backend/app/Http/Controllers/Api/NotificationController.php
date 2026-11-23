<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    use ApiHelpers;

    /* ── POST /notifications/mark-read ───────────────────────────────────── */
    public function markRead(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $data = $this->body($request);
        if (!empty($data['id'])) {
            DB::update('UPDATE notifications SET is_read = 1 WHERE id = ?', [(int)$data['id']]);
        } else {
            DB::statement('UPDATE notifications SET is_read = 1');
        }
        return $this->json(['message' => 'Marked as read.']);
    }

    /* ── POST /notifications/generate ────────────────────────────────────── */
    public function generate(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $this->generateInventoryNotifications();
        return $this->json(['message' => 'Notifications generated.']);
    }

    /* ── GET /notifications ───────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        InventoryService::purgeExpiredRecycleBin();
        $this->generateInventoryNotifications();
        $rows = DB::select(
            'SELECT id, type, title, body, product_id, is_read, created_at
             FROM notifications
             ORDER BY (title LIKE "Out of Stock:%") DESC, is_read ASC, created_at DESC
             LIMIT 50'
        );
        return $this->json(array_map(fn($n) => $this->formatNotif((array)$n), $rows));
    }

    /* ── POST /notifications ──────────────────────────────────────────────── */
    public function store(Request $request)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        $data = $this->body($request);
        $this->requireFields($data, ['type', 'title', 'body']);
        DB::insert(
            'INSERT INTO notifications (type, title, body, product_id, is_read) VALUES (?, ?, ?, ?, 0)',
            [$data['type'], $data['title'], $data['body'], $data['product_id'] ?? null]
        );
        return $this->json(['message' => 'Notification created.'], 201);
    }

    /* ── Auto-generator (ported from notifications.php) ──────────────────── */
    private function generateInventoryNotifications(): void
    {
        $pdo = DB::getPdo();
        $today = time();
        $softDeleteEnabled = !empty(DB::select("SHOW COLUMNS FROM products LIKE 'deleted_at'"));

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

        $products = DB::select(
            'SELECT p.id, p.name, p.status, p.reorder, p.units_per_pack,
                    COALESCE(SUM(b.qty),0) AS stock,
                    MIN(b.expiry_date) AS earliest_expiry
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             ' . ($softDeleteEnabled ? 'WHERE p.deleted_at IS NULL' : '') . '
             GROUP BY p.id, p.name, p.status, p.reorder, p.units_per_pack'
        );

        foreach ($products as $p) {
            $p = (array)$p;
            $stock = (int)$p['stock'];
            $reorderUnits = (int)$p['reorder'] * max(1, (int)$p['units_per_pack']);
            $currentStatus = InventoryService::computeStatus($stock, $reorderUnits);
            if ($currentStatus !== $p['status']) {
                DB::update('UPDATE products SET status = ? WHERE id = ?', [$currentStatus, $p['id']]);
            }

            if (in_array($currentStatus, ['out_of_stock', 'critical', 'low'], true)) {
                $title = $currentStatus === 'out_of_stock'
                    ? "Out of Stock: {$p['name']}"
                    : ucfirst($currentStatus) . " Stock: {$p['name']}";
                $body = $currentStatus === 'out_of_stock'
                    ? "{$p['name']} has 0 units available. Reorder now."
                    : "{$p['name']} is {$currentStatus} with {$stock} units left and reorder point at {$p['reorder']}.";
                $this->upsertNotification('alert', $title, $body, $p['id']);
            } else {
                DB::delete(
                    "DELETE FROM notifications WHERE product_id = ? AND (title LIKE 'Out of Stock:%' OR title LIKE 'Critical Stock:%' OR title LIKE 'Low Stock:%')",
                    [$p['id']]
                );
            }

            $expiryTitles = [
                "Expired: {$p['name']}",
                "Expiring Soon: {$p['name']}",
                "Expiry Alert: {$p['name']}",
            ];
            $currentExpiryTitle = null;

            if ($p['earliest_expiry']) {
                $expTs = strtotime($p['earliest_expiry']);
                $daysLeft = ($expTs - $today) / 86400;
                if ($daysLeft <= 0) {
                    $title = $currentExpiryTitle = $expiryTitles[0];
                    $body = "Batch expired on " . date('m/d/Y', $expTs) . ". Remove from shelf immediately.";
                    $this->upsertNotification('alert', $title, $body, $p['id']);
                } elseif ($daysLeft <= 30) {
                    $title = $currentExpiryTitle = $expiryTitles[1];
                    $body = "Expires " . date('m/d/Y', $expTs) . " — within 30 days. Prioritize sales.";
                    $this->upsertNotification('alert', $title, $body, $p['id']);
                } elseif ($daysLeft <= 90) {
                    $title = $currentExpiryTitle = $expiryTitles[2];
                    $body = "Expires " . date('m/d/Y', $expTs) . " — within 90 days.";
                    $this->upsertNotification('alert', $title, $body, $p['id']);
                }
            }

            if ($currentExpiryTitle === null) {
                DB::delete('DELETE FROM notifications WHERE product_id = ? AND title IN (?, ?, ?)', [$p['id'], ...$expiryTitles]);
            } else {
                DB::delete('DELETE FROM notifications WHERE product_id = ? AND title IN (?, ?, ?) AND title <> ?', [$p['id'], ...$expiryTitles, $currentExpiryTitle]);
            }
        }
    }

    private function upsertNotification(string $type, string $title, string $body, ?string $productId): void
    {
        $check = DB::selectOne('SELECT id FROM notifications WHERE product_id <=> ? AND title = ? LIMIT 1', [$productId, $title]);
        if ($check) return;
        DB::insert('INSERT INTO notifications (type, title, body, product_id, is_read) VALUES (?, ?, ?, ?, 0)', [$type, $title, $body, $productId]);
    }

    private function formatNotif(array $n): array
    {
        return [
            'id' => (int)$n['id'],
            'type' => $n['type'],
            'title' => $n['title'],
            'body' => $n['body'],
            'productId' => $n['product_id'],
            'read' => (bool)$n['is_read'],
            'time' => $this->timeAgo($n['created_at']),
        ];
    }

    private function timeAgo(string $datetime): string
    {
        $diff = time() - strtotime($datetime);
        if ($diff < 60) return 'Just now';
        if ($diff < 3600) return (int)($diff / 60) . ' min ago';
        if ($diff < 86400) return (int)($diff / 3600) . ' hr ago';
        return date('m/d/Y', strtotime($datetime));
    }
}
