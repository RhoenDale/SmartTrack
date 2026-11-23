<?php
/**
 * SmartTrack — API bridge to the Laravel backend.
 *
 * The React frontend calls /SmartTrack/api/{resource}... (same URLs the legacy
 * plain-PHP API used). This file bootstraps the Laravel application sitting in
 * ../backend and rewrites the request URI so Laravel's router sees /api/...
 * and dispatches it to the matching controller.
 *
 * Keeps the frontend's existing API_BASE (/SmartTrack/api) working unchanged.
 */

define('LARAVEL_START', microtime(true));

require __DIR__ . '/../backend/vendor/autoload.php';
$app = require_once __DIR__ . '/../backend/bootstrap/app.php';

$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

// Rewrite the URI so Laravel routes the request under the /api prefix.
//   /SmartTrack/api/products   -> /api/products
//   /SmartTrack/api/auth/login -> /api/auth/login
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$uri = preg_replace('#^/SmartTrack/api#', '', $uri);
if ($uri === '' || $uri[0] !== '/') {
    $uri = '/' . ltrim($uri, '/');
}
$uri = '/api' . $uri;
$_SERVER['REQUEST_URI'] = $uri;

// SCRIPT_NAME / PHP_SELF must point at a Laravel-style front controller so the
// framework's request matcher treats this as the application entry point.
$_SERVER['SCRIPT_NAME']  = '/SmartTrack/backend/public/index.php';
$_SERVER['PHP_SELF']      = '/SmartTrack/backend/public/index.php';
$_SERVER['SCRIPT_FILENAME'] = __DIR__ . '/../backend/public/index.php';

$request = Illuminate\Http\Request::capture();
$response = $kernel->handle($request);
$response->send();
$kernel->terminate($request, $response);
