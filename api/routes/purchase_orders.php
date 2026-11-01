<?php
/**
 * Supplier purchase order and receipt routes (admin + inventory manager).
 *
 * GET    /purchase-orders
 * GET    /purchase-orders/performance
 * GET    /purchase-orders/{id}
 * POST   /purchase-orders
 * PUT    /purchase-orders/{id}          — edit dates/items (only when status = ordered)
 * DELETE /purchase-orders/{id}          — cancel order (only when status = ordered)
 * POST   /purchase-orders/{id}/receipts
 */

$actor = require_auth();
require_role(['admin/owner', 'admin', 'inventory_manager']);
$pdo = db();

foreach (['purchase_orders', 'purchase_order_items', 'purchase_order_receipts'] as $requiredTable) {
    $table = $pdo->query("SHOW TABLES LIKE '{$requiredTable}'")->fetchColumn();
    if (!$table) {
        json_response(['error' => 'Purchase-order schema migration is required. Apply create_supplier_purchase_orders.sql before using this section.'], 503);
    }
}

function purchase_order_actor_columns_ready(PDO $pdo): bool {
    $createdBy = $pdo->query("SHOW COLUMNS FROM purchase_orders LIKE 'created_by'")->fetch(PDO::FETCH_ASSOC);
    $receivedBy = $pdo->query("SHOW COLUMNS FROM purchase_order_receipts LIKE 'received_by'")->fetch(PDO::FETCH_ASSOC);
    return str_starts_with(strtolower((string)($createdBy['Type'] ?? '')), 'varchar(')
        && str_starts_with(strtolower((string)($receivedBy['Type'] ?? '')), 'varchar(');
}

function purchase_order_cancellation_ready(PDO $pdo): bool {
    $status = $pdo->query("SHOW COLUMNS FROM purchase_orders LIKE 'status'")->fetch(PDO::FETCH_ASSOC);
    return str_contains(strtolower((string)($status['Type'] ?? '')), "'cancelled'");
}

if ($method === 'GET' && $id === 'performance') {
    $rows = $pdo->query(
        "SELECT po.supplier,
                COUNT(DISTINCT po.id) AS order_count,
                SUM(i.qty_ordered) AS qty_ordered,
                SUM(LEAST(i.qty_ordered, COALESCE(r.qty_received, 0))) AS qty_fulfilled,
                COUNT(DISTINCT CASE WHEN po.status NOT IN ('received', 'cancelled') THEN po.id END) AS open_orders
         FROM purchase_orders po
         JOIN purchase_order_items i ON i.purchase_order_id = po.id
         LEFT JOIN (
             SELECT purchase_order_item_id, SUM(qty_received) AS qty_received
             FROM purchase_order_receipts
             GROUP BY purchase_order_item_id
         ) r ON r.purchase_order_item_id = i.id
         WHERE po.status <> 'cancelled'
         GROUP BY po.supplier
         ORDER BY po.supplier"
    )->fetchAll(PDO::FETCH_ASSOC);

    json_response(array_map(static function ($row) {
        $ordered = (int)$row['qty_ordered'];
        $fulfilled = (int)$row['qty_fulfilled'];
        return [
            'supplier' => $row['supplier'],
            'orderCount' => (int)$row['order_count'],
            'qtyOrdered' => $ordered,
            'qtyFulfilled' => $fulfilled,
            'fulfillmentRate' => $ordered > 0 ? round(($fulfilled / $ordered) * 100, 1) : null,
            'openOrders' => (int)$row['open_orders'],
        ];
    }, $rows));
}

if ($method === 'GET' && $id === null) {
    $orders = $pdo->query(
        'SELECT id, supplier, ordered_at, expected_delivery_date, status, created_at
         FROM purchase_orders ORDER BY ordered_at DESC, id DESC'
    )->fetchAll(PDO::FETCH_ASSOC);
    $itemStmt = $pdo->prepare(
        'SELECT i.id, i.product_id, p.name AS product_name, i.qty_ordered,
                COALESCE(SUM(r.qty_received), 0) AS qty_received
         FROM purchase_order_items i
         JOIN products p ON p.id = i.product_id
         LEFT JOIN purchase_order_receipts r ON r.purchase_order_item_id = i.id
         WHERE i.purchase_order_id = ?
         GROUP BY i.id, i.product_id, p.name, i.qty_ordered
         ORDER BY i.id'
    );
    foreach ($orders as &$order) {
        $itemStmt->execute([$order['id']]);
        $items = array_map(static function ($item) {
            $ordered = (int)$item['qty_ordered'];
            $received = (int)$item['qty_received'];
            return [
                'id' => (int)$item['id'],
                'productId' => (string)$item['product_id'],
                'productName' => $item['product_name'],
                'qtyOrdered' => $ordered,
                'qtyReceived' => $received,
                'qtyRemaining' => max(0, $ordered - $received),
            ];
        }, $itemStmt->fetchAll(PDO::FETCH_ASSOC));
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
    json_response($orders);
}

if ($method === 'POST' && $id === null) {
    if (!purchase_order_actor_columns_ready($pdo)) {
        json_response(['error' => 'Purchase-order audit migration is required. Apply harden_purchase_order_relations.sql before creating orders.'], 503);
    }
    $data = body();
    require_fields($data, ['supplier', 'orderedAt', 'items']);
    $supplier = trim((string)$data['supplier']);
    $orderedAt = normalize_optional_date($data['orderedAt']);
    $expectedDate = normalize_optional_date($data['expectedDeliveryDate'] ?? null);
    $items = $data['items'];
    if ($supplier === '' || !$orderedAt || !is_array($items) || count($items) === 0) {
        json_response(['error' => 'Supplier, order date, and at least one item are required.'], 422);
    }

    $normalizedItems = [];
    $seenProducts = [];
    foreach ($items as $item) {
        $productId = filter_var($item['productId'] ?? null, FILTER_VALIDATE_INT);
        $qty = filter_var($item['qtyOrdered'] ?? null, FILTER_VALIDATE_INT);
        if (!$productId || !$qty || $qty < 1 || isset($seenProducts[$productId])) {
            json_response(['error' => 'Each product must be unique and have an ordered quantity greater than zero.'], 422);
        }
        $productStmt = $pdo->prepare('SELECT supplier FROM products WHERE id = ? LIMIT 1');
        $productStmt->execute([$productId]);
        $productSupplier = $productStmt->fetchColumn();
        if ($productSupplier === false || strcasecmp(trim((string)$productSupplier), $supplier) !== 0) {
            json_response(['error' => 'Every ordered product must belong to the selected supplier.'], 422);
        }
        $seenProducts[$productId] = true;
        $normalizedItems[] = ['productId' => $productId, 'qtyOrdered' => $qty];
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO purchase_orders (supplier, ordered_at, expected_delivery_date, created_by)
             VALUES (?, ?, ?, ?)'
        )->execute([$supplier, $orderedAt, $expectedDate, $actor['id'] ?? null]);
        $orderId = (int)$pdo->lastInsertId();
        $insertItem = $pdo->prepare(
            'INSERT INTO purchase_order_items (purchase_order_id, product_id, qty_ordered)
             VALUES (?, ?, ?)'
        );
        foreach ($normalizedItems as $item) {
            $insertItem->execute([$orderId, $item['productId'], $item['qtyOrdered']]);
        }
        $pdo->commit();
        json_response(['id' => $orderId, 'message' => 'Purchase order created.'], 201);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

if ($method === 'POST' && ctype_digit((string)$id) && $sub === 'receipts') {
    if (!purchase_order_actor_columns_ready($pdo)) {
        json_response(['error' => 'Purchase-order audit migration is required. Apply harden_purchase_order_relations.sql before recording deliveries.'], 503);
    }
    $data = body();
    require_fields($data, ['receivedAt', 'items']);
    $receivedAt = normalize_optional_date($data['receivedAt']);
    $items = $data['items'];
    if (!$receivedAt || !is_array($items) || count($items) === 0) {
        json_response(['error' => 'Receipt date and at least one received item are required.'], 422);
    }

    $orderStmt = $pdo->prepare('SELECT id, status FROM purchase_orders WHERE id = ? FOR UPDATE');
    $pdo->beginTransaction();
    try {
        $orderStmt->execute([$id]);
        $order = $orderStmt->fetch(PDO::FETCH_ASSOC);
        if (!$order) {
            $pdo->rollBack();
            json_response(['error' => 'Purchase order not found.'], 404);
        }
        if ($order['status'] === 'received') {
            $pdo->rollBack();
            json_response(['error' => 'This purchase order is already fully received.'], 409);
        }

        $receiptInsert = $pdo->prepare(
            'INSERT INTO purchase_order_receipts
             (purchase_order_item_id, product_id, batch_id, qty_received, received_date, expiry_date, batch_total_cost, received_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $batchInsert = $pdo->prepare(
            'INSERT INTO product_batches
             (batch_id, product_id, qty, expiry_date, received_date, batch_total_cost, unit_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $changedProducts = [];
        $batchCounter = 0;
        foreach ($items as $item) {
            $itemId = filter_var($item['itemId'] ?? null, FILTER_VALIDATE_INT);
            $qty = filter_var($item['qtyReceived'] ?? null, FILTER_VALIDATE_INT);
            if (!$itemId || !$qty || $qty < 1) {
                throw new InvalidArgumentException('Received quantities must be whole numbers greater than zero.');
            }

            $lineStmt = $pdo->prepare(
                'SELECT id, product_id, qty_ordered FROM purchase_order_items
                 WHERE id = ? AND purchase_order_id = ? FOR UPDATE'
            );
            $lineStmt->execute([$itemId, $id]);
            $line = $lineStmt->fetch(PDO::FETCH_ASSOC);
            if (!$line) throw new InvalidArgumentException('A received item does not belong to this order.');
            $receivedStmt = $pdo->prepare(
                'SELECT COALESCE(SUM(qty_received), 0) FROM purchase_order_receipts WHERE purchase_order_item_id = ?'
            );
            $receivedStmt->execute([$itemId]);
            $alreadyReceived = (int)$receivedStmt->fetchColumn();
            $remaining = (int)$line['qty_ordered'] - $alreadyReceived;
            if ($qty > $remaining) {
                throw new InvalidArgumentException('Received quantity cannot exceed the remaining ordered quantity.');
            }

            $expiryDate = normalize_optional_date($item['expiryDate'] ?? null);
            $costValue = $item['batchTotalCost'] ?? null;
            $batchTotalCost = ($costValue === '' || $costValue === null) ? null : filter_var($costValue, FILTER_VALIDATE_FLOAT);
            if ($batchTotalCost !== null && ($batchTotalCost === false || $batchTotalCost < 0)) {
                throw new InvalidArgumentException('Batch cost must be zero or greater.');
            }
            $unitCost = $batchTotalCost !== null ? round(((float)$batchTotalCost / $qty), 4) : null;
            $batchCounter++;
            $batchId = 'PO' . $id . '-P' . $line['product_id'] . '-' . date('ymdHis') . '-' . $batchCounter . bin2hex(random_bytes(2));

            $batchInsert->execute([
                $batchId, $line['product_id'], $qty, $expiryDate, $receivedAt, $batchTotalCost, $unitCost,
            ]);
            $receiptInsert->execute([
                $itemId, $line['product_id'], $batchId, $qty, $receivedAt, $expiryDate,
                $batchTotalCost, $actor['id'] ?? null,
            ]);
            $changedProducts[(string)$line['product_id']] = true;
        }

        $statusStmt = $pdo->prepare(
            'SELECT SUM(i.qty_ordered) AS ordered_qty,
                    SUM(COALESCE(r.received_qty, 0)) AS received_qty
             FROM purchase_order_items i
             LEFT JOIN (
                 SELECT purchase_order_item_id, SUM(qty_received) AS received_qty
                 FROM purchase_order_receipts GROUP BY purchase_order_item_id
             ) r ON r.purchase_order_item_id = i.id
             WHERE i.purchase_order_id = ?'
        );
        $statusStmt->execute([$id]);
        $totals = $statusStmt->fetch(PDO::FETCH_ASSOC);
        $status = (int)$totals['received_qty'] >= (int)$totals['ordered_qty']
            ? 'received'
            : ((int)$totals['received_qty'] > 0 ? 'partially_received' : 'ordered');
        $pdo->prepare('UPDATE purchase_orders SET status = ? WHERE id = ?')->execute([$status, $id]);
        $pdo->commit();

        foreach (array_keys($changedProducts) as $productId) sync_product_status($productId);
        json_response(['message' => 'Delivery recorded and received stock added to inventory.'], 201);
    } catch (InvalidArgumentException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_response(['error' => $error->getMessage()], 422);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

// ─── GET single purchase order ───────────────────────────────────────────────
if ($method === 'GET' && ctype_digit((string)$id)) {
    $stmt = $pdo->prepare(
        'SELECT id, supplier, ordered_at, expected_delivery_date, status, created_at
         FROM purchase_orders WHERE id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        json_response(['error' => 'Purchase order not found.'], 404);
    }
    $itemStmt = $pdo->prepare(
        'SELECT i.id, i.product_id, p.name AS product_name, i.qty_ordered,
                COALESCE(SUM(r.qty_received), 0) AS qty_received
         FROM purchase_order_items i
         JOIN products p ON p.id = i.product_id
         LEFT JOIN purchase_order_receipts r ON r.purchase_order_item_id = i.id
         WHERE i.purchase_order_id = ?
         GROUP BY i.id, i.product_id, p.name, i.qty_ordered
         ORDER BY i.id'
    );
    $itemStmt->execute([$id]);
    $items = array_map(static function ($item) {
        $ordered = (int)$item['qty_ordered'];
        $received = (int)$item['qty_received'];
        return [
            'id' => (int)$item['id'],
            'productId' => (string)$item['product_id'],
            'productName' => $item['product_name'],
            'qtyOrdered' => $ordered,
            'qtyReceived' => $received,
            'qtyRemaining' => max(0, $ordered - $received),
        ];
    }, $itemStmt->fetchAll(PDO::FETCH_ASSOC));
    json_response([
        'id' => (int)$order['id'],
        'supplier' => $order['supplier'],
        'orderedAt' => $order['ordered_at'],
        'expectedDeliveryDate' => $order['expected_delivery_date'],
        'status' => $order['status'],
        'createdAt' => $order['created_at'],
        'items' => $items,
    ]);
}

// ─── PUT edit purchase order (only when status = ordered) ─────────────────────
if ($method === 'PUT' && ctype_digit((string)$id)) {
    $data = body();

    $pdo->beginTransaction();
    try {
        $orderStmt = $pdo->prepare('SELECT id, supplier, status FROM purchase_orders WHERE id = ? FOR UPDATE');
        $orderStmt->execute([$id]);
        $order = $orderStmt->fetch(PDO::FETCH_ASSOC);
        if (!$order) {
            $pdo->rollBack();
            json_response(['error' => 'Purchase order not found.'], 404);
        }
        if ($order['status'] !== 'ordered') {
            $pdo->rollBack();
            json_response(['error' => 'Only orders that have not received any deliveries can be edited.'], 409);
        }

        $newSupplier = isset($data['supplier']) ? trim((string)$data['supplier']) : null;
        if ($newSupplier !== null && $newSupplier === '') {
            throw new InvalidArgumentException('Supplier cannot be empty.');
        }
        $effectiveSupplier = $newSupplier ?? $order['supplier'];

        $orderedAt = isset($data['orderedAt']) ? normalize_optional_date($data['orderedAt']) : null;
        if (isset($data['orderedAt']) && !$orderedAt) {
            throw new InvalidArgumentException('A valid order date is required.');
        }

        $expectedDateRaw = array_key_exists('expectedDeliveryDate', $data) ? $data['expectedDeliveryDate'] : null;
        $expectedDate = $expectedDateRaw !== null ? normalize_optional_date($expectedDateRaw) : null;

        // Validate items if provided (full replacement)
        $items = $data['items'] ?? null;
        $normalizedItems = null;
        if ($items !== null) {
            if (!is_array($items) || count($items) === 0) {
                throw new InvalidArgumentException('At least one item is required.');
            }
            $normalizedItems = [];
            $seenProducts = [];
            foreach ($items as $item) {
                $productId = filter_var($item['productId'] ?? null, FILTER_VALIDATE_INT);
                $qty = filter_var($item['qtyOrdered'] ?? null, FILTER_VALIDATE_INT);
                if (!$productId || !$qty || $qty < 1 || isset($seenProducts[$productId])) {
                    throw new InvalidArgumentException('Each product must be unique and have an ordered quantity greater than zero.');
                }
                $productStmt = $pdo->prepare('SELECT supplier FROM products WHERE id = ? LIMIT 1');
                $productStmt->execute([$productId]);
                $productSupplier = $productStmt->fetchColumn();
                if ($productSupplier === false || strcasecmp(trim((string)$productSupplier), $effectiveSupplier) !== 0) {
                    throw new InvalidArgumentException('Every ordered product must belong to the selected supplier.');
                }
                $seenProducts[$productId] = true;
                $normalizedItems[] = ['productId' => $productId, 'qtyOrdered' => $qty];
            }
        }

        // Update order fields
        $updates = [];
        $params = [];
        if ($newSupplier !== null) { $updates[] = 'supplier = ?'; $params[] = $newSupplier; }
        if ($orderedAt) { $updates[] = 'ordered_at = ?'; $params[] = $orderedAt; }
        if ($expectedDateRaw !== null) { $updates[] = 'expected_delivery_date = ?'; $params[] = $expectedDate; }
        if (count($updates) > 0) {
            $params[] = $id;
            $pdo->prepare('UPDATE purchase_orders SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
        }

        // Replace items if provided
        if ($normalizedItems !== null) {
            $pdo->prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?')->execute([$id]);
            $insertItem = $pdo->prepare(
                'INSERT INTO purchase_order_items (purchase_order_id, product_id, qty_ordered)
                 VALUES (?, ?, ?)'
            );
            foreach ($normalizedItems as $item) {
                $insertItem->execute([$id, $item['productId'], $item['qtyOrdered']]);
            }
        }

        $pdo->commit();
        json_response(['message' => 'Purchase order updated.']);
    } catch (InvalidArgumentException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_response(['error' => $error->getMessage()], 422);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

// ─── DELETE cancel purchase order (only when status = ordered) ───────────────
if ($method === 'DELETE' && ctype_digit((string)$id)) {
    if (!purchase_order_cancellation_ready($pdo)) {
        json_response(['error' => 'Purchase-order cancellation migration is required. Apply add_cancelled_status_to_purchase_orders.sql before cancelling orders.'], 503);
    }
    $stmt = $pdo->prepare('SELECT id, status FROM purchase_orders WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        json_response(['error' => 'Purchase order not found.'], 404);
    }
    if ($order['status'] !== 'ordered') {
        json_response(['error' => 'Only orders that have not received any deliveries can be cancelled.'], 409);
    }
    $pdo->prepare('UPDATE purchase_orders SET status = ? WHERE id = ?')->execute(['cancelled', $id]);
    json_response(['message' => 'Purchase order cancelled.']);
}

json_response(['error' => 'Purchase order route not found.'], 404);
