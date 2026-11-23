<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BatchController extends Controller
{
    use ApiHelpers;

    /* ── GET /products/{id}/batches ─────────────────────────────────────── */
    public function index(Request $request, string $id)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select(
            'SELECT batch_id, qty, expiry_date, received_date
             FROM product_batches WHERE product_id = ? AND qty > 0
             ORDER BY received_date ASC',
            [$id]
        );
        $batches = array_map(function ($b) {
            $b = (array)$b;
            return [
                'batchId' => $b['batch_id'],
                'qty' => (int)$b['qty'],
                'expiry' => $b['expiry_date'] ? date('m/d/Y', strtotime($b['expiry_date'])) : null,
                'expiryDate' => $b['expiry_date'],
                'receivedDate' => date('m/d/Y', strtotime($b['received_date'])),
            ];
        }, $rows);
        return $this->json($batches);
    }

    /* ── POST /products/{id}/batches ────────────────────────────────────── */
    public function store(Request $request, string $id)
    {
        $this->requireRole($request, ['inventory_manager']);
        $data = $this->body($request);
        $this->requireFields($data, ['qty']);
        $qty = filter_var($data['qty'], FILTER_VALIDATE_INT);
        if ($qty === false || $qty <= 0) {
            return $this->json(['error' => 'Qty must be a positive whole number.'], 422);
        }
        $expiryDate = InventoryService::normalizeOptionalDate($data['expiry_date'] ?? null);
        $received = InventoryService::normalizeOptionalDate($data['received_date'] ?? date('Y-m-d'), 'Received date');
        $product = DB::selectOne('SELECT id FROM products WHERE id = ?', [$id]);
        if (!$product) return $this->json(['error' => 'Product not found.'], 404);

        $count = (int)DB::selectOne('SELECT COUNT(*) AS c FROM product_batches WHERE product_id = ?', [$id])->c;
        $nextBatchNumber = $count + 1;
        do {
            $batchId = $id . '-B' . $nextBatchNumber++;
            $exists = DB::selectOne('SELECT 1 FROM product_batches WHERE batch_id = ?', [$batchId]);
        } while ($exists);

        DB::insert(
            'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date)
             VALUES (?, ?, ?, ?, ?)',
            [$batchId, $id, $qty, $expiryDate, $received ?? date('Y-m-d')]
        );

        InventoryService::syncProductStatus($id);
        return $this->json(['message' => 'Batch added.', 'batchId' => $batchId], 201);
    }

    /* ── DELETE /products/{id}/batches/{batchId} ────────────────────────── */
    public function destroy(Request $request, string $id, string $batchId)
    {
        $this->requireRole($request, ['inventory_manager']);
        $affected = DB::delete('DELETE FROM product_batches WHERE batch_id = ? AND product_id = ?', [$batchId, $id]);
        if ($affected === 0) return $this->json(['error' => 'Batch not found.'], 404);
        InventoryService::syncProductStatus($id);
        return $this->json(['message' => 'Batch deleted.']);
    }
}
