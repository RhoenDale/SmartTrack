<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FinancialController extends Controller
{
    use ApiHelpers;

    /* ── GET /financial/{tab} ────────────────────────────────────────────── */
    public function show(Request $request, string $tab = 'summary')
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        return match ($tab) {
            'summary' => $this->summary($request),
            'daily' => $this->daily($request),
            'monthly' => $this->monthly(),
            'records' => $this->records($request),
            'breakdown' => $this->breakdown($request),
            'staff' => $this->staff($request),
            'income' => $this->income($request),
            'export' => $this->export($request),
            default => $this->json(['error' => 'Financial endpoint not found.'], 404),
        };
    }

    private function summary(Request $request)
    {
        $dateFrom = $request->query('date_from', '');
        $dateTo = $request->query('date_to', '');

        $where = 'WHERE 1=1';
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo) { $where .= ' AND DATE(transacted_at) <= ?'; $params[] = $dateTo; }

        $row = collect(DB::select(
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
             FROM transactions $where",
            $params
        ))->first();

        $brokenWhere = "WHERE pr.record_type = 'broken' AND t.type = 'adjustment'";
        $brokenParams = [];
        if ($dateFrom) { $brokenWhere .= ' AND DATE(t.transacted_at) >= ?'; $brokenParams[] = $dateFrom; }
        if ($dateTo) { $brokenWhere .= ' AND DATE(t.transacted_at) <= ?'; $brokenParams[] = $dateTo; }
        $brokenRow = collect(DB::select(
            "SELECT COALESCE(SUM(pr.loss_amount), 0) AS broken_loss,
                    SUM(pr.loss_amount IS NULL) AS uncosted_broken_count
             FROM product_returns pr
             JOIN transactions t ON t.id = pr.id
             $brokenWhere",
            $brokenParams
        ))->first();

        $totalRevenue = (float)$row->total_revenue;
        $totalPreTax = (float)$row->total_pre_tax;
        $totalVat = (float)$row->total_vat_collected;
        $totalReturns = (float)$row->total_returns;
        $brokenLoss = (float)($brokenRow->broken_loss ?? 0);
        $vatReturned = (float)$row->total_vat_returned;
        $netVat = round($totalVat - $vatReturned, 2);
        $netRevenue = round($totalRevenue - $totalReturns, 2);
        $totalLosses = round($totalReturns + $brokenLoss, 2);
        $netAfterLosses = round($netRevenue - $brokenLoss, 2);
        $netPreTax = round($totalPreTax - ((float)$row->total_returns - $vatReturned), 2);
        $salesCount = (int)$row->sales_count;
        $avgOrderVal = $salesCount > 0 ? round($totalRevenue / $salesCount, 2) : 0.0;

        return $this->json([
            'totalRevenue' => $totalRevenue,
            'totalPreTax' => round($totalPreTax, 2),
            'totalVatCollected' => round($totalVat, 2),
            'netVatPayable' => $netVat,
            'totalReturns' => $totalReturns,
            'netRevenue' => $netRevenue,
            'brokenStockLoss' => $brokenLoss,
            'totalLosses' => $totalLosses,
            'netAfterLosses' => $netAfterLosses,
            'uncostedBrokenCount' => (int)($brokenRow->uncosted_broken_count ?? 0),
            'salesCount' => $salesCount,
            'returnsCount' => (int)$row->returns_count,
            'adjustmentsCount' => (int)$row->adjustments_count,
            'totalTransactions' => (int)$row->total_transactions,
            'avgOrderValue' => $avgOrderVal,
            'todayRevenue' => (float)$row->today_revenue,
            'weekRevenue' => (float)$row->week_revenue,
            'monthRevenue' => (float)$row->month_revenue,
        ]);
    }

    private function daily(Request $request)
    {
        $days = max(1, min((int)$request->query('days', 30), 90));

        $calendar = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $dt = new \DateTime("-$i days");
            $calendar[$dt->format('Y-m-d')] = [
                'date' => $dt->format('M d'),
                'revenue' => 0.0,
                'returns' => 0.0,
                'brokenLoss' => 0.0,
            ];
        }

        $rows = DB::select(
            "SELECT DATE(t.transacted_at) AS day,
                    SUM(CASE WHEN t.type='sale'   THEN t.amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN t.type='return' THEN t.amount ELSE 0 END) AS returns,
                    SUM(CASE WHEN pr.record_type='broken' THEN COALESCE(pr.loss_amount,0) ELSE 0 END) AS broken_loss
             FROM transactions t
             LEFT JOIN product_returns pr ON pr.id = t.id
             WHERE DATE(t.transacted_at) >= CURDATE() - INTERVAL ? DAY
             GROUP BY DATE(t.transacted_at)",
            [$days - 1]
        );
        foreach ($rows as $r) {
            if (isset($calendar[$r->day])) {
                $calendar[$r->day]['revenue'] = (float)$r->revenue;
                $calendar[$r->day]['returns'] = (float)$r->returns;
                $calendar[$r->day]['brokenLoss'] = (float)$r->broken_loss;
            }
        }

        return $this->json(array_values($calendar));
    }

    private function monthly()
    {
        $rows = DB::select(
            "SELECT DATE_FORMAT(t.transacted_at, '%b %Y') AS month,
                    SUM(CASE WHEN t.type='sale'   THEN t.amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN t.type='return' THEN t.amount ELSE 0 END) AS returns,
                    SUM(CASE WHEN pr.record_type='broken' THEN COALESCE(pr.loss_amount,0) ELSE 0 END) AS broken_loss,
                    COUNT(CASE WHEN t.type='sale' THEN 1 END)             AS sales_count
             FROM transactions t
             LEFT JOIN product_returns pr ON pr.id = t.id
             WHERE t.transacted_at >= NOW() - INTERVAL 12 MONTH
             GROUP BY DATE_FORMAT(t.transacted_at, '%Y-%m')
             ORDER BY MIN(t.transacted_at) ASC"
        );
        $result = array_map(fn($r) => [
            'month' => $r->month,
            'revenue' => (float)$r->revenue,
            'returns' => (float)$r->returns,
            'brokenLoss' => (float)$r->broken_loss,
            'net' => round((float)$r->revenue - (float)$r->returns, 2),
            'netAfterLosses' => round((float)$r->revenue - (float)$r->returns - (float)$r->broken_loss, 2),
            'sales_count' => (int)$r->sales_count,
        ], $rows);
        return $this->json($result);
    }

    private function records(Request $request)
    {
        $type = $request->query('type', 'all');
        $dateFrom = $request->query('date_from', '');
        $dateTo = $request->query('date_to', '');
        $perPage = max(1, min((int)$request->query('per_page', 25), 100));
        $pageNum = max(1, (int)$request->query('page', 1));
        $offset = ($pageNum - 1) * $perPage;

        $where = 'WHERE 1=1';
        $params = [];
        if ($type !== 'all') { $where .= ' AND t.type = ?'; $params[] = $type; }
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo) { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo; }

        $countRow = DB::selectOne("SELECT COUNT(*) AS c FROM transactions t $where", $params);
        $total = (int)($countRow->c ?? 0);

        $queryParams = array_merge($params, [$perPage, $offset]);
        $rows = DB::select(
            "SELECT t.id, t.type, t.product_name, t.qty, t.amount,
                    COALESCE(u.name, t.staff) AS staff_name,
                    t.note, t.adjustment_reason, t.damaged_qty, t.status,
                    t.transacted_at
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             $where
             ORDER BY t.transacted_at DESC
             LIMIT ? OFFSET ?",
            $queryParams
        );

        $records = array_map(function ($r) {
            $r = (array)$r;
            return [
                'id' => $r['id'],
                'type' => $r['type'],
                'product' => $r['product_name'],
                'qty' => (int)$r['qty'],
                'amount' => (float)$r['amount'],
                'staff' => $r['staff_name'],
                'note' => $r['note'] ?? '',
                'status' => $r['status'],
                'date' => date('m/d/Y H:i', strtotime($r['transacted_at'])),
            ];
        }, $rows);

        return $this->json([
            'records' => $records,
            'total' => $total,
            'page' => $pageNum,
            'per_page' => $perPage,
            'pages' => (int)ceil($total / $perPage),
        ]);
    }

    private function breakdown(Request $request)
    {
        $dateFrom = $request->query('date_from', '');
        $dateTo = $request->query('date_to', '');

        $where = "WHERE t.type = 'sale'";
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo) { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo; }

        $rows = DB::select(
            "SELECT c.name AS category,
                    SUM(t.amount) AS revenue,
                    SUM(t.qty) AS units
             FROM transactions t
             JOIN product_category_map pcm ON pcm.product_id = t.product_id
             JOIN categories c ON c.id = pcm.category_id
             $where
             GROUP BY c.id, c.name
             ORDER BY revenue DESC",
            $params
        );

        $totalRev = array_sum(array_map(fn($r) => (float)$r->revenue, $rows)) ?: 1;
        $result = array_map(fn($r) => [
            'category' => $r->category,
            'revenue' => (float)$r->revenue,
            'units' => (int)$r->units,
            'share' => round((float)$r->revenue / $totalRev * 100, 1),
        ], $rows);
        return $this->json($result);
    }

    private function staff(Request $request)
    {
        $dateFrom = $request->query('date_from', '');
        $dateTo = $request->query('date_to', '');

        $where = "WHERE t.type = 'sale'";
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo) { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo; }

        $rows = DB::select(
            "SELECT COALESCE(u.name, t.staff) AS staff_name,
                    COUNT(*)      AS transactions,
                    SUM(t.amount) AS revenue,
                    SUM(t.qty)    AS units_sold
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             $where
             GROUP BY COALESCE(u.name, t.staff)
             ORDER BY revenue DESC",
            $params
        );

        $result = array_map(fn($r) => [
            'staff' => $r->staff_name,
            'transactions' => (int)$r->transactions,
            'revenue' => (float)$r->revenue,
            'unitsSold' => (int)$r->units_sold,
        ], $rows);
        return $this->json($result);
    }

    private function income(Request $request)
    {
        $dateFrom = $request->query('date_from', '');
        $dateTo = $request->query('date_to', '');

        $where = "WHERE t.type = 'sale'";
        $params = [];
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo) { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo; }

        $revRows = DB::select(
            "SELECT
                t.product_id,
                t.product_name,
                COALESCE((SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                          FROM product_category_map pcm
                          JOIN categories c ON c.id = pcm.category_id
                          WHERE pcm.product_id = p.id), 'Uncategorized') AS category,
                SUM(t.qty)                             AS units_sold,
                SUM(t.amount)                          AS revenue
             FROM transactions t
             LEFT JOIN products p ON p.id = t.product_id
             $where
             GROUP BY t.product_id, t.product_name, p.id
             ORDER BY revenue DESC",
            $params
        );

        $cogsRows = DB::select(
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
             GROUP BY t.product_id",
            $params
        );
        $cogsMap = [];
        foreach ($cogsRows as $c) {
            $cogsMap[$c->product_id] = [
                'totalCogs' => (float)$c->total_cogs,
                'batchesUsed' => (int)$c->batches_used,
                'minUnitCost' => $c->min_unit_cost !== null ? (float)$c->min_unit_cost : null,
                'maxUnitCost' => $c->max_unit_cost !== null ? (float)$c->max_unit_cost : null,
            ];
        }

        $totalRevenue = 0.0;
        $costedRevenue = 0.0;
        $totalCogAll = 0.0;
        $result = [];

        foreach ($revRows as $r) {
            $pid = $r->product_id ?? '';
            $units = (int)$r->units_sold;
            $revenue = (float)$r->revenue;
            $cogs = $cogsMap[$pid] ?? null;
            $totalCost = $cogs ? round($cogs['totalCogs'], 2) : null;
            $grossProfit = $totalCost !== null ? round($revenue - $totalCost, 2) : null;
            $margin = ($totalCost !== null && $revenue > 0) ? round(($grossProfit / $revenue) * 100, 1) : null;
            $avgUnitCost = ($totalCost !== null && $units > 0) ? round($totalCost / $units, 4) : null;
            $multiCost = $cogs && $cogs['batchesUsed'] > 1 && $cogs['minUnitCost'] !== $cogs['maxUnitCost'];

            $totalRevenue += $revenue;
            if ($totalCost !== null) {
                $costedRevenue += $revenue;
                $totalCogAll += $totalCost;
            }

            $result[] = [
                'productId' => $pid,
                'productName' => $r->product_name,
                'category' => $r->category,
                'unitsSold' => $units,
                'revenue' => $revenue,
                'totalCost' => $totalCost,
                'grossProfit' => $grossProfit,
                'margin' => $margin,
                'avgUnitCost' => $avgUnitCost,
                'multiCost' => $multiCost,
                'hasCostData' => $cogs !== null,
            ];
        }

        return $this->json([
            'rows' => $result,
            'totals' => [
                'revenue' => round($totalRevenue, 2),
                'costedRevenue' => round($costedRevenue, 2),
                'totalCost' => round($totalCogAll, 2),
                'grossProfit' => round($costedRevenue - $totalCogAll, 2),
                'margin' => $costedRevenue > 0
                    ? round((($costedRevenue - $totalCogAll) / $costedRevenue) * 100, 1)
                    : null,
            ],
        ]);
    }

    private function export(Request $request)
    {
        $type = $request->query('type', 'all');
        $dateFrom = $request->query('date_from', '');
        $dateTo = $request->query('date_to', '');

        $where = 'WHERE 1=1';
        $params = [];
        if ($type !== 'all') { $where .= ' AND t.type = ?'; $params[] = $type; }
        if ($dateFrom) { $where .= ' AND DATE(t.transacted_at) >= ?'; $params[] = $dateFrom; }
        if ($dateTo) { $where .= ' AND DATE(t.transacted_at) <= ?'; $params[] = $dateTo; }

        $rows = DB::select(
            "SELECT t.id, t.type, t.product_name, t.qty, t.amount,
                    COALESCE(u.name, t.staff) AS staff_name,
                    t.note, t.adjustment_reason, t.status, t.transacted_at
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             $where
             ORDER BY t.transacted_at DESC",
            $params
        );

        $fileSuffix = $dateFrom && $dateTo
            ? "{$dateFrom}_to_{$dateTo}"
            : ($dateFrom ? "from_{$dateFrom}" : ($dateTo ? "to_{$dateTo}" : date('Y-m-d')));
        $filename = "financial-ledger-{$fileSuffix}.csv";

        return new StreamedResponse(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['Transaction ID', 'Type', 'Product', 'Qty', 'Amount (PHP)', 'Staff', 'Note', 'Status', 'Date']);
            foreach ($rows as $r) {
                $dt = $r->transacted_at ? date('Y-m-d H:i:s', strtotime($r->transacted_at)) : '';
                fputcsv($out, [
                    $r->id,
                    $r->type,
                    $r->product_name,
                    (int)$r->qty,
                    number_format((float)$r->amount, 2, '.', ''),
                    $r->staff_name,
                    $r->note ?? '',
                    $r->status,
                    $dt,
                ]);
            }
            fclose($out);
        }, 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Pragma' => 'no-cache',
        ]);
    }
}
