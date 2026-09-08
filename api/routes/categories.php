<?php
/**
 * Categories routes
 *
 *   GET    /categories        — list all
 *   POST   /categories        — add a category  [inv_mgr+]
 *   DELETE /categories/{id}   — remove category [admin]
 */

require_auth();
$pdo = db();

if ($id) {
    if ($method === 'DELETE') {
        require_role(['admin/owner', 'admin']);
        $pdo->prepare('DELETE FROM categories WHERE id = ?')->execute([$id]);
        json_response(['message' => 'Category deleted.']);
    }
    json_response(['error' => 'Method not allowed.'], 405);
}

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT name FROM categories ORDER BY name ASC');
    $cats = array_column($stmt->fetchAll(), 'name');
    json_response($cats);
}

if ($method === 'POST') {
    require_role(['admin/owner', 'admin', 'inventory_manager']);
    $data = body();
    require_fields($data, ['name']);
    $name = trim($data['name']);

    // Upsert — ignore if already exists
    $pdo->prepare('INSERT IGNORE INTO categories (name) VALUES (?)')->execute([$name]);
    json_response(['message' => 'Category saved.', 'name' => $name], 201);
}

json_response(['error' => 'Method not allowed.'], 405);
