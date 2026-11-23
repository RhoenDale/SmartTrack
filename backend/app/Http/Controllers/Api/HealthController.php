<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HealthController extends Controller
{
    public function index(Request $request)
    {
        $migrationStatus = ['applied' => [], 'pending' => [], 'ready' => true];

        try {
            DB::getPdo()->query('SELECT 1');
        } catch (\Throwable $e) {
            return response()->json([
                'status' => 'degraded',
                'database' => ['status' => 'error', 'message' => $e->getMessage()],
                'offline' => true,
            ], 503);
        }

        return response()->json([
            'status' => 'ok',
            'database' => ['status' => 'connected'],
            'migrations' => $migrationStatus,
            'offline' => true,
        ]);
    }
}
