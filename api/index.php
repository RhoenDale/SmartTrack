<?php
/**
 * SmartTrack — PHP REST API  (entry point)
 * URL pattern: http://localhost/SmartTrack/api/{resource}/{id}/{sub}
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

// ─── CORS ─────────────────────────────────────────────────────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['http://localhost:5173', 'http://localhost', 'http://127.0.0.1', 'http://localhost:80'];
$corsOrigin = in_array($origin, $allowed, true) ? $origin : 'http://localhost';
header("Access-Control-Allow-Origin: $corsOrigin");
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ─── Parse URI ────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Normalize: strip any leading path up to and including /api
// Handles both /SmartTrack/api/... and /api/...
$uri = preg_replace('#^.*?/api#', '', $uri);
$uri = trim($uri, '/');

// Split into path segments
// e.g. "products/P001/batches" → ['products','P001','batches']
$segments = ($uri === '') ? [] : explode('/', $uri);

$resource = $segments[0] ?? '';   // products, auth, users, …
$id       = $segments[1] ?? null; // P001, login, export, …
$sub      = $segments[2] ?? null; // batches, password, …
$sub2     = $segments[3] ?? null; // batchId under /products/{id}/batches/{batchId}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
try {
    switch ($resource) {
        case 'auth':         require __DIR__ . '/routes/auth.php';         break;
        case 'products':     require __DIR__ . '/routes/products.php';     break;
        case 'categories':   require __DIR__ . '/routes/categories.php';   break;
        case 'transactions': require __DIR__ . '/routes/transactions.php'; break;
        case 'users':        require __DIR__ . '/routes/users.php';        break;
        case 'notifications':require __DIR__ . '/routes/notifications.php';break;
        case 'analytics':    require __DIR__ . '/routes/analytics.php';    break;
        case 'dashboard':    require __DIR__ . '/routes/dashboard.php';    break;
        case 'reports':      require __DIR__ . '/routes/reports.php';      break;
        case 'stock-alerts': require __DIR__ . '/routes/stock_alerts.php'; break;
        default:
            json_response(['error' => "Route '$resource' not found."], 404);
    }
} catch (PDOException $e) {
    json_response(['error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    json_response(['error' => $e->getMessage()], 500);
}
