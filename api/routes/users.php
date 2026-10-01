<?php
/**
 * User / Staff routes  (admin only except GET /users/me)
 *
 *   GET    /users            — list all staff   [admin]
 *   GET    /users/{id}       — single user       [admin]
 *   POST   /users            — create user       [admin]
 *   PUT    /users/{id}       — update user       [admin]
 *   PUT    /users/{id}/password — change password [admin]
 *   DELETE /users/{id}       — not implemented   (soft status change instead)
 */

require_auth();
$pdo      = db();
$authUser = current_user();

// ── PUT /users/{id}/password ──────────────────────────────────────────────────
if ($id && $sub === 'password' && $method === 'PUT') {
    // Admins can change anyone's password; users can only change their own
    $isSelf = $authUser && $authUser['id'] === $id;
    if (!$isSelf) {
        require_role(['admin/owner', 'admin']);
        // Admin (not owner) can only change password for cashier/inventory_manager
        if ($authUser['role'] === 'admin') {
            $target = $pdo->prepare('SELECT role FROM users WHERE id = ?');
            $target->execute([$id]);
            $targetUser = $target->fetch();
            if (!$targetUser || !in_array($targetUser['role'], ['cashier', 'inventory_manager'])) {
                json_response(['error' => 'Admins can only change passwords for cashiers and inventory managers.'], 403);
            }
        }
    }
    $data = body();
    require_fields($data, ['password']);

    $hash = password_hash($data['password'], PASSWORD_BCRYPT);
    $pdo->prepare('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?')
        ->execute([$hash, $id]);
    json_response(['message' => 'Password updated.']);
}

// ── POST /users/{id}/reset-password  — wipes password (admin/owner only) ─────
if ($id && $sub === 'reset-password' && $method === 'POST') {
    require_role(['admin/owner', 'admin']);

    // Prevent resetting your own password this way
    if ($authUser['id'] === $id) {
        json_response(['error' => 'Use the change-password form to update your own password.'], 403);
    }

    // Fetch target user role
    $target = $pdo->prepare('SELECT role FROM users WHERE id = ?');
    $target->execute([$id]);
    $targetUser = $target->fetch();
    if (!$targetUser) json_response(['error' => 'User not found.'], 404);

    // Admin (not owner) can only reset cashier/inventory_manager passwords
    if ($authUser['role'] === 'admin') {
        if (!in_array($targetUser['role'], ['cashier', 'inventory_manager'])) {
            json_response(['error' => 'Admins can only reset passwords for cashiers and inventory managers.'], 403);
        }
    }

    // Set password to empty string (disabled — user can't login until new password is set)
    $pdo->prepare('UPDATE users SET password = "", updated_at = NOW() WHERE id = ?')
        ->execute([$id]);
    json_response(['message' => 'Password has been reset. User must set a new password.']);
}

// ── /users/{id} ───────────────────────────────────────────────────────────────
if ($id) {
    if ($method === 'GET') {
        require_role(['admin/owner', 'admin']);
        $stmt = $pdo->prepare(
            'SELECT id, name, role, email, position, initials, status, last_login, created_at
             FROM users WHERE id = ?'
        );
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if (!$user) json_response(['error' => 'User not found.'], 404);
        $user = format_user($user);
        json_response($user);
    }

    if ($method === 'PUT') {
        // Allow users to update their own profile (name, email only)
        // Admins can update any user (including role, status)
        $isSelf = $authUser && $authUser['id'] === $id;
        $isAdmin = in_array($authUser['role'] ?? '', ['admin/owner', 'admin']);
        
        if (!$isSelf && !$isAdmin) {
            json_response(['error' => 'Forbidden: insufficient permissions.'], 403);
        }

        $data = body();
        
        if ($isSelf && !$isAdmin) {
            // Regular users can only update their own name and email
            require_fields($data, ['name', 'email']);
            
            // Validate name length (database is varchar(120))
            if (strlen($data['name']) > 120) {
                json_response(['error' => 'Name must be 120 characters or less.'], 400);
            }
            
            // Don't allow changing role or status
            $initials = make_initials($data['name']);
            $pdo->prepare(
                'UPDATE users SET name=?, email=?, initials=?, updated_at=NOW() WHERE id = ?'
            )->execute([
                $data['name'],
                strtolower(trim($data['email'])),
                $initials,
                $id,
            ]);
        } else {
            // Admins can update everything
            require_fields($data, ['name', 'role', 'email', 'status']);
            
            // Validate name length (database is varchar(120))
            if (strlen($data['name']) > 120) {
                json_response(['error' => 'Name must be 120 characters or less.'], 400);
            }
            
            $initials = make_initials($data['name']);
            $pdo->prepare(
                'UPDATE users SET name=?, role=?, email=?, status=?, initials=?,
                 position=?, updated_at=NOW() WHERE id = ?'
            )->execute([
                $data['name'], $data['role'], strtolower(trim($data['email'])),
                $data['status'], $initials,
                $data['position'] ?? '',
                $id,
            ]);
        }

        $stmt = $pdo->prepare(
            'SELECT id, name, role, email, position, initials, status, last_login FROM users WHERE id = ?'
        );
        $stmt->execute([$id]);
        json_response(format_user($stmt->fetch()));
    }

    if ($method === 'DELETE') {
        require_role(['admin/owner', 'admin']);
        // Prevent deleting yourself
        if ($authUser && $authUser['id'] === $id) {
            json_response(['error' => 'You cannot delete your own account.'], 403);
        }
        $check = $pdo->prepare('SELECT id FROM users WHERE id = ?');
        $check->execute([$id]);
        if (!$check->fetch()) {
            json_response(['error' => 'User not found.'], 404);
        }
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        json_response(['message' => 'User deleted.']);
    }

    json_response(['error' => 'Method not allowed.'], 405);
}

// ── /users ────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    require_role(['admin/owner', 'admin']);
    $stmt = $pdo->query(
        'SELECT id, name, role, email, position, initials, status, last_login
         FROM users ORDER BY id ASC'
    );
    json_response(array_map('format_user', $stmt->fetchAll()));
}

if ($method === 'POST') {
    require_role(['admin/owner', 'admin']);
    $data = body();
    require_fields($data, ['name', 'role', 'email', 'password']);

    // Check duplicate email
    $check = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $check->execute([strtolower(trim($data['email']))]);
    if ($check->fetch()) {
        json_response(['error' => 'Email already in use.'], 409);
    }

    // Generate next user ID
    $maxId = $pdo->query("SELECT MAX(CAST(SUBSTRING(id,2) AS UNSIGNED)) FROM users")->fetchColumn();
    $newId = 'U' . str_pad((int)$maxId + 1, 3, '0', STR_PAD_LEFT);

    $initials = make_initials($data['name']);
    $hash     = password_hash($data['password'], PASSWORD_BCRYPT);

    $pdo->prepare(
        'INSERT INTO users (id, name, role, email, password, position, initials, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $newId,
        $data['name'],
        $data['role'],
        strtolower(trim($data['email'])),
        $hash,
        $data['position'] ?? '',
        $initials,
        $data['status'] ?? 'active',
    ]);

    $stmt = $pdo->prepare(
        'SELECT id, name, role, email, position, initials, status, last_login FROM users WHERE id = ?'
    );
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
        'lastLogin' => $u['last_login']
            ? date('m/d/Y H:i', strtotime($u['last_login']))
            : 'Never',
    ];
}
