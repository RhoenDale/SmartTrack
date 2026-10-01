<?php
/**
 * Read the existing users directly from the database.
 * No hardcoded credentials or passwords are stored in this file.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = db();
    $stmt = $pdo->query(
        'SELECT id, name, email, role, position, initials, status, last_login, created_at
         FROM users
         ORDER BY id ASC'
    );

    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    http_response_code(200);
    echo json_encode([
        'status'  => 'success',
        'count'   => count($users),
        'users'   => $users,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

