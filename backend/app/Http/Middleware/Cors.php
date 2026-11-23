<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class Cors
{
    private array $allowed = [
        'http://localhost:5173',
        'http://localhost',
        'http://localhost:80',
        'http://127.0.0.1',
        'http://127.0.0.1:80',
    ];

    public function handle(Request $request, Closure $next): mixed
    {
        $origin = $request->header('Origin', '');

        // Always allow loopback and empty origin (Electron, curl, etc.)
        if ($origin === '' || in_array($origin, $this->allowed, true)) {
            $corsOrigin = $origin !== '' ? $origin : 'http://localhost';
        } else {
            $corsOrigin = 'http://localhost';
        }

        if ($request->getMethod() === 'OPTIONS') {
            return response('', 200)
                ->header('Access-Control-Allow-Origin', $corsOrigin)
                ->header('Access-Control-Allow-Credentials', 'true')
                ->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Active-Role')
                ->header('Access-Control-Max-Age', '86400');
        }

        $response = $next($request);

        // Use headers->set() so this works for both JsonResponse and StreamedResponse.
        $response->headers->set('Access-Control-Allow-Origin', $corsOrigin);
        $response->headers->set('Access-Control-Allow-Credentials', 'true');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Active-Role');

        return $response;
    }
}
