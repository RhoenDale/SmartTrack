<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateToken;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityController extends Controller
{
    use ApiHelpers;

    /* ── GET /activity ───────────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $authUser = $this->requireRole($request, InventoryService::ALL_ROLES);
        $isAdmin = AuthenticateToken::userHasRole($authUser, ['admin/owner', 'admin']);

        if (!DB::selectOne("SHOW TABLES LIKE 'activity_logs'")) {
            return $this->json([
                'error' => 'Activity log migration is required. Apply api/migrations/create_activity_logs.sql.',
            ], 503);
        }

        $limit = filter_var($request->query('limit', 50), FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 100],
        ]);
        if ($limit === false) {
            return $this->json(['error' => 'Limit must be between 1 and 100.'], 422);
        }

        $before = null;
        $beforeRaw = $request->query('before', '');
        if ($beforeRaw !== '') {
            $before = filter_var($beforeRaw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($before === false) return $this->json(['error' => 'Invalid activity cursor.'], 422);
        }

        $actorFilter = trim((string)$request->query('actor_id', ''));
        $where = [];
        $params = [];
        if ($before !== null) {
            $where[] = 'id < ?';
            $params[] = $before;
        }
        if (!$isAdmin) {
            $where[] = 'actor_user_id = ?';
            $params[] = $authUser['id'];
        } elseif ($actorFilter === 'anonymous') {
            $where[] = 'actor_user_id IS NULL';
        } elseif ($actorFilter !== '') {
            $where[] = 'actor_user_id = ?';
            $params[] = $actorFilter;
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $rows = DB::select(
            "SELECT id, actor_user_id, actor_name, method, request_path, response_status, created_at
             FROM activity_logs $whereSql
             ORDER BY id DESC
             LIMIT " . ($limit + 1),
            $params
        );
        $hasMore = count($rows) > $limit;
        if ($hasMore) array_pop($rows);

        if ($isAdmin) {
            $actorRows = DB::select(
                'SELECT actor_user_id, MAX(actor_name) AS actor_name
                 FROM activity_logs
                 GROUP BY actor_user_id
                 ORDER BY actor_name'
            );
        } else {
            $actorRows = [(object)['actor_user_id' => $authUser['id'], 'actor_name' => $authUser['name']]];
        }

        return $this->json([
            'entries' => array_map(function ($row) {
                return [
                    'id' => (string)$row->id,
                    'actorId' => $row->actor_user_id !== null ? (string)$row->actor_user_id : null,
                    'actor' => $row->actor_name,
                    'method' => $row->method,
                    'path' => $row->request_path,
                    'status' => (int)$row->response_status,
                    'ts' => date(DATE_ATOM, strtotime($row->created_at)),
                ];
            }, $rows),
            'actors' => array_map(function ($row) {
                return [
                    'id' => $row->actor_user_id !== null ? (string)$row->actor_user_id : null,
                    'name' => $row->actor_name,
                ];
            }, $actorRows),
            'hasMore' => $hasMore,
            'nextCursor' => $rows ? (string)end($rows)->id : null,
        ]);
    }
}
