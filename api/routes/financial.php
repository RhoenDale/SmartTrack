<?php
/**
 * Financial Management routes  [admin only]
 *
 *   GET /financial/summary   — headline KPIs: total revenue, returns, net revenue,
 *                              gross profit, total transactions, avg order value
 *   GET /financial/daily     — daily revenue for the last 30 days (chart data)
 *   GET /financial/monthly   — monthly revenue + returns for up to 12 months
 *   GET /financial/records   — paginated full transaction ledger
 *                              ?type=all|sale|return|adjustment
 *                              &date_from=YYYY-MM-DD &date_to=YYYY-MM-DD
 *                              &page=1 &per_page=25
 *   GET /financial/breakdown — revenue breakdown by product category
 *   GET /financial/staff     — revenue generated per staff member (sales only)
 */

require_role(['admin/owner', 'admin']);
$pdo = db();

if ($method !== 'GET') json_response(['error' => 'Method not allowed.'], 405);

$tab = $id ?? 'summary';

switch ($tab) {

    // ── Headline KPIs ─────────────────────────────────────────────────────────
    case 'summary':
        $dateFrom = $_GET['date_from'] ?? '';
        $dateTo   = $_GET['date_to']   ?? '';

        $where  = 'WHERE 1=1';
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo)   { $where .= ' AND DATE(transacted_at) <= ?'; $params[] = $dateTo;   }

        $stmt = $pdo->prepare(
            "SELECT
                COALESCE(SUM(CASE WHEN type='sale'       THEN amount           ELSE 0 END), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN type='sale'       THEN pre_tax_amount   ELSE 0 END), 0) AS total_pre_tax,
                COALESCE(SUM(CASE WHEN type='sale'       THEN tax_amount       ELSE 0 END), 0) AS total_vat_collected,
                COALESCE(SUM(CASE WHEN type='return'     THEN amount           ELSE 0 END), 0) AS total_returns,
                COALESCE(SUM(CASE WHEN type='return'     THEN tax_amount       ELSE 0 END), 0) AS total_vat_returned,
                COUNT(CASE WHEN type='sale'              THEN 1      END)                       AS sales_count,
                COUNT(CASE WHEN type='return'            THEN 1      END)                       AS returns_count,
                COUNT(CASE WHEN type='adjustment'        THEN 1      END)                       AS adjustments_count,
                COUNT(*)                                                                         AS total_transactions,
                COALESCE(SUM(CASE WHEN type='sale' AND DATE(transacted_at) = CURDATE() THEN amount ELSE 0 END), 0) AS today_revenue,
                COALESCE(SUM(CASE WHEN type='sale' AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY THEN amount ELSE 0 END), 0) AS week_revenue,
                COALESCE(SUM(CASE WHEN type='sale' AND DATE(transacted_at) >= DATE_FORMAT(CURDATE(),'%Y-%m-01') THEN amount ELSE 0 END), 0) AS month_revenue
             FROM transactions $where"
        );
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $totalRevenue    = (float)$row['total_revenue'];    // VAT-inclusive gross
        $totalPreTax     = (float)$row['total_pre_tax'];    // net of VAT (taxable base)
        $totalVat        = (float)$row['total_vat_collected']; // VAT collected
        $totalReturns    = (float)$row['total_returns'];
        $vatReturned     = (float)$row['total_vat_returned'];
        $netVat          = round($totalVat - $vatReturned, 2); // net VAT payable to BIR
        $netRevenue      = round($totalRevenue - $totalReturns, 2);
        $netPreTax       = round($totalPreTax - ((float)$row['total_returns'] - $vatReturned), 2);
        // Estimated gross profit at ~40% margin (pharmacy industry standard estimate)
        $grossProfit     = round($netRevenue * 0.40, 2);
        $salesCount      = (int)$row['sales_count'];
        $avgOrderVal     = $salesCount > 0 ? round($totalRevenue / $salesCount, 2) : 0.0;

        json_response([
            'totalRevenue'       => $totalRevenue,
            'totalPreTax'        => round($totalPreTax, 2),
            'totalVatCollected'  => round($totalVat, 2),
            'netVatPayable'      => $netVat,
            'totalReturns'       => $totalReturns,
            'netRevenue'         => $netRevenue,
            'grossProfit'        => $grossProfit,
            'salesCount'         => $salesCount,
            'returnsCount'       => (int)$row['returns_count'],
            'adjustmentsCount'   => (int)$row['adjustments_count'],
            'totalTransactions'  => (int)$row['total_transactions'],
            'avgOrderValue'      => $avgOrderVal,
            'todayRevenue'       => (float)$row['today_revenue'],
            'weekRevenue'        => (float)$row['week_revenue'],
            'monthRevenue'       => (float)$row['month_revenue'],
        ]);
        break;

    // ── Daily revenue — last 30 days ──────────────────────────────────────────
    case 'daily':
        $days = max(1, min((int)($_GET['days'] ?? 30), 90));

        // Build a calendar skeleton so days with no sales still appear
        $calendar = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $dt = new DateTime("-$i days");
            $calendar[$dt->format('Y-m-d')] = [
                'date'    => $dt->format('M d'),
                'revenue' => 0.0,
                'returns' => 0.0,
            ];
        }

        $stmt = $pdo->prepare(
            "SELECT DATE(transacted_at) AS day,
                    SUM(CASE WHEN type='sale'   THEN amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN type='return' THEN amount ELSE 0 END) AS returns
             FROM transactions
             WHERE DATE(transacted_at) >= CURDATE() - INTERVAL ? DAY
             GROUP BY DATE(transacted_at)"
        );
        $stmt->execute([$days - 1]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (isset($calendar[$r['day']])) {
                $calendar[$r['day']]['revenue'] = (float)$r['revenue'];
                $calendar[$r['day']]['returns'] = (float)$r['returns'];
            }
        }

        json_response(array_values($calendar));
        break;

    // ── Monthly revenue + returns — last 12 months ────────────────────────────
    case 'monthly':
        $stmt = $pdo->query(
            "SELECT DATE_FORMAT(transacted_at, '%b %Y') AS month,
                    MIN(transacted_at)                   AS sort_key,
                    SUM(CASE WHEN type='sale'   THEN amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN type='return' THEN amount ELSE 0 END) AS returns,
                    COUNT(CASE WHEN type='sale' THEN 1 END)             AS sales_count
             FROM transactions
             WHERE transacted_at >= NOW() - INTERVAL 12 MONTH
             GROUP BY DATE_FORMAT(transacted_at, '%Y-%m')
             ORDER BY MIN(transacted_at) ASC"
        );
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $result = array_map(fn($r) => [
            'month'       => $r['month'],
            'revenue'     => (float)$r['revenue'],
            'returns'     => (float)$r['returns'],
            'net'         => round((float)$r['revenue'] - (float)$r['returns'], 2),
            'sales_count' => (int)$r['sales_count'],
        ], $rows);

        json_response($result);
        break;

    // ── Full transaction ledger ───────────────────────────────────────────────
    case 'records':
        $type     = $_GET['type']     ?? 'all';
        $dateFrom = $_GET['date_from'] ?? '';
        $dateTo   = $_GET['date_to']   ?? '';
        $perPage  = max(1, min((int)($_GET['per_page'] ?? 25), 100));
        $pageNum  = max(1, (int)($_GET['page'] ?? 1));
        $offset   = ($pageNum - 1) * $perPage;

        $where  = 'WHERE 1=1';
        $params = [];
        if ($type !== 'all') { $where .= ' AND t.type = ?';                      $params[] = $type;     }
        if ($dateFrom)       { $where .= ' AND DATE(t.transacted_at) >= ?';      $params[] = $dateFrom; }
        if ($dateTo)         { $where .= ' AND DATE(t.transacted_at) <= ?';      $params[] = $dateTo;   }

        // Count total matching rows for pagination
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions t $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Fetch page of records
        $stmt = $pdo->prepare(
            "SELECT t.id, t.type, t.product_name, t.qty, t.amount,
                    COALESCE(u.name, t.staff) AS staff_name,
                    t.note, t.adjustment_reason, t.damaged_qty, t.status,
                    t.transacted_at
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             $where
             ORDER BY t.transacted_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute([...$params, $perPage, $offset]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $records = array_map(fn($r) => [
            'id'         => $r['id'],
            'type'       => $r['type'],
            'product'    => $r['product_name'],
            'qty'        => (int)$r['qty'],
            'amount'     => (float)$r['amount'],
            'staff'      => $r['staff_name'],
            'note'       => $r['note'] ?? '',
            'status'     => $r['status'],
            'date'       => date('m/d/Y H:i', strtotime($r['transacted_at'])),
        ], $rows);

        json_response([
            'records'   => $records,
            'total'     => $total,
            'page'      => $pageNum,
            'per_page'  => $perPage,
            'pages'     => (int)ceil($total / $perPage),
        ]);
        break;

    // ── Revenue by category ───────────────────────────────────────────────────
    case 'breakdown':
        $dateFrom = $_GET['date_from'] ?? '';
        $dateTo   = $_GET['date_to']   ?? '';

        $where  = "WHERE t.type = 'sale'";
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo)   { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo;   }

        $stmt = $pdo->prepare(
            "SELECT COALESCE(p.category, 'Uncategorized') AS category,
                    SUM(t.amount) AS revenue,
                    SUM(t.qty)    AS units
             FROM transactions t
             LEFT JOIN products p ON p.id = t.product_id
             $where
             GROUP BY COALESCE(p.category, 'Uncategorized')
             ORDER BY revenue DESC"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalRev = array_sum(array_column($rows, 'revenue')) ?: 1;
        $result = array_map(fn($r) => [
            'category' => $r['category'],
            'revenue'  => (float)$r['revenue'],
            'units'    => (int)$r['units'],
            'share'    => round((float)$r['revenue'] / $totalRev * 100, 1),
        ], $rows);

        json_response($result);
        break;

    // ── Revenue per staff member ──────────────────────────────────────────────
    case 'staff':
        $dateFrom = $_GET['date_from'] ?? '';
        $dateTo   = $_GET['date_to']   ?? '';

        $where  = "WHERE t.type = 'sale'";
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo)   { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo;   }

        $stmt = $pdo->prepare(
            "SELECT COALESCE(u.name, t.staff) AS staff_name,
                    COUNT(*)      AS transactions,
                    SUM(t.amount) AS revenue,
                    SUM(t.qty)    AS units_sold
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             $where
             GROUP BY COALESCE(u.name, t.staff)
             ORDER BY revenue DESC"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $result = array_map(fn($r) => [
            'staff'        => $r['staff_name'],
            'transactions' => (int)$r['transactions'],
            'revenue'      => (float)$r['revenue'],
            'unitsSold'    => (int)$r['units_sold'],
        ], $rows);

        json_response($result);
        break;

    // ── CSV export of full financial ledger ───────────────────────────────────
    case 'export':
        $type     = $_GET['type']      ?? 'all';
        $dateFrom = $_GET['date_from'] ?? '';
        $dateTo   = $_GET['date_to']   ?? '';

        $where  = 'WHERE 1=1';
        $params = [];
        if ($type !== 'all') { $where .= ' AND t.type = ?';                 $params[] = $type;     }
        if ($dateFrom)       { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo)         { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo;   }

        $stmt = $pdo->prepare(
            "SELECT t.id, t.type, t.product_name, t.qty, t.amount,
                    COALESCE(u.name, t.staff) AS staff_name,
                    t.note, t.adjustment_reason, t.status, t.transacted_at
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             $where
             ORDER BY t.transacted_at DESC"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Build filename with date range
        $fileSuffix = $dateFrom && $dateTo
            ? "{$dateFrom}_to_{$dateTo}"
            : ($dateFrom ? "from_{$dateFrom}" : ($dateTo ? "to_{$dateTo}" : date('Y-m-d')));

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="financial-ledger-' . $fileSuffix . '.csv"');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');

        $out = fopen('php://output', 'w');
        // BOM for Excel UTF-8 compatibility
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Transaction ID', 'Type', 'Product', 'Qty', 'Amount (PHP)', 'Staff', 'Note', 'Status', 'Date']);
        foreach ($rows as $r) {
            // Use ISO datetime (YYYY-MM-DD HH:MM:SS) so Excel treats it as text,
            // not a date serial. Forward-slash formats (MM/DD/YYYY) get auto-converted.
            $dt = $r['transacted_at']
                ? date('Y-m-d H:i:s', strtotime($r['transacted_at']))
                : '';
            fputcsv($out, [
                $r['id'],
                $r['type'],
                $r['product_name'],
                (int)$r['qty'],
                number_format((float)$r['amount'], 2, '.', ''),
                $r['staff_name'],
                $r['note'] ?? '',
                $r['status'],
                $dt,
            ]);
        }
        fclose($out);
        exit;

    // ── Per-product income: real COGS from FIFO batch audit trail ────────────
    case 'income':
        $dateFrom = $_GET['date_from'] ?? '';
        $dateTo   = $_GET['date_to']   ?? '';

        $where  = "WHERE t.type = 'sale'";
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo)   { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo;   }

        // Step 1: aggregate revenue and units by product
        $revStmt = $pdo->prepare(
            "SELECT
                t.product_id,
                t.product_name,
                COALESCE(p.category, 'Uncategorized') AS category,
                SUM(t.qty)                             AS units_sold,
                SUM(t.amount)                          AS revenue
             FROM transactions t
             LEFT JOIN products p ON p.id = t.product_id
             $where
             GROUP BY t.product_id, t.product_name, p.category
             ORDER BY revenue DESC"
        );
        $revStmt->execute($params);
        $revRows = $revStmt->fetchAll(PDO::FETCH_ASSOC);

        // Step 2: for each product, compute actual COGS by joining
        //   transaction_batches (qty consumed per batch per sale)
        //   → product_batches (unit_cost locked at time of receipt)
        // This gives exact cost regardless of supplier price changes between batches.
        $cogsStmt = $pdo->prepare(
            "SELECT
                t.product_id,
                SUM(tb.qty * COALESCE(pb.unit_cost, 0)) AS total_cogs,
                COUNT(DISTINCT pb.batch_id)              AS batches_used,
                MIN(pb.unit_cost)                        AS min_unit_cost,
                MAX(pb.unit_cost)                        AS max_unit_cost
             FROM transactions t
             JOIN transaction_batches tb ON tb.transaction_id = t.id
             JOIN product_batches pb     ON pb.batch_id = tb.batch_id
             $where
             GROUP BY t.product_id"
        );
        $cogsStmt->execute($params);
        $cogsMap = [];
        foreach ($cogsStmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $cogsMap[$c['product_id']] = [
                'totalCogs'    => (float)$c['total_cogs'],
                'batchesUsed'  => (int)$c['batches_used'],
                'minUnitCost'  => $c['min_unit_cost'] !== null ? (float)$c['min_unit_cost'] : null,
                'maxUnitCost'  => $c['max_unit_cost'] !== null ? (float)$c['max_unit_cost'] : null,
            ];
        }

        $totalRevenue = 0.0;
        $totalCogAll  = 0.0;
        $result = [];

        foreach ($revRows as $r) {
            $pid         = $r['product_id'] ?? '';
            $units       = (int)$r['units_sold'];
            $revenue     = (float)$r['revenue'];
            $cogs        = $cogsMap[$pid] ?? null;
            $totalCost   = $cogs ? round($cogs['totalCogs'], 2) : null;
            $grossProfit = $totalCost !== null ? round($revenue - $totalCost, 2) : null;
            $margin      = ($totalCost !== null && $revenue > 0)
                           ? round(($grossProfit / $revenue) * 100, 1) : null;
            $avgUnitCost = ($totalCost !== null && $units > 0)
                           ? round($totalCost / $units, 4) : null;
            // Flag if multiple batches with different costs were used (price varied)
            $multiCost   = $cogs && $cogs['batchesUsed'] > 1
                           && $cogs['minUnitCost'] !== $cogs['maxUnitCost'];

            $totalRevenue += $revenue;
            if ($totalCost !== null) $totalCogAll += $totalCost;

            $result[] = [
                'productId'    => $pid,
                'productName'  => $r['product_name'],
                'category'     => $r['category'],
                'unitsSold'    => $units,
                'revenue'      => $revenue,
                'totalCost'    => $totalCost,
                'grossProfit'  => $grossProfit,
                'margin'       => $margin,
                'avgUnitCost'  => $avgUnitCost,
                'multiCost'    => $multiCost,  // true = used batches with different costs
                'hasCostData'  => $cogs !== null,
            ];
        }

        json_response([
            'rows'   => $result,
            'totals' => [
                'revenue'     => round($totalRevenue, 2),
                'totalCost'   => round($totalCogAll,  2),
                'grossProfit' => round($totalRevenue - $totalCogAll, 2),
                'margin'      => $totalRevenue > 0
                                 ? round((($totalRevenue - $totalCogAll) / $totalRevenue) * 100, 1)
                                 : null,
            ],
        ]);
        break;

    default:
        json_response(['error' => 'Financial endpoint not found.'], 404);
}
