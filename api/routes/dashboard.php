<?php
/**
 * Dashboard route
 *
 *   GET /dashboard — all data needed for the admin dashboard in one call
 *   GET /dashboard/cashier — database-backed cashier dashboard totals
 *     - weekly revenue/profit chart data (last 7 days)
 *     - top 5 selling products this week
 *     - KPI stat cards
 *     - recent transactions (last 6)
 *     - stock alerts summary
 */

$pdo = db();

if ($method !== 'GET') json_response(['error' => 'Method not allowed.'], 405);

if ($id === 'cashier') {
    $cashier = require_auth();
    if ($cashier['role'] !== 'cashier') {
        json_response(['error' => 'Forbidden. Insufficient permissions.'], 403);
    }

    $staffName = staff_abbrev($cashier['name']);
    $salesStmt = $pdo->prepare(
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
           AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY"
    );
    $salesStmt->execute([$cashier['id'], $staffName]);
    $sales = $salesStmt->fetch(PDO::FETCH_ASSOC);

    $stockStmt = $pdo->query(
        "SELECT p.id, p.status, MIN(b.expiry_date) AS earliest_expiry
         FROM products p
         LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
         GROUP BY p.id, p.status"
    );
    $lowStockCount = 0;
    $expiryAlertCount = 0;
    $today = strtotime(date('Y-m-d'));
    foreach ($stockStmt->fetchAll(PDO::FETCH_ASSOC) as $product) {
        if (in_array($product['status'], ['out_of_stock', 'critical', 'low'], true)) $lowStockCount++;
        if (!$product['earliest_expiry']) continue;
        $days = (strtotime($product['earliest_expiry']) - $today) / 86400;
        if ($days <= 90) $expiryAlertCount++;
    }

    json_response([
        'todayRevenue' => (float)$sales['today_revenue'],
        'todaySalesCount' => (int)$sales['today_sales_count'],
        'todayUnits' => (int)$sales['today_units'],
        'todayReturnsCount' => (int)$sales['today_returns_count'],
        'todayReturnedUnits' => (int)$sales['today_returned_units'],
        'weekRevenue' => (float)$sales['week_revenue'],
        'weekSalesCount' => (int)$sales['week_sales_count'],
        'stockAlertCount' => $lowStockCount + $expiryAlertCount,
    ]);
}

require_role(['admin/owner', 'admin']);

// ── Weekly revenue (last 7 calendar days) ─────────────────────────────────────
$weekData = [];
for ($i = 6; $i >= 0; $i--) {
    $dt       = new DateTime("-$i days");
    $dayLabel = $dt->format('D'); // Mon, Tue …
    $dayDate  = $dt->format('Y-m-d');
    $weekData[$dayDate] = ['key' => $dayLabel, 'revenue' => 0.0];
}

$stmt = $pdo->prepare(
    "SELECT DATE(transacted_at) AS day, SUM(amount) AS revenue
     FROM transactions
     WHERE type = 'sale' AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY
     GROUP BY DATE(transacted_at)"
);
$stmt->execute();
foreach ($stmt->fetchAll() as $r) {
    if (isset($weekData[$r['day']])) {
        $weekData[$r['day']]['revenue'] = (float)$r['revenue'];
    }
}
$weekChart    = array_values($weekData);
$weekRevTotal = array_sum(array_column($weekChart, 'revenue'));

// ── Top 5 selling products this week ─────────────────────────────────────────
$topStmt = $pdo->prepare(
    "SELECT product_name AS name, SUM(qty) AS sold
     FROM transactions
     WHERE type='sale' AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY
     GROUP BY product_name
     ORDER BY sold DESC
     LIMIT 5"
);
$topStmt->execute();
$topProducts = $topStmt->fetchAll(PDO::FETCH_ASSOC);
$topProducts = array_map(fn($r) => ['name' => $r['name'], 'sold' => (int)$r['sold']], $topProducts);

// ── Recent 6 transactions ─────────────────────────────────────────────────────
$recStmt = $pdo->query(
    "SELECT id, type, product_name, qty, amount, staff, status, transacted_at
     FROM transactions ORDER BY transacted_at DESC LIMIT 6"
);
$recent = array_map(fn($r) => [
    'id'      => $r['id'],
    'type'    => $r['type'],
    'product' => $r['product_name'],
    'qty'     => (int)$r['qty'],
    'amount'  => (float)$r['amount'],
    'staff'   => $r['staff'],
    'status'  => $r['status'],
    'date'    => date('m/d/Y H:i', strtotime($r['transacted_at'])),
], $recStmt->fetchAll());

// ── Stock KPIs ────────────────────────────────────────────────────────────────
$invStmt = $pdo->query(
    "SELECT p.id, p.name, p.status, p.reorder,
            COALESCE(SUM(b.qty),0) AS stock,
            MIN(b.expiry_date)     AS earliest_expiry
     FROM products p
     LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
     GROUP BY p.id, p.name, p.status, p.reorder"
);
$allProducts = $invStmt->fetchAll(PDO::FETCH_ASSOC);
$totalUnits  = array_sum(array_column($allProducts, 'stock'));
$lowStock    = array_filter($allProducts, fn($p) => in_array($p['status'], ['out_of_stock','critical','low']));
$lowStockCount = count($lowStock);
$criticalCount = count(array_filter($allProducts, fn($p) => $p['status'] === 'critical'));

$now = time();
$expired = $within30 = $within90 = 0;
foreach ($allProducts as $p) {
    if (!$p['earliest_expiry']) continue;
    $days = ($now - strtotime($p['earliest_expiry'])) / 86400 * -1; // negative = expired
    if ($days <= 0)   $expired++;
    elseif ($days <= 30)  $within30++;
    elseif ($days <= 90)  $within90++;
}

// ── Stock alerts list ─────────────────────────────────────────────────────────
$alertList = array_values(array_filter($allProducts, fn($p) => $p['status'] !== 'good'));
$alertList = array_map(fn($p) => [
    'id'             => $p['id'],
    'name'           => $p['name'],
    'status'         => $p['status'],
    'stock'          => (int)$p['stock'],
    'reorder'        => (int)$p['reorder'],
    'earliestExpiry' => $p['earliest_expiry']
        ? date('m/d/Y', strtotime($p['earliest_expiry']))
        : '—',
], $alertList);

json_response([
    'weekChart'     => $weekChart,
    'weekRevenue'   => round($weekRevTotal, 2),
    'topProducts'   => $topProducts,
    'recentTx'      => $recent,
    'stats' => [
        'totalStockUnits'   => (int)$totalUnits,
        'productCount'      => count($allProducts),
        'lowStockCount'     => $lowStockCount,
        'criticalCount'     => $criticalCount,
        'expiredCount'      => $expired,
        'within30Count'     => $within30,
        'within90Count'     => $within90,
        'totalAlertBadge'   => $lowStockCount + $expired + $within30 + $within90,
    ],
    'stockAlerts'   => $alertList,
]);
