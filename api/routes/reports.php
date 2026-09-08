<?php
/**
 * Reports routes
 *
 *   GET /reports/sales      — sales summary + sales-by-product table
 *   GET /reports/stock      — stock alert summary
 *   GET /reports/inventory  — complete inventory with values
 */

require_auth();
$pdo = db();

if ($method !== 'GET') json_response(['error' => 'Method not allowed.'], 405);

$tab = $id ?? 'sales';

switch ($tab) {

    // ── Sales report ──────────────────────────────────────────────────────────
    case 'sales':
        $totalRevenue = (float)$pdo->query(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='sale'"
        )->fetchColumn();
        $totalReturns = (float)$pdo->query(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='return'"
        )->fetchColumn();
        $salesCount = (int)$pdo->query(
            "SELECT COUNT(*) FROM transactions WHERE type='sale'"
        )->fetchColumn();
        $returnsCount = (int)$pdo->query(
            "SELECT COUNT(*) FROM transactions WHERE type='return'"
        )->fetchColumn();

        $stmt = $pdo->query(
            "SELECT product_name AS product,
                    SUM(qty)    AS qty,
                    SUM(amount) AS amount
             FROM transactions
             WHERE type='sale'
             GROUP BY product_name
             ORDER BY amount DESC"
        );
        $byProduct = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $byProduct = array_map(fn($r) => [
            'product' => $r['product'],
            'qty'     => (int)$r['qty'],
            'amount'  => (float)$r['amount'],
        ], $byProduct);

        json_response([
            'totalRevenue' => $totalRevenue,
            'totalReturns' => $totalReturns,
            'netRevenue'   => round($totalRevenue - $totalReturns, 2),
            'salesCount'   => $salesCount,
            'returnsCount' => $returnsCount,
            'byProduct'    => $byProduct,
        ]);
        break;

    // ── Stock alerts report ───────────────────────────────────────────────────
    case 'stock':
        $rows = $pdo->query(
            "SELECT p.id, p.name, p.category, p.reorder, p.status,
                    COALESCE(SUM(b.qty),0) AS stock
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             GROUP BY p.id, p.name, p.category, p.reorder, p.status
             ORDER BY FIELD(p.status,'critical','low','moderate','good')"
        )->fetchAll(PDO::FETCH_ASSOC);

        $critical = $low = $moderate = $good = 0;
        $items = [];
        foreach ($rows as $r) {
            switch ($r['status']) {
                case 'critical': $critical++; break;
                case 'low':      $low++;      break;
                case 'moderate': $moderate++; break;
                default:         $good++;
            }
            if ($r['status'] !== 'good') {
                $items[] = [
                    'id'       => $r['id'],
                    'name'     => $r['name'],
                    'category' => $r['category'],
                    'stock'    => (int)$r['stock'],
                    'reorder'  => (int)$r['reorder'],
                    'shortage' => max(0, (int)$r['reorder'] - (int)$r['stock']),
                    'status'   => $r['status'],
                ];
            }
        }
        json_response([
            'critical' => $critical,
            'low'      => $low,
            'moderate' => $moderate,
            'good'     => $good,
            'items'    => $items,
        ]);
        break;

    // ── Full inventory report ─────────────────────────────────────────────────
    case 'inventory':
        $rows = $pdo->query(
            "SELECT p.id, p.name, p.category, p.price, p.status,
                    COALESCE(SUM(b.qty),0) AS stock,
                    MIN(b.expiry_date)     AS earliest_expiry
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
             GROUP BY p.id, p.name, p.category, p.price, p.status
             ORDER BY p.id ASC"
        )->fetchAll(PDO::FETCH_ASSOC);

        $totalStock = 0;
        $totalValue = 0.0;
        $items = array_map(function ($r) use (&$totalStock, &$totalValue) {
            $stock = (int)$r['stock'];
            $price = (float)$r['price'];
            $totalStock += $stock;
            $totalValue += $stock * $price;
            return [
                'id'       => $r['id'],
                'name'     => $r['name'],
                'category' => $r['category'],
                'stock'    => $stock,
                'price'    => $price,
                'value'    => round($stock * $price, 2),
                'expiry'   => $r['earliest_expiry']
                    ? date('m/d/Y', strtotime($r['earliest_expiry']))
                    : '—',
                'status'   => $r['status'],
            ];
        }, $rows);

        json_response([
            'totalProducts' => count($rows),
            'totalStock'    => $totalStock,
            'totalValue'    => round($totalValue, 2),
            'items'         => $items,
        ]);
        break;

    default:
        json_response(['error' => 'Report type not found.'], 404);
}
