<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use App\Http\Middleware\AuthenticateToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TransactionController extends Controller
{
    use ApiHelpers;

    /* ── GET /transactions ──────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $type = $request->query('type', 'all');
        $dateFrom = $request->query('date_from', '');
        $dateTo = $request->query('date_to', '');

        $sql = 'SELECT t.*, COALESCE(u.name, t.staff) AS current_staff_name
                FROM transactions t
                LEFT JOIN users u ON t.staff_id = u.id
                WHERE 1=1';
        $params = [];

        if ($type !== 'all') {
            $sql .= ' AND t.type = ?';
            $params[] = $type;
        }
        if ($dateFrom) {
            $sql .= ' AND DATE(t.transacted_at) >= ?';
            $params[] = $dateFrom;
        }
        if ($dateTo) {
            $sql .= ' AND DATE(t.transacted_at) <= ?';
            $params[] = $dateTo;
        }
        $sql .= ' ORDER BY t.transacted_at DESC';

        $rows = DB::select($sql, $params);
        return $this->json(array_map(fn($r) => InventoryService::formatTransaction((array)$r), $rows));
    }

    /* ── GET /transactions/export ───────────────────────────────────────── */
    public function export(Request $request)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        $rows = DB::select(
            'SELECT id, type, product_name, product_id, qty, amount, staff, status,
                    note, returned_tx_id, adjustment_reason, damaged_qty, transacted_at
             FROM transactions ORDER BY transacted_at DESC'
        );

        $filename = 'transactions-' . date('Y-m-d') . '.csv';
        return new StreamedResponse(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Transaction ID', 'Type', 'Product', 'Product ID', 'Qty', 'Amount', 'Staff', 'Status', 'Date', 'Note']);
            foreach ($rows as $r) {
                $r = (array)$r;
                fputcsv($out, [
                    $r['id'], $r['type'], $r['product_name'], $r['product_id'],
                    $r['qty'], $r['amount'], $r['staff'], $r['status'],
                    $r['transacted_at'], $r['note'] ?? '',
                ]);
            }
            fclose($out);
        }, 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    /* ── GET /transactions/{id} ─────────────────────────────────────────── */
    public function show(Request $request, string $id)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select(
            'SELECT t.*,
             COALESCE(u.name, t.staff) AS current_staff_name
             FROM transactions t
             LEFT JOIN users u ON t.staff_id = u.id
             WHERE t.id = ?
             GROUP BY t.id
             LIMIT 1',
            [$id]
        );
        if (empty($rows)) return $this->json(['error' => 'Transaction not found.'], 404);
        $tx = InventoryService::formatTransaction((array)$rows[0]);
        return $this->json($tx);
    }

    /* ── POST /transactions/sale ─────────────────────────────────────────── */
    public function sale(Request $request)
    {
        $this->requireRole($request, ['cashier']);
        $authUser = $this->user($request);
        $data = $this->body($request);
        $items = $data['items'] ?? null;

        if (is_array($items) && count($items) > 0) {
            return $this->handleMultiSale($request, $authUser, $data, $items);
        }

        $this->requireFields($data, ['product_id', 'qty']);
        $productId = $data['product_id'];
        $saleQty = (int)($data['sale_qty'] ?? $data['qty']);
        $saleUnit = ($data['sale_unit'] ?? 'unit') === 'pack' ? 'pack' : 'unit';
        if ($saleQty <= 0) return $this->json(['error' => 'Qty must be > 0.'], 422);

        $customerVatExempt = !empty($data['customer_vat_exempt']);
        $customerExemptionType = trim((string)($data['customer_exemption_type'] ?? ''));
        $customerIdNumber = trim((string)($data['customer_id_number'] ?? ''));
        try {
            InventoryService::validateCustomerExemptionFields($customerVatExempt, $customerExemptionType, $customerIdNumber);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], 422);
        }

        $product = DB::selectOne('SELECT * FROM products WHERE id = ? AND ' . InventoryService::productNotDeletedSql('products'), [$productId]);
        if (!$product) return $this->json(['error' => 'Product not found.'], 404);
        $product = (array)$product;

        $unitsPerSale = $saleUnit === 'pack' ? max(1, (int)$product['units_per_pack']) : 1;
        $qty = $saleQty * $unitsPerSale;

        $unitPrice = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
        $salePrice = $saleUnit === 'pack' && $product['pack_price'] !== null
            ? (float)$product['pack_price']
            : ($saleUnit === 'pack' ? $unitPrice * $unitsPerSale : $unitPrice);
        $shelfAmount = round($salePrice * $saleQty, 2);
        $amount = $shelfAmount;

        $discountAmount = 0.0;
        if ($customerVatExempt) {
            $discountBase = round($shelfAmount / 1.12, 2);
            $discountAmount = round($discountBase * 0.20, 2);
            $amount = round($discountBase - $discountAmount, 2);
            $vatRate = 0.0;
            $preTaxAmount = $amount;
            $taxAmount = 0.0;
        } else {
            $vatRate = 0.12;
            $preTaxAmount = round($amount / 1.12, 2);
            $taxAmount = round($amount - $preTaxAmount, 2);
        }
        $note = $customerVatExempt
            ? "Customer VAT exemption: {$customerExemptionType} ID {$customerIdNumber}"
            : null;
        $cvExempt = $customerVatExempt ? 1 : 0;
        $cvType = $customerVatExempt ? $customerExemptionType : null;
        $cvId = $customerVatExempt ? $customerIdNumber : null;

        DB::beginTransaction();
        try {
            $consumed = InventoryService::fifoDeduct($productId, $qty);
            InventoryService::assertSaleBatchesSafe((string)$product['name'], $consumed);

            $txId = InventoryService::genTxId('TXN');
            DB::insert(
                'INSERT INTO transactions
                 (id, type, sale_group_id, product_name, product_id, qty, sale_qty, sale_unit, units_per_sale, amount, discount_amount, pre_tax_amount, tax_amount, tax_rate,
                  customer_vat_exempt, customer_exemption_type, customer_id_number,
                  staff, staff_id, status, note, transacted_at)
                  VALUES (?, "sale", NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, NOW())',
                [
                    $txId, $product['name'], $productId, $qty, $saleQty, $saleUnit, $unitsPerSale, $amount, $discountAmount,
                    $preTaxAmount, $taxAmount, $vatRate, $cvExempt, $cvType, $cvId,
                    InventoryService::staffAbbrev($authUser['name']), $authUser['id'], $note,
                ]
            );

            foreach ($consumed as $c) {
                DB::insert(
                    'INSERT INTO transaction_batches (transaction_id, batch_id, expiry_date, qty) VALUES (?, ?, ?, ?)',
                    [$txId, $c['batchId'], $c['expiry'], $c['qty']]
                );
            }

            InventoryService::syncProductStatus($productId);
            DB::commit();

            $tx = DB::selectOne('SELECT * FROM transactions WHERE id = ?', [$txId]);
            $txArr = InventoryService::formatTransaction((array)$tx);
            $txArr['batchesConsumed'] = $consumed;

            $productRow = DB::selectOne('SELECT * FROM products WHERE id = ?', [$productId]);

            return $this->json([
                'transaction' => $txArr,
                'product' => InventoryService::enrichProduct((array)$productRow),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->json(['error' => $e->getMessage()], 422);
        }
    }

    private function handleMultiSale(Request $request, array $authUser, array $data, array $items)
    {
        $customerVatExempt = !empty($data['customer_vat_exempt']);
        $customerExemptionType = trim((string)($data['customer_exemption_type'] ?? ''));
        $customerIdNumber = trim((string)($data['customer_id_number'] ?? ''));
        $hasAnyDiscountItem = $customerVatExempt;
        foreach ($items as $it) {
            if (is_array($it) && !empty($it['apply_customer_discount'])) {
                $hasAnyDiscountItem = true;
                break;
            }
        }
        try {
            InventoryService::validateCustomerExemptionFields($hasAnyDiscountItem, $customerExemptionType, $customerIdNumber);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], 422);
        }

        $saleGroupId = InventoryService::genTxId('SALE');
        $txList = [];
        $updatedProducts = [];

        DB::beginTransaction();
        try {
            foreach ($items as $index => $item) {
                if (!is_array($item)) {
                    throw new \InvalidArgumentException('Each sale item must be an object.');
                }
                $productId = trim((string)($item['product_id'] ?? ''));
                $saleQty = (int)($item['sale_qty'] ?? $item['qty'] ?? 0);
                $saleUnit = (($item['sale_unit'] ?? 'unit') === 'pack') ? 'pack' : 'unit';
                if ($productId === '' || $saleQty <= 0) {
                    throw new \InvalidArgumentException("Invalid item at position {$index}. Product ID and qty are required.");
                }

                $product = DB::selectOne('SELECT * FROM products WHERE id = ? AND ' . InventoryService::productNotDeletedSql('products'), [$productId]);
                if (!$product) {
                    throw new \InvalidArgumentException("Product not found: {$productId}");
                }
                $product = (array)$product;

                $unitsPerSale = $saleUnit === 'pack' ? max(1, (int)$product['units_per_pack']) : 1;
                $qty = $saleQty * $unitsPerSale;
                $applyCustomerDiscount = array_key_exists('apply_customer_discount', $item)
                    ? !empty($item['apply_customer_discount'])
                    : $customerVatExempt;

                $unitPrice = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
                $salePrice = $saleUnit === 'pack' && $product['pack_price'] !== null
                    ? (float)$product['pack_price']
                    : ($saleUnit === 'pack' ? $unitPrice * $unitsPerSale : $unitPrice);
                $shelfAmount = round($salePrice * $saleQty, 2);
                $discountAmount = 0.0;
                if ($applyCustomerDiscount) {
                    $discountBase = round($shelfAmount / 1.12, 2);
                    $discountAmount = round($discountBase * 0.20, 2);
                    $amount = round($discountBase - $discountAmount, 2);
                    $vatRate = 0.0;
                    $preTaxAmount = $amount;
                    $taxAmount = 0.0;
                } else {
                    $amount = $shelfAmount;
                    $vatRate = 0.12;
                    $preTaxAmount = round($amount / 1.12, 2);
                    $taxAmount = round($amount - $preTaxAmount, 2);
                }

                $consumed = InventoryService::fifoDeduct($productId, $qty);
                InventoryService::assertSaleBatchesSafe((string)$product['name'], $consumed);
                $txId = InventoryService::genTxId('TXN');
                $note = $applyCustomerDiscount
                    ? "Customer discount: {$customerExemptionType} ID {$customerIdNumber}"
                    : null;
                $cvExempt = $applyCustomerDiscount ? 1 : 0;
                $cvType = $applyCustomerDiscount ? $customerExemptionType : null;
                $cvId = $applyCustomerDiscount ? $customerIdNumber : null;

                DB::insert(
                    'INSERT INTO transactions
                     (id, type, sale_group_id, product_name, product_id, qty, sale_qty, sale_unit, units_per_sale, amount, discount_amount, pre_tax_amount, tax_amount, tax_rate,
                      customer_vat_exempt, customer_exemption_type, customer_id_number,
                      staff, staff_id, status, note, transacted_at)
                     VALUES (?, "sale", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, NOW())',
                    [
                        $txId, $saleGroupId, $product['name'], $productId, $qty, $saleQty, $saleUnit, $unitsPerSale, $amount, $discountAmount,
                        $preTaxAmount, $taxAmount, $vatRate, $cvExempt, $cvType, $cvId,
                        InventoryService::staffAbbrev($authUser['name']), $authUser['id'], $note,
                    ]
                );

                foreach ($consumed as $c) {
                    DB::insert(
                        'INSERT INTO transaction_batches (transaction_id, batch_id, expiry_date, qty) VALUES (?, ?, ?, ?)',
                        [$txId, $c['batchId'], $c['expiry'], $c['qty']]
                    );
                }

                InventoryService::syncProductStatus($productId);

                $txRow = DB::selectOne('SELECT * FROM transactions WHERE id = ?', [$txId]);
                $tx = InventoryService::formatTransaction((array)$txRow);
                $tx['batchesConsumed'] = $consumed;
                $txList[] = $tx;

                $productRow = DB::selectOne('SELECT * FROM products WHERE id = ?', [$productId]);
                $updatedProducts[$productId] = InventoryService::enrichProduct((array)$productRow);
            }

            DB::commit();

            $payload = [
                'saleId' => $saleGroupId,
                'transactions' => $txList,
                'products' => array_values($updatedProducts),
            ];
            if (!empty($txList)) {
                $payload['transaction'] = $txList[0];
                $payload['product'] = $updatedProducts[$txList[0]['productId']] ?? null;
            }
            return $this->json($payload, 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->json(['error' => $e->getMessage()], 422);
        }
    }

    /* ── POST /transactions/adjustment ──────────────────────────────────── */
    public function adjustment(Request $request)
    {
        $this->requireRole($request, ['inventory_manager']);
        $authUser = $this->user($request);
        $data = $this->body($request);
        $this->requireFields($data, ['product_id', 'qty', 'reason', 'adjust_type']);

        $productId = $data['product_id'];
        $qty = (int)$data['qty'];
        $reason = trim($data['reason']);
        $adjustType = $data['adjust_type'];

        if ($qty <= 0) return $this->json(['error' => 'Qty must be > 0.'], 422);
        if ($reason === '') return $this->json(['error' => 'Reason is required.'], 422);

        $adjReason = $adjustType === 'damage'
            ? "Damaged — $reason"
            : "Stock Correction — $reason";

        DB::beginTransaction();
        try {
            $consumed = InventoryService::fifoDeduct($productId, $qty);

            $adjId = InventoryService::genTxId('ADJ');
            $productName = DB::selectOne('SELECT name FROM products WHERE id = ?', [$productId])->name ?? '';

            DB::insert(
                'INSERT INTO transactions
                 (id, type, product_name, product_id, qty, amount, staff, staff_id, status,
                  note, adjustment_reason, damaged_qty, transacted_at)
                 VALUES (?, "adjustment", ?, ?, ?, 0, ?, ?, "completed", ?, ?, ?, NOW())',
                [
                    $adjId, $productName, $productId, $qty,
                    InventoryService::staffAbbrev($authUser['name']), $authUser['id'],
                    $reason, $adjReason,
                    $adjustType === 'damage' ? $qty : 0,
                ]
            );

            InventoryService::syncProductStatus($productId);
            DB::commit();

            $tx = DB::selectOne('SELECT * FROM transactions WHERE id = ?', [$adjId]);
            $productRow = DB::selectOne('SELECT * FROM products WHERE id = ?', [$productId]);
            return $this->json([
                'transaction' => InventoryService::formatTransaction((array)$tx),
                'product' => InventoryService::enrichProduct((array)$productRow),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->json(['error' => $e->getMessage()], 422);
        }
    }
}
