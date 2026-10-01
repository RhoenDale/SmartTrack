<?php
/**
 * SmartTrack Diagnostic Script
 * Tests database connection, schema, data, and API routing
 * 
 * Access via: http://localhost/SmartTrack/api/diagnostic
 */

header('Content-Type: application/json; charset=utf-8');

$diagnostics = [];

// ─── 1. Database Connection ───────────────────────────────────────────────────
try {
    require_once __DIR__ . '/config.php';
    require_once __DIR__ . '/db.php';
    
    $pdo = db();
    $diagnostics['database'] = ['status' => 'connected', 'host' => DB_HOST, 'database' => DB_NAME];
} catch (Exception $e) {
    $diagnostics['database'] = ['status' => 'error', 'message' => $e->getMessage()];
    http_response_code(500);
    echo json_encode($diagnostics, JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── 2. Database Schema Tables ────────────────────────────────────────────────
try {
    $stmt = $pdo->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $diagnostics['schema'] = [
        'tables_found' => count($tables),
        'tables' => $tables,
        'required_tables' => ['users', 'products', 'product_batches', 'transactions', 'auth_tokens'],
        'all_present' => count(array_intersect(['users', 'products', 'product_batches', 'transactions', 'auth_tokens'], $tables)) === 5
    ];
} catch (Exception $e) {
    $diagnostics['schema'] = ['status' => 'error', 'message' => $e->getMessage()];
}

// ─── 3. Data Counts ──────────────────────────────────────────────────────────
try {
    $diagnostics['data'] = [
        'users' => (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
        'products' => (int)$pdo->query("SELECT COUNT(*) FROM products")->fetchColumn(),
        'product_batches' => (int)$pdo->query("SELECT COUNT(*) FROM product_batches")->fetchColumn(),
        'transactions' => (int)$pdo->query("SELECT COUNT(*) FROM transactions")->fetchColumn(),
        'auth_tokens' => (int)$pdo->query("SELECT COUNT(*) FROM auth_tokens")->fetchColumn(),
    ];
} catch (Exception $e) {
    $diagnostics['data'] = ['status' => 'error', 'message' => $e->getMessage()];
}

// ─── 4. Sample User for Testing ───────────────────────────────────────────────
try {
    $stmt = $pdo->query("SELECT id, name, email, role FROM users LIMIT 1");
    $sampleUser = $stmt->fetch(PDO::FETCH_ASSOC);
    $diagnostics['sample_user'] = $sampleUser ?: ['status' => 'no_users_found'];
} catch (Exception $e) {
    $diagnostics['sample_user'] = ['status' => 'error', 'message' => $e->getMessage()];
}

// ─── 5. Sample Products ──────────────────────────────────────────────────────
try {
    $stmt = $pdo->query("SELECT id, name, category FROM products LIMIT 3");
    $sampleProducts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $diagnostics['sample_products'] = $sampleProducts ?: ['status' => 'no_products_found'];
} catch (Exception $e) {
    $diagnostics['sample_products'] = ['status' => 'error', 'message' => $e->getMessage()];
}

// ─── 6. Environment Check ────────────────────────────────────────────────────
$diagnostics['environment'] = [
    'php_version' => phpversion(),
    'pdo_available' => extension_loaded('pdo'),
    'pdo_mysql_available' => extension_loaded('pdo_mysql'),
    'request_method' => $_SERVER['REQUEST_METHOD'],
    'origin' => $_SERVER['HTTP_ORIGIN'] ?? 'none',
    'host' => $_SERVER['HTTP_HOST'] ?? 'unknown',
];

// ─── 7. CORS Configuration Check ──────────────────────────────────────────────
$diagnostics['cors'] = [
    'allowed_origins' => ['http://localhost:5173', 'http://localhost', 'http://127.0.0.1', 'file://'],
    'current_origin' => $_SERVER['HTTP_ORIGIN'] ?? 'none',
    'allowed' => in_array($_SERVER['HTTP_ORIGIN'] ?? '', ['http://localhost:5173', 'http://localhost', 'http://127.0.0.1', 'file://', '']) || $_SERVER['HTTP_ORIGIN'] === ''
];

http_response_code(200);
echo json_encode($diagnostics, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
