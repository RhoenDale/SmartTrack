<?php
/**
 * Stock Alerts route
 *
 *   GET /stock-alerts          — combined stock + expiry alert data
 *   GET /stock-alerts/stock    — stock level alerts only
 *   GET /stock-alerts/expiry   — expiry alerts only
 */

require_auth();
$pdo = db();

if ($method !== 'GET') json_response(['error' => 'Method not allowed.'], 405);

$tab = $id ?? 'all';

// Fetch all products with computed stock and earliest expiry
$rows = $pdo->query(
    "SELECT p.id, p.name, p.category, p.reorder, p.price, p.status,
            COALESCE(SUM(b.qty),0) AS stock,
            MIN(b.expiry_date)     AS earliest_expiry
     FROM products p
     LEFT JOIN product_batches b ON b.product_id = p.id AND b.qty > 0
     GROUP BY p.id, p.name, p.category, p.reorder, p.price, p.status"
)->fetchAll(PDO::FETCH_ASSOC);

$now = time();

$stockAlerts  = [];
$expiryAlerts = [];

foreach ($rows as $r) {
    $stock  = (int)$r['stock'];
    $reorder = (int)$r['reorder'];
    $expiry = $r['earliest_expiry'];

    // Stock alerts
    if (in_array($r['status'], ['critical','low','moderate'])) {
        $pct      = $reorder > 0 ? min(100, round(($stock / ($reorder * 1.5)) * 100)) : 100;
        $shortage = max(0, $reorder - $stock);
        $stockAlerts[] = [
            'id'       => $r['id'],
            'name'     => $r['name'],
            'category' => $r['category'],
            'stock'    => $stock,
            'reorder'  => $reorder,
            'price'    => (float)$r['price'],
            'status'   => $r['status'],
            'shortage' => $shortage,
            'pct'      => $pct,
            'expiry'   => $expiry ? date('m/d/Y', strtotime($expiry)) : '—',
        ];
    }

    // Expiry alerts
    if ($expiry) {
        $daysLeft = ($now - strtotime($expiry)) / 86400 * -1; // negative = already expired
        if ($daysLeft <= 90) {
            $level = $daysLeft <= 0 ? 'expired' : ($daysLeft <= 30 ? 'within30' : 'within90');
            $expiryAlerts[] = [
                'id'       => $r['id'],
                'name'     => $r['name'],
                'category' => $r['category'],
                'stock'    => $stock,
                'expiry'   => date('m/d/Y', strtotime($expiry)),
                'daysLeft' => (int)ceil(abs($daysLeft)),
                'level'    => $level,
            ];
        }
    }
}

// Sort expiry alerts: expired first, then soonest
usort($expiryAlerts, function ($a, $b) {
    $order = ['expired' => 0, 'within30' => 1, 'within90' => 2];
    $diff  = $order[$a['level']] <=> $order[$b['level']];
    return $diff !== 0 ? $diff : $a['daysLeft'] <=> $b['daysLeft'];
});

$summary = [
    'stockAlertCount'  => count($stockAlerts),
    'expiryAlertCount' => count($expiryAlerts),
    'criticalCount'    => count(array_filter($stockAlerts, fn($a) => $a['status'] === 'critical')),
    'lowCount'         => count(array_filter($stockAlerts, fn($a) => $a['status'] === 'low')),
    'moderateCount'    => count(array_filter($stockAlerts, fn($a) => $a['status'] === 'moderate')),
    'expiredCount'     => count(array_filter($expiryAlerts, fn($a) => $a['level'] === 'expired')),
    'within30Count'    => count(array_filter($expiryAlerts, fn($a) => $a['level'] === 'within30')),
    'within90Count'    => count(array_filter($expiryAlerts, fn($a) => $a['level'] === 'within90')),
];

switch ($tab) {
    case 'stock':
        json_response(['summary' => $summary, 'stockAlerts' => $stockAlerts]);
        break;
    case 'expiry':
        json_response(['summary' => $summary, 'expiryAlerts' => $expiryAlerts]);
        break;
    default:
        json_response([
            'summary'      => $summary,
            'stockAlerts'  => $stockAlerts,
            'expiryAlerts' => $expiryAlerts,
        ]);
}
