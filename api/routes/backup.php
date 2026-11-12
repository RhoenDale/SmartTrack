<?php
/**
 * SmartTrack — Backup & Migration API Routes
 * Handled via /api/backup/{action}
 */

require_once __DIR__ . '/../backup-util.php';
require_once __DIR__ . '/../migrator.php';

require_auth();

// Restrict database backup & migration actions to Admin / Owner roles
$user = current_user();
$roles = $user['roles'] ?? [$user['role'] ?? ''];
if (!in_array('owner', $roles, true) && !in_array('admin', $roles, true)) {
    json_response(['error' => 'Permission denied. Only Pharmacy Owners and Admins can manage database backups.'], 403);
}

$action = $id ?? 'status';

// ── GET /api/backup/status ──
if ($method === 'GET' && $action === 'status') {
    $pdo = db();
    $status = get_database_status($pdo);
    $migrations = get_applied_migrations($pdo);
    $status['migrationCount'] = count($migrations);
    json_response($status);
}

// ── GET /api/backup/export — Download Full SQL Dump ──
if ($method === 'GET' && ($action === 'export' || $action === 'download')) {
    $pdo = db();
    $dump = generate_database_dump($pdo);
    $filename = sprintf('smarttrack_backup_%s_%s.sql', DB_NAME, date('Y-m-d_His'));

    // Also persist a copy to local server storage
    save_database_backup($pdo, 'user_manual_download');

    header('Content-Description: File Transfer');
    header('Content-Type: application/sql; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Transfer-Encoding: binary');
    header('Expires: 0');
    header('Cache-Control: must-revalidate');
    header('Pragma: public');
    header('Content-Length: ' . strlen($dump));

    echo $dump;
    exit;
}

// ── POST /api/backup/create — Create Server-side Backup ──
if ($method === 'POST' && $action === 'create') {
    $pdo = db();
    $filepath = save_database_backup($pdo, 'manual');
    json_response([
        'success' => true,
        'message' => 'Database backup created successfully.',
        'filename' => basename($filepath),
        'size' => round(filesize($filepath) / 1024, 1) . ' KB',
        'createdAt' => date('Y-m-d H:i:s'),
    ]);
}

// ── POST /api/backup/migrate — Run Auto-Migrations ──
if ($method === 'POST' && $action === 'migrate') {
    $pdo = db();
    $res = run_auto_migrations($pdo);
    json_response([
        'success' => true,
        'result' => $res,
        'message' => empty($res['applied']) ? 'Database schema is already up to date.' : 'Applied ' . count($res['applied']) . ' pending migrations.',
    ]);
}

// ── POST /api/backup/restore — Restore from Uploaded SQL File ──
if ($method === 'POST' && $action === 'restore') {
    if (empty($_FILES['backup_file']['tmp_name'])) {
        json_response(['error' => 'No backup file uploaded.'], 400);
    }

    $tmpFile = $_FILES['backup_file']['tmp_name'];
    $originalName = $_FILES['backup_file']['name'] ?? 'backup.sql';
    
    // Check file extension
    if (!preg_match('/\.sql$/i', $originalName)) {
        json_response(['error' => 'Invalid file format. Please upload a valid .sql backup file.'], 422);
    }

    $sqlContent = file_get_contents($tmpFile);
    if (!$sqlContent || strlen(trim($sqlContent)) < 50) {
        json_response(['error' => 'The uploaded backup file is empty or corrupted.'], 422);
    }

    $pdo = db();
    try {
        restore_database_dump($pdo, $sqlContent);
        json_response([
            'success' => true,
            'message' => 'Database restored successfully! All tables and records have been reloaded.',
            'restoredFrom' => $originalName,
            'timestamp' => date('Y-m-d H:i:s'),
        ]);
    } catch (Throwable $e) {
        json_response([
            'error' => 'Database restore failed: ' . $e->getMessage() . '. A pre-restore safety snapshot was preserved on the server.',
        ], 500);
    }
}

json_response(['error' => "Action '$action' not recognized under backup."], 404);
