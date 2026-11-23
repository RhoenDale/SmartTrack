<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    use ApiHelpers;

    /* ── GET /reports/{tab} ─────────────────────────────────────────────── */
    public function show(Request $request, string $tab = 'sales')
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        return match ($tab) {
            'sales' => $this->sales(),
            'stock' => $this->stock(),
            'inventory' => $this->inventory(),
            default => $this->json(['error' => 'Report type not found.'], 404),
        };
    }

    private function sales()
    {
        $totalRevenue = (float)(DB::selectOne("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='sale'")->s ?? 0);
        $totalReturns = (float)(DB::selectOne("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='return'")->s ?? 0);
        $salesCount = (int)(DB::selectOne("SELECT COUNT(*) AS c FROM transactions WHERE type='sale'")->c ?? 0);
        $returnsCount = (int)(DB::selectOne("SELECT COUNT(*) AS c FROM transactions WHERE type='return'")->c ?? 0);

        $rows = DB::select(
            "SELECT product_name AS product,
                    SUM(qty)    AS qty,
                    SUM(amount) AS amount
             FROM transactions
             WHERE type='sale'
             GROUP BY product_name
             ORDER BY amount DESC"
        );
        $byProduct = array_map(fn($r) => [
            'product' => $r->product,
            'qty' => (int)$r->qty,
            'amount' => (float)$r->amount,
        ], $rows);

        return $this->json([
            'totalRevenue' => $totalRevenue,
            'totalReturns' => $totalReturns,
            'netRevenue' => round($totalRevenue - $totalReturns, 2),
            'salesCount' => $salesCount,
            'returnsCount' => $returnsCount,
            'byProduct' => $byProduct,
        ]);
    }

    private function stock()
    {
        $rows = DB::select(
            "SELECT p.id, p.name,
                    COALESCE((SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                              FROM product_category_map pcm
                              JOIN categories c ON c.id = pcm.category_id
                              WHERE pcm.product_id = p.id), '') AS category,
                    p.reorder, COALESCE(p.units_per_pack, 1) AS units_per_pack, p.status,
                    COALESCE(SUM(b.qty),0) AS stock
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE " . InventoryService::productNotDeletedSql('p') . "
             GROUP BY p.id, p.name, p.reorder, p.units_per_pack, p.status
             ORDER BY FIELD(p.status,'out_of_stock','critical','low','moderate','good')"
        );

        $critical = $low = $moderate = $good = 0;
        $items = [];
        foreach ($rows as $r) {
            $r = (array)$r;
            switch ($r['status']) {
                case 'critical': $critical++; break;
                case 'low': $low++; break;
                case 'moderate': $moderate++; break;
                default: $good++;
            }
            if ($r['status'] !== 'good') {
                $reorderUnits = (int)$r['reorder'] * max(1, (int)$r['units_per_pack']);
                $items[] = [
                    'id' => $r['id'],
                    'name' => $r['name'],
                    'category' => $r['category'],
                    'stock' => (int)$r['stock'],
                    'reorder' => (int)$r['reorder'],
                    'reorderUnits' => $reorderUnits,
                    'shortage' => max(0, $reorderUnits - (int)$r['stock']),
                    'status' => $r['status'],
                ];
            }
        }
        return $this->json([
            'critical' => $critical,
            'low' => $low,
            'moderate' => $moderate,
            'good' => $good,
            'items' => $items,
        ]);
    }

    private function inventory()
    {
        $rows = DB::select(
            "SELECT p.id, p.name,
                    COALESCE((SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                              FROM product_category_map pcm
                              JOIN categories c ON c.id = pcm.category_id
                              WHERE pcm.product_id = p.id), '') AS category,
                    p.price, p.status,
                    COALESCE(SUM(b.qty),0) AS stock,
                    MIN(b.expiry_date)     AS earliest_expiry
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE " . InventoryService::productNotDeletedSql('p') . "
             GROUP BY p.id, p.name, p.price, p.status
             ORDER BY p.id ASC"
        );

        $totalStock = 0;
        $totalValue = 0.0;
        $items = array_map(function ($r) use (&$totalStock, &$totalValue) {
            $r = (array)$r;
            $stock = (int)$r['stock'];
            $price = (float)$r['price'];
            $totalStock += $stock;
            $totalValue += $stock * $price;
            return [
                'id' => $r['id'],
                'name' => $r['name'],
                'category' => $r['category'],
                'stock' => $stock,
                'price' => $price,
                'value' => round($stock * $price, 2),
                'expiry' => $r['earliest_expiry'] ? date('m/d/Y', strtotime($r['earliest_expiry'])) : '—',
                'status' => $r['status'],
            ];
        }, $rows);

        return $this->json([
            'totalProducts' => count($rows),
            'totalStock' => $totalStock,
            'totalValue' => round($totalValue, 2),
            'items' => $items,
        ]);
    }
}
