<?php
/**
 * SmartTrack — Session-based authentication helpers
 */

if (session_status() === PHP_SESSION_NONE) {
    // Determine if we're on HTTPS
    $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') 
                || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    
    // For localhost development (HTTP), use 'Lax' instead of 'None'
    // 'None' requires secure=true which doesn't work on localhost HTTP
    $sameSite = $isSecure ? 'None' : 'Lax';
    
    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'httponly' => true,
        'secure'   => $isSecure,
        'samesite' => $sameSite,
    ]);
    session_start();
}

/** Returns the currently authenticated user array, or null. */
function current_user(): ?array {
    return $_SESSION['smarttrack_user'] ?? null;
}

/**
 * Require authentication. Returns 401 if not logged in.
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
    if (!in_array($user['role'], $roles, true)) {
        json_response(['error' => 'Forbidden. Insufficient permissions.'], 403);
    }
}

$ADMIN_ROLES     = ['admin/owner', 'admin'];
$INV_ROLES       = ['admin/owner', 'admin', 'inventory_manager'];
$ALL_ROLES       = ['admin/owner', 'admin', 'inventory_manager', 'cashier'];
