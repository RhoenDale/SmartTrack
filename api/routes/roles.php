<?php
/**
 * Roles routes
 *
 *   GET    /roles        — list all roles with user count and permissions
 *   GET    /roles/{id}   — single role
 *   POST   /roles        — create custom role [admin only]
 *   PUT    /roles/{id}   — update custom role [admin only]
 *   DELETE /roles/{id}   — delete custom role [admin only]
 */

require_auth();
$pdo      = db();
$authUser = current_user();

function format_role(array $r): array {
    $permissions = [];
    if (!empty($r['permissions'])) {
        $decoded = json_decode($r['permissions'], true);
        if (is_array($decoded)) {
            $permissions = $decoded;
        }
    }
    return [
        'id'          => $r['id'],
        'name'        => $r['name'],
        'description' => $r['description'] ?? '',
        'permissions' => $permissions,
        'isSystem'    => (bool)($r['is_system'] ?? 0),
        'userCount'   => isset($r['user_count']) ? (int)$r['user_count'] : 0,
        'createdAt'   => $r['created_at'] ?? null,
        'updatedAt'   => $r['updated_at'] ?? null,
    ];
}

// ── Single role operations: /roles/{id} ───────────────────────────────────────
if ($id) {
    if ($method === 'GET') {
        $stmt = $pdo->prepare('
            SELECT r.*, COUNT(u.id) as user_count 
            FROM roles r 
            LEFT JOIN users u ON u.role = r.id 
            WHERE r.id = ? 
            GROUP BY r.id
        ');
        $stmt->execute([$id]);
        $role = $stmt->fetch();
        if (!$role) {
            json_response(['error' => 'Role not found.'], 404);
        }
        json_response(format_role($role));
    }

    if ($method === 'PUT') {
        require_role(['admin/owner', 'admin']);
        $data = body();
        require_fields($data, ['name']);

        // Check if role exists
        $stmt = $pdo->prepare('SELECT * FROM roles WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            json_response(['error' => 'Role not found.'], 404);
        }

        $name = trim($data['name']);
        if (empty($name)) {
            json_response(['error' => 'Role name cannot be empty.'], 400);
        }

        $description = trim($data['description'] ?? '');
        $permissions = isset($data['permissions']) && is_array($data['permissions'])
            ? json_encode(array_values(array_unique($data['permissions'])))
            : json_encode([]);

        $pdo->prepare('
            UPDATE roles 
            SET name = ?, description = ?, permissions = ?, updated_at = NOW() 
            WHERE id = ?
        ')->execute([$name, $description, $permissions, $id]);

        $fetchStmt = $pdo->prepare('
            SELECT r.*, COUNT(u.id) as user_count 
            FROM roles r 
            LEFT JOIN users u ON u.role = r.id 
            WHERE r.id = ? 
            GROUP BY r.id
        ');
        $fetchStmt->execute([$id]);
        json_response(format_role($fetchStmt->fetch()));
    }

    if ($method === 'DELETE') {
        require_role(['admin/owner', 'admin']);

        // Check if role exists
        $stmt = $pdo->prepare('SELECT * FROM roles WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            json_response(['error' => 'Role not found.'], 404);
        }

        // Prevent deleting built-in system roles
        if (!empty($existing['is_system'])) {
            json_response(['error' => 'System roles cannot be deleted.'], 400);
        }

        // Check if any users are currently assigned to this role
        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE role = ?');
        $countStmt->execute([$id]);
        $assignedCount = (int)$countStmt->fetchColumn();
        if ($assignedCount > 0) {
            json_response([
                'error' => "Cannot delete role because it is assigned to {$assignedCount} active staff member(s). Please reassign them first."
            ], 400);
        }

        $pdo->prepare('DELETE FROM roles WHERE id = ?')->execute([$id]);
        json_response(['message' => 'Role deleted successfully.']);
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── Collection operations: /roles ─────────────────────────────────────────────
if ($method === 'GET') {
    $stmt = $pdo->query('
        SELECT r.*, COUNT(u.id) as user_count 
        FROM roles r 
        LEFT JOIN users u ON u.role = r.id 
        GROUP BY r.id 
        ORDER BY r.is_system DESC, r.name ASC
    ');
    $roles = $stmt->fetchAll();
    json_response(array_map('format_role', $roles));
}

if ($method === 'POST') {
    require_role(['admin/owner', 'admin']);
    $data = body();
    require_fields($data, ['name']);

    $name = trim($data['name']);
    if (empty($name)) {
        json_response(['error' => 'Role name is required.'], 400);
    }

    // Generate slug ID if not explicitly provided
    $slug = trim($data['id'] ?? '');
    if (empty($slug)) {
        $slug = preg_replace('/[^a-z0-9]+/i', '_', strtolower($name));
        $slug = trim($slug, '_');
    } else {
        $slug = preg_replace('/[^a-z0-9_\-]+/i', '_', strtolower($slug));
    }

    if (empty($slug)) {
        $slug = 'role_' . substr(md5(uniqid()), 0, 6);
    }

    // Check duplicate ID
    $check = $pdo->prepare('SELECT id FROM roles WHERE id = ?');
    $check->execute([$slug]);
    if ($check->fetch()) {
        json_response(['error' => "A role with ID '{$slug}' already exists."], 409);
    }

    $description = trim($data['description'] ?? '');
    $permissions = isset($data['permissions']) && is_array($data['permissions'])
        ? json_encode(array_values(array_unique($data['permissions'])))
        : json_encode([]);

    $pdo->prepare('
        INSERT INTO roles (id, name, description, permissions, is_system, created_at, updated_at) 
        VALUES (?, ?, ?, ?, 0, NOW(), NOW())
    ')->execute([$slug, $name, $description, $permissions]);

    $fetchStmt = $pdo->prepare('
        SELECT r.*, 0 as user_count 
        FROM roles r 
        WHERE r.id = ?
    ');
    $fetchStmt->execute([$slug]);
    json_response(format_role($fetchStmt->fetch()), 201);
}

json_response(['error' => 'Method not allowed.'], 405);

