<?php
/**
 * SmartTrack — Pure PHP Database Backup & Disaster Recovery Utility
 * Generates and restores full SQL dumps without requiring external mysqldump CLI binaries.
 */

function generate_database_dump(PDO $pdo): string {
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $dbName = defined('DB_NAME') ? DB_NAME : 'smarttrack';

    $dump  = "-- --------------------------------------------------------\n";
    $dump .= "-- SmartTrack Automated Database Backup\n";
    $dump .= "-- Database: " . $dbName . "\n";
    $dump .= "-- Generated: " . date('Y-m-d H:i:s') . "\n";
    $dump .= "-- Version: 1.0.0 (SmartTrack Capstone Release)\n";
    $dump .= "-- --------------------------------------------------------\n\n";
    $dump .= "SET FOREIGN_KEY_CHECKS=0;\n";
    $dump .= "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n";
    $dump .= "START TRANSACTION;\n";
    $dump .= "SET time_zone = '+08:00';\n\n";

    foreach ($tables as $table) {
        // Table schema
        $createRow = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM);
        if (!$createRow || empty($createRow[1])) {
            continue;
        }

        $dump .= "-- --------------------------------------------------------\n";
        $dump .= "-- Structure for table `$table`\n";
        $dump .= "-- --------------------------------------------------------\n";
        $dump .= "DROP TABLE IF EXISTS `$table`;\n";
        $dump .= $createRow[1] . ";\n\n";

        // Table data
        $rows = $pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($rows)) {
            $dump .= "-- Dumping data for table `$table`\n";
            $cols = array_map(function($c) { return "`$c`"; }, array_keys($rows[0]));
            
            // Chunk inserts into batches of 100 rows to prevent huge single queries
            $chunks = array_chunk($rows, 100);
            foreach ($chunks as $chunk) {
                $dump .= "INSERT INTO `$table` (" . implode(', ', $cols) . ") VALUES\n";
                $valRows = [];
                foreach ($chunk as $r) {
                    $vals = array_map(function($v) use ($pdo) {
                        if ($v === null) return "NULL";
                        return $pdo->quote($v);
                    }, array_values($r));
                    $valRows[] = "(" . implode(', ', $vals) . ")";
                }
                $dump .= implode(",\n", $valRows) . ";\n";
            }
            $dump .= "\n";
        }
    }

    $dump .= "COMMIT;\n";
    $dump .= "SET FOREIGN_KEY_CHECKS=1;\n";
    $dump .= "-- End of SmartTrack Database Dump\n";

    return $dump;
}

function save_database_backup(PDO $pdo, string $prefix = 'auto_backup'): string {
    $dir = __DIR__ . '/backups';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $filename = sprintf('%s_%s_%s.sql', $prefix, date('Ymd_His'), substr(md5(uniqid('', true)), 0, 6));
    $filepath = $dir . '/' . $filename;

    $sql = generate_database_dump($pdo);
    file_put_contents($filepath, $sql);

    // Keep only the latest 15 backups to save local storage space
    $existing = glob($dir . '/*.sql');
    if ($existing && count($existing) > 15) {
        usort($existing, function($a, $b) { return filemtime($b) - filemtime($a); });
        $toDelete = array_slice($existing, 15);
        foreach ($toDelete as $oldFile) {
            @unlink($oldFile);
        }
    }

    return $filepath;
}

function restore_database_dump(PDO $pdo, string $sqlContent): bool {
    // Safety check: before restoring, create a recovery snapshot
    save_database_backup($pdo, 'pre_restore_safety_snapshot');

    $pdo->beginTransaction();
    try {
        $pdo->exec("SET FOREIGN_KEY_CHECKS=0");

        // Split queries by semicolon followed by newline
        $queries = preg_split('/;\s*[\r\n]+/', $sqlContent);
        foreach ($queries as $query) {
            $trimmed = trim($query);
            if (!empty($trimmed) && strpos($trimmed, '--') !== 0) {
                $pdo->exec($trimmed);
            }
        }

        $pdo->exec("SET FOREIGN_KEY_CHECKS=1");
        $pdo->commit();
        return true;
    } catch (Throwable $e) {
        $pdo->rollBack();
        $pdo->exec("SET FOREIGN_KEY_CHECKS=1");
        throw $e;
    }
}

function get_database_status(PDO $pdo): array {
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $dir = __DIR__ . '/backups';
    $backups = is_dir($dir) ? glob($dir . '/*.sql') : [];
    
    $lastBackup = null;
    if ($backups && count($backups) > 0) {
        usort($backups, function($a, $b) { return filemtime($b) - filemtime($a); });
        $lastBackup = [
            'file' => basename($backups[0]),
            'date' => date('Y-m-d H:i:s', filemtime($backups[0])),
            'size' => round(filesize($backups[0]) / 1024, 1) . ' KB',
        ];
    }

    $productCount = 0;
    $txCount = 0;
    try {
        $productCount = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL")->fetchColumn();
    } catch (Throwable $e) {}
    try {
        $txCount = (int)$pdo->query("SELECT COUNT(*) FROM transactions")->fetchColumn();
    } catch (Throwable $e) {}

    return [
        'database' => defined('DB_NAME') ? DB_NAME : 'smarttrack',
        'tableCount' => count($tables),
        'productCount' => $productCount,
        'transactionCount' => $txCount,
        'backupCount' => count($backups),
        'lastBackup' => $lastBackup,
        'offlineMode' => true,
        'systemVersion' => '1.0.0',
    ];
}

