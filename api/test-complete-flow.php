<?php
/**
 * Complete test flow: Login → Get Token → Fetch Data
 * Simulates the exact Electron app flow
 * 
 * Access via: http://localhost/SmartTrack/api/test-complete-flow
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

$results = [];

try {
    // ─── STEP 1: Login ────────────────────────────────────────────────────────
    $email = 'admin@tangub.ph';
    $password = 'admin123';
    
    $stmt = db()->prepare(
        'SELECT id, name, role, email, password, position, initials, status
         FROM users WHERE email = ? LIMIT 1'
    );
    $stmt->execute([strtolower(trim($email))]);
    $user = $stmt->fetch();
    
    if (!$user) {
        throw new Exception("User not found: $email");
    }
    
    if (!password_verify($password, $user['password'])) {
        throw new Exception("Password mismatch");
    }
    
    if ($user['status'] !== 'active') {
        throw new Exception("User account inactive");
    }
    
    // Create token
    unset($user['password']);
    $token = create_token((string)$user['id']);
    
    $results['step_1_login'] = [
        'status' => 'success',
        'user' => $user,
        'token' => $token,
    ];
    
    // ─── STEP 2: Fetch Products with Token ─────────────────────────────────
    $_SERVER['HTTP_AUTHORIZATION'] = "Bearer $token";
    
    $authUser = current_user();
    if (!$authUser) {
        throw new Exception("Token validation failed");
    }
    
    $stmt = db()->prepare('SELECT * FROM products ORDER BY id ASC');
    $stmt->execute();
    $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($products as &$p) {
        $p = enrich_product($p);
    }
    unset($p);
    
    $results['step_2_products'] = [
        'status' => 'success',
        'count' => count($products),
        'total_stock' => array_sum(array_column($products, 'stock')),
        'sample' => $products[0] ?? null,
    ];
    
    // ─── STEP 3: Fetch Transactions ───────────────────────────────────────
    $stmt = db()->query(
        "SELECT id, type, product_name, qty, amount, staff, status, transacted_at
         FROM transactions ORDER BY transacted_at DESC LIMIT 10"
    );
    $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $results['step_3_transactions'] = [
        'status' => 'success',
        'count' => count($transactions),
        'sample' => $transactions[0] ?? null,
    ];
    
    // ─── STEP 4: Fetch Dashboard Data (Admin Only) ─────────────────────────
    if ($authUser['role'] === 'admin' || $authUser['role'] === 'admin/owner') {
        $stmt = db()->query(
            "SELECT DATE(transacted_at) AS day, SUM(amount) AS revenue
             FROM transactions
             WHERE type = 'sale' AND DATE(transacted_at) >= CURDATE() - INTERVAL 6 DAY
             GROUP BY DATE(transacted_at)"
        );
        $weekData = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $results['step_4_dashboard'] = [
            'status' => 'success',
            'week_revenue_count' => count($weekData),
            'total_revenue' => array_sum(array_column($weekData, 'revenue')),
        ];
    }
    
    // ─── STEP 5: Fetch Categories ────────────────────────────────────────
    $stmt = db()->query('SELECT DISTINCT category FROM products ORDER BY category ASC');
    $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $results['step_5_categories'] = [
        'status' => 'success',
        'count' => count($categories),
        'categories' => $categories,
    ];
    
    // ─── STEP 6: Fetch Notifications ─────────────────────────────────────
    $stmt = db()->prepare(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
    );
    $stmt->execute([$authUser['id']]);
    $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $results['step_6_notifications'] = [
        'status' => 'success',
        'count' => count($notifications),
    ];
    
    $results['overall_status'] = 'SUCCESS - All data fetched correctly!';
    $results['ready_for_electron'] = true;
    
} catch (Exception $e) {
    http_response_code(500);
    $results['error'] = $e->getMessage();
    $results['overall_status'] = 'FAILED';
    $results['ready_for_electron'] = false;
}

http_response_code($results['overall_status'] === 'SUCCESS - All data fetched correctly!' ? 200 : 500);
echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
