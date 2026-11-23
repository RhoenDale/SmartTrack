<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LogActivity
{
    private static bool $recording = false;
    private static ?bool $tableAvailable = null;

    public function handle(Request $request, Closure $next): mixed
    {
        $response = $next($request);

        $path = $request->getPathInfo();

        // Skip health and activity endpoints
        if (str_contains($path, '/health') || str_contains($path, '/activity')) {
            return $response;
        }

        if (self::$recording) {
            return $response;
        }
        self::$recording = true;

        try {
            if (self::$tableAvailable === null) {
                try {
                    self::$tableAvailable = (bool) DB::selectOne("SHOW TABLES LIKE 'activity_logs'");
                } catch (\Throwable $e) {
                    self::$tableAvailable = false;
                }
            }

            if (!self::$tableAvailable) {
                return $response;
            }

            $user = $request->attributes->get('auth_user');
            $isLogin = str_ends_with($path, '/auth/login');

            if (!$user && !$isLogin) {
                return $response;
            }

            $status = $response->getStatusCode();
            $actorId = $user ? (string)($user['id'] ?? null) : null;
            $actorName = $user ? (mb_substr((string)($user['name'] ?? 'Unknown'), 0, 120)) : 'Unauthenticated';
            $method = $request->getMethod();
            $reqPath = mb_substr($path, 0, 500);

            DB::statement(
                'INSERT INTO activity_logs (actor_user_id, actor_name, method, request_path, response_status) VALUES (?, ?, ?, ?, ?)',
                [$actorId, $actorName, $method, $reqPath, $status]
            );
        } catch (\Throwable $e) {
            // Never break the response over logging
            error_log('SmartTrack activity log write failed: ' . $e->getMessage());
        } finally {
            self::$recording = false;
        }

        return $response;
    }
}
