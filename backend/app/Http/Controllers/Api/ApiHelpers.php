<?php

namespace App\Http\Controllers\Api;

use App\Http\Middleware\AuthenticateToken;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Shared helpers for the API controllers: body parsing, field validation,
 * role enforcement, and quick JSON responses.
 */
trait ApiHelpers
{
    protected function body(Request $request): array
    {
        $raw = $request->getContent();
        $parsed = json_decode($raw, true);
        return is_array($parsed) ? $parsed : [];
    }

    protected function requireFields(array $data, array $fields): void
    {
        foreach ($fields as $f) {
            if (!isset($data[$f]) || $data[$f] === '') {
                abort(response()->json(['error' => "Field '$f' is required."], 422));
            }
        }
    }

    /**
     * Get the authenticated user array stored by the AuthenticateToken middleware.
     */
    protected function user(Request $request): ?array
    {
        return $request->attributes->get('auth_user');
    }

    /**
     * Ensure the user has one of the given roles. Aborts with 403 if not.
     */
    protected function requireRole(Request $request, array|string $roles): array
    {
        $user = $this->user($request);
        if (!$user) {
            abort(response()->json(['error' => 'Unauthenticated. Please log in.'], 401));
        }
        if (!AuthenticateToken::userHasRole($user, $roles)) {
            abort(response()->json(['error' => 'Forbidden. Insufficient permissions.'], 403));
        }
        return $user;
    }

    protected function json(mixed $data, int $status = 200)
    {
        // response()->json() signature: ($data, $status, $headers, $options)
        return response()->json($data, $status, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
