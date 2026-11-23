<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StockAlertController extends Controller
{
    use ApiHelpers;

    /* ── GET /stock-alerts/{tab?} ────────────────────────────────────────── */
    public function show(Request $request, string $tab = 'all')
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);

        $rows = DB::select(
            "SELECT p.id, p.name,
                    COALESCE((SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                              FROM product_category_map pcm
                              JOIN categories c ON c.id = pcm.category_id
                              WHERE pcm.product_id = p.id), '') AS category,
                    p.reorder, COALESCE(p.units_per_pack, 1) AS units_per_pack, p.price, p.status,
                    COALESCE(SUM(b.qty),0) AS stock,
                    MIN(b.expiry_date)     AS earliest_expiry
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE " . InventoryService::productNotDeletedSql('p') . "
             GROUP BY p.id, p.name, p.reorder, p.units_per_pack, p.price, p.status"
        );

        $now = time();
        $stockAlerts = [];
        $expiryAlerts = [];

        foreach ($rows as $r) {
            $r = (array)$r;
            $stock = (int)$r['stock'];
            $reorder = (int)$r['reorder'];
            $reorderUnits = $reorder * max(1, (int)$r['units_per_pack']);
            $expiry = $r['earliest_expiry'];

            if (in_array($r['status'], ['out_of_stock', 'critical', 'low', 'moderate'])) {
                $pct = $reorderUnits > 0 ? min(100, round(($stock / ($reorderUnits * 1.5)) * 100)) : 100;
                $stockAlerts[] = [
                    'id' => $r['id'],
                    'name' => $r['name'],
                    'category' => $r['category'],
                    'stock' => $stock,
                    'reorder' => $reorder,
                    'reorderUnits' => $reorderUnits,
                    'price' => (float)$r['price'],
                    'status' => $r['status'],
                    'shortage' => max(0, $reorderUnits - $stock),
                    'pct' => $pct,
                    'expiry' => $expiry ? date('m/d/Y', strtotime($expiry)) : '—',
                ];
            }

            if ($expiry) {
                $daysLeft = ($now - strtotime($expiry)) / 86400 * -1;
                if ($daysLeft <= 90) {
                    $level = $daysLeft <= 0 ? 'expired' : ($daysLeft <= 30 ? 'within30' : 'within90');
                    $expiryAlerts[] = [
                        'id' => $r['id'],
                        'name' => $r['name'],
                        'category' => $r['category'],
                        'stock' => $stock,
                        'expiry' => date('m/d/Y', strtotime($expiry)),
                        'daysLeft' => (int)ceil(abs($daysLeft)),
                        'level' => $level,
                    ];
                }
            }
        }

        usort($expiryAlerts, function ($a, $b) {
            $order = ['expired' => 0, 'within30' => 1, 'within90' => 2];
            $diff = $order[$a['level']] <=> $order[$b['level']];
            return $diff !== 0 ? $diff : $a['daysLeft'] <=> $b['daysLeft'];
        });

        $summary = [
            'stockAlertCount' => count($stockAlerts),
            'expiryAlertCount' => count($expiryAlerts),
            'criticalCount' => count(array_filter($stockAlerts, fn($a) => $a['status'] === 'critical')),
            'outOfStockCount' => count(array_filter($stockAlerts, fn($a) => $a['status'] === 'out_of_stock')),
            'lowCount' => count(array_filter($stockAlerts, fn($a) => $a['status'] === 'low')),
            'moderateCount' => count(array_filter($stockAlerts, fn($a) => $a['status'] === 'moderate')),
            'expiredCount' => count(array_filter($expiryAlerts, fn($a) => $a['level'] === 'expired')),
            'within30Count' => count(array_filter($expiryAlerts, fn($a) => $a['level'] === 'within30')),
            'within90Count' => count(array_filter($expiryAlerts, fn($a) => $a['level'] === 'within90')),
        ];

        return match ($tab) {
            'stock' => $this->json(['summary' => $summary, 'stockAlerts' => $stockAlerts]),
            'expiry' => $this->json(['summary' => $summary, 'expiryAlerts' => $expiryAlerts]),
            default => $this->json([
                'summary' => $summary,
                'stockAlerts' => $stockAlerts,
                'expiryAlerts' => $expiryAlerts,
            ]),
        };
    }
}
