<?php
/**
 * Analytics routes  — chart and KPI data
 *
 *   GET /analytics/monthly-demand    — monthly demand from sale transactions
 *   GET /analytics/sma               — supply vs demand + SMA-3/SMA-6
 *   GET /analytics/eoq               — EOQ recommendations for low-stock items
 *   GET /analytics/performance       — product performance table
 *   GET /analytics/category-sales    — sales breakdown by category (pie chart)
 *   GET /analytics/adjustments       — adjustment/damage records
 */

require_auth();
$pdo = db();

$action = $id ?? '';

switch ($method . ':' . $action) {

    // ── Monthly demand ────────────────────────────────────────────────────────
    case 'GET:monthly-demand':
        $stmt = $pdo->query(
            "SELECT DATE_FORMAT(transacted_at, '%b %Y') AS month,
                    SUM(qty) AS demand
             FROM transactions
             WHERE type = 'sale'
             GROUP BY DATE_FORMAT(transacted_at, '%Y-%m')
             ORDER BY MIN(transacted_at) ASC"
        );
        json_response($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    // ── Supply vs Demand + SMA ────────────────────────────────────────────────
    case 'GET:sma':
        // Monthly demand
        $demandStmt = $pdo->query(
            "SELECT DATE_FORMAT(transacted_at, '%b %Y') AS month,
                    SUM(qty) AS demand
             FROM transactions
             WHERE type = 'sale'
             GROUP BY DATE_FORMAT(transacted_at, '%Y-%m')
             ORDER BY MIN(transacted_at) ASC"
        );
        $demandRows = $demandStmt->fetchAll(PDO::FETCH_ASSOC);

        // Monthly supply from batches
        $supplyStmt = $pdo->query(
            "SELECT DATE_FORMAT(received_date, '%b %Y') AS month,
                    SUM(qty) AS supply
             FROM product_batches
             GROUP BY DATE_FORMAT(received_date, '%Y-%m')
             ORDER BY MIN(received_date) ASC"
        );
        $supplyMap = [];
        foreach ($supplyStmt->fetchAll(PDO::FETCH_ASSOC) as $s) {
            $supplyMap[$s['month']] = (int)$s['supply'];
        }

        $demandValues = array_column($demandRows, 'demand');
        $result = [];
        foreach ($demandRows as $i => $row) {
            $demand = (int)$row['demand'];
            $supply = $supplyMap[$row['month']] ?? (int)round($demand * 1.05);
            $result[] = [
                'month'  => $row['month'],
                'demand' => $demand,
                'supply' => $supply,
                'sma3'   => $i >= 2  ? sma(array_slice($demandValues, 0, $i+1), 3)  : null,
                'sma6'   => $i >= 5  ? sma(array_slice($demandValues, 0, $i+1), 6)  : null,
            ];
        }

        // Also return headline metrics
        $allDemand = array_map('intval', $demandValues);
        $sma3Val   = sma($allDemand, 3);
        $sma6Val   = sma($allDemand, 6);
        $months    = max(count($allDemand), 1);
        $annDemand = array_sum($allDemand) * (12 / $months);

        $avgCostRow = $pdo->query('SELECT AVG(price) AS avg FROM products')->fetch();
        $avgCost    = (float)($avgCostRow['avg'] ?? 8.75);
        $eoq        = estimate_eoq((int)round($annDemand), $avgCost);

        $adjustedDmg = (int)$pdo->query(
            "SELECT COALESCE(SUM(damaged_qty),0) FROM transactions WHERE type='adjustment'"
        )->fetchColumn();
        $adjustCount = (int)$pdo->query(
            "SELECT COUNT(*) FROM transactions WHERE type='adjustment'"
        )->fetchColumn();

        json_response([
            'chartData'    => $result,
            'sma3'         => round($sma3Val),
            'sma6'         => round($sma6Val),
            'eoq'          => $eoq,
            'totalDamaged' => $adjustedDmg,
            'adjustCount'  => $adjustCount,
        ]);
        break;

    // ── EOQ Reorder Recommendations ───────────────────────────────────────────
    case 'GET:eoq':
        $lowStock = $pdo->query(
            "SELECT p.id, p.name, p.category, p.reorder, p.price,
                    COALESCE(SUM(b.qty),0) AS stock
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE p.status IN ('critical','low')
             GROUP BY p.id, p.name, p.category, p.reorder, p.price"
        )->fetchAll(PDO::FETCH_ASSOC);

        $monthCount = (int)$pdo->query(
            "SELECT COUNT(DISTINCT DATE_FORMAT(transacted_at,'%Y-%m'))
             FROM transactions WHERE type='sale'"
        )->fetchColumn() ?: 1;

        $recs = [];
        foreach ($lowStock as $p) {
            $totalSold = (int)$pdo->prepare(
                "SELECT COALESCE(SUM(qty),0) FROM transactions
                 WHERE type='sale' AND product_id = ?"
            )->execute([$p['id']]) ? $pdo->query(
                "SELECT COALESCE(SUM(qty),0) FROM transactions
                 WHERE type='sale' AND product_id='{$p['id']}'"
            )->fetchColumn() : 0;

            $annDemand = ($totalSold / $monthCount) * 12;
            $eoq = estimate_eoq(max((int)round($annDemand), $p['reorder'] * 4), (float)$p['price']);
            $recs[] = [
                'id'       => $p['id'],
                'name'     => $p['name'],
                'category' => $p['category'],
                'stock'    => (int)$p['stock'],
                'reorder'  => (int)$p['reorder'],
                'price'    => (float)$p['price'],
                'shortage' => max(0, (int)$p['reorder'] - (int)$p['stock']),
                'eoq'      => $eoq,
                'totalSold'=> (int)$totalSold,
            ];
        }
        usort($recs, fn($a, $b) => $b['shortage'] - $a['shortage']);
        json_response($recs);
        break;

    // ── Product Performance ───────────────────────────────────────────────────
    case 'GET:performance':
        $stmt = $pdo->query(
            "SELECT t.product_name AS name,
                    p.category,
                    SUM(t.qty)    AS units_sold,
                    SUM(t.amount) AS revenue
             FROM transactions t
             LEFT JOIN products p ON p.id = t.product_id
             WHERE t.type = 'sale'
             GROUP BY t.product_name, p.category
             ORDER BY revenue DESC"
        );
        $rows   = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $maxRev = count($rows) > 0 ? (float)$rows[0]['revenue'] : 1;

        $result = array_map(function ($r) use ($maxRev) {
            $units = (int)$r['units_sold'];
            $rev   = (float)$r['revenue'];
            $ratio = $rev / max($maxRev, 1);
            return [
                'name'    => $r['name'],
                'cat'     => $r['category'] ?? '—',
                'units'   => $units,
                'rev'     => $rev,
                'level'   => $ratio > 0.5 ? 'High' : ($ratio > 0.2 ? 'Moderate' : 'Stable'),
            ];
        }, $rows);

        json_response($result);
        break;

    // ── Category Sales (pie) ──────────────────────────────────────────────────
    case 'GET:category-sales':
        $stmt = $pdo->query(
            "SELECT p.category AS name, SUM(t.qty) AS value
             FROM transactions t
             JOIN products p ON p.id = t.product_id
             WHERE t.type = 'sale'
             GROUP BY p.category
             ORDER BY value DESC"
        );
        $rows  = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $total = array_sum(array_column($rows, 'value'));
        if ($total == 0) {
            // Fallback to static seed distribution
            json_response([
                ['name' => 'Antibiotics',      'value' => 28],
                ['name' => 'Analgesics',        'value' => 22],
                ['name' => 'Antihypertensive',  'value' => 18],
                ['name' => 'Supplements',       'value' => 15],
                ['name' => 'Others',            'value' => 17],
            ]);
        }
        $pie = array_map(fn($r) => [
            'name'  => $r['name'],
            'value' => (int)round(((int)$r['value'] / $total) * 100),
        ], $rows);
        json_response($pie);
        break;

    // ── Adjustment records ────────────────────────────────────────────────────
    case 'GET:adjustments':
        $stmt = $pdo->query(
            "SELECT id, product_name, product_id, qty, staff,
                    COALESCE(damaged_qty,0) AS damaged_qty,
                    adjustment_reason, note, transacted_at
             FROM transactions
             WHERE type = 'adjustment'
             ORDER BY transacted_at DESC"
        );
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        json_response(array_map(fn($r) => [
            'id'               => $r['id'],
            'product'          => $r['product_name'],
            'productId'        => $r['product_id'],
            'qty'              => (int)$r['qty'],
            'damagedQty'       => (int)$r['damaged_qty'],
            'staff'            => $r['staff'],
            'date'             => date('m/d/Y H:i', strtotime($r['transacted_at'])),
            'adjustmentReason' => $r['adjustment_reason'] ?? $r['note'],
        ], $rows));
        break;

    default:
        json_response(['error' => 'Analytics route not found.'], 404);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function sma(array $values, int $window): float {
    if (count($values) === 0 || $window <= 0) return 0;
    $slice = array_slice($values, -$window);
    return array_sum($slice) / count($slice);
}

function estimate_eoq(int $annualDemand, float $avgUnitCost,
                      float $orderCost = 120, float $holdingRate = 0.2): int {
    if ($annualDemand <= 0 || $avgUnitCost <= 0) return 0;
    $holdingCost = $avgUnitCost * $holdingRate;
    $qty = sqrt((2 * $annualDemand * $orderCost) / $holdingCost);
    return max(0, (int)round($qty));
}
