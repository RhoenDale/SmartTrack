<?php
/**
 * SmartTrack — Automated Database Migration Engine
 * Automatically checks, backs up, and applies schema updates without manual phpMyAdmin intervention.
 */

require_once __DIR__ . '/backup-util.php';

function init_migrations_table(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `schema_migrations` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `migration_name` VARCHAR(255) NOT NULL UNIQUE,
            `batch` INT NOT NULL DEFAULT 1,
            `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
}

function get_applied_migrations(PDO $pdo): array {
    init_migrations_table($pdo);
    return $pdo->query("SELECT migration_name FROM schema_migrations ORDER BY id ASC")
               ->fetchAll(PDO::FETCH_COLUMN);
}

function mark_migration_applied(PDO $pdo, string $name, int $batch = 1): void {
    init_migrations_table($pdo);
    $stmt = $pdo->prepare("INSERT IGNORE INTO schema_migrations (migration_name, batch) VALUES (?, ?)");
    $stmt->execute([$name, $batch]);
}

/**
 * Baseline registration: marks all existing historical migrations as applied
 * so existing production tables are never corrupted or duplicated.
 */
function ensure_baseline_migrations(PDO $pdo): void {
    $applied = get_applied_migrations($pdo);
    if (empty($applied)) {
        // First time initialization on existing database:
        // Register all current sql files up to now as baseline
        $files = glob(__DIR__ . '/migrations/*.sql');
        if ($files) {
            foreach ($files as $file) {
                $base = basename($file);
                mark_migration_applied($pdo, $base, 1);
            }
        }
        mark_migration_applied($pdo, 'v4.11.10_baseline_initial', 1);
    }
}

/**
 * Automatically runs any pending .sql migrations in api/migrations/
 * Runs automatically on app start / API health check.
 */
function run_auto_migrations(PDO $pdo): array {
    init_migrations_table($pdo);
    ensure_baseline_migrations($pdo);

    $applied = get_applied_migrations($pdo);
    $allFiles = glob(__DIR__ . '/migrations/*.sql');
    if (!$allFiles) {
        return ['status' => 'up_to_date', 'applied' => [], 'errors' => []];
    }

    sort($allFiles);
    $pending = [];
    foreach ($allFiles as $file) {
        $name = basename($file);
        if (!in_array($name, $applied, true)) {
            $pending[] = $file;
        }
    }

    if (empty($pending)) {
        return ['status' => 'up_to_date', 'applied' => [], 'errors' => []];
    }

    // Auto-create pre-migration safety backup before applying updates
    $backupFile = save_database_backup($pdo, 'pre_migration_safety');

    $appliedNow = [];
    $errors = [];
    $batch = (int)$pdo->query("SELECT COALESCE(MAX(batch), 0) + 1 FROM schema_migrations")->fetchColumn();

    foreach ($pending as $file) {
        $name = basename($file);
        $sql = file_get_contents($file);
        if (!$sql) continue;

        try {
            // Execute statements
            $queries = preg_split('/;\s*[\r\n]+/', $sql);
            foreach ($queries as $q) {
                $trimmed = trim($q);
                if (!empty($trimmed) && strpos($trimmed, '--') !== 0) {
                    $pdo->exec($trimmed);
                }
            }
            mark_migration_applied($pdo, $name, $batch);
            $appliedNow[] = $name;
        } catch (Throwable $e) {
            $errors[] = [
                'migration' => $name,
                'error' => $e->getMessage()
            ];
            error_log("SmartTrack Auto-Migration failed for $name: " . $e->getMessage());
            break; // Stop at first error
        }
    }

    return [
        'status' => empty($errors) ? 'success' : 'partial_error',
        'backup' => basename($backupFile),
        'applied' => $appliedNow,
        'errors' => $errors,
    ];
}
