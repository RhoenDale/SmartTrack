<?php
/**
 * Auth routes
 *   POST /auth/login   — login (returns token + user)
 *   POST /auth/logout  — logout (revokes token or destroys session)
 *   GET  /auth/me      — current session/token user
 */

// $id = login | logout | me  (set by index.php)
switch ($method . ':' . ($id ?? '')) {

    case 'POST:login':
        $data = body();
        require_fields($data, ['email', 'password']);

        $stmt = db()->prepare(
            'SELECT id, name, role, email, password, position, initials, status
             FROM users WHERE email = ? LIMIT 1'
        );
        $stmt->execute([strtolower(trim($data['email']))]);
        $user = $stmt->fetch();

        if (!$user) {
            json_response(['error' => 'Invalid email or password.'], 401);
        }

        if ($user['status'] !== 'active') {
            json_response(['error' => 'account_inactive'], 403);
        }

        if (!password_verify($data['password'], $user['password'])) {
            json_response(['error' => 'Invalid email or password.'], 401);
        }

        db()->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')
            ->execute([$user['id']]);

        unset($user['password']);

        // Store in session (browser fallback)
        $_SESSION['smarttrack_user'] = $user;

        // Generate a persistent token for stateless clients (Electron)
        $token = create_token((string)$user['id']);

        json_response(['user' => $user, 'token' => $token]);
        break;

    case 'POST:logout':
        // Revoke Bearer token if present
        $bearer = get_bearer_token();
        if ($bearer !== null) {
            revoke_token($bearer);
        }
        // Also destroy the session
        $_SESSION = [];
        session_destroy();
        json_response(['message' => 'Logged out.']);
        break;

    case 'GET:me':
        $user = current_user();
        if (!$user) json_response(['error' => 'Not authenticated.'], 401);
        json_response(['user' => $user]);
        break;

    default:
        json_response(['error' => 'Auth route not found.'], 404);
}
