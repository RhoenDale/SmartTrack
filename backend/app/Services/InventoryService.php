<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use Exception;
use DomainException;
use InvalidArgumentException;

/**
 * SmartTrack — Inventory & business logic service.
 *
 * Ports the shared helper functions originally living in api/helpers.php so
 * every controller works against the exact same rules as the legacy PHP API.
 */
class InventoryService
{
    public const ADMIN_ROLES = ['admin/owner', 'admin'];
    public const INV_ROLES   = ['admin/owner', 'admin', 'inventory_manager'];
    public const ALL_ROLES   = ['admin/owner', 'admin', 'inventory_manager', 'cashier'];

    /* ── Date & batch normalization ───────────────────────────────────────── */

    public static function normalizeOptionalDate(mixed $value, string $field = 'Expiry date'): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value)) {
            throw new InvalidArgumentException("$field must be a valid date or left blank.");
        }

        $value = trim($value);
        if ($value === '') {
            return null;
        }

        foreach (['!Y-m-d', '!m/d/Y'] as $inputFormat) {
            $date = \DateTimeImmutable::createFromFormat($inputFormat, $value);
            $errors = \DateTimeImmutable::getLastErrors();
            if ($date && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))) {
                return $date->format('Y-m-d');
            }
        }

        throw new InvalidArgumentException("$field must be a valid date or left blank.");
    }

    public static function normalizeProductBatch(mixed $batch): array
    {
        if (!is_array($batch)) {
            throw new InvalidArgumentException('Each batch must be an object.');
        }

        $batchId = trim((string)($batch['batchId'] ?? ''));
        $qty = filter_var($batch['qty'] ?? null, FILTER_VALIDATE_INT);
        if ($batchId === '' || mb_strlen($batchId) > 30 || $qty === false || $qty <= 0) {
            throw new InvalidArgumentException('Each batch needs an ID of 1 to 30 characters and a positive whole-number quantity.');
        }

        $costValue = $batch['batchTotalCost'] ?? null;
        $totalCost = ($costValue === '' || $costValue === null)
            ? null
            : filter_var($costValue, FILTER_VALIDATE_FLOAT);
        if ($totalCost === false || ($totalCost !== null && $totalCost < 0)) {
            throw new InvalidArgumentException('Batch cost must be zero or greater.');
        }

        $receivedDate = self::normalizeOptionalDate($batch['receivedDate'] ?? date('Y-m-d'), 'Received date');
        return [
            'batchId' => $batchId,
            'qty' => $qty,
            'expiryDate' => self::normalizeOptionalDate($batch['expiryDate'] ?? $batch['expiry'] ?? null),
            'receivedDate' => $receivedDate ?? date('Y-m-d'),
            'batchTotalCost' => $totalCost,
            'unitCost' => $totalCost !== null ? round($totalCost / $qty, 4) : null,
        ];
    }

    /* ── Naming helpers (mirror shared.tsx) ──────────────────────────────── */

    public static function computeStatus(int $stock, int $reorder): string
    {
        if ($stock <= 0) return 'out_of_stock';
        if ($reorder <= 0) return 'good';
        if ($stock < $reorder * 0.4) return 'critical';
        if ($stock < $reorder) return 'low';
        if ($stock < $reorder * 1.5) return 'moderate';
        return 'good';
    }

    public static function makeInitials(string $name): string
    {
        $words = array_filter(explode(' ', $name));
        $words = array_slice(array_values($words), 0, 2);
        return implode('', array_map(fn($w) => strtoupper($w[0] ?? ''), $words));
    }

    public static function staffAbbrev(string $name): string
    {
        $parts = explode(' ', trim($name));
        if (count($parts) === 0) return $name;
        $parts[0] = strtoupper($parts[0][0] ?? '') . '.';
        return implode(' ', $parts);
    }

    public static function genTxId(string $prefix = 'TXN'): string
    {
        return $prefix . '-' . strtoupper(substr(uniqid(), -6));
    }

    /* ── Product category helpers ─────────────────────────────────────────── */

    public static function productCategoryNames(array $data): array
    {
        $input = $data['categories'] ?? ($data['category'] ?? []);
        if (is_string($input)) {
            $input = preg_split('/\s*\/\s*/u', $input);
        }
        if (!is_array($input)) {
            throw new InvalidArgumentException('Categories must be a list of category names.');
        }

        $names = [];
        $seen = [];
        foreach ($input as $value) {
            if (!is_string($value)) {
                throw new InvalidArgumentException('Each category must be a text value.');
            }
            foreach (preg_split('/\s*\/\s*/u', $value) as $name) {
                $name = trim($name);
                if ($name === '') continue;
                if (mb_strlen($name) > 80) {
                    throw new InvalidArgumentException('Category names must be 80 characters or fewer.');
                }
                $key = mb_strtolower($name);
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                $names[] = $name;
            }
        }
        if (!$names) {
            throw new InvalidArgumentException('Select or add at least one category.');
        }
        return $names;
    }

    public static function syncProductCategories(string|int $productId, array $names): void
    {
        $pdo = DB::getPdo();
        $pdo->prepare('DELETE FROM product_category_map WHERE product_id = ?')->execute([$productId]);
        foreach ($names as $name) {
            DB::insert('INSERT IGNORE INTO categories (name) VALUES (?)', [$name]);
            $categoryId = DB::selectOne('SELECT id FROM categories WHERE name = ?', [$name]);
            if (!$categoryId) {
                throw new RuntimeException("Unable to find saved category '{$name}'.");
            }
            DB::insert('INSERT INTO product_category_map (product_id, category_id) VALUES (?, ?)', [$productId, $categoryId->id]);
        }
    }

    /* ── Recycle bin helpers ──────────────────────────────────────────────── */

    public static function productNotDeletedSql(string $alias = 'p'): string
    {
        static $hasDeletedAt = null;
        if ($hasDeletedAt === null) {
            $hasDeletedAt = (bool) DB::selectOne("SHOW COLUMNS FROM products LIKE 'deleted_at'");
        }
        return $hasDeletedAt ? "{$alias}.deleted_at IS NULL" : '1=1';
    }

    public static function productPurgeHistoryReady(): bool
    {
        $pdo = DB::getPdo();
        $itemTable = $pdo->query("SHOW TABLES LIKE 'purchase_order_items'")->fetchColumn();
        $receiptTable = $pdo->query("SHOW TABLES LIKE 'purchase_order_receipts'")->fetchColumn();
        if (!$itemTable && !$receiptTable) return true;
        if (!$itemTable || !$receiptTable) return false;

        $snapshot = $pdo->query("SHOW COLUMNS FROM purchase_order_items LIKE 'product_name_snapshot'")->fetch(\PDO::FETCH_ASSOC);
        $itemProduct = $pdo->query("SHOW COLUMNS FROM purchase_order_items LIKE 'product_id'")->fetch(\PDO::FETCH_ASSOC);
        $receiptProduct = $pdo->query("SHOW COLUMNS FROM purchase_order_receipts LIKE 'product_id'")->fetch(\PDO::FETCH_ASSOC);
        if (!$snapshot || ($itemProduct['Null'] ?? '') !== 'YES' || ($receiptProduct['Null'] ?? '') !== 'YES') {
            return false;
        }

        $rows = DB::select(
            "SELECT COUNT(*) AS cnt
             FROM information_schema.REFERENTIAL_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND CONSTRAINT_NAME IN ('fk_purchase_order_items_product_purge', 'fk_purchase_receipts_product_purge')
               AND DELETE_RULE = 'SET NULL'"
        );
        return (int)($rows[0]->cnt ?? 0) === 2;
    }

    public static function purgeExpiredRecycleBin(): void
    {
        $pdo = DB::getPdo();
        $lock = $pdo->query("SELECT GET_LOCK('smarttrack_recycle_bin_auto_purge', 0)")->fetchColumn();
        if ((int)$lock !== 1) return;

        try {
            $userDeletedAt = $pdo->query("SHOW COLUMNS FROM users LIKE 'deleted_at'")->fetchColumn();
            if ($userDeletedAt) {
                $pdo->exec(
                    'DELETE FROM users
                     WHERE deleted_at IS NOT NULL
                       AND deleted_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)'
                );
            }

            $productDeletedAt = $pdo->query("SHOW COLUMNS FROM products LIKE 'deleted_at'")->fetchColumn();
            if ($productDeletedAt && self::productPurgeHistoryReady()) {
                $pdo->exec(
                    'DELETE n
                     FROM notifications n
                     INNER JOIN products p ON p.id = n.product_id
                     WHERE p.deleted_at IS NOT NULL
                       AND p.deleted_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)'
                );
                $pdo->exec(
                    'DELETE FROM products
                     WHERE deleted_at IS NOT NULL
                       AND deleted_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)'
                );
            }
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('smarttrack_recycle_bin_auto_purge')");
        }
    }

    /* ── FIFO stock operations ────────────────────────────────────────────── */

    /**
     * Run FIFO deduction on a product's batches.
     * Batches are ordered by received_date ASC (FIFO).
     * Returns ['consumed' => [...], 'updated_batches' => [...]]
     * Throws Exception if insufficient stock.
     *
     * MUST be called within an open transaction.
     */
    public static function fifoDeduct(string $productId, int $qty): array
    {
        $pdo = DB::getPdo();

        $stmt = $pdo->prepare(
            'SELECT id, batch_id, qty, expiry_date, received_date, unit_cost
             FROM product_batches
             WHERE product_id = ? AND qty > 0
             ORDER BY received_date ASC, id ASC
             FOR UPDATE'
        );
        $stmt->execute([$productId]);
        $batches = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $totalAvailable = array_sum(array_column($batches, 'qty'));
        if ($qty > $totalAvailable) {
            throw new Exception("Insufficient stock. Requested: $qty, Available: $totalAvailable");
        }

        $remaining = $qty;
        $consumed = [];
        $updates = [];

        foreach ($batches as $b) {
            if ($remaining <= 0) break;
            $deduct = min((int)$b['qty'], $remaining);
            $remaining -= $deduct;
            $newQty = (int)$b['qty'] - $deduct;
            $consumed[] = [
                'batchId' => $b['batch_id'],
                'expiry' => $b['expiry_date'],
                'qty' => $deduct,
                'unitCost' => $b['unit_cost'] !== null ? (float)$b['unit_cost'] : null,
            ];
            $updates[] = ['id' => $b['id'], 'qty' => $newQty];
        }

        $upd = $pdo->prepare('UPDATE product_batches SET qty = ? WHERE id = ?');
        foreach ($updates as $u) {
            $upd->execute([$u['qty'], $u['id']]);
        }

        $pdo->prepare('DELETE FROM product_batches WHERE product_id = ? AND qty = 0')
            ->execute([$productId]);

        return $consumed;
    }

    /**
     * Restock a batch (for returns).
     * If batch exists, adds qty back; otherwise re-inserts it.
     */
    public static function fifoRestock(string $productId, int $qty, string $batchId, ?string $expiryDate): void
    {
        $exists = DB::selectOne('SELECT id FROM product_batches WHERE batch_id = ?', [$batchId]);
        if ($exists) {
            DB::affectingStatement('UPDATE product_batches SET qty = qty + ? WHERE batch_id = ?', [$qty, $batchId]);
        } else {
            DB::insert(
                'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date)
                 VALUES (?, ?, ?, ?, CURDATE())',
                [$batchId, $productId, $qty, $expiryDate]
            );
        }
    }

    /**
     * Recompute and update a product's status field
     * from its current batch totals.
     */
    public static function syncProductStatus(string $productId): void
    {
        $rows = DB::select(
            'SELECT p.name, p.reorder, p.units_per_pack, COALESCE(SUM(b.qty),0) AS stock
             FROM products p
             LEFT JOIN product_batches b ON b.product_id = p.id
             WHERE p.id = ?
             GROUP BY p.name, p.reorder, p.units_per_pack',
            [$productId]
        );
        $row = $rows[0] ?? null;
        if (!$row) return;

        $stock = (int)$row->stock;
        $reorderUnits = (int)$row->reorder * max(1, (int)$row->units_per_pack);
        $status = self::computeStatus($stock, $reorderUnits);
        DB::update('UPDATE products SET status = ? WHERE id = ?', [$status, $productId]);

        $title = "Out of Stock: {$row->name}";
        if ($stock <= 0) {
            $check = DB::selectOne('SELECT id FROM notifications WHERE product_id = ? AND title = ? LIMIT 1', [$productId, $title]);
            if (!$check) {
                DB::insert(
                    'INSERT INTO notifications (type, title, body, product_id, is_read)
                     VALUES (?, ?, ?, ?, 0)',
                    ['alert', $title, "{$row->name} has reached 0 units. Reorder now.", $productId]
                );
            }
        } else {
            DB::delete('DELETE FROM notifications WHERE product_id = ? AND title = ?', [$productId, $title]);
        }
    }

    /**
     * Attach computed fields to a product row:
     *   stock, expiry, batches, categories, category, price, sale_price, unit_label,
     *   units_per_pack, pack_price, reorder.
     */
    public static function enrichProduct(array $product): array
    {
        $batches = DB::select(
            'SELECT batch_id, qty, expiry_date, received_date, batch_total_cost, unit_cost
             FROM product_batches
             WHERE product_id = ? AND qty > 0
             ORDER BY received_date ASC, id ASC',
            [$product['id']]
        );

        $stock = 0;
        $earliestExpiry = null;
        $batchArr = [];

        foreach ($batches as $b) {
            $b = (array)$b;
            $stock += (int)$b['qty'];
            if ($b['expiry_date'] !== null && ($earliestExpiry === null || $b['expiry_date'] < $earliestExpiry)) {
                $earliestExpiry = $b['expiry_date'];
            }
            $batchArr[] = [
                'batchId' => $b['batch_id'],
                'qty' => (int)$b['qty'],
                'expiry' => $b['expiry_date'] ? date('m/d/Y', strtotime($b['expiry_date'])) : null,
                'expiryDate' => $b['expiry_date'],
                'receivedDate' => date('m/d/Y', strtotime($b['received_date'])),
                'batchTotalCost' => $b['batch_total_cost'] !== null ? (float)$b['batch_total_cost'] : null,
                'unitCost' => $b['unit_cost'] !== null ? (float)$b['unit_cost'] : null,
            ];
        }

        $product['stock'] = $stock;
        $product['expiry'] = $earliestExpiry ? date('m/d/Y', strtotime($earliestExpiry)) : '—';
        $product['batches'] = $batchArr;

        $categoryRows = DB::select(
            'SELECT c.name
             FROM product_category_map pcm
             JOIN categories c ON c.id = pcm.category_id
             WHERE pcm.product_id = ?
             ORDER BY c.name ASC',
            [$product['id']]
        );
        $categories = array_map(fn($r) => $r->name, $categoryRows);
        $product['categories'] = $categories;
        $product['category'] = implode(', ', $categories);
        $product['price'] = (float)$product['price'];
        $product['sale_price'] = $product['sale_price'] !== null ? (float)$product['sale_price'] : null;
        $product['unit_label'] = $product['unit_label'] ?? 'unit';
        $product['units_per_pack'] = max(1, (int)($product['units_per_pack'] ?? 1));
        $product['pack_price'] = $product['pack_price'] !== null ? (float)$product['pack_price'] : null;
        $product['reorder'] = (int)$product['reorder'];

        return $product;
    }

    /* ── Transaction formatting ───────────────────────────────────────────── */

    public static function formatTransaction(array $tx): array
    {
        $staffName = $tx['current_staff_name'] ?? $tx['staff'] ?? null;

        // Abbreviate the staff name if it's a full name
        if ($staffName !== null && strpos($staffName, ' ') !== false && !strpos($staffName, '.')) {
            $staffName = self::staffAbbrev($staffName);
        }

        $customerVatExempt = false;
        $customerExemptionType = null;
        $customerIdNumber = null;
        if (($tx['type'] ?? '') === 'sale') {
            if (!empty($tx['customer_vat_exempt'])) {
                $customerVatExempt = true;
                $customerExemptionType = $tx['customer_exemption_type'] ?? null;
                $customerIdNumber = $tx['customer_id_number'] ?? null;
            } elseif (!empty($tx['note'])) {
                if (preg_match('/^Customer (?:VAT exemption|discount): (.+) ID (.+)$/', $tx['note'], $matches)) {
                    $customerVatExempt = true;
                    $customerExemptionType = $matches[1];
                    $customerIdNumber = $matches[2];
                }
            }
        }

        return [
            'id' => $tx['id'],
            'type' => $tx['type'],
            'saleGroupId' => $tx['sale_group_id'] ?? null,
            'product' => $tx['product_name'],
            'productId' => $tx['product_id'],
            'qty' => (int)$tx['qty'],
            'saleQty' => isset($tx['sale_qty']) && $tx['sale_qty'] !== null ? (int)$tx['sale_qty'] : (int)$tx['qty'],
            'saleUnit' => $tx['sale_unit'] ?? 'unit',
            'unitsPerSale' => isset($tx['units_per_sale']) ? (int)$tx['units_per_sale'] : 1,
            'amount' => (float)$tx['amount'],
            'discountAmount' => (float)($tx['discount_amount'] ?? 0),
            'preTaxAmount' => isset($tx['pre_tax_amount']) ? (float)$tx['pre_tax_amount'] : null,
            'taxAmount' => isset($tx['tax_amount']) ? (float)$tx['tax_amount'] : null,
            'taxRate' => isset($tx['tax_rate']) ? (float)$tx['tax_rate'] : null,
            'customerVatExempt' => $customerVatExempt,
            'customerExemptionType' => $customerExemptionType,
            'customerIdNumber' => $customerIdNumber,
            'staff' => $staffName,
            'staffId' => $tx['staff_id'] ?? null,
            'status' => $tx['status'],
            'date' => date('m/d/Y H:i', strtotime($tx['transacted_at'])),
            'note' => $tx['note'] ?? null,
            'returnedTxId' => $tx['returned_tx_id'] ?? null,
            'adjustmentReason' => $tx['adjustment_reason'] ?? null,
            'damagedQty' => isset($tx['damaged_qty']) ? (int)$tx['damaged_qty'] : null,
        ];
    }

    public static function formatReturnRecord(array $row): array
    {
        return [
            'returnTxId' => $row['id'],
            'saleTxId' => $row['sale_tx_id'] ?? $row['id'],
            'productId' => (string)$row['product_id'],
            'product' => $row['product_name'],
            'qty' => (int)$row['qty'],
            'refund' => (float)$row['refund_amount'],
            'reason' => $row['reason'],
            'cashier' => $row['recorded_by_name'] ?? '',
            'createdAt' => date('m/d/Y H:i', strtotime($row['created_at'])),
            'disposition' => $row['disposition'],
            'processedAt' => $row['processed_at']
                ? date('m/d/Y H:i', strtotime($row['processed_at']))
                : null,
            'saleUnit' => $row['sale_unit'] ?? 'unit',
            'unitsPerSale' => (int)($row['units_per_sale'] ?? 1),
            'returnType' => $row['record_type'] === 'broken' ? 'adjustment' : 'return',
        ];
    }

    public static function formatUser(array $u): array
    {
        $roles = \App\Http\Middleware\AuthenticateToken::getUserRoleIds((string)$u['id'], $u['role'] ?? null);
        return [
            'id' => $u['id'],
            'name' => $u['name'],
            'role' => $u['role'],
            'roles' => $roles,
            'email' => $u['email'],
            'position' => $u['position'] ?? '',
            'initials' => $u['initials'],
            'status' => $u['status'],
            'lastLogin' => isset($u['last_login']) && $u['last_login']
                ? date('m/d/Y H:i', strtotime($u['last_login']))
                : 'Never',
        ];
    }

    /* ── Sale expiry gate ────────────────────────────────────────────────── */

    public static function assertSaleBatchesSafe(string $productName, array $consumed): void
    {
        $todayMidnight = strtotime(date('Y-m-d'));
        foreach ($consumed as $batch) {
            $expiryRaw = $batch['expiry'] ?? null;
            if ($expiryRaw === null || $expiryRaw === '') continue;

            $expiryTs = strtotime(date('Y-m-d', strtotime((string)$expiryRaw)));
            if ($expiryTs === false) continue;

            $daysLeft = (int)floor(($expiryTs - $todayMidnight) / 86400);
            $batchId = (string)($batch['batchId'] ?? '');
            $expiryFmt = date('m/d/Y', $expiryTs);

            if ($daysLeft <= 0) {
                throw new DomainException(
                    "Cannot sell \"{$productName}\" — batch (ID: {$batchId}) has already EXPIRED on {$expiryFmt}. Remove this batch from inventory immediately."
                );
            }
            if ($daysLeft <= 30) {
                throw new DomainException(
                    "Cannot sell \"{$productName}\" — batch (ID: {$batchId}) expires in {$daysLeft} day" . ($daysLeft === 1 ? '' : 's') . " ({$expiryFmt}). Products within 30 days of expiry cannot be sold. Please remove or update this batch."
                );
            }
        }
    }

    public static function validateCustomerExemptionFields(bool $required, string $type, string $idNumber): void
    {
        if (!$required) return;
        $allowedExemptionTypes = ['Senior Citizen', 'PWD', 'Other Qualified ID'];
        if (!in_array($type, $allowedExemptionTypes, true)) {
            throw new InvalidArgumentException('Invalid VAT exemption ID type.');
        }
        if ($idNumber === '') {
            throw new InvalidArgumentException('Customer ID number is required for VAT exemption.');
        }
    }

    /* ── Small SMA / EOQ math used by analytics ─────────────────────────────── */

    public static function sma(array $values, int $window): float
    {
        if (count($values) === 0 || $window <= 0) return 0;
        $slice = array_slice($values, -$window);
        return array_sum($slice) / count($slice);
    }

    public static function estimateEoq(int $annualDemand, float $avgUnitCost, float $orderCost = 120, float $holdingRate = 0.2): int
    {
        if ($annualDemand <= 0 || $avgUnitCost <= 0) return 0;
        $holdingCost = max(0.2, $avgUnitCost * $holdingRate);
        $qty = sqrt((2 * $annualDemand * $orderCost) / $holdingCost);
        return max(0, (int)round($qty));
    }
}
