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
        $productId = trim((string)($_GET['product_id'] ?? ''));
        $category  = trim((string)($_GET['category'] ?? ''));

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
        $demandStmt = $pdo->prepare($demandSql);
        $demandStmt->execute($demandParams);
        $demandRows = $demandStmt->fetchAll(PDO::FETCH_ASSOC);

        // Monthly delivered supply from recorded purchase receipts. Batch qty
        // is the remaining stock after sales, so it cannot represent historical
        // receipt quantities accurately.
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
            $supplyStmt = $pdo->prepare($supplySql);
            $supplyStmt->execute($supplyParams);
            $supplyRows = $supplyStmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            // Older installations may not yet have the optional purchasing
            // tables. Keep sales forecasting available and report no recorded
            // receipt history until the Purchases migration has been applied.
            error_log('Analytics receipt history unavailable: ' . $e->getMessage());
            $supplyRows = [];
        }
        $supplyMap = [];
        $monthLabels = [];
        foreach ($supplyRows as $s) {
            $supplyMap[$s['monthKey']] = (int)$s['supply'];
            $monthLabels[$s['monthKey']] = $s['month'];
        }

        $demandMap = [];
        foreach ($demandRows as $row) {
            $demandMap[$row['monthKey']] = (int)$row['demand'];
            $monthLabels[$row['monthKey']] = $row['month'];
        }
        $forecastRows = [];
        if ($demandRows) {
            $month = new DateTimeImmutable($demandRows[0]['monthKey'] . '-01');
            $lastMonth = new DateTimeImmutable($demandRows[count($demandRows) - 1]['monthKey'] . '-01');
            while ($month <= $lastMonth) {
                $monthKey = $month->format('Y-m');
                $monthLabels[$monthKey] ??= $month->format('M Y');
                $forecastRows[] = [
                    'monthKey' => $monthKey,
                    'month' => $monthLabels[$monthKey],
                    'demand' => $demandMap[$monthKey] ?? 0,
                ];
                $month = $month->modify('+1 month');
            }
        }
        $demandValues = array_column($forecastRows, 'demand');
        $result = [];
        foreach ($forecastRows as $i => $row) {
            $demand = (int)$row['demand'];
            $supply = $supplyMap[$row['monthKey']] ?? 0;
            $result[] = [
                'month'  => $row['month'],
                'demand' => $demand,
                'supply' => $supply,
                // Back-test each month using earlier sales only. Never include
                // the month being evaluated in its own forecast window.
                'sma3'   => $i >= 3  ? sma(array_slice($demandValues, 0, $i), 3)  : null,
                'sma6'   => $i >= 6  ? sma(array_slice($demandValues, 0, $i), 6)  : null,
            ];
        }

        // Separate same-unit monthly flow series for the supply/demand view.
        // This includes receipt-only months while leaving SMA's historical
        // demand windows and back-test calculations based on demandRows intact.
        $flowMonths = array_unique(array_merge(array_column($forecastRows, 'monthKey'), array_keys($supplyMap)));
        sort($flowMonths, SORT_STRING);
        $supplyDemandData = array_map(static function ($monthKey) use ($monthLabels, $demandMap, $supplyMap) {
            return [
                'month' => $monthLabels[$monthKey],
                'demand' => $demandMap[$monthKey] ?? 0,
                'supply' => $supplyMap[$monthKey] ?? 0,
            ];
        }, $flowMonths);

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

        $lossScope = '';
        $lossParams = [];
        if ($productId !== '') {
            $lossScope .= ' AND pr.product_id = ?';
            $lossParams[] = $productId;
        }
        if ($category !== '') {
            $lossScope .= ' AND EXISTS (
                SELECT 1 FROM product_category_map pcm
                JOIN categories c ON c.id = pcm.category_id
                WHERE pcm.product_id = pr.product_id AND c.name = ?
            )';
            $lossParams[] = $category;
        }
        $returnLossStmt = $pdo->prepare(
            "SELECT COALESCE(SUM(pr.refund_amount), 0)
             FROM product_returns pr
             WHERE pr.record_type = 'return' $lossScope"
        );
        $returnLossStmt->execute($lossParams);
        $returnLoss = (float)$returnLossStmt->fetchColumn();

        $brokenLossStmt = $pdo->prepare(
            "SELECT COALESCE(SUM(pr.loss_amount), 0) AS broken_loss,
                    SUM(pr.loss_amount IS NULL) AS uncosted_broken_count
             FROM product_returns pr
             WHERE pr.record_type = 'broken' $lossScope"
        );
        $brokenLossStmt->execute($lossParams);
        $brokenLoss = $brokenLossStmt->fetch(PDO::FETCH_ASSOC);
        $brokenLossAmount = (float)$brokenLoss['broken_loss'];

        json_response([
            'chartData'    => $result,
            'supplyDemandData' => $supplyDemandData,
            'sma3'         => round($sma3Val),
            'sma6'         => round($sma6Val),
            'eoq'          => $eoq,
            'totalDamaged' => $adjustedDmg,
            'adjustCount'  => $adjustCount,
            'returnLoss'   => round($returnLoss, 2),
            'brokenLoss'   => round($brokenLossAmount, 2),
            'totalLoss'    => round($returnLoss + $brokenLossAmount, 2),
            'uncostedBrokenCount' => (int)($brokenLoss['uncosted_broken_count'] ?? 0),
        ]);
        break;

    // ── EOQ Reorder Recommendations ───────────────────────────────────────────
    case 'GET:eoq':
        $lowStock = $pdo->query(
            "SELECT p.id, p.name,
                    COALESCE((SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                              FROM product_category_map pcm
                              JOIN categories c ON c.id = pcm.category_id
                              WHERE pcm.product_id = p.id), '') AS category,
                    p.reorder, p.price,
                    COALESCE(SUM(b.qty),0) AS stock
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             WHERE p.status IN ('out_of_stock','critical','low')
             GROUP BY p.id, p.name, p.reorder, p.price"
        )->fetchAll(PDO::FETCH_ASSOC);

        $monthCount = (int)$pdo->query(
            "SELECT COUNT(DISTINCT DATE_FORMAT(transacted_at,'%Y-%m'))
             FROM transactions WHERE type='sale'"
        )->fetchColumn() ?: 1;

        $recs = [];
        foreach ($lowStock as $p) {
            $soldStmt = $pdo->prepare(
                "SELECT COALESCE(SUM(qty),0) FROM transactions
                 WHERE type='sale' AND product_id = ?"
            );
            $soldStmt->execute([$p['id']]);
            $totalSold = (int)$soldStmt->fetchColumn();

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
            "SELECT c.name AS name, SUM(t.qty) AS units
             FROM transactions t
             JOIN product_category_map pcm ON pcm.product_id = t.product_id
             JOIN categories c ON c.id = pcm.category_id
             WHERE t.type = 'sale'
             GROUP BY c.id, c.name
             ORDER BY units DESC"
        );
        $rows  = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $total = array_sum(array_column($rows, 'units'));
        if ($total <= 0) {
            json_response([]);
            break;
        }
        $pie = array_map(fn($r) => [
            'name'  => $r['name'],
            'value' => round(((float)$r['units'] / $total) * 100, 1),
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
