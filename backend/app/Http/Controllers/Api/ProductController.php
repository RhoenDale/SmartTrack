<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    use ApiHelpers;

    /* ── POST /products/{id}/supplier ────────────────────────────────────── */
    public function updateSupplier(Request $request, string $id)
    {
        $this->requireRole($request, ['inventory_manager']);
        $data = $this->body($request);
        $this->requireFields($data, ['supplier']);
        $supplier = trim((string)$data['supplier']);
        if ($supplier === '' || mb_strlen($supplier) > 120) {
            return $this->json(['error' => 'Enter a supplier name with 1 to 120 characters.'], 422);
        }
        $affected = DB::update('UPDATE products SET supplier = ?, updated_at = NOW() WHERE id = ?', [$supplier, $id]);
        if ($affected === 0) {
            $exists = DB::selectOne('SELECT 1 FROM products WHERE id = ?', [$id]);
            if (!$exists) return $this->json(['error' => 'Product not found.'], 404);
        }
        return $this->json(['message' => 'Product supplier updated.']);
    }

    /* ── GET /products/deleted — recycle bin list ────────────────────────── */
    public function deleted(Request $request)
    {
        $this->requireRole($request, ['admin/owner', 'admin', 'inventory_manager']);
        InventoryService::purgeExpiredRecycleBin();

        $cols = DB::select("SHOW COLUMNS FROM products LIKE 'deleted_at'");
        if (empty($cols)) return $this->json([]);

        $rows = DB::select(
            "SELECT p.id, p.name, p.supplier, p.status,
                    p.deleted_at, p.deleted_by, p.delete_note,
                    u.name AS deleted_by_name,
                    COALESCE(
                        (SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                         FROM product_category_map pcm
                         JOIN categories c ON c.id = pcm.category_id
                         WHERE pcm.product_id = p.id),
                        ''
                    ) AS category_names
             FROM products p
             LEFT JOIN users u ON u.id = p.deleted_by
             WHERE p.deleted_at IS NOT NULL
             ORDER BY p.deleted_at DESC"
        );

        return $this->json(array_map(function ($r) {
            $r = (array)$r;
            return [
                'id' => (string)$r['id'],
                'name' => $r['name'],
                'category' => $r['category_names'] ?? '',
                'supplier' => $r['supplier'],
                'stock' => 0,
                'price' => 0,
                'deletedAt' => $r['deleted_at'],
                'deletedByName' => $r['deleted_by_name'] ?? $r['deleted_by'] ?? null,
                'deleteNote' => $r['delete_note'] ?? null,
                'daysSinceDelete' => $r['deleted_at']
                    ? (int)floor((time() - strtotime($r['deleted_at'])) / 86400)
                    : 0,
            ];
        }, $rows));
    }

    /* ── POST /products/{id}/restore ─────────────────────────────────────── */
    public function restore(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner', 'admin', 'inventory_manager']);
        $exists = DB::selectOne('SELECT id FROM products WHERE id = ? AND deleted_at IS NOT NULL', [$id]);
        if (!$exists) return $this->json(['error' => 'Product not found in recycle bin.'], 404);
        DB::update("UPDATE products SET deleted_at = NULL, deleted_by = NULL, delete_note = NULL, updated_at = NOW() WHERE id = ?", [$id]);
        InventoryService::syncProductStatus($id);
        return $this->json(['message' => 'Product restored.']);
    }

    /* ── DELETE /products/{id}/purge ────────────────────────────────────── */
    public function purge(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner', 'admin', 'inventory_manager']);
        if (!InventoryService::productPurgeHistoryReady()) {
            return $this->json(['error' => 'Apply recycle_bin_product_history.sql before permanently deleting products so purchase history is preserved.'], 503);
        }
        $exists = DB::selectOne('SELECT id FROM products WHERE id = ? AND deleted_at IS NOT NULL', [$id]);
        if (!$exists) return $this->json(['error' => 'Product not found in recycle bin.'], 404);

        DB::beginTransaction();
        try {
            DB::delete('DELETE FROM notifications WHERE product_id = ?', [$id]);
            DB::delete('DELETE FROM products WHERE id = ?', [$id]);
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
        return $this->json(['message' => 'Product permanently deleted.']);
    }

    /* ── POST /products/import — Bulk CSV/Excel importer ────────────────── */
    public function import(Request $request)
    {
        $this->requireRole($request, ['inventory_manager']);
        $payload = $this->body($request);
        $items = $payload['items'] ?? [];
        if (!is_array($items) || empty($items)) {
            return $this->json(['error' => 'No items provided for import.'], 422);
        }

        $created = 0;
        $updated = 0;
        $errors = [];
        $today = date('Y-m-d');
        $oneYear = date('Y-m-d', strtotime('+1 year'));

        DB::beginTransaction();
        try {
            foreach ($items as $idx => $row) {
                $rowNum = $idx + 1;
                $name = trim((string)($row['name'] ?? ''));
                if ($name === '') {
                    $errors[] = "Row {$rowNum}: Missing medicine name (skipped).";
                    continue;
                }

                $barcode = trim((string)($row['barcode'] ?? ''));
                $category = trim((string)($row['category'] ?? 'General'));
                if ($category === '') $category = 'General';
                $supplier = trim((string)($row['supplier'] ?? 'Direct Supplier'));
                if ($supplier === '') $supplier = 'Direct Supplier';

                $price = max(0, (float)($row['price'] ?? 0));
                $salePrice = isset($row['sale_price']) && $row['sale_price'] !== '' ? max(0, (float)$row['sale_price']) : ($price > 0 ? round($price * 1.25, 2) : 0);
                $reorder = max(1, (int)($row['reorder'] ?? 20));
                $unitLabel = trim((string)($row['unit_label'] ?? 'unit')) ?: 'unit';
                $qty = max(0, (int)($row['stock'] ?? $row['qty'] ?? 0));

                $expiry = trim((string)($row['expiry'] ?? $row['expiry_date'] ?? ''));
                if ($expiry === '' || !strtotime($expiry)) {
                    $expiry = $oneYear;
                } else {
                    $expiry = date('Y-m-d', strtotime($expiry));
                }

                $existingId = null;
                if ($barcode !== '') {
                    $found = DB::selectOne('SELECT id, name FROM products WHERE barcode = ? AND deleted_at IS NULL', [$barcode]);
                    if ($found) $existingId = $found->id;
                }
                if (!$existingId) {
                    $found = DB::selectOne('SELECT id, barcode FROM products WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL', [$name]);
                    if ($found) $existingId = $found->id;
                }

                if ($existingId) {
                    DB::update(
                        'UPDATE products SET supplier = COALESCE(NULLIF(?, ""), supplier),
                                             price = CASE WHEN ? > 0 THEN ? ELSE price END,
                                             sale_price = CASE WHEN ? > 0 THEN ? ELSE sale_price END,
                                             reorder = CASE WHEN ? > 0 THEN ? ELSE reorder END,
                                             updated_at = NOW()
                         WHERE id = ?',
                        [$supplier, $price, $price, $salePrice, $salePrice, $reorder, $reorder, $existingId]
                    );
                    InventoryService::syncProductCategories($existingId, [$category]);

                    if ($qty > 0) {
                        $batchId = trim((string)($row['batch_id'] ?? ''));
                        if ($batchId === '') {
                            $batchId = 'IMP-' . date('ymd') . '-' . substr(uniqid(), -4);
                        }
                        $batchTotalCost = round($qty * $price, 2);
                        DB::insert(
                            'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
                             VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [$batchId, $existingId, $qty, $expiry, $today, $batchTotalCost, $price]
                        );
                    }
                    InventoryService::syncProductStatus((string)$existingId);
                    $updated++;
                } else {
                    if ($barcode === '') {
                        $barcode = 'ST-' . strtoupper(substr(md5($name . microtime()), 0, 8));
                    }
                    DB::insert(
                        'INSERT INTO products (barcode, name, supplier, reorder, price, sale_price, unit_label, units_per_pack, pack_price, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "good")',
                        [$barcode, $name, $supplier, $reorder, $price, $salePrice, $unitLabel, 1, null]
                    );
                    $newId = (string)DB::getPdo()->lastInsertId();
                    InventoryService::syncProductCategories($newId, [$category]);

                    if ($qty > 0) {
                        $batchId = trim((string)($row['batch_id'] ?? ''));
                        if ($batchId === '') {
                            $batchId = 'IMP-' . date('ymd') . '-' . substr(uniqid(), -4);
                        }
                        $batchTotalCost = round($qty * $price, 2);
                        DB::insert(
                            'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
                             VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [$batchId, $newId, $qty, $expiry, $today, $batchTotalCost, $price]
                        );
                    }
                    InventoryService::syncProductStatus($newId);
                    $created++;
                }
            }

            DB::commit();
            return $this->json([
                'success' => true,
                'created' => $created,
                'updated' => $updated,
                'total' => $created + $updated,
                'errors' => $errors,
                'message' => "Successfully imported {$created} new products and updated {$updated} existing items.",
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->json(['error' => 'Import failed: ' . $e->getMessage()], 500);
        }
    }

    /* ── GET /products/{id} ──────────────────────────────────────────────── */
    public function show(Request $request, string $id)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $row = DB::selectOne('SELECT * FROM products WHERE id = ?', [$id]);
        if (!$row) return $this->json(['error' => 'Product not found.'], 404);
        return $this->json(InventoryService::enrichProduct((array)$row));
    }

    /* ── PUT /products/{id} ─────────────────────────────────────────────── */
    public function update(Request $request, string $id)
    {
        $this->requireRole($request, ['inventory_manager']);
        $data = $this->body($request);
        $this->requireFields($data, ['name', 'supplier', 'reorder', 'price']);
        $categoryNames = InventoryService::productCategoryNames($data);

        $normalizedBatches = null;
        if (array_key_exists('batches', $data)) {
            if (!is_array($data['batches'])) {
                return $this->json(['error' => 'Batches must be a list.'], 422);
            }
            if ($data['batches']) {
                $normalizedBatches = array_map([InventoryService::class, 'normalizeProductBatch'], $data['batches']);
            }
        }

        $barcode = trim((string)($data['barcode'] ?? ''));

        DB::beginTransaction();
        try {
            $exists = DB::selectOne('SELECT id FROM products WHERE id = ? FOR UPDATE', [$id]);
            if (!$exists) {
                DB::rollBack();
                return $this->json(['error' => 'Product not found.'], 404);
            }

            $barcodeCheck = DB::selectOne('SELECT id FROM products WHERE barcode = ? AND id <> ?', [$barcode, $id]);
            if ($barcode !== '' && $barcodeCheck) {
                DB::rollBack();
                return $this->json(['error' => "Barcode '{$barcode}' is already assigned to another product."], 409);
            }

            DB::update(
                'UPDATE products SET barcode=?, name=?, supplier=?, reorder=?, price=?, sale_price=?, unit_label=?, units_per_pack=?, pack_price=?, updated_at=NOW()
                 WHERE id = ?',
                [
                    $barcode !== '' ? $barcode : null,
                    $data['name'], $data['supplier'],
                    (int)$data['reorder'], (float)$data['price'],
                    isset($data['sale_price']) && $data['sale_price'] !== '' ? (float)$data['sale_price'] : null,
                    trim((string)($data['unit_label'] ?? 'unit')) ?: 'unit',
                    max(1, (int)($data['units_per_pack'] ?? 1)),
                    isset($data['pack_price']) && $data['pack_price'] !== '' ? (float)$data['pack_price'] : null,
                    $id,
                ]
            );
            InventoryService::syncProductCategories($id, $categoryNames);

            if ($normalizedBatches !== null) {
                DB::delete('DELETE FROM product_batches WHERE product_id = ?', [$id]);
                foreach ($normalizedBatches as $batch) {
                    DB::insert(
                        'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
                         VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [
                            $batch['batchId'], $id, $batch['qty'], $batch['expiryDate'],
                            $batch['receivedDate'], $batch['batchTotalCost'], $batch['unitCost'],
                        ]
                    );
                }
            }

            InventoryService::syncProductStatus($id);
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        $row = DB::selectOne('SELECT * FROM products WHERE id = ?', [$id]);
        return $this->json(InventoryService::enrichProduct((array)$row));
    }

    /* ── DELETE /products/{id} — soft-delete ────────────────────────────── */
    public function destroy(Request $request, string $id)
    {
        $this->requireRole($request, ['inventory_manager']);
        $actor = $this->user($request);
        $cols = DB::select("SHOW COLUMNS FROM products LIKE 'deleted_at'");
        if (!empty($cols)) {
            $existing = DB::selectOne('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', [$id]);
            if (!$existing) return $this->json(['error' => 'Product not found.'], 404);
            $note = $this->body($request)['note'] ?? null;
            DB::update(
                "UPDATE products SET deleted_at = NOW(), deleted_by = ?, delete_note = ?, status = 'out_of_stock', updated_at = NOW() WHERE id = ?",
                [$actor['id'] ?? null, $note, $id]
            );
            DB::delete("DELETE FROM notifications WHERE product_id = ? AND type = 'alert'", [$id]);
            return $this->json(['message' => 'Product moved to recycle bin.']);
        }

        $affected = DB::delete('DELETE FROM products WHERE id = ?', [$id]);
        if ($affected === 0) return $this->json(['error' => 'Product not found.'], 404);
        DB::delete("DELETE FROM notifications WHERE product_id = ? AND type = 'alert'", [$id]);
        return $this->json(['message' => 'Product deleted.']);
    }

    /* ── GET /products ──────────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $search = $request->query('search', '');
        $status = $request->query('status', 'all');

        $softDeleteEnabled = !empty(DB::select("SHOW COLUMNS FROM products LIKE 'deleted_at'"));
        $sql = 'SELECT * FROM products WHERE 1=1' . ($softDeleteEnabled ? ' AND (deleted_at IS NULL)' : '');
        $params = [];

        if ($search !== '') {
            $sql .= ' AND (name LIKE ? OR id LIKE ? OR barcode LIKE ? OR EXISTS (
                SELECT 1 FROM product_category_map pcm
                JOIN categories c ON c.id = pcm.category_id
                WHERE pcm.product_id = products.id AND c.name LIKE ?
            ))';
            $like = "%$search%";
            $params = array_merge($params, [$like, $like, $like, $like]);
        }
        if ($status !== 'all') {
            $sql .= ' AND status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY id ASC';

        $rows = DB::select($sql, $params);
        return $this->json(array_map(fn($r) => InventoryService::enrichProduct((array)$r), $rows));
    }

    /* ── POST /products ─────────────────────────────────────────────────── */
    public function store(Request $request)
    {
        $this->requireRole($request, ['inventory_manager']);
        $data = $this->body($request);
        $this->requireFields($data, ['barcode', 'name', 'supplier', 'reorder', 'price', 'batches']);
        if (!is_array($data['batches'])) {
            return $this->json(['error' => 'Batches must be a list.'], 422);
        }
        $normalizedBatches = array_map([InventoryService::class, 'normalizeProductBatch'], $data['batches']);
        $categoryNames = InventoryService::productCategoryNames($data);
        $barcode = trim((string)$data['barcode']);
        if ($barcode === '') {
            return $this->json(['error' => 'A barcode is required.'], 422);
        }

        $check = DB::selectOne('SELECT id FROM products WHERE barcode = ?', [$barcode]);
        if ($check) {
            return $this->json(['error' => "Barcode '{$barcode}' is already assigned to a product."], 409);
        }

        DB::beginTransaction();
        try {
            DB::insert(
                'INSERT INTO products (barcode, name, supplier, reorder, price, sale_price, unit_label, units_per_pack, pack_price, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "good")',
                [
                    $barcode, $data['name'], $data['supplier'],
                    (int)$data['reorder'], (float)$data['price'],
                    isset($data['sale_price']) && $data['sale_price'] !== '' ? (float)$data['sale_price'] : null,
                    trim((string)($data['unit_label'] ?? 'unit')) ?: 'unit',
                    max(1, (int)($data['units_per_pack'] ?? 1)),
                    isset($data['pack_price']) && $data['pack_price'] !== '' ? (float)$data['pack_price'] : null,
                ]
            );
            $productId = (string)DB::getPdo()->lastInsertId();
            InventoryService::syncProductCategories($productId, $categoryNames);

            foreach ($normalizedBatches as $batch) {
                DB::insert(
                    'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
                     VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        $batch['batchId'], $productId, $batch['qty'], $batch['expiryDate'],
                        $batch['receivedDate'], $batch['batchTotalCost'], $batch['unitCost'],
                    ]
                );
            }

            InventoryService::syncProductStatus($productId);
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        $row = DB::selectOne('SELECT * FROM products WHERE id = ?', [$productId]);
        return $this->json(InventoryService::enrichProduct((array)$row), 201);
    }
}
