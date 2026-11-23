<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    use ApiHelpers;

    /* ── GET /dashboard/cashier ──────────────────────────────────────────── */
    public function cashier(Request $request)
    {
        $cashier = $this->requireRole($request, ['cashier']);

        $staffName = InventoryService::staffAbbrev($cashier['name']);
        $salesRow = DB::selectOne(
            "SELECT
                COALESCE(SUM(CASE WHEN type = 'sale' AND DATE(transacted_at) = CURDATE() THEN amount ELSE 0 END), 0) AS today_revenue,
                COUNT(DISTINCT CASE WHEN type = 'sale' AND DATE(transacted_at) = CURDATE() THEN COALESCE(sale_group_id, id) END) AS today_sales_count,
                COALESCE(SUM(CASE WHEN type = 'sale' AND DATE(transacted_at) = CURDATE() THEN qty ELSE 0 END), 0) AS today_units,
                SUM(CASE WHEN type = 'return' AND DATE(transacted_at) = CURDATE() THEN 1 ELSE 0 END) AS today_returns_count,
                COALESCE(SUM(CASE WHEN type = 'return' AND DATE(transacted_at) = CURDATE() THEN qty ELSE 0 END), 0) AS today_returned_units,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END), 0) AS week_revenue,
                COUNT(DISTINCT CASE WHEN type = 'sale' THEN COALESCE(sale_group_id, id) END) AS week_sales_count
             FROM transactions
             WHERE (staff_id = ? OR (staff_id IS NULL AND LOWER(TRIM(staff)) = LOWER(?)))
               AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY",
            [$cashier['id'], $staffName]
        );

        $stockRows = DB::select(
            "SELECT p.id, p.status, MIN(b.expiry_date) AS earliest_expiry
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE " . InventoryService::productNotDeletedSql('p') . "
             GROUP BY p.id, p.status"
        );
        $lowStockCount = 0;
        $expiryAlertCount = 0;
        $today = strtotime(date('Y-m-d'));
        foreach ($stockRows as $product) {
            $product = (array)$product;
            if (in_array($product['status'], ['out_of_stock', 'critical', 'low'], true)) $lowStockCount++;
            if (!$product['earliest_expiry']) continue;
            $days = (strtotime($product['earliest_expiry']) - $today) / 86400;
            if ($days <= 90) $expiryAlertCount++;
        }

        return $this->json([
            'todayRevenue' => (float)$salesRow->today_revenue,
            'todaySalesCount' => (int)$salesRow->today_sales_count,
            'todayUnits' => (int)$salesRow->today_units,
            'todayReturnsCount' => (int)$salesRow->today_returns_count,
            'todayReturnedUnits' => (int)$salesRow->today_returned_units,
            'weekRevenue' => (float)$salesRow->week_revenue,
            'weekSalesCount' => (int)$salesRow->week_sales_count,
            'stockAlertCount' => $lowStockCount + $expiryAlertCount,
        ]);
    }

    /* ── GET /dashboard ──────────────────────────────────────────────────── */
    public function admin(Request $request)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);

        // Weekly revenue (last 7 calendar days)
        $weekData = [];
        for ($i = 6; $i >= 0; $i--) {
            $dt = new \DateTime("-$i days");
            $dayLabel = $dt->format('D');
            $dayDate = $dt->format('Y-m-d');
            $weekData[$dayDate] = ['key' => $dayLabel, 'revenue' => 0.0];
        }

        $rows = DB::select(
            "SELECT DATE(transacted_at) AS day, SUM(amount) AS revenue
             FROM transactions
             WHERE type = 'sale' AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY
             GROUP BY DATE(transacted_at)"
        );
        foreach ($rows as $r) {
            if (isset($weekData[$r->day])) {
                $weekData[$r->day]['revenue'] = (float)$r->revenue;
            }
        }
        $weekChart = array_values($weekData);
        $weekRevTotal = array_sum(array_column($weekChart, 'revenue'));

        // Top 5 selling products this week
        $topRows = DB::select(
            "SELECT product_name AS name, SUM(qty) AS sold
             FROM transactions
             WHERE type='sale' AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY
             GROUP BY product_name
             ORDER BY sold DESC
             LIMIT 5"
        );
        $topProducts = array_map(fn($r) => ['name' => $r->name, 'sold' => (int)$r->sold], $topRows);

        // Recent 6 transactions
        $recRows = DB::select(
            "SELECT id, type, product_name, qty, amount, staff, status, transacted_at
             FROM transactions ORDER BY transacted_at DESC LIMIT 6"
        );
        $recent = array_map(function ($r) {
            $r = (array)$r;
            return [
                'id' => $r['id'],
                'type' => $r['type'],
                'product' => $r['product_name'],
                'qty' => (int)$r['qty'],
                'amount' => (float)$r['amount'],
                'staff' => $r['staff'],
                'status' => $r['status'],
                'date' => date('m/d/Y H:i', strtotime($r['transacted_at'])),
            ];
        }, $recRows);

        // Stock KPIs
        $allRows = DB::select(
            "SELECT p.id, p.name, p.status, p.reorder,
                    COALESCE(SUM(b.qty),0) AS stock,
                    MIN(b.expiry_date)     AS earliest_expiry
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE " . InventoryService::productNotDeletedSql('p') . "
             GROUP BY p.id, p.name, p.status, p.reorder"
        );
        $allProducts = array_map(fn($r) => (array)$r, $allRows);
        $totalUnits = array_sum(array_column($allProducts, 'stock'));
        $lowStockCount = count(array_filter($allProducts, fn($p) => in_array($p['status'], ['out_of_stock', 'critical', 'low'])));
        $criticalCount = count(array_filter($allProducts, fn($p) => $p['status'] === 'critical'));

        $now = time();
        $expired = $within30 = $within90 = 0;
        foreach ($allProducts as $p) {
            if (!$p['earliest_expiry']) continue;
            $days = ($now - strtotime($p['earliest_expiry'])) / 86400 * -1;
            if ($days <= 0) $expired++;
            elseif ($days <= 30) $within30++;
            elseif ($days <= 90) $within90++;
        }

        $alertList = array_values(array_filter($allProducts, fn($p) => $p['status'] !== 'good'));
        $alertList = array_map(fn($p) => [
            'id' => $p['id'],
            'name' => $p['name'],
            'status' => $p['status'],
            'stock' => (int)$p['stock'],
            'reorder' => (int)$p['reorder'],
            'earliestExpiry' => $p['earliest_expiry'] ? date('m/d/Y', strtotime($p['earliest_expiry'])) : '—',
        ], $alertList);

        return $this->json([
            'weekChart' => $weekChart,
            'weekRevenue' => round($weekRevTotal, 2),
            'topProducts' => $topProducts,
            'recentTx' => $recent,
            'stats' => [
                'totalStockUnits' => (int)$totalUnits,
                'productCount' => count($allProducts),
                'lowStockCount' => $lowStockCount,
                'criticalCount' => $criticalCount,
                'expiredCount' => $expired,
                'within30Count' => $within30,
                'within90Count' => $within90,
                'totalAlertBadge' => $lowStockCount + $expired + $within30 + $within90,
            ],
            'stockAlerts' => $alertList,
        ]);
    }
}
