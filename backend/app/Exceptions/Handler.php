<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\AuthenticationException;
use Throwable;

class Handler extends ExceptionHandler
{
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            // only log — don't stop handling
        });
    }

    public function render($request, Throwable $e): \Illuminate\Http\Response|\Illuminate\Http\JsonResponse|\Symfony\Component\HttpFoundation\Response
    {
        // Always return JSON for API routes or JSON requests
        if ($request->is('api/*') || $request->expectsJson() || $request->header('Accept') === 'application/json') {
            return $this->renderJson($e);
        }

        return parent::render($request, $e);
    }

    private function renderJson(Throwable $e): \Illuminate\Http\JsonResponse
    {
        if ($e instanceof ValidationException) {
            return response()->json([
                'error' => 'Validation failed.',
                'errors' => $e->errors(),
            ], 422);
        }

        if ($e instanceof AuthenticationException) {
            return response()->json(['error' => 'Unauthenticated. Please log in.'], 401);
        }

        if ($e instanceof \Illuminate\Database\QueryException) {
            $code = (int)($e->errorInfo[1] ?? 0);
            if ($code === 1062) {
                return response()->json(['error' => 'A record with the same unique value already exists.'], 409);
            }
            if ($code === 1451) {
                return response()->json(['error' => 'This record is still referenced and cannot be deleted.'], 409);
            }
            if ($code === 1452) {
                return response()->json(['error' => 'A referenced record does not exist.'], 422);
            }
            if ($code === 1265) {
                return response()->json(['error' => 'A supplied value is not supported by the current database schema. Apply the required database migration.'], 503);
            }
            error_log('SmartTrack database error: ' . $e->getMessage());
            return response()->json(['error' => 'A database error occurred. Check the server log for details.'], 500);
        }

        if ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
            return response()->json(['error' => 'Resource not found.'], 404);
        }

        if ($e instanceof \Symfony\Component\HttpKernel\Exception\NotFoundHttpException) {
            return response()->json(['error' => 'Route not found.'], 404);
        }

        if ($e instanceof \Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException) {
            return response()->json(['error' => 'Method not allowed.'], 405);
        }

        $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
        $message = config('app.debug') ? $e->getMessage() : 'An unexpected server error occurred.';

        error_log('SmartTrack server error: ' . $e->getMessage());
        return response()->json(['error' => $message], $status);
    }
}
