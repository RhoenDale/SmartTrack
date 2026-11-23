<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseOrderController extends Controller
{
    use ApiHelpers;

    private function requireSchema()
    {
        foreach (['purchase_orders', 'purchase_order_items', 'purchase_order_receipts'] as $requiredTable) {
            $table = DB::selectOne("SHOW TABLES LIKE '{$requiredTable}'");
            if (!$table) {
                return $this->json(['error' => 'Purchase-order schema migration is required. Apply create_supplier_purchase_orders.sql before using this section.'], 503);
            }
        }
        if (!InventoryService::productPurgeHistoryReady()) {
            return $this->json(['error' => 'Apply recycle_bin_product_history.sql before using purchase orders so product purge preserves order history.'], 503);
        }
        return null;
    }

    private function actorColumnsReady(): bool
    {
        $createdBy = collect(DB::select("SHOW COLUMNS FROM purchase_orders LIKE 'created_by'"))->first();
        $receivedBy = collect(DB::select("SHOW COLUMNS FROM purchase_order_receipts LIKE 'received_by'"))->first();
        return str_starts_with(strtolower((string)($createdBy->Type ?? '')), 'varchar(')
            && str_starts_with(strtolower((string)($receivedBy->Type ?? '')), 'varchar(');
    }

    private function cancellationReady(): bool
    {
        $status = collect(DB::select("SHOW COLUMNS FROM purchase_orders LIKE 'status'"))->first();
        return str_contains(strtolower((string)($status->Type ?? '')), "'cancelled'");
    }

    /* ── GET /purchase-orders/performance ────────────────────────────────── */
    public function performance(Request $request)
    {
        $this->requireRole($request, InventoryService::INV_ROLES);
        $err = $this->requireSchema();
        if ($err) return $err;

        $rows = DB::select(
            "SELECT po.supplier,
                    COUNT(DISTINCT po.id) AS order_count,
                    SUM(i.qty_ordered) AS qty_ordered,
                    SUM(LEAST(i.qty_ordered, COALESCE(r.qty_received, 0))) AS qty_fulfilled,
                    COUNT(DISTINCT CASE WHEN po.status NOT IN ('received', 'cancelled') THEN po.id END) AS open_orders,
                    ROUND(AVG(CASE WHEN r.received_date IS NOT NULL THEN DATEDIFF(r.received_date, po.ordered_at) END), 1) AS avg_lead_days,
                    COUNT(DISTINCT r.id) AS receipt_count
             FROM purchase_orders po
             JOIN purchase_order_items i ON i.purchase_order_id = po.id
             LEFT JOIN purchase_order_receipts r ON r.purchase_order_item_id = i.id
             WHERE po.status <> 'cancelled'
             GROUP BY po.supplier
             ORDER BY po.supplier"
        );

        return $this->json(array_map(function ($row) {
            $row = (array)$row;
            $ordered = (int)$row['qty_ordered'];
            $fulfilled = (int)$row['qty_fulfilled'];
            $avgLead = $row['avg_lead_days'] !== null ? (float)$row['avg_lead_days'] : null;
            return [
                'supplier' => $row['supplier'],
                'orderCount' => (int)$row['order_count'],
                'qtyOrdered' => $ordered,
                'qtyFulfilled' => $fulfilled,
                'fulfillmentRate' => $ordered > 0 ? round(($fulfilled / $ordered) * 100, 1) : null,
                'openOrders' => (int)$row['open_orders'],
                'avgLeadDays' => $avgLead,
                'receiptCount' => (int)$row['receipt_count'],
            ];
        }, $rows));
    }

    /* ── GET /purchase-orders ────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, InventoryService::INV_ROLES);
        $err = $this->requireSchema();
        if ($err) return $err;

        $orders = DB::select(
            'SELECT id, supplier, ordered_at, expected_delivery_date, status, created_at
             FROM purchase_orders ORDER BY ordered_at DESC, id DESC'
        );

        foreach ($orders as &$order) {
            $order = (array)$order;
            $itemRows = DB::select(
                'SELECT i.id, i.product_id, COALESCE(i.product_name_snapshot, p.name) AS product_name, i.qty_ordered,
                        COALESCE(SUM(r.qty_received), 0) AS qty_received
                 FROM purchase_order_items i
                 LEFT JOIN products p ON p.id = i.product_id
                 LEFT JOIN purchase_order_receipts r ON r.purchase_order_item_id = i.id
                 WHERE i.purchase_order_id = ?
                 GROUP BY i.id, i.product_id, i.product_name_snapshot, p.name, i.qty_ordered
                 ORDER BY i.id',
                [$order['id']]
            );
            $items = array_map(function ($item) {
                $item = (array)$item;
                $ordered = (int)$item['qty_ordered'];
                $received = (int)$item['qty_received'];
                return [
                    'id' => (int)$item['id'],
                    'productId' => (string)($item['product_id'] ?? ''),
                    'productName' => $item['product_name'],
                    'qtyOrdered' => $ordered,
                    'qtyReceived' => $received,
                    'qtyRemaining' => max(0, $ordered - $received),
                ];
            }, $itemRows);
            $order = [
                'id' => (int)$order['id'],
                'supplier' => $order['supplier'],
                'orderedAt' => $order['ordered_at'],
                'expectedDeliveryDate' => $order['expected_delivery_date'],
                'status' => $order['status'],
                'createdAt' => $order['created_at'],
                'items' => $items,
            ];
        }
        unset($order);
        return $this->json($orders);
    }

    /* ── POST /purchase-orders ───────────────────────────────────────────── */
    public function store(Request $request)
    {
        $actor = $this->requireRole($request, ['inventory_manager']);
        $err = $this->requireSchema();
        if ($err) return $err;
        if (!$this->actorColumnsReady()) {
            return $this->json(['error' => 'Purchase-order audit migration is required. Apply harden_purchase_order_relations.sql before creating orders.'], 503);
        }

        $data = $this->body($request);
        $this->requireFields($data, ['supplier', 'orderedAt', 'items']);
        $supplier = trim((string)$data['supplier']);
        $orderedAt = InventoryService::normalizeOptionalDate($data['orderedAt']);
        $expectedDate = InventoryService::normalizeOptionalDate($data['expectedDeliveryDate'] ?? null);
        $items = $data['items'];
        if ($supplier === '' || !$orderedAt || !is_array($items) || count($items) === 0) {
            return $this->json(['error' => 'Supplier, order date, and at least one item are required.'], 422);
        }

        $normalizedItems = [];
        $seenProducts = [];
        foreach ($items as $item) {
            $productId = filter_var($item['productId'] ?? null, FILTER_VALIDATE_INT);
            $qty = filter_var($item['qtyOrdered'] ?? null, FILTER_VALIDATE_INT);
            if (!$productId || !$qty || $qty < 1 || isset($seenProducts[$productId])) {
                return $this->json(['error' => 'Each product must be unique and have an ordered quantity greater than zero.'], 422);
            }
            $product = DB::selectOne('SELECT supplier, name FROM products WHERE id = ? LIMIT 1', [$productId]);
            if (!$product || strcasecmp(trim((string)$product->supplier), $supplier) !== 0) {
                return $this->json(['error' => 'Every ordered product must belong to the selected supplier.'], 422);
            }
            $seenProducts[$productId] = true;
            $normalizedItems[] = ['productId' => $productId, 'productName' => $product->name, 'qtyOrdered' => $qty];
        }

        DB::beginTransaction();
        try {
            DB::insert(
                'INSERT INTO purchase_orders (supplier, ordered_at, expected_delivery_date, created_by) VALUES (?, ?, ?, ?)',
                [$supplier, $orderedAt, $expectedDate, $actor['id'] ?? null]
            );
            $orderId = (int)DB::getPdo()->lastInsertId();
            foreach ($normalizedItems as $item) {
                DB::insert(
                    'INSERT INTO purchase_order_items (purchase_order_id, product_id, product_name_snapshot, qty_ordered) VALUES (?, ?, ?, ?)',
                    [$orderId, $item['productId'], $item['productName'], $item['qtyOrdered']]
                );
            }
            DB::commit();
            return $this->json(['id' => $orderId, 'message' => 'Purchase order created.'], 201);
        } catch (\Throwable $error) {
            DB::rollBack();
            throw $error;
        }
    }

    /* ── POST /purchase-orders/{id}/receipts ─────────────────────────────── */
    public function receiveDelivery(Request $request, int $id)
    {
        $actor = $this->requireRole($request, ['inventory_manager']);
        $err = $this->requireSchema();
        if ($err) return $err;
        if (!$this->actorColumnsReady()) {
            return $this->json(['error' => 'Purchase-order audit migration is required. Apply harden_purchase_order_relations.sql before recording deliveries.'], 503);
        }

        $data = $this->body($request);
        $this->requireFields($data, ['receivedAt', 'items']);
        $receivedAt = InventoryService::normalizeOptionalDate($data['receivedAt']);
        $items = $data['items'];
        if (!$receivedAt || !is_array($items) || count($items) === 0) {
            return $this->json(['error' => 'Receipt date and at least one received item are required.'], 422);
        }

        DB::beginTransaction();
        try {
            $order = DB::selectOne('SELECT id, status FROM purchase_orders WHERE id = ? FOR UPDATE', [$id]);
            if (!$order) {
                DB::rollBack();
                return $this->json(['error' => 'Purchase order not found.'], 404);
            }
            if ($order->status === 'received') {
                DB::rollBack();
                return $this->json(['error' => 'This purchase order is already fully received.'], 409);
            }
            if ($order->status === 'cancelled') {
                DB::rollBack();
                return $this->json(['error' => 'Cannot record a delivery for a cancelled purchase order.'], 409);
            }

            $changedProducts = [];
            $batchCounter = 0;
            foreach ($items as $item) {
                $itemId = filter_var($item['itemId'] ?? null, FILTER_VALIDATE_INT);
                $qty = filter_var($item['qtyReceived'] ?? null, FILTER_VALIDATE_INT);
                if (!$itemId || !$qty || $qty < 1) {
                    throw new \InvalidArgumentException('Received quantities must be whole numbers greater than zero.');
                }

                $line = DB::selectOne(
                    'SELECT id, product_id, qty_ordered FROM purchase_order_items WHERE id = ? AND purchase_order_id = ? FOR UPDATE',
                    [$itemId, $id]
                );
                if (!$line) throw new \InvalidArgumentException('A received item does not belong to this order.');
                if ($line->product_id === null) {
                    throw new \InvalidArgumentException('This product was permanently deleted, so the order line cannot receive new stock.');
                }
                $receivedRow = DB::selectOne('SELECT COALESCE(SUM(qty_received), 0) AS s FROM purchase_order_receipts WHERE purchase_order_item_id = ?', [$itemId]);
                $alreadyReceived = (int)($receivedRow->s ?? 0);
                $remaining = (int)$line->qty_ordered - $alreadyReceived;
                if ($qty > $remaining) {
                    throw new \InvalidArgumentException('Received quantity cannot exceed the remaining ordered quantity.');
                }

                $expiryDate = InventoryService::normalizeOptionalDate($item['expiryDate'] ?? null);
                $costValue = $item['batchTotalCost'] ?? null;
                $batchTotalCost = ($costValue === '' || $costValue === null) ? null : filter_var($costValue, FILTER_VALIDATE_FLOAT);
                if ($batchTotalCost !== null && ($batchTotalCost === false || $batchTotalCost < 0)) {
                    throw new \InvalidArgumentException('Batch cost must be zero or greater.');
                }
                $unitCost = $batchTotalCost !== null ? round(((float)$batchTotalCost / $qty), 4) : null;
                $batchCounter++;
                $batchId = 'PO' . $id . '-P' . $line->product_id . '-' . date('ymdHis') . '-' . $batchCounter . bin2hex(random_bytes(2));

                DB::insert(
                    'INSERT INTO product_batches (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$batchId, $line->product_id, $qty, $expiryDate, $receivedAt, $batchTotalCost, $unitCost]
                );
                DB::insert(
                    'INSERT INTO purchase_order_receipts (purchase_order_item_id, product_id, batch_id, qty_received, received_date, expiry_date, batch_total_cost, received_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$itemId, $line->product_id, $batchId, $qty, $receivedAt, $expiryDate, $batchTotalCost, $actor['id'] ?? null]
                );
                $changedProducts[(string)$line->product_id] = true;
            }

            $totals = collect(DB::select(
                'SELECT SUM(i.qty_ordered) AS ordered_qty,
                        SUM(COALESCE(r.received_qty, 0)) AS received_qty
                 FROM purchase_order_items i
                 LEFT JOIN (
                     SELECT purchase_order_item_id, SUM(qty_received) AS received_qty
                     FROM purchase_order_receipts GROUP BY purchase_order_item_id
                 ) r ON r.purchase_order_item_id = i.id
                 WHERE i.purchase_order_id = ?',
                [$id]
            ))->first();
            $status = (int)$totals->received_qty >= (int)$totals->ordered_qty
                ? 'received'
                : ((int)$totals->received_qty > 0 ? 'partially_received' : 'ordered');
            DB::update('UPDATE purchase_orders SET status = ? WHERE id = ?', [$status, $id]);
            DB::commit();

            foreach (array_keys($changedProducts) as $productId) InventoryService::syncProductStatus($productId);
            return $this->json(['message' => 'Delivery recorded and received stock added to inventory.'], 201);
        } catch (\InvalidArgumentException $error) {
            DB::rollBack();
            return $this->json(['error' => $error->getMessage()], 422);
        } catch (\Throwable $error) {
            DB::rollBack();
            throw $error;
        }
    }

    /* ── GET /purchase-orders/{id} ───────────────────────────────────────── */
    public function show(Request $request, int $id)
    {
        $this->requireRole($request, InventoryService::INV_ROLES);
        $err = $this->requireSchema();
        if ($err) return $err;

        $order = DB::selectOne(
            'SELECT id, supplier, ordered_at, expected_delivery_date, status, created_at FROM purchase_orders WHERE id = ? LIMIT 1',
            [$id]
        );
        if (!$order) return $this->json(['error' => 'Purchase order not found.'], 404);

        $itemRows = DB::select(
            'SELECT i.id, i.product_id, COALESCE(i.product_name_snapshot, p.name) AS product_name, i.qty_ordered,
                    COALESCE(SUM(r.qty_received), 0) AS qty_received
             FROM purchase_order_items i
             LEFT JOIN products p ON p.id = i.product_id
             LEFT JOIN purchase_order_receipts r ON r.purchase_order_item_id = i.id
             WHERE i.purchase_order_id = ?
             GROUP BY i.id, i.product_id, i.product_name_snapshot, p.name, i.qty_ordered
             ORDER BY i.id',
            [$id]
        );
        $items = array_map(function ($item) {
            $item = (array)$item;
            $ordered = (int)$item['qty_ordered'];
            $received = (int)$item['qty_received'];
            return [
                'id' => (int)$item['id'],
                'productId' => (string)($item['product_id'] ?? ''),
                'productName' => $item['product_name'],
                'qtyOrdered' => $ordered,
                'qtyReceived' => $received,
                'qtyRemaining' => max(0, $ordered - $received),
            ];
        }, $itemRows);

        return $this->json([
            'id' => (int)$order->id,
            'supplier' => $order->supplier,
            'orderedAt' => $order->ordered_at,
            'expectedDeliveryDate' => $order->expected_delivery_date,
            'status' => $order->status,
            'createdAt' => $order->created_at,
            'items' => $items,
        ]);
    }

    /* ── PUT /purchase-orders/{id} ──────────────────────────────────────── */
    public function update(Request $request, int $id)
    {
        $this->requireRole($request, ['inventory_manager']);
        $err = $this->requireSchema();
        if ($err) return $err;
        $data = $this->body($request);

        DB::beginTransaction();
        try {
            $order = DB::selectOne('SELECT id, supplier, status FROM purchase_orders WHERE id = ? FOR UPDATE', [$id]);
            if (!$order) {
                DB::rollBack();
                return $this->json(['error' => 'Purchase order not found.'], 404);
            }
            if ($order->status !== 'ordered') {
                DB::rollBack();
                return $this->json(['error' => 'Only orders that have not received any deliveries can be edited.'], 409);
            }
            $purged = DB::selectOne('SELECT 1 AS x FROM purchase_order_items WHERE purchase_order_id = ? AND product_id IS NULL LIMIT 1', [$id]);
            if ($purged) {
                DB::rollBack();
                return $this->json(['error' => 'This order contains a permanently deleted product and cannot be edited.'], 409);
            }

            $newSupplier = isset($data['supplier']) ? trim((string)$data['supplier']) : null;
            if ($newSupplier !== null && $newSupplier === '') {
                throw new \InvalidArgumentException('Supplier cannot be empty.');
            }
            $effectiveSupplier = $newSupplier ?? $order->supplier;

            $orderedAt = isset($data['orderedAt']) ? InventoryService::normalizeOptionalDate($data['orderedAt']) : null;
            if (isset($data['orderedAt']) && !$orderedAt) {
                throw new \InvalidArgumentException('A valid order date is required.');
            }

            $expectedDateRaw = array_key_exists('expectedDeliveryDate', $data) ? $data['expectedDeliveryDate'] : null;
            $expectedDate = $expectedDateRaw !== null ? InventoryService::normalizeOptionalDate($expectedDateRaw) : null;

            $items = $data['items'] ?? null;
            $normalizedItems = null;
            if ($items !== null) {
                if (!is_array($items) || count($items) === 0) {
                    throw new \InvalidArgumentException('At least one item is required.');
                }
                $normalizedItems = [];
                $seenProducts = [];
                foreach ($items as $item) {
                    $productId = filter_var($item['productId'] ?? null, FILTER_VALIDATE_INT);
                    $qty = filter_var($item['qtyOrdered'] ?? null, FILTER_VALIDATE_INT);
                    if (!$productId || !$qty || $qty < 1 || isset($seenProducts[$productId])) {
                        throw new \InvalidArgumentException('Each product must be unique and have an ordered quantity greater than zero.');
                    }
                    $product = DB::selectOne('SELECT supplier, name FROM products WHERE id = ? LIMIT 1', [$productId]);
                    if (!$product || strcasecmp(trim((string)$product->supplier), $effectiveSupplier) !== 0) {
                        throw new \InvalidArgumentException('Every ordered product must belong to the selected supplier.');
                    }
                    $seenProducts[$productId] = true;
                    $normalizedItems[] = ['productId' => $productId, 'productName' => $product->name, 'qtyOrdered' => $qty];
                }
            }

            $updates = [];
            $params = [];
            if ($newSupplier !== null) { $updates[] = 'supplier = ?'; $params[] = $newSupplier; }
            if ($orderedAt) { $updates[] = 'ordered_at = ?'; $params[] = $orderedAt; }
            if ($expectedDateRaw !== null) { $updates[] = 'expected_delivery_date = ?'; $params[] = $expectedDate; }
            if (count($updates) > 0) {
                $params[] = $id;
                DB::update('UPDATE purchase_orders SET ' . implode(', ', $updates) . ' WHERE id = ?', $params);
            }

            if ($normalizedItems !== null) {
                DB::delete('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [$id]);
                foreach ($normalizedItems as $item) {
                    DB::insert(
                        'INSERT INTO purchase_order_items (purchase_order_id, product_id, product_name_snapshot, qty_ordered) VALUES (?, ?, ?, ?)',
                        [$id, $item['productId'], $item['productName'], $item['qtyOrdered']]
                    );
                }
            }

            DB::commit();
            return $this->json(['message' => 'Purchase order updated.']);
        } catch (\InvalidArgumentException $error) {
            DB::rollBack();
            return $this->json(['error' => $error->getMessage()], 422);
        } catch (\Throwable $error) {
            DB::rollBack();
            throw $error;
        }
    }

    /* ── DELETE /purchase-orders/{id} ──────────────────────────────────── */
    public function destroy(Request $request, int $id)
    {
        $this->requireRole($request, ['inventory_manager']);
        $err = $this->requireSchema();
        if ($err) return $err;
        if (!$this->cancellationReady()) {
            return $this->json(['error' => 'Purchase-order cancellation migration is required. Apply add_cancelled_status_to_purchase_orders.sql before cancelling orders.'], 503);
        }
        $order = DB::selectOne('SELECT id, status FROM purchase_orders WHERE id = ? LIMIT 1', [$id]);
        if (!$order) return $this->json(['error' => 'Purchase order not found.'], 404);
        if ($order->status !== 'ordered') {
            return $this->json(['error' => 'Only orders that have not received any deliveries can be cancelled.'], 409);
        }
        DB::update('UPDATE purchase_orders SET status = ? WHERE id = ?', ['cancelled', $id]);
        return $this->json(['message' => 'Purchase order cancelled.']);
    }
}
