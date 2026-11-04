<?php
/**
 * Activity audit routes
 *
 *   GET /activity — paginated activity history [authenticated user]
 */

$authUser = require_auth();
$isAdmin = in_array($authUser['role'], ['admin/owner', 'admin'], true);
$pdo = db();

if ($method !== 'GET') {
    json_response(['error' => 'Method not allowed.'], 405);
}

if (!$pdo->query("SHOW TABLES LIKE 'activity_logs'")->fetchColumn()) {
    json_response([
        'error' => 'Activity log migration is required. Apply api/migrations/create_activity_logs.sql.',
    ], 503);
}

$limit = filter_var($_GET['limit'] ?? 50, FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1, 'max_range' => 100],
]);
if ($limit === false) {
    json_response(['error' => 'Limit must be between 1 and 100.'], 422);
}

$before = null;
if (isset($_GET['before']) && $_GET['before'] !== '') {
    $before = filter_var($_GET['before'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($before === false) json_response(['error' => 'Invalid activity cursor.'], 422);
}

$actorFilter = trim((string)($_GET['actor_id'] ?? ''));
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

$stmt = $pdo->prepare(
    "SELECT id, actor_user_id, actor_name, method, request_path, response_status, created_at
     FROM activity_logs $whereSql
     ORDER BY id DESC
     LIMIT " . ($limit + 1)
);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
$hasMore = count($rows) > $limit;
if ($hasMore) array_pop($rows);

$actors = $isAdmin
    ? $pdo->query(
        'SELECT actor_user_id, MAX(actor_name) AS actor_name
         FROM activity_logs
         GROUP BY actor_user_id
         ORDER BY actor_name'
    )->fetchAll(PDO::FETCH_ASSOC)
    : [['actor_user_id' => $authUser['id'], 'actor_name' => $authUser['name']]];

json_response([
    'entries' => array_map(static function (array $row): array {
        return [
            'id' => (string)$row['id'],
            'actorId' => $row['actor_user_id'] !== null ? (string)$row['actor_user_id'] : null,
            'actor' => $row['actor_name'],
            'method' => $row['method'],
            'path' => $row['request_path'],
            'status' => (int)$row['response_status'],
            'ts' => date(DATE_ATOM, strtotime($row['created_at'])),
        ];
    }, $rows),
    'actors' => array_map(static function (array $row): array {
        return [
            'id' => $row['actor_user_id'] !== null ? (string)$row['actor_user_id'] : null,
            'name' => $row['actor_name'],
        ];
    }, $actors),
    'hasMore' => $hasMore,
    'nextCursor' => $rows ? (string)end($rows)['id'] : null,
]);
