<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    use ApiHelpers;

    /* ── GET /analytics/monthly-demand ──────────────────────────────────── */
    public function monthlyDemand(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select(
            "SELECT DATE_FORMAT(transacted_at, '%b %Y') AS month,
                    SUM(qty) AS demand
             FROM transactions
             WHERE type = 'sale'
             GROUP BY DATE_FORMAT(transacted_at, '%Y-%m')
             ORDER BY MIN(transacted_at) ASC"
        );
        return $this->json(array_map(fn($r) => (array)$r, $rows));
    }

    /* ── GET /analytics/sma ──────────────────────────────────────────────── */
    public function sma(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $productId = trim((string)$request->query('product_id', ''));
        $category = trim((string)$request->query('category', ''));
        $orderCostParam = $request->query('order_cost') ? max(1.0, (float)$request->query('order_cost')) : 120.0;
        $holdingRateParam = $request->query('holding_rate') ? max(0.01, (float)$request->query('holding_rate')) : 0.2;

        // Monthly demand
        $demandSql = "SELECT DATE_FORMAT(t.transacted_at, '%Y-%m') AS monthKey,
                             DATE_FORMAT(t.transacted_at, '%b %Y') AS month,
                             SUM(t.qty) AS demand
                      FROM transactions t
                      LEFT JOIN products p ON p.id = t.product_id
                      WHERE t.type = 'sale'";
        $demandParams = [];
        if ($productId !== '') { $demandSql .= ' AND t.product_id = ?'; $demandParams[] = $productId; }
        if ($category !== '') {
            $demandSql .= ' AND EXISTS (
                SELECT 1 FROM product_category_map pcm
                JOIN categories c ON c.id = pcm.category_id
                WHERE pcm.product_id = p.id AND c.name = ?
            )';
            $demandParams[] = $category;
        }
        $demandSql .= " GROUP BY DATE_FORMAT(t.transacted_at, '%Y-%m') ORDER BY MIN(t.transacted_at) ASC";
        $demandRows = DB::select($demandSql, $demandParams);

        // Monthly supply from receipts
        $supplySql = "SELECT DATE_FORMAT(r.received_date, '%Y-%m') AS monthKey,
                             DATE_FORMAT(r.received_date, '%b %Y') AS month,
                             SUM(r.qty_received) AS supply
                      FROM purchase_order_receipts r
                      LEFT JOIN products p ON p.id = r.product_id
                      WHERE 1=1";
        $supplyParams = [];
        if ($productId !== '') { $supplySql .= ' AND r.product_id = ?'; $supplyParams[] = $productId; }
        if ($category !== '') {
            $supplySql .= ' AND EXISTS (
                SELECT 1 FROM product_category_map pcm
                JOIN categories c ON c.id = pcm.category_id
                WHERE pcm.product_id = p.id AND c.name = ?
            )';
            $supplyParams[] = $category;
        }
        $supplySql .= " GROUP BY DATE_FORMAT(r.received_date, '%Y-%m') ORDER BY MIN(r.received_date) ASC";
        try {
            $supplyRows = DB::select($supplySql, $supplyParams);
        } catch (\Throwable $e) {
            error_log('Analytics receipt history unavailable: ' . $e->getMessage());
            $supplyRows = [];
        }

        $supplyMap = [];
        $monthLabels = [];
        foreach ($supplyRows as $s) {
            $supplyMap[$s->monthKey] = (int)$s->supply;
            $monthLabels[$s->monthKey] = $s->month;
        }

        $demandMap = [];
        foreach ($demandRows as $row) {
            $demandMap[$row->monthKey] = (int)$row->demand;
            $monthLabels[$row->monthKey] = $row->month;
        }

        // Fill calendar gap months
        $forecastRows = [];
        if (count($demandRows) > 0) {
            $storeMaxMonthRow = DB::selectOne("SELECT COALESCE(MAX(DATE_FORMAT(transacted_at, '%Y-%m')), '') AS m FROM transactions WHERE type = 'sale'");
            $storeMaxMonth = $storeMaxMonthRow->m ?? '';
            $firstMonthKey = $demandRows[0]->monthKey;
            $lastDemandMonthKey = $demandRows[count($demandRows) - 1]->monthKey;
            $endMonthKey = ($storeMaxMonth !== '' && $storeMaxMonth > $lastDemandMonthKey)
                ? $storeMaxMonth
                : $lastDemandMonthKey;
            $cursor = new \DateTimeImmutable($firstMonthKey . '-01');
            $end = new \DateTimeImmutable($endMonthKey . '-01');
            while ($cursor <= $end) {
                $mk = $cursor->format('Y-m');
                $label = $monthLabels[$mk] ?? $cursor->format('M Y');
                $monthLabels[$mk] = $label;
                $forecastRows[] = [
                    'monthKey' => $mk,
                    'month' => $label,
                    'demand' => $demandMap[$mk] ?? 0,
                ];
                $cursor = $cursor->modify('+1 month');
            }
        }
        $demandValues = array_column($forecastRows, 'demand');
        $result = [];
        foreach ($forecastRows as $i => $row) {
            $demand = (int)$row['demand'];
            $supply = $supplyMap[$row['monthKey']] ?? 0;
            $result[] = [
                'month' => $row['month'],
                'demand' => $demand,
                'supply' => $supply,
                'sma3' => $i >= 3 ? InventoryService::sma(array_slice($demandValues, 0, $i), 3) : null,
                'sma6' => $i >= 6 ? InventoryService::sma(array_slice($demandValues, 0, $i), 6) : null,
            ];
        }

        $flowMonths = array_unique(array_merge(array_column($forecastRows, 'monthKey'), array_keys($supplyMap)));
        sort($flowMonths, SORT_STRING);
        $supplyDemandData = array_map(function ($monthKey) use ($monthLabels, $demandMap, $supplyMap) {
            return [
                'month' => $monthLabels[$monthKey] ?? '',
                'demand' => $demandMap[$monthKey] ?? 0,
                'supply' => $supplyMap[$monthKey] ?? 0,
            ];
        }, $flowMonths);

        $allDemand = array_map('intval', $demandValues);
        $periodCount = count($allDemand);
        $activeCount = count(array_filter($allDemand, fn($v) => $v > 0));
        $sma3Val = InventoryService::sma($allDemand, 3);
        $sma6Val = InventoryService::sma($allDemand, 6);
        $months = max($periodCount, 1);
        $annDemand = $sma3Val > 0 ? ($sma3Val * 12) : (array_sum($allDemand) * (12 / $months));

        // Cost-based EOQ
        $costWhere = InventoryService::productNotDeletedSql('p');
        $costParams = [];
        if ($productId !== '') {
            $costWhere .= ' AND p.id = ?';
            $costParams[] = $productId;
        }
        if ($category !== '') {
            $costWhere .= ' AND EXISTS (
                SELECT 1 FROM product_category_map pcm
                JOIN categories c ON c.id = pcm.category_id
                WHERE pcm.product_id = p.id AND c.name = ?
            )';
            $costParams[] = $category;
        }
        $costRow = collect(DB::select(
            "SELECT SUM(CASE WHEN b.unit_cost IS NOT NULL AND b.unit_cost > 0 AND b.qty > 0 THEN b.qty * b.unit_cost ELSE 0 END) AS costed_value,
                    SUM(CASE WHEN b.unit_cost IS NOT NULL AND b.unit_cost > 0 AND b.qty > 0 THEN b.qty ELSE 0 END) AS costed_qty,
                    AVG(CASE WHEN p.price > 0 THEN p.price * 0.7 ELSE 5.0 END) AS fallback_cost
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE $costWhere",
            $costParams
        ))->first();
        $costedQty = (int)($costRow->costed_qty ?? 0);
        $avgCost = $costedQty > 0
            ? ((float)$costRow->costed_value / $costedQty)
            : (float)($costRow->fallback_cost ?? 8.75);
        $eoq = InventoryService::estimateEoq((int)round($annDemand), $avgCost, $orderCostParam, $holdingRateParam);

        $adjustedDmg = (int)(DB::selectOne("SELECT COALESCE(SUM(damaged_qty),0) AS s FROM transactions WHERE type='adjustment'")->s ?? 0);
        $adjustCount = (int)(DB::selectOne("SELECT COUNT(*) AS c FROM transactions WHERE type='adjustment'")->c ?? 0);

        $lossScope = '';
        $lossParams = [];
        if ($productId !== '') { $lossScope .= ' AND pr.product_id = ?'; $lossParams[] = $productId; }
        if ($category !== '') {
            $lossScope .= ' AND EXISTS (
                SELECT 1 FROM product_category_map pcm
                JOIN categories c ON c.id = pcm.category_id
                WHERE pcm.product_id = pr.product_id AND c.name = ?
            )';
            $lossParams[] = $category;
        }

        $returnLossRow = DB::selectOne("SELECT COALESCE(SUM(pr.refund_amount), 0) AS s FROM product_returns pr WHERE pr.record_type = 'return' $lossScope", $lossParams);
        $returnLoss = (float)($returnLossRow->s ?? 0);

        $brokenRows = DB::select(
            "SELECT COALESCE(SUM(pr.loss_amount), 0) AS broken_loss,
                    SUM(pr.loss_amount IS NULL) AS uncosted_broken_count
             FROM product_returns pr
             WHERE pr.record_type = 'broken' $lossScope",
            $lossParams
        );
        $brokenLossRow = $brokenRows[0] ?? null;
        $brokenLossAmount = (float)($brokenLossRow->broken_loss ?? 0);

        return $this->json([
            'chartData' => $result,
            'supplyDemandData' => $supplyDemandData,
            'sma3' => round($sma3Val),
            'sma6' => round($sma6Val),
            'periodCount' => $periodCount,
            'activePeriodCount' => $activeCount,
            'sma3Ready' => $periodCount >= 3,
            'sma6Ready' => $periodCount >= 6,
            'eoq' => $eoq,
            'totalDamaged' => $adjustedDmg,
            'adjustCount' => $adjustCount,
            'returnLoss' => round($returnLoss, 2),
            'brokenLoss' => round($brokenLossAmount, 2),
            'totalLoss' => round($returnLoss + $brokenLossAmount, 2),
            'uncostedBrokenCount' => (int)($brokenLossRow->uncosted_broken_count ?? 0),
        ]);
    }

    /* ── GET /analytics/eoq ──────────────────────────────────────────────── */
    public function eoq(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $demandBasis = trim((string)$request->query('demand_basis', 'sma3'));
        $orderCostParam = $request->query('order_cost') ? max(1.0, (float)$request->query('order_cost')) : 120.0;
        $holdingRateParam = $request->query('holding_rate') ? max(0.01, (float)$request->query('holding_rate')) : 0.2;

        $lowStock = DB::select(
            "SELECT p.id, p.name,
                    COALESCE((SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                              FROM product_category_map pcm
                              JOIN categories c ON c.id = pcm.category_id
                              WHERE pcm.product_id = p.id), '') AS category,
                    p.reorder, p.price, COALESCE(p.units_per_pack, 1) AS units_per_pack,
                    COALESCE(SUM(b.qty),0) AS stock,
                    SUM(CASE WHEN b.unit_cost IS NOT NULL AND b.qty > 0 THEN b.qty * b.unit_cost ELSE 0 END) AS costed_value,
                    SUM(CASE WHEN b.unit_cost IS NOT NULL AND b.qty > 0 THEN b.qty ELSE 0 END) AS costed_qty
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE p.status IN ('out_of_stock','critical','low') AND " . InventoryService::productNotDeletedSql('p') . "
             GROUP BY p.id, p.name, p.reorder, p.price, p.units_per_pack"
        );

        $monthCount = (int)(DB::selectOne("SELECT COUNT(DISTINCT DATE_FORMAT(transacted_at,'%Y-%m')) AS c FROM transactions WHERE type='sale'")->c ?? 0) ?: 1;
        $storeMaxRow = DB::selectOne("SELECT COALESCE(MAX(DATE_FORMAT(transacted_at, '%Y-%m')), '') AS m FROM transactions WHERE type = 'sale'");
        $storeMinRow = DB::selectOne("SELECT COALESCE(MIN(DATE_FORMAT(transacted_at, '%Y-%m')), '') AS m FROM transactions WHERE type = 'sale'");
        $storeMaxMonth = $storeMaxRow->m ?? '';
        $storeMinMonth = $storeMinRow->m ?? '';

        $monthKeys = [];
        if ($storeMinMonth !== '' && $storeMaxMonth !== '') {
            $cursor = new \DateTimeImmutable($storeMinMonth . '-01');
            $end = new \DateTimeImmutable($storeMaxMonth . '-01');
            while ($cursor <= $end) {
                $monthKeys[] = $cursor->format('Y-m');
                $cursor = $cursor->modify('+1 month');
            }
        }

        $recs = [];
        foreach ($lowStock as $p) {
            $p = (array)$p;
            $monthlyRows = DB::select(
                "SELECT DATE_FORMAT(transacted_at, '%Y-%m') AS monthKey, COALESCE(SUM(qty), 0) AS qty
                 FROM transactions WHERE type = 'sale' AND product_id = ?
                 GROUP BY DATE_FORMAT(transacted_at, '%Y-%m')",
                [$p['id']]
            );
            $prodMonthMap = [];
            $totalSold = 0;
            foreach ($monthlyRows as $mRow) {
                $q = (int)$mRow->qty;
                $prodMonthMap[$mRow->monthKey] = $q;
                $totalSold += $q;
            }

            $series = array_map(fn($mk) => $prodMonthMap[$mk] ?? 0, $monthKeys);
            $prodSma3 = InventoryService::sma($series, 3);
            $prodSma6 = InventoryService::sma($series, 6);
            $calendarMonths = max(count($monthKeys), 1);
            $histMonthly = $totalSold / $calendarMonths;

            $reorderUnits = (int)$p['reorder'] * max(1, (int)$p['units_per_pack']);
            $demandIsFallback = ($totalSold === 0);
            if ($demandIsFallback) {
                $annDemand = max(10, $reorderUnits * 6);
            } elseif ($demandBasis === 'sma6' && $prodSma6 > 0) {
                $annDemand = $prodSma6 * 12;
            } elseif ($demandBasis === 'historical') {
                $annDemand = $histMonthly * 12;
            } else {
                $annDemand = ($prodSma3 > 0 ? $prodSma3 : $histMonthly) * 12;
            }

            $costedQty = (int)($p['costed_qty'] ?? 0);
            $costIsEstimated = ($costedQty <= 0);
            $unitCost = !$costIsEstimated
                ? ((float)$p['costed_value'] / $costedQty)
                : ((float)$p['price'] > 0 ? (float)$p['price'] * 0.7 : 5.0);

            $rawEoq = InventoryService::estimateEoq((int)round($annDemand), $unitCost, $orderCostParam, $holdingRateParam);
            $packSize = max(1, (int)$p['units_per_pack']);
            $packs = max(1, (int)ceil($rawEoq / $packSize));
            $eoq = $packs * $packSize;
            $recs[] = [
                'id' => $p['id'],
                'name' => $p['name'],
                'category' => $p['category'],
                'stock' => (int)$p['stock'],
                'reorder' => (int)$p['reorder'],
                'reorderUnits' => $reorderUnits,
                'price' => (float)$p['price'],
                'unitCost' => round($unitCost, 2),
                'costIsEstimated' => $costIsEstimated,
                'shortage' => max(0, $reorderUnits - (int)$p['stock']),
                'rawEoq' => $rawEoq,
                'eoq' => $eoq,
                'sma3' => round($prodSma3, 1),
                'sma6' => round($prodSma6, 1),
                'annualDemand' => (int)round($annDemand),
                'demandIsFallback' => $demandIsFallback,
                'totalSold' => (int)$totalSold,
            ];
        }
        usort($recs, fn($a, $b) => $b['shortage'] - $a['shortage']);
        return $this->json($recs);
    }

    /* ── GET /analytics/performance ─────────────────────────────────────── */
    public function performance(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select(
            "SELECT t.product_name AS name,
                    COALESCE((SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                              FROM product_category_map pcm
                              JOIN categories c ON c.id = pcm.category_id
                              WHERE pcm.product_id = p.id), '—') AS category,
                    SUM(t.qty)    AS units_sold,
                    SUM(t.amount) AS revenue
             FROM transactions t
             LEFT JOIN products p ON p.id = t.product_id
             WHERE t.type = 'sale'
             GROUP BY t.product_name, p.id
             ORDER BY revenue DESC"
        );
        $maxRev = count($rows) > 0 ? (float)$rows[0]->revenue : 1;

        $result = array_map(function ($r) use ($maxRev) {
            $r = (array)$r;
            $units = (int)$r['units_sold'];
            $rev = (float)$r['revenue'];
            $ratio = $rev / max($maxRev, 1);
            return [
                'name' => $r['name'],
                'cat' => $r['category'] ?? '—',
                'units' => $units,
                'rev' => $rev,
                'level' => $ratio > 0.5 ? 'High' : ($ratio > 0.2 ? 'Moderate' : 'Stable'),
            ];
        }, $rows);

        return $this->json($result);
    }

    /* ── GET /analytics/category-sales ───────────────────────────────────── */
    public function categorySales(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select(
            "SELECT c.name AS name, SUM(t.qty) AS units
             FROM transactions t
             JOIN product_category_map pcm ON pcm.product_id = t.product_id
             JOIN categories c ON c.id = pcm.category_id
             WHERE t.type = 'sale'
             GROUP BY c.id, c.name
             ORDER BY units DESC"
        );
        $total = array_sum(array_map(fn($r) => (int)$r->units, $rows));
        if ($total <= 0) return $this->json([]);
        $pie = array_map(fn($r) => [
            'name' => $r->name,
            'value' => round(((float)$r->units / $total) * 100, 1),
        ], $rows);
        return $this->json($pie);
    }

    /* ── GET /analytics/adjustments ──────────────────────────────────────── */
    public function adjustments(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select(
            "SELECT id, product_name, product_id, qty, staff,
                    COALESCE(damaged_qty,0) AS damaged_qty,
                    adjustment_reason, note, transacted_at
             FROM transactions
             WHERE type = 'adjustment'
             ORDER BY transacted_at DESC"
        );
        return $this->json(array_map(function ($r) {
            $r = (array)$r;
            return [
                'id' => $r['id'],
                'product' => $r['product_name'],
                'productId' => $r['product_id'],
                'qty' => (int)$r['qty'],
                'damagedQty' => (int)$r['damaged_qty'],
                'staff' => $r['staff'],
                'date' => date('m/d/Y H:i', strtotime($r['transacted_at'])),
                'adjustmentReason' => $r['adjustment_reason'] ?? $r['note'],
            ];
        }, $rows));
    }
}
