<?php
/**
 * User / Staff routes  (admin only except self-profile updates)
 *
 *   GET    /users                — list active staff            [admin]
 *   GET    /users/deleted        — list soft-deleted users      [admin]
 *   GET    /users/{id}           — single user                  [admin]
 *   POST   /users                — create user                  [admin]
 *   PUT    /users/{id}           — update user                  [admin/self]
 *   PUT    /users/{id}/password  — change password              [admin/self]
 *   POST   /users/{id}/reset-password — wipe password           [admin]
 *   POST   /users/{id}/restore   — restore from recycle bin     [admin]
 *   DELETE /users/{id}           — soft-delete (move to bin)    [admin]
 *   DELETE /users/{id}/purge     — permanent delete             [admin/owner]
 */

require_auth();
$pdo      = db();
$authUser = current_user();

// Helper: check whether the soft-delete migration has been applied
function soft_delete_enabled(PDO $pdo): bool {
    static $checked = null;
    if ($checked !== null) return $checked;
    $cols = $pdo->query("SHOW COLUMNS FROM users LIKE 'deleted_at'")->fetchAll();
    return $checked = !empty($cols);
}

function user_role_exists(PDO $pdo, string $role): bool {
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE id = ? LIMIT 1');
    $stmt->execute([$role]);
    return $stmt->fetchColumn() === $role;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes with $sub  (must be checked BEFORE the generic $id block)
// ─────────────────────────────────────────────────────────────────────────────

// PUT /users/{id}/password
if ($id && $id !== 'deleted' && $sub === 'password' && $method === 'PUT') {
    $isSelf  = $authUser && $authUser['id'] === $id;
    if (!$isSelf) require_role(['admin/owner', 'admin']);
    $targetStmt = $pdo->prepare('SELECT role FROM users WHERE id = ?');
    $targetStmt->execute([$id]);
    $target = $targetStmt->fetch();
    if (!$target) json_response(['error' => 'User not found.'], 404);
    if (!$isSelf && $authUser['role'] === 'admin') {
        if (!in_array($target['role'], ['cashier', 'inventory_manager'])) {
            json_response(['error' => 'Admins can only change passwords for cashiers and inventory managers.'], 403);
        }
    }
    $data = body();
    require_fields($data, ['password']);
    if (!is_string($data['password']) || strlen($data['password']) < 6) {
        json_response(['error' => 'Password must be at least 6 characters.'], 422);
    }
    $pdo->prepare('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?')
        ->execute([password_hash($data['password'], PASSWORD_BCRYPT), $id]);
    json_response(['message' => 'Password updated.']);
}

// POST /users/{id}/reset-password
if ($id && $id !== 'deleted' && $sub === 'reset-password' && $method === 'POST') {
    require_role(['admin/owner', 'admin']);
    if ($authUser['id'] === $id) json_response(['error' => 'Use the change-password form to update your own password.'], 403);
    $t = $pdo->prepare('SELECT role FROM users WHERE id = ?');
    $t->execute([$id]);
    $tu = $t->fetch();
    if (!$tu) json_response(['error' => 'User not found.'], 404);
    if ($authUser['role'] === 'admin' && !in_array($tu['role'], ['cashier', 'inventory_manager'])) {
        json_response(['error' => 'Admins can only reset passwords for cashiers and inventory managers.'], 403);
    }
    $pdo->prepare('UPDATE users SET password = "", updated_at = NOW() WHERE id = ?')->execute([$id]);
    json_response(['message' => 'Password has been reset. User must set a new password.']);
}

// POST /users/{id}/restore
if ($id && $id !== 'deleted' && $sub === 'restore' && $method === 'POST') {
    require_role(['admin/owner', 'admin']);
    if (!soft_delete_enabled($pdo)) json_response(['error' => 'Recycle bin migration not applied yet.'], 500);
    $t = $pdo->prepare('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NOT NULL');
    $t->execute([$id]);
    $target = $t->fetch();
    if (!$target) json_response(['error' => 'User not found in recycle bin.'], 404);
    if ($authUser['role'] === 'admin' && !in_array($target['role'], ['cashier', 'inventory_manager'])) {
        json_response(['error' => 'Admins can only restore cashiers and inventory managers.'], 403);
    }
    $pdo->prepare('UPDATE users SET deleted_at = NULL, deleted_by = NULL, delete_note = NULL, status = \'inactive\', updated_at = NOW() WHERE id = ?')
        ->execute([$id]);
    json_response(['message' => 'User restored. Status is inactive — activate when ready.']);
}

// DELETE /users/{id}/purge
if ($id && $id !== 'deleted' && $sub === 'purge' && $method === 'DELETE') {
    require_role(['admin/owner']);
    if (!soft_delete_enabled($pdo)) json_response(['error' => 'Recycle bin migration not applied yet.'], 500);
    $t = $pdo->prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NOT NULL');
    $t->execute([$id]);
    if (!$t->fetch()) json_response(['error' => 'User not found in recycle bin.'], 404);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    json_response(['message' => 'User permanently deleted.']);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/deleted — recycle bin list
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'GET' && $id === 'deleted') {
    require_role(['admin/owner', 'admin']);
    purge_expired_recycle_bin($pdo);
    if (!soft_delete_enabled($pdo)) json_response([]); // migration not run yet
    $stmt = $pdo->query(
        'SELECT u.id, u.name, u.role, u.email, u.position, u.initials, u.status,
                u.last_login, u.deleted_at, u.deleted_by, u.delete_note,
                d.name AS deleted_by_name
         FROM users u
         LEFT JOIN users d ON d.id = u.deleted_by
         WHERE u.deleted_at IS NOT NULL
         ORDER BY u.deleted_at DESC'
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    json_response(array_map(function ($u) {
        $base = format_user($u);
        $base['deletedAt']       = $u['deleted_at'];
        $base['deletedByName']   = $u['deleted_by_name'] ?? $u['deleted_by'] ?? null;
        $base['deleteNote']      = $u['delete_note'] ?? null;
        $base['daysSinceDelete'] = $u['deleted_at']
            ? (int)floor((time() - strtotime($u['deleted_at'])) / 86400)
            : 0;
        return $base;
    }, $rows));
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic /users/{id} block
// ─────────────────────────────────────────────────────────────────────────────
if ($id && $id !== 'deleted') {
    if ($method === 'GET') {
        require_role(['admin/owner', 'admin']);
        $stmt = $pdo->prepare('SELECT id, name, role, email, position, initials, status, last_login, created_at FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $u = $stmt->fetch();
        if (!$u) json_response(['error' => 'User not found.'], 404);
        json_response(format_user($u));
    }

    if ($method === 'PUT') {
        $isSelf  = $authUser && $authUser['id'] === $id;
        $isAdmin = in_array($authUser['role'] ?? '', ['admin/owner', 'admin']);
        if (!$isSelf && !$isAdmin) json_response(['error' => 'Forbidden: insufficient permissions.'], 403);

        $data = body();
        if ($isSelf && !$isAdmin) {
            require_fields($data, ['name', 'email']);
            if (!is_string($data['name']) || strlen($data['name']) > 120) {
                json_response(['error' => 'Name must be 120 characters or less.'], 422);
            }
            if (!is_string($data['email']) || !filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL)) {
                json_response(['error' => 'Enter a valid email address.'], 422);
            }
            $initials = make_initials($data['name']);
            $pdo->prepare('UPDATE users SET name=?, email=?, initials=?, updated_at=NOW() WHERE id = ?')
                ->execute([$data['name'], strtolower(trim($data['email'])), $initials, $id]);
        } else {
            require_fields($data, ['name', 'role', 'email', 'status']);
            if (!is_string($data['name']) || strlen($data['name']) > 120) json_response(['error' => 'Name must be 120 characters or less.'], 422);
            if (!is_string($data['email']) || !filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL)) {
                json_response(['error' => 'Enter a valid email address.'], 422);
            }
            if (!is_string($data['role']) || trim($data['role']) === '' || strlen($data['role']) > 50) {
                json_response(['error' => 'Select a valid role.'], 422);
            }
            if (!user_role_exists($pdo, $data['role'])) {
                json_response(['error' => 'Select a role that exists in the roles table.'], 422);
            }
            if (!in_array($data['status'], ['active', 'inactive'], true)) {
                json_response(['error' => 'Status must be active or inactive.'], 422);
            }
            $initials = make_initials($data['name']);
            $pdo->prepare('UPDATE users SET name=?, role=?, email=?, status=?, initials=?, position=?, updated_at=NOW() WHERE id = ?')
                ->execute([$data['name'], $data['role'], strtolower(trim($data['email'])), $data['status'], $initials, $data['position'] ?? '', $id]);
        }
        $stmt = $pdo->prepare('SELECT id, name, role, email, position, initials, status, last_login FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $updated = $stmt->fetch();
        if (!$updated) json_response(['error' => 'User not found.'], 404);
        json_response(format_user($updated));
    }

    if ($method === 'DELETE') {
        require_role(['admin/owner', 'admin']);
        if ($authUser && $authUser['id'] === $id) json_response(['error' => 'You cannot delete your own account.'], 403);
        $t = $pdo->prepare('SELECT id, role FROM users WHERE id = ?' . (soft_delete_enabled($pdo) ? ' AND deleted_at IS NULL' : ''));
        $t->execute([$id]);
        $target = $t->fetch();
        if (!$target) json_response(['error' => 'User not found.'], 404);
        if ($authUser['role'] === 'admin' && !in_array($target['role'], ['cashier', 'inventory_manager'])) {
            json_response(['error' => 'Admins can only delete cashiers and inventory managers.'], 403);
        }
        if (soft_delete_enabled($pdo)) {
            $note = body()['note'] ?? null;
            $pdo->prepare("UPDATE users SET deleted_at = NOW(), deleted_by = ?, delete_note = ?, status = 'inactive', updated_at = NOW() WHERE id = ?")
                ->execute([$authUser['id'], $note, $id]);
            json_response(['message' => 'User moved to recycle bin.']);
        } else {
            $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
            json_response(['message' => 'User deleted.']);
        }
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users — list active staff
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    require_role(['admin/owner', 'admin']);
    $where = soft_delete_enabled($pdo) ? 'WHERE deleted_at IS NULL' : '';
    $stmt  = $pdo->query("SELECT id, name, role, email, position, initials, status, last_login FROM users $where ORDER BY id ASC");
    json_response(array_map('format_user', $stmt->fetchAll()));
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /users — create user
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'POST') {
    require_role(['admin/owner', 'admin']);
    $data = body();
    require_fields($data, ['name', 'role', 'email', 'password']);
    if (!is_string($data['name']) || strlen($data['name']) > 120) {
        json_response(['error' => 'Name must be 120 characters or less.'], 422);
    }
    if (!is_string($data['email']) || !filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL)) {
        json_response(['error' => 'Enter a valid email address.'], 422);
    }
    if (!is_string($data['role']) || trim($data['role']) === '' || strlen($data['role']) > 50) {
        json_response(['error' => 'Select a valid role.'], 422);
    }
    if (!user_role_exists($pdo, $data['role'])) {
        json_response(['error' => 'Select a role that exists in the roles table.'], 422);
    }
    if (!is_string($data['password']) || strlen($data['password']) < 6) {
        json_response(['error' => 'Password must be at least 6 characters.'], 422);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $check->execute([strtolower(trim($data['email']))]);
    if ($check->fetch()) json_response(['error' => 'Email already in use.'], 409);

    $maxId = $pdo->query("SELECT MAX(CAST(SUBSTRING(id,2) AS UNSIGNED)) FROM users")->fetchColumn();
    $newId = 'U' . str_pad((int)$maxId + 1, 3, '0', STR_PAD_LEFT);

    $pdo->prepare('INSERT INTO users (id, name, role, email, password, position, initials, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$newId, $data['name'], $data['role'], strtolower(trim($data['email'])),
                   password_hash($data['password'], PASSWORD_BCRYPT),
                   $data['position'] ?? '', make_initials($data['name']), $data['status'] ?? 'active']);

    $stmt = $pdo->prepare('SELECT id, name, role, email, position, initials, status, last_login FROM users WHERE id = ?');
    $stmt->execute([$newId]);
    json_response(format_user($stmt->fetch()), 201);
}

json_response(['error' => 'Method not allowed.'], 405);

function format_user(array $u): array {
    return [
        'id'        => $u['id'],
        'name'      => $u['name'],
        'role'      => $u['role'],
        'email'     => $u['email'],
        'position'  => $u['position'] ?? '',
        'initials'  => $u['initials'],
        'status'    => $u['status'],
        'lastLogin' => isset($u['last_login']) && $u['last_login']
            ? date('m/d/Y H:i', strtotime($u['last_login']))
            : 'Never',
    ];
}
