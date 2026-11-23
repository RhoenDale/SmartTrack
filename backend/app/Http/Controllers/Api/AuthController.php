<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateToken;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $this->validateBody($request);
        $this->requireFields($data, ['email', 'password']);

        $email = strtolower(trim($data['email']));
        $user = DB::selectOne(
            'SELECT id, name, role, email, password, position, initials, status
             FROM users WHERE email = ? LIMIT 1',
            [$email]
        );

        if (!$user) {
            return response()->json(['error' => 'Invalid email or password.'], 401);
        }

        if ($user->status !== 'active') {
            return response()->json(['error' => 'account_inactive'], 403);
        }

        if (!password_verify($data['password'], $user->password)) {
            return response()->json(['error' => 'Invalid email or password.'], 401);
        }

        DB::update('UPDATE users SET last_login = NOW() WHERE id = ?', [$user->id]);

        $userArr = (array) $user;
        unset($userArr['password']);
        $userArr = AuthenticateToken::attachUserRoles($request, $userArr);

        if ($userArr instanceof \Illuminate\Http\JsonResponse) {
            return $userArr;
        }

        // Persist actor for activity-log middleware
        $request->attributes->set('auth_user', $userArr);

        $token = $this->createToken((string)$user->id);

        return response()->json(['user' => $userArr, 'token' => $token]);
    }

    public function logout(Request $request)
    {
        // Persist actor for activity log
        $user = $request->attributes->get('auth_user');
        if (!$user) {
            // Try resolving via token even when middleware didn't run (open route)
            $token = $this->bearerToken($request);
            if ($token) {
                $row = DB::selectOne(
                    'SELECT u.id, u.name, u.role, u.email, u.position, u.initials, u.status
                     FROM auth_tokens t JOIN users u ON u.id = t.user_id
                     WHERE t.token = ? LIMIT 1',
                    [$token]
                );
                if ($row) {
                    $u = AuthenticateToken::attachUserRoles($request, (array)$row);
                    if (!($u instanceof \Illuminate\Http\JsonResponse)) {
                        $request->attributes->set('auth_user', $u);
                    }
                }
            }
        }

        $bearer = $this->bearerToken($request);
        if ($bearer !== null) {
            DB::delete('DELETE FROM auth_tokens WHERE token = ?', [$bearer]);
        }

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request)
    {
        $user = $request->attributes->get('auth_user');
        if (!$user) {
            return response()->json(['error' => 'Not authenticated.'], 401);
        }
        return response()->json(['user' => $user]);
    }

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    private function createToken(string $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $expiry = date('Y-m-d H:i:s', time() + (int) config('session.lifetime', 1440) * 60);

        // Keep at most 5 active sessions
        DB::delete(
            'DELETE FROM auth_tokens WHERE user_id = ? AND id NOT IN (
                 SELECT id FROM (
                     SELECT id FROM auth_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 4
                 ) AS keep
             )',
            [$userId, $userId]
        );

        DB::insert(
            'INSERT INTO auth_tokens (user_id, token, created_at, expires_at)
             VALUES (?, ?, NOW(), ?)',
            [$userId, $token, $expiry]
        );

        return $token;
    }

    private function bearerToken(Request $request): ?string
    {
        $header = $request->header('Authorization', '');
        if (preg_match('/^Bearer\s+(.+)$/i', trim($header), $m)) {
            return $m[1];
        }
        $qt = trim((string)$request->query('token', ''));
        return $qt !== '' ? $qt : null;
    }

    private function validateBody(Request $request): array
    {
        $raw = $request->getContent();
        $parsed = json_decode($raw, true);
        return is_array($parsed) ? $parsed : [];
    }

    private function requireFields(array $data, array $fields)
    {
        foreach ($fields as $f) {
            if (!isset($data[$f]) || $data[$f] === '') {
                abort(response()->json(['error' => "Field '$f' is required."], 422, [], JSON_UNESCAPED_UNICODE));
            }
        }
    }
}
