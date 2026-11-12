<?php
/**
 * SmartTrack — PHP REST API  (entry point)
 * URL pattern: http://localhost/SmartTrack/api/{resource}/{id}/{sub}
 */

// ─── CORS ─────────────────────────────────────────────────────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
    'http://localhost:5173',
    'http://localhost',
    'http://localhost:80',
    'http://127.0.0.1',
    'http://127.0.0.1:80',
    'file://',   // Electron desktop app (file:// origin)
];
// Electron often sends no Origin header at all (empty string) — always allow localhost loopback
if ($origin === '' || in_array($origin, $allowed, true)) {
    $corsOrigin = ($origin !== '') ? $origin : 'http://localhost';
} else {
    $corsOrigin = 'http://localhost';
}
header("Access-Control-Allow-Origin: $corsOrigin");
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Active-Role');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// config.php contains machine-specific database credentials and is intentionally
// excluded from Git. Return JSON rather than a PHP warning page when it is absent.
$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(503);
    echo json_encode([
        'error' => 'API is not configured. Copy api/config.example.php to api/config.php and set your database credentials.',
    ]);
    exit;
}

require_once $configPath;
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

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
        case 'health':
            $pdo = db();
            require_once __DIR__ . '/migrator.php';
            $migrationStatus = run_auto_migrations($pdo);
            json_response([
                'status' => 'ok',
                'database' => ['status' => 'connected'],
                'migrations' => $migrationStatus,
                'offline' => true,
            ]);
            break;
        case 'setup-test-users': require __DIR__ . '/setup-test-users.php'; break;
        case 'diagnostic':   require __DIR__ . '/diagnostic.php';         break;
        case 'auth':         require __DIR__ . '/routes/auth.php';         break;
        case 'activity':     require __DIR__ . '/routes/activity.php';     break;
        case 'backup':       require __DIR__ . '/routes/backup.php';       break;
        case 'products':     require __DIR__ . '/routes/products.php';     break;
        case 'purchase-orders': require __DIR__ . '/routes/purchase_orders.php'; break;
        case 'categories':   require __DIR__ . '/routes/categories.php';   break;
        case 'transactions': require __DIR__ . '/routes/transactions.php'; break;
        case 'return-requests': require __DIR__ . '/routes/return_requests.php'; break;
        case 'users':        require __DIR__ . '/routes/users.php';        break;
        case 'roles':        require __DIR__ . '/routes/roles.php';        break;
        case 'settings':     require __DIR__ . '/routes/settings.php';     break;
        case 'notifications':require __DIR__ . '/routes/notifications.php';break;
        case 'analytics':    require __DIR__ . '/routes/analytics.php';    break;
        case 'dashboard':    require __DIR__ . '/routes/dashboard.php';    break;
        case 'reports':      require __DIR__ . '/routes/reports.php';      break;
        case 'stock-alerts': require __DIR__ . '/routes/stock_alerts.php'; break;
        case 'financial':    require __DIR__ . '/routes/financial.php';    break;
        default:
            json_response(['error' => "Route '$resource' not found."], 404);
    }
} catch (PDOException $e) {
    error_log('SmartTrack database error: ' . $e->getMessage());
    $driverCode = (int)($e->errorInfo[1] ?? 0);
    if ($driverCode === 1062) {
        json_response(['error' => 'A record with the same unique value already exists.'], 409);
    }
    if ($driverCode === 1451) {
        json_response(['error' => 'This record is still referenced and cannot be deleted.'], 409);
    }
    if ($driverCode === 1452) {
        json_response(['error' => 'A referenced record does not exist.'], 422);
    }
    if ($driverCode === 1265) {
        json_response(['error' => 'A supplied value is not supported by the current database schema. Apply the required database migration.'], 503);
    }
    json_response(['error' => 'A database error occurred. Check the server log for details.'], 500);
} catch (Throwable $e) {
    error_log('SmartTrack server error: ' . $e->getMessage());
    json_response(['error' => 'An unexpected server error occurred. Check the server log for details.'], 500);
}
