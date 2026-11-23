<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReturnRequestController extends Controller
{
    use ApiHelpers;

    /* ── GET /return-requests ───────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, ['inventory_manager', 'admin', 'admin/owner']);
        $rows = DB::select(
            'SELECT id, record_type, product_id, product_name, qty, sale_unit, units_per_sale,
                    refund_amount, reason, sale_tx_id, batch_id, expiry_date,
                    disposition, recorded_by_name, processed_by, processed_at, created_at
             FROM product_returns
             ORDER BY created_at DESC'
        );
        return $this->json(array_map(fn($r) => InventoryService::formatReturnRecord((array)$r), $rows));
    }

    /* ── POST /return-requests/broken ────────────────────────────────────── */
    public function broken(Request $request)
    {
        $this->requireRole($request, ['inventory_manager', 'cashier']);
        $authUser = $this->user($request);
        $data = $this->body($request);
        $this->requireFields($data, ['product_id', 'qty', 'reason']);

        $productId = trim((string)$data['product_id']);
        $qty = filter_var($data['qty'], FILTER_VALIDATE_INT);
        $reason = trim((string)$data['reason']);
        $saleUnit = (string)($data['sale_unit'] ?? 'unit');
        $saleQty = filter_var($data['sale_qty'] ?? $data['qty'], FILTER_VALIDATE_INT);

        if ($qty === false || $qty <= 0) return $this->json(['error' => 'Qty must be greater than zero.'], 422);
        if ($saleQty === false || $saleQty <= 0) return $this->json(['error' => 'Sale qty must be greater than zero.'], 422);
        if (!in_array($saleUnit, ['unit', 'pack'], true)) return $this->json(['error' => 'Sale unit must be unit or pack.'], 422);
        if ($reason === '') return $this->json(['error' => 'Reason is required.'], 422);

        DB::beginTransaction();
        try {
            $product = DB::selectOne('SELECT * FROM products WHERE id = ? FOR UPDATE', [$productId]);
            if (!$product) {
                DB::rollBack();
                return $this->json(['error' => 'Product not found.'], 404);
            }
            $product = (array)$product;

            $unitsPerSale = $saleUnit === 'pack' ? max(1, (int)$product['units_per_pack']) : 1;
            if ($saleUnit === 'pack' && $unitsPerSale <= 1) {
                DB::rollBack();
                return $this->json(['error' => 'This product does not have a pack size.'], 422);
            }
            if ((int)$qty !== (int)$saleQty * $unitsPerSale) {
                DB::rollBack();
                return $this->json(['error' => 'The base-unit quantity does not match the selected unit or pack quantity.'], 422);
            }

            $stockRow = DB::selectOne('SELECT COALESCE(SUM(qty),0) AS s FROM product_batches WHERE product_id = ?', [$productId]);
            $currentStock = (int)($stockRow->s ?? 0);
            if ($qty > $currentStock) {
                DB::rollBack();
                return $this->json(['error' => "Cannot record {$qty} broken — only {$currentStock} units in stock."], 422);
            }

            $consumed = InventoryService::fifoDeduct($productId, $qty);
            $lossAmount = 0.0;
            $hasCompleteCost = true;
            foreach ($consumed as $batch) {
                if ($batch['unitCost'] === null) {
                    $hasCompleteCost = false;
                    break;
                }
                $lossAmount += $batch['qty'] * $batch['unitCost'];
            }
            $lossAmount = $hasCompleteCost ? round($lossAmount, 2) : null;
            $recordId = InventoryService::genTxId('BRK');
            $staffName = InventoryService::staffAbbrev($authUser['name']);

            DB::insert(
                'INSERT INTO product_returns
                 (id, record_type, product_id, product_name, qty, sale_unit, units_per_sale,
                  refund_amount, loss_amount, reason, sale_tx_id, batch_id, expiry_date,
                  disposition, recorded_by, recorded_by_name, processed_by, processed_at)
                 VALUES (?, "broken", ?, ?, ?, ?, ?,
                         0.00, ?, ?, NULL, ?, ?,
                         "broken", ?, ?, ?, NOW())',
                [
                    $recordId,
                    $productId, $product['name'], $qty, $saleUnit, $unitsPerSale,
                    $lossAmount, $reason,
                    $consumed[0]['batchId'] ?? null,
                    $consumed[0]['expiry'] ?? null,
                    $authUser['id'], $staffName, $authUser['id'],
                ]
            );

            DB::insert(
                'INSERT INTO transactions
                 (id, type, product_name, product_id, qty, sale_qty, sale_unit, units_per_sale,
                  amount, pre_tax_amount, tax_amount,
                  tax_rate, staff, staff_id, status, note, transacted_at)
                 VALUES (?, "adjustment", ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, "completed", ?, NOW())',
                [
                    $recordId, $product['name'], $productId, $qty, $saleQty, $saleUnit, $unitsPerSale,
                    $lossAmount ?? 0, $staffName, $authUser['id'], "Broken — {$reason}",
                ]
            );

            InventoryService::syncProductStatus($productId);
            DB::commit();

            $updated = DB::selectOne('SELECT * FROM products WHERE id = ?', [$productId]);
            $row = DB::selectOne('SELECT * FROM product_returns WHERE id = ?', [$recordId]);

            return $this->json([
                'message' => "{$qty} unit(s) of {$product['name']} recorded as broken and removed from stock.",
                'record' => InventoryService::formatReturnRecord((array)$row),
                'product' => InventoryService::enrichProduct((array)$updated),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /* ── POST /return-requests — customer return ─────────────────────────── */
    public function store(Request $request)
    {
        $this->requireRole($request, ['cashier', 'inventory_manager']);
        $authUser = $this->user($request);
        $data = $this->body($request);
        $this->requireFields($data, ['sale_tx_id', 'qty', 'reason']);

        $saleTxId = trim((string)$data['sale_tx_id']);
        $qty = filter_var($data['qty'], FILTER_VALIDATE_INT);
        $reason = trim((string)$data['reason']);

        if ($qty === false || $qty <= 0) return $this->json(['error' => 'Qty must be greater than zero.'], 422);
        if ($reason === '') return $this->json(['error' => 'Return reason is required.'], 422);

        DB::beginTransaction();
        try {
            $sale = DB::selectOne('SELECT * FROM transactions WHERE id = ? AND type = "sale" FOR UPDATE', [$saleTxId]);
            if (!$sale) {
                DB::rollBack();
                return $this->json(['error' => 'Original sale transaction not found.'], 404);
            }
            $sale = (array)$sale;
            if (empty($sale['product_id'])) {
                throw new \RuntimeException('The original sale is not linked to a product and cannot be returned.');
            }

            $returnedRow = DB::selectOne('SELECT COALESCE(SUM(qty), 0) AS s FROM product_returns WHERE sale_tx_id = ?', [$saleTxId]);
            $alreadyReturned = (int)($returnedRow->s ?? 0);
            $remainingQty = (int)$sale['qty'] - $alreadyReturned;

            if ($qty > $remainingQty) {
                throw new \DomainException("Only {$remainingQty} of the sold units remain returnable.");
            }

            $originalBatch = DB::selectOne(
                'SELECT batch_id, expiry_date FROM transaction_batches WHERE transaction_id = ? ORDER BY id ASC LIMIT 1',
                [$saleTxId]
            );

            $soldQty = max((int)$sale['qty'], 1);
            $refund = round(((float)$sale['amount'] / $soldQty) * $qty, 2);
            $vatRate = max(0.0, (float)($sale['tax_rate'] ?? 0.12));
            $preTax = $vatRate > 0 ? round($refund / (1 + $vatRate), 2) : $refund;
            $tax = round($refund - $preTax, 2);
            $saleUnit = $sale['sale_unit'] ?? 'unit';
            $unitsPerSale = max(1, (int)($sale['units_per_sale'] ?? 1));
            $returnTxId = InventoryService::genTxId('RET');
            $staffName = InventoryService::staffAbbrev($authUser['name']);

            DB::insert(
                'INSERT INTO product_returns
                 (id, record_type, product_id, product_name, qty, sale_unit, units_per_sale,
                  refund_amount, reason, sale_tx_id, batch_id, expiry_date,
                  disposition, recorded_by, recorded_by_name)
                 VALUES (?, "return", ?, ?, ?, ?, ?,
                         ?, ?, ?, ?, ?,
                         "pending", ?, ?)',
                [
                    $returnTxId,
                    $sale['product_id'], $sale['product_name'], $qty, $saleUnit, $unitsPerSale,
                    $refund, $reason, $saleTxId,
                    $originalBatch->batch_id ?? null,
                    $originalBatch->expiry_date ?? null,
                    $authUser['id'], $staffName,
                ]
            );

            DB::insert(
                'INSERT INTO transactions
                 (id, type, product_name, product_id, qty, sale_unit, units_per_sale, amount,
                  pre_tax_amount, tax_amount, tax_rate, staff, staff_id, status, note,
                  returned_tx_id, transacted_at)
                 VALUES (?, "return", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, ?, NOW())',
                [
                    $returnTxId,
                    $sale['product_name'], $sale['product_id'], $qty, $saleUnit, $unitsPerSale,
                    $refund, $preTax, $tax, $vatRate,
                    $staffName, $authUser['id'], $reason, $saleTxId,
                ]
            );

            DB::commit();

            $row = DB::selectOne('SELECT * FROM product_returns WHERE id = ?', [$returnTxId]);
            $transactionRow = DB::selectOne('SELECT * FROM transactions WHERE id = ?', [$returnTxId]);

            return $this->json([
                'record' => InventoryService::formatReturnRecord((array)$row),
                'transaction' => InventoryService::formatTransaction((array)$transactionRow),
                'disposition' => 'pending',
            ], 201);
        } catch (\DomainException $e) {
            DB::rollBack();
            return $this->json(['error' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /* ── PUT /return-requests/{id} — set disposition ────────────────────── */
    public function update(Request $request, string $id)
    {
        $this->requireRole($request, ['inventory_manager']);
        $authUser = $this->user($request);
        if (!preg_match('/^[A-Za-z0-9\-]+$/', (string)$id)) {
            return $this->json(['error' => 'Invalid return record ID.'], 422);
        }
        $data = $this->body($request);
        $this->requireFields($data, ['disposition']);
        $disposition = (string)$data['disposition'];
        if (!in_array($disposition, ['restocked', 'broken'], true)) {
            return $this->json(['error' => 'Disposition must be restocked or broken.'], 422);
        }

        DB::beginTransaction();
        try {
            $request = collect(DB::select(
                "SELECT pr.*, p.units_per_pack
                 FROM product_returns pr
                 JOIN products p ON p.id = pr.product_id
                 WHERE pr.id = ? AND pr.disposition = 'pending' AND pr.record_type = 'return'
                 FOR UPDATE",
                [$id]
            ))->first();
            if (!$request) {
                DB::rollBack();
                return $this->json(['error' => 'Return record was already processed or does not exist.'], 404);
            }
            $request = (array)$request;

            if ($disposition === 'restocked') {
                $batchId = $request['batch_id'] ?: 'RET-' . $request['id'];
                $restockQty = (int)$request['qty'];
                InventoryService::fifoRestock((string)$request['product_id'], $restockQty, $batchId, $request['expiry_date']);
                InventoryService::syncProductStatus((string)$request['product_id']);
            }

            DB::update(
                'UPDATE product_returns SET disposition = ?, processed_by = ?, processed_at = NOW() WHERE id = ?',
                [$disposition, $authUser['id'], $id]
            );

            DB::commit();

            $productRow = DB::selectOne('SELECT * FROM products WHERE id = ?', [$request['product_id']]);
            $restockQty = (int)$request['qty'];
            $message = $disposition === 'restocked'
                ? "Restocked {$restockQty} unit" . ($restockQty !== 1 ? 's' : '') . " of {$request['product_name']}."
                : "Returned product recorded as broken.";

            return $this->json([
                'message' => $message,
                'product' => InventoryService::enrichProduct((array)$productRow),
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
    }
}
