<?php
/**
 * SmartTrack — Authentication helpers
 *
 * Supports two auth mechanisms (checked in order):
 *   1. Authorization: Bearer <token>  — used by the Electron desktop app
 *   2. PHP session cookie             — used by the browser / dev server
 */

// ─── Session setup ────────────────────────────────────────────────────────────
if (session_status() === PHP_SESSION_NONE) {
    $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'httponly' => true,
        'secure'   => $isSecure,
        'samesite' => $isSecure ? 'None' : 'Lax',
    ]);
    session_start();
}

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * Extract Bearer token from the Authorization header OR ?token= query param.
 * The query param fallback is used by window.open() CSV export calls where
 * setting request headers is not possible.
 */
function get_bearer_token(): ?string {
    // 1. Authorization header
    $header = $_SERVER['HTTP_AUTHORIZATION']
           ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
           ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', trim($header), $m)) {
        return $m[1];
    }
    // 2. Query-string fallback (?token=...)
    $qt = trim($_GET['token'] ?? '');
    return $qt !== '' ? $qt : null;
}

/**
 * Look up a token in the DB and return the user row, or null if
 * the token is missing / expired / revoked.
 */
function user_from_token(string $token): ?array {
    $stmt = db()->prepare(
        'SELECT u.id, u.name, u.role, u.email, u.position, u.initials, u.status
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token = ? AND t.expires_at > NOW()
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ? attach_user_roles($row) : null;
}

function user_roles_enabled(?PDO $pdo = null): bool {
    static $enabled = null;
    if ($enabled === null) {
        $pdo = $pdo ?? db();
        $enabled = (bool)$pdo->query("SHOW TABLES LIKE 'user_roles'")->fetchColumn();
    }
    return $enabled;
}

function user_role_ids(string $userId, ?string $fallbackRole = null): array {
    if (user_roles_enabled()) {
        $stmt = db()->prepare(
            'SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY (role_id = ?) DESC, role_id ASC'
        );
        $stmt->execute([$userId, $fallbackRole ?? '']);
        $roles = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'role_id');
        if ($roles) return $roles;
    }

    return $fallbackRole !== null && $fallbackRole !== '' ? [$fallbackRole] : [];
}

function attach_user_roles(array $user): array {
    $user['roles'] = user_role_ids((string)$user['id'], $user['role'] ?? null);
    if (!$user['roles'] && !empty($user['role'])) {
        $user['roles'] = [$user['role']];
    }
    $activeRole = trim($_SERVER['HTTP_X_ACTIVE_ROLE'] ?? '');
    if ($activeRole !== '') {
        if (!in_array($activeRole, $user['roles'], true)) {
            json_response(['error' => 'The selected role is not assigned to this account. Please sign in again and choose an assigned role.'], 403);
        }
        $user['active_role'] = $activeRole;
        $user['role'] = $activeRole;
    } else {
        $user['active_role'] = $user['role'] ?? null;
    }
    return $user;
}

function user_has_role(array $user, array|string $roles): bool {
    $activeRole = $user['active_role'] ?? $user['role'] ?? null;
    $assignedRoles = $activeRole !== null ? [$activeRole] : [];
    $roles = is_array($roles) ? $roles : [$roles];
    return (bool)array_intersect($assignedRoles, $roles);
}

/** Generate a secure random token and persist it for the given user. */
function create_token(string $userId): string {
    $token  = bin2hex(random_bytes(32)); // 64-char hex string
    $expiry = date('Y-m-d H:i:s', time() + SESSION_LIFETIME);

    // Clean up old tokens for this user (keep at most 5 active sessions)
    $pdo = db();
    $pdo->prepare(
        'DELETE FROM auth_tokens WHERE user_id = ? AND id NOT IN (
             SELECT id FROM (
                 SELECT id FROM auth_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 4
             ) AS keep
         )'
    )->execute([$userId, $userId]);

    $pdo->prepare(
        'INSERT INTO auth_tokens (user_id, token, created_at, expires_at)
         VALUES (?, ?, NOW(), ?)'
    )->execute([$userId, $token, $expiry]);

    return $token;
}

/** Revoke a specific token (logout). */
function revoke_token(string $token): void {
    db()->prepare('DELETE FROM auth_tokens WHERE token = ?')->execute([$token]);
}

// ─── Auth resolution ──────────────────────────────────────────────────────────

/**
 * Returns the currently authenticated user array, or null.
 * Checks Bearer token first, then PHP session.
 */
function current_user(): ?array {
    // 1. Token-based (Electron / stateless clients)
    $bearer = get_bearer_token();
    if ($bearer !== null) {
        return user_from_token($bearer);
    }

    // 2. Session-based (browser)
    $user = $_SESSION['smarttrack_user'] ?? null;
    return $user ? attach_user_roles($user) : null;
}

/**
 * Require authentication. Exits with 401 if not logged in.
 * Returns the current user array on success.
 */
function require_auth(): array {
    $user = current_user();
    if (!$user) {
        json_response(['error' => 'Unauthenticated. Please log in.'], 401);
    }
    return $user;
}

/**
 * Require a specific role (or one of several).
 * Call after require_auth().
 */
function require_role(array $roles): void {
    $user = require_auth();
    if (!user_has_role($user, $roles)) {
        json_response(['error' => 'Forbidden. Insufficient permissions.'], 403);
    }
}

$ADMIN_ROLES = ['admin/owner', 'admin'];
$INV_ROLES   = ['admin/owner', 'admin', 'inventory_manager'];
$ALL_ROLES   = ['admin/owner', 'admin', 'inventory_manager', 'cashier'];
