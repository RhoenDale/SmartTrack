<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuthenticateToken
{
    public function handle(Request $request, Closure $next): mixed
    {
        // 1. Bearer token from Authorization header
        $token = null;
        $authHeader = $request->header('Authorization', '');
        if (preg_match('/^Bearer\s+(.+)$/i', trim($authHeader), $m)) {
            $token = $m[1];
        }

        // 2. Query-param fallback (?token=...) for CSV export links
        if ($token === null && $request->query('token')) {
            $token = trim($request->query('token'));
        }

        if ($token === null) {
            return response()->json(['error' => 'Unauthenticated. Please log in.'], 401);
        }

        try {
            $row = DB::selectOne(
                'SELECT u.id, u.name, u.role, u.email, u.position, u.initials, u.status
                 FROM auth_tokens t
                 JOIN users u ON u.id = t.user_id
                 WHERE t.token = ? AND t.expires_at > NOW()
                 LIMIT 1',
                [$token]
            );
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Database error during authentication.'], 500);
        }

        if (!$row) {
            return response()->json(['error' => 'Unauthenticated. Please log in.'], 401);
        }

        $user = (array) $row;

        // Attach roles
        $user = $this->attachUserRoles($request, $user);
        if ($user instanceof \Illuminate\Http\JsonResponse) {
            return $user;
        }

        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_token', $token);

        return $next($request);
    }

    public static function attachUserRoles(Request $request, array $user): array|\Illuminate\Http\JsonResponse
    {
        $roles = self::getUserRoleIds((string)$user['id'], $user['role'] ?? null);
        if (!$roles && !empty($user['role'])) {
            $roles = [$user['role']];
        }
        $user['roles'] = $roles;

        $activeRole = trim($request->header('X-Active-Role', ''));
        if ($activeRole !== '') {
            if (!in_array($activeRole, $roles, true)) {
                return response()->json([
                    'error' => 'The selected role is not assigned to this account. Please sign in again and choose an assigned role.'
                ], 403);
            }
            $user['active_role'] = $activeRole;
            $user['role'] = $activeRole;
        } else {
            $user['active_role'] = $user['role'] ?? null;
        }

        return $user;
    }

    public static function getUserRoleIds(string $userId, ?string $fallbackRole = null): array
    {
        try {
            $tableExists = DB::selectOne("SHOW TABLES LIKE 'user_roles'");
            if ($tableExists) {
                $rows = DB::select(
                    'SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY (role_id = ?) DESC, role_id ASC',
                    [$userId, $fallbackRole ?? '']
                );
                $roles = array_column(array_map(fn($r) => (array)$r, $rows), 'role_id');
                if ($roles) return $roles;
            }
        } catch (\Throwable $e) {
            // ignore
        }

        return $fallbackRole !== null && $fallbackRole !== '' ? [$fallbackRole] : [];
    }

    public static function userHasRole(array $user, array|string $roles): bool
    {
        $activeRole = $user['active_role'] ?? $user['role'] ?? null;
        $roles = is_array($roles) ? $roles : [$roles];
        return $activeRole !== null && in_array($activeRole, $roles, true);
    }
}
