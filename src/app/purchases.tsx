import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, CalendarDays, PackageCheck, Pencil, Plus, RefreshCw, Truck, X } from "lucide-react";
import { productsApi, purchaseOrdersApi, type PurchaseOrder, type SupplierPerformance } from "./api";
import { hasUserRole, type Product } from "./data";
import { InfoTip, TablePager, ConfirmDialog } from "./shared";

type DraftLine = { productId: string; productName: string; qtyOrdered: number };
type ReceiveDraft = { qty: string; expiry: string; cost: string };
const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary";

function todayLocal() {
  const date = new Date();
  return (
    String(date.getFullYear()) +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function statusLabel(status: PurchaseOrder["status"]) {
  if (status === "received") return "Received";
  if (status === "partially_received") return "Partially received";
  if (status === "cancelled") return "Cancelled";
  return "Ordered";
}

export default function PurchaseOrdersPage({
  inventory,
  onInventoryChanged,
  userRoles,
}: {
  inventory: Product[];
  onInventoryChanged: () => void;
  userRoles: string[];
}) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [performance, setPerformance] = useState<SupplierPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canModify = hasUserRole({ roles: userRoles }, "inventory_manager");

  // ── Create-form state ──────────────────────────────────────────────────
  const [supplier, setSupplier] = useState("");
  const [showSupplierSetup, setShowSupplierSetup] = useState(false);
  const [supplierNameDraft, setSupplierNameDraft] = useState("");
  const [supplierProductId, setSupplierProductId] = useState("");
  const [orderedAt, setOrderedAt] = useState(todayLocal());
  const [expectedDate, setExpectedDate] = useState("");
  const [productId, setProductId] = useState("");
  const [qtyOrdered, setQtyOrdered] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [reviewingOrder, setReviewingOrder] = useState(false);
  const [receivedAt, setReceivedAt] = useState(todayLocal());
  const [receiveDrafts, setReceiveDrafts] = useState<Record<number, ReceiveDraft>>({});

  // ── Edit modal state ─────────────────────────────────────────────────────
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [editSupplier, setEditSupplier] = useState("");
  const [editOrderedAt, setEditOrderedAt] = useState("");
  const [editExpectedDate, setEditExpectedDate] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editQtyOrdered, setEditQtyOrdered] = useState("");
  const [editDraftLines, setEditDraftLines] = useState<DraftLine[]>([]);

  // ── Cancel confirmation state ────────────────────────────────────────────
  const [cancellingOrder, setCancellingOrder] = useState<PurchaseOrder | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);

  // ── Pagination ────────────────────────────────────────────────────────────
  const [perfPage, setPerfPage] = useState(1);
  const PERF_PAGE_SIZE = 5;
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PAGE_SIZE = 5;

  // ── Derived data ──────────────────────────────────────────────────────────
  const suppliers = useMemo(
    () =>
      [...new Set(inventory.map((product) => product.supplier.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [inventory]
  );
  const supplierProducts = useMemo(
    () => inventory.filter((product) => product.supplier.trim() === supplier),
    [inventory, supplier]
  );
  const editSupplierProducts = useMemo(
    () => inventory.filter((product) => product.supplier.trim() === editSupplier),
    [inventory, editSupplier]
  );
  // Ensure the order's current supplier is always selectable even if no products carry it now
  const editSupplierOptions = useMemo(
    () => Array.from(new Set([...suppliers, editSupplier].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [suppliers, editSupplier]
  );

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError("");
    try {
      const results = await Promise.all([purchaseOrdersApi.list(), purchaseOrdersApi.performance()]);
      setOrders(results[0]);
      setPerformance(results[1]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load purchase orders. Check that the database migration has been applied."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (supplier && !suppliers.includes(supplier)) {
      setSupplier("");
      setDraftLines([]);
      setProductId("");
    }
  }, [supplier, suppliers]);

  // ── Create-order helpers ──────────────────────────────────────────────────
  const addDraftLine = () => {
    const selected = supplierProducts.find((product) => product.id === productId);
    const quantity = Number(qtyOrdered);
    if (!selected) {
      setError("Choose a product before adding it to the order.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Enter a whole quantity greater than zero.");
      return;
    }
    if (draftLines.some((line) => line.productId === selected.id)) {
      setError("This product is already on the order.");
      return;
    }
    setDraftLines((lines) => [...lines, { productId: selected.id, productName: selected.name, qtyOrdered: quantity }]);
    setProductId("");
    setQtyOrdered("");
    setError("");
  };

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supplier || !orderedAt || draftLines.length === 0) {
      setError("Choose a supplier, order date, and at least one product.");
      return;
    }
    setError("");
    setReviewingOrder(true);
  };

  const confirmCreateOrder = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await purchaseOrdersApi.create({
        supplier,
        orderedAt,
        expectedDeliveryDate: expectedDate || null,
        items: draftLines.map((line) => ({ productId: line.productId, qtyOrdered: line.qtyOrdered })),
      });
      setDraftLines([]);
      setSupplier("");
      setExpectedDate("");
      setReviewingOrder(false);
      setNotice("Purchase order saved. Stock changes only when a delivery is recorded.");
      setShowCreateModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the purchase order.");
    } finally {
      setSaving(false);
    }
  };

  const saveSupplierLink = async () => {
    const name = supplierNameDraft.trim();
    if (!name || !supplierProductId) {
      setError("Enter the supplier name and choose a product to link.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await productsApi.setSupplier(supplierProductId, name);
      setSupplierNameDraft("");
      setSupplierProductId("");
      setNotice(`Supplier "${name}" saved. The linked product is now available for purchase orders.`);
      onInventoryChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this supplier.");
    } finally {
      setSaving(false);
    }
  };

  // ── Receive-delivery helpers ───────────────────────────────────────────────
  const beginReceiving = (order: PurchaseOrder) => {
    setReceivingOrder(order);
    setReceivedAt(todayLocal());
    setReceiveDrafts(
      Object.fromEntries(
        order.items.filter((item) => item.qtyRemaining > 0).map((item) => [item.id, { qty: "", expiry: "", cost: "" }])
      )
    );
    setError("");
  };

  const recordDelivery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!receivingOrder) return;
    const enteredItems = receivingOrder.items
      .map((item) => ({ item, value: receiveDrafts[item.id]?.qty.trim() ?? "" }))
      .filter((entry) => entry.value !== "");
    if (
      enteredItems.some(({ item, value }) => {
        const qty = Number(value);
        return !Number.isInteger(qty) || qty < 1 || qty > item.qtyRemaining;
      })
    ) {
      setError("Use whole quantities from 1 up to the remaining amount for each product.");
      return;
    }
    const items = receivingOrder.items.flatMap((item) => {
      const draft = receiveDrafts[item.id];
      const qty = Number(draft?.qty ?? "");
      if (!Number.isInteger(qty) || qty < 1) return [];
      return [
        {
          itemId: item.id,
          qtyReceived: qty,
          expiryDate: draft.expiry || null,
          batchTotalCost: draft.cost.trim() === "" ? null : Number(draft.cost),
        },
      ];
    });
    if (items.length === 0) {
      setError("Enter a received quantity for at least one product.");
      return;
    }
    if (items.some((item) => item.batchTotalCost !== null && (!Number.isFinite(item.batchTotalCost) || item.batchTotalCost < 0))) {
      setError("Batch cost must be zero or greater.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await purchaseOrdersApi.receive(receivingOrder.id, { receivedAt, items });
      setReceivingOrder(null);
      setNotice("Delivery saved and received quantities added to inventory batches.");
      await load();
      onInventoryChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this delivery.");
    } finally {
      setSaving(false);
    }
  };

  // ── Edit-order helpers ─────────────────────────────────────────────────────
  const beginEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setEditSupplier(order.supplier);
    setEditOrderedAt(order.orderedAt);
    setEditExpectedDate(order.expectedDeliveryDate || "");
    setEditDraftLines(
      order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        qtyOrdered: item.qtyOrdered,
      }))
    );
    setEditProductId("");
    setEditQtyOrdered("");
    setError("");
  };

  const editAddDraftLine = () => {
    const selected = editSupplierProducts.find((product) => product.id === editProductId);
    const quantity = Number(editQtyOrdered);
    if (!selected) {
      setError("Choose a product before adding it to the order.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Enter a whole quantity greater than zero.");
      return;
    }
    if (editDraftLines.some((line) => line.productId === selected.id)) {
      setError("This product is already on the order.");
      return;
    }
    setEditDraftLines((lines) => [
      ...lines,
      { productId: selected.id, productName: selected.name, qtyOrdered: quantity },
    ]);
    setEditProductId("");
    setEditQtyOrdered("");
    setError("");
  };

  const confirmEditOrder = async () => {
    if (!editingOrder) return;
    if (!editSupplier || !editOrderedAt || editDraftLines.length === 0) {
      setError("Choose a supplier, order date, and at least one product.");
      return;
    }
    if (editDraftLines.some((line) => !Number.isInteger(line.qtyOrdered) || line.qtyOrdered < 1)) {
      setError("All quantities must be whole numbers greater than zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await purchaseOrdersApi.update(editingOrder.id, {
        supplier: editSupplier,
        orderedAt: editOrderedAt,
        expectedDeliveryDate: editExpectedDate || null,
        items: editDraftLines.map((line) => ({ productId: line.productId, qtyOrdered: line.qtyOrdered })),
      });
      setEditingOrder(null);
      setNotice("Purchase order updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the purchase order.");
    } finally {
      setSaving(false);
    }
  };

  // ── Cancel-order helper ────────────────────────────────────────────────────
  const confirmCancelOrder = async () => {
    if (!cancellingOrder) return;
    setSaving(true);
    setError("");
    try {
      await purchaseOrdersApi.cancel(cancellingOrder.id);
      setCancellingOrder(null);
      setNotice("Purchase order cancelled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the purchase order.");
    } finally {
      setSaving(false);
    }
  };

  // ── KPI values ─────────────────────────────────────────────────────────────
  const totalOpen = orders.filter((o) => o.status !== "received" && o.status !== "cancelled").length;
  const totalOrdered = performance.reduce((sum, row) => sum + row.qtyOrdered, 0);
  const totalReceived = performance.reduce((sum, row) => sum + row.qtyFulfilled, 0);
  const overallRate = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : null;

  const paginatedPerformance = useMemo(() => {
    const start = (perfPage - 1) * PERF_PAGE_SIZE;
    return performance.slice(start, start + PERF_PAGE_SIZE);
  }, [performance, perfPage]);

  const paginatedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ORDERS_PAGE_SIZE;
    return orders.slice(start, start + ORDERS_PAGE_SIZE);
  }, [orders, ordersPage]);

  // ── ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-4 w-full max-w-[1400px] mx-auto st-page-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ml-auto flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">Supplier Orders</h1>
            <InfoTip
              title="Supplier Orders & Fulfillment"
              lines={[
                "Record supplier orders and compare ordered quantities with deliveries received.",
                { label: "Purchase Orders", value: "Log incoming orders with suppliers before delivery without inflating active stock" },
                { label: "Record Delivery", value: "Receive delivered quantities into inventory batches with lot expiry and cost" },
                { label: "Edit / Cancel", value: "Orders can be edited or cancelled until a delivery is recorded" },
                { label: "Fulfillment Rate", value: "Ratio of quantity received over quantity ordered per supplier" },
              ]}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track supplier orders, record deliveries, and monitor fulfillment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canModify && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setNotice("");
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-all"
          >
            <Plus size={13} /> New Order
          </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Orders & Fulfillment                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Suppliers tracked</p>
              <p className="mt-0.5 text-lg font-bold text-foreground">{performance.length}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Open orders</p>
              <p className="mt-0.5 text-lg font-bold text-amber-600 dark:text-amber-400">{totalOpen}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Overall fulfillment</p>
              <p className="mt-0.5 text-lg font-bold text-primary">
                {overallRate === null ? "—" : overallRate.toFixed(1) + "%"}
              </p>
            </div>
          </div>

          {/* Purchase orders list */}
          <section className="rounded-lg border border-border/80 bg-card">
            <div className="px-3 py-2.5 border-b border-border/80 flex items-center gap-2">
              <CalendarDays size={15} className="text-primary" />
              <h2 className="text-sm font-bold text-foreground">Purchase orders</h2>
              <InfoTip
                title="Purchase Orders Lifecycle"
                lines={[
                  "Track the delivery status of inventory orders placed with suppliers.",
                  { label: "Ordered", value: "Purchase request created and pending shipment from supplier" },
                  { label: "Partially Received", value: "Partial shipment arrived and received into inventory; balance pending" },
                  { label: "Received", value: "All ordered quantities verified and added to inventory batches" },
                  { label: "Cancelled", value: "Order voided before any delivery was received" },
                ]}
              />
            </div>
            {loading ? (
              <p className="p-5 text-sm text-muted-foreground">Loading orders…</p>
            ) : orders.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No purchase orders recorded yet.</p>
            ) : (
              <div>
                <div className="divide-y divide-border/80">
                  {paginatedOrders.map((order) => {
                    const ordered = order.items.reduce((sum, item) => sum + item.qtyOrdered, 0);
                    const received = order.items.reduce((sum, item) => sum + item.qtyReceived, 0);
                    const rate = ordered > 0 ? (received / ordered) * 100 : 0;
                    const statusClass =
                      order.status === "received"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : order.status === "partially_received"
                        ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : order.status === "cancelled"
                        ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
                        : "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400";
                    const isCancelled = order.status === "cancelled";
                    return (
                      <div
                        key={order.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/10 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              PO-{order.id} · {order.supplier}
                            </p>
                            <span
                              className={
                                "rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase " +
                                statusClass
                              }
                            >
                              {statusLabel(order.status)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Ordered {order.orderedAt}
                            {order.expectedDeliveryDate ? " · Expected " + order.expectedDeliveryDate : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {order.items
                              .map(
                                (item) =>
                                  `${item.productName} · ${item.qtyReceived.toLocaleString()} of ${item.qtyOrdered.toLocaleString()} received`
                              )
                              .join("  |  ")}
                          </p>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {!isCancelled && (
                            <div className="text-right">
                              <p className="text-xs font-semibold text-foreground">{rate.toFixed(1)}% received</p>
                              <p className="text-[10px] text-muted-foreground">
                                {received.toLocaleString()} / {ordered.toLocaleString()}
                              </p>
                            </div>
                          )}
                          {order.status === "ordered" && canModify && (
                            <>
                              <button
                                type="button"
                                onClick={() => beginEdit(order)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancellingOrder(order)}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-300/60 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              >
                                <Ban size={13} /> Cancel
                              </button>
                            </>
                          )}
                          {order.status !== "received" && !isCancelled && canModify && (
                            <button
                              type="button"
                              onClick={() => beginReceiving(order)}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-all"
                            >
                              Record delivery
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <TablePager
                  total={orders.length}
                  page={ordersPage}
                  pageSize={ORDERS_PAGE_SIZE}
                  onPage={setOrdersPage}
                  alwaysShow
                />
              </div>
            )}
          </section>

          {/* Supplier fulfillment */}
          <section className="rounded-lg border border-border/80 bg-card">
            <div className="px-3 py-2.5 border-b border-border/80 flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Supplier fulfillment</h2>
              <InfoTip
                title="Supplier Fulfillment Guide"
                lines={[
                  "Received quantity ÷ ordered quantity across recorded purchase orders.",
                  { label: "Quantity Metric", value: "Measures volume fulfillment, not delivery timeliness" },
                  { label: "Historical Records", value: "Applies to orders created in SmartTrack; legacy stock batches without POs are excluded" },
                  { label: "Fulfillment Rate", value: "Percentage of requested units successfully delivered by supplier" },
                ]}
              />
            </div>
            {performance.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No purchase order history yet.</p>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10 bg-card shadow-sm text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Supplier</th>
                        <th className="px-3 py-2">Orders</th>
                        <th className="px-3 py-2">Units ordered</th>
                        <th className="px-3 py-2">Units received</th>
                        <th className="px-3 py-2">Fulfillment</th>
                        <th className="px-3 py-2">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPerformance.map((row) => (
                        <tr key={row.supplier} className="border-t border-border/70 hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 text-xs font-semibold text-foreground">{row.supplier}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.orderCount}</td>
                          <td className="px-3 py-2 text-xs tabular-nums text-foreground">{row.qtyOrdered.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs tabular-nums text-foreground">{row.qtyFulfilled.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs font-semibold text-primary">
                            {row.fulfillmentRate === null ? "—" : row.fulfillmentRate.toFixed(1) + "%"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.openOrders}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  total={performance.length}
                  page={perfPage}
                  pageSize={PERF_PAGE_SIZE}
                  onPage={setPerfPage}
                  alwaysShow
                />
              </div>
            )}
          </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* New purchase order dialog                                               */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && createPortal(
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 st-overlay-in"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving && !reviewingOrder) setShowCreateModal(false);
          }}
        >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-create-title"
          className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6 st-modal-in"
        >
        <form onSubmit={createOrder} className="space-y-5">
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Truck size={17} />
              </span>
              <div>
                <h2 id="purchase-create-title" className="text-base font-bold text-foreground">Create supplier order</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose a supplier, then add the products you want to order.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSupplierSetup((open) => !open);
                setError("");
              }}
              aria-expanded={showSupplierSetup}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              {showSupplierSetup ? <X size={13} /> : <Plus size={13} />}
              {showSupplierSetup ? "Close supplier setup" : "Add supplier"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/80 bg-muted/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="purchase-supplier">
              Supplier
              <select
                id="purchase-supplier"
                className={inputClass + " app-select mt-1.5"}
                value={supplier}
                onChange={(event) => {
                  setSupplier(event.target.value);
                  setDraftLines([]);
                  setProductId("");
                }}
              >
                <option value="">Select supplier</option>
                {suppliers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Order date
              <input
                className={inputClass + " mt-1.5"}
                type="date"
                value={orderedAt}
                onChange={(event) => setOrderedAt(event.target.value)}
                required
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Expected delivery (optional)
              <input
                className={inputClass + " mt-1.5"}
                type="date"
                value={expectedDate}
                onChange={(event) => setExpectedDate(event.target.value)}
              />
            </label>
          </div>

          {showSupplierSetup && (
            <div
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3 space-y-2.5"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">Add a supplier and link a product</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Enter the supplier name, then choose a product you buy from them. The product will be available under
                  this supplier for future orders.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
                <label className="text-xs font-medium text-muted-foreground">
                  Supplier name
                  <input
                    className={inputClass + " mt-1.5"}
                    value={supplierNameDraft}
                    onChange={(event) => setSupplierNameDraft(event.target.value)}
                    maxLength={120}
                    placeholder="e.g. MedLine Distributors"
                    required
                  />
                </label>
                <label className="text-xs font-medium text-muted-foreground">
                  Product to link
                  <select
                    className={inputClass + " app-select mt-1.5"}
                    value={supplierProductId}
                    onChange={(event) => setSupplierProductId(event.target.value)}
                    required
                  >
                    <option value="">Choose a product</option>
                    {inventory.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · current supplier: {product.supplier || "none"}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void saveSupplierLink()}
                  disabled={saving || !inventory.length}
                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save supplier"}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 items-end sm:grid-cols-[minmax(0,1fr)_160px_auto]">
            <label className="text-xs font-medium text-muted-foreground">
              Product
              <select
                className={inputClass + " app-select mt-1.5"}
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                disabled={!supplier}
              >
                <option value="">{supplier ? "Select a product" : "Select a supplier first"}</option>
                {supplierProducts
                  .filter((product) => !draftLines.some((line) => line.productId === product.id))
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Quantity ordered
              <input
                className={inputClass + " mt-1.5"}
                type="number"
                min="1"
                step="1"
                value={qtyOrdered}
                onChange={(event) => setQtyOrdered(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={addDraftLine}
              disabled={!supplier}
              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Plus size={13} /> Add item
            </button>
          </div>

          {draftLines.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border">
              {draftLines.map((line) => (
                <div key={line.productId} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-foreground">{line.productName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{line.qtyOrdered.toLocaleString()} ordered</span>
                    <button
                      type="button"
                      aria-label={"Remove " + line.productName}
                      onClick={() =>
                        setDraftLines((lines) => lines.filter((entry) => entry.productId !== line.productId))
                      }
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            {suppliers.length === 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">Add supplier names to products before creating an order.</p>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || draftLines.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all st-btn"
              >
                <PackageCheck size={14} /> Review order
              </button>
            </div>
          </div>
        </form>
        </section>
        </div>,
        document.body,
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Review-order modal                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {reviewingOrder && createPortal(
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 p-4 st-overlay-in"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setReviewingOrder(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-review-title"
            className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl st-modal-in"
          >
            <h2 id="purchase-review-title" className="text-base font-bold text-foreground">
              Review supplier order
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Check the supplier and quantities before saving.</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <dt className="text-muted-foreground">Supplier</dt>
              <dd className="text-right font-semibold text-foreground">{supplier}</dd>
              <dt className="text-muted-foreground">Order date</dt>
              <dd className="text-right text-foreground">{orderedAt}</dd>
              {expectedDate && (
                <>
                  <dt className="text-muted-foreground">Expected delivery</dt>
                  <dd className="text-right text-foreground">{expectedDate}</dd>
                </>
              )}
            </dl>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
              {draftLines.map((line) => (
                <div key={line.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="text-foreground">{line.productName}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {line.qtyOrdered.toLocaleString()} ordered
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-200">
              Inventory changes only when you record a delivery. You can edit or cancel this order until a delivery is
              received.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewingOrder(false)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Back to edit
              </button>
              <button
                type="button"
                onClick={() => void confirmCreateOrder()}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Confirm and save"}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Receive-delivery modal                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {receivingOrder && createPortal(
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 p-4 st-overlay-in"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReceivingOrder(null);
          }}
        >
          <form
            onSubmit={recordDelivery}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl st-modal-in"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Record delivery · PO-{receivingOrder.id}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {receivingOrder.supplier} · Enter quantities received in this delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingOrder(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={17} />
              </button>
            </div>
            <label className="block mt-4 text-xs font-medium text-muted-foreground">
              Delivery date
              <input
                className={inputClass + " mt-1.5"}
                type="date"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
                required
              />
            </label>
            <div className="mt-4 space-y-3">
              {receivingOrder.items
                .filter((item) => item.qtyRemaining > 0)
                .map((item) => {
                  const draft = receiveDrafts[item.id] ?? { qty: "", expiry: "", cost: "" };
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      <div className="flex justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{item.productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.qtyRemaining.toLocaleString()} remaining
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Received now
                          <input
                            className={inputClass + " mt-1"}
                            type="number"
                            min="0"
                            max={item.qtyRemaining}
                            step="1"
                            value={draft.qty}
                            onChange={(event) =>
                              setReceiveDrafts((current) => ({
                                ...current,
                                [item.id]: { ...draft, qty: event.target.value },
                              }))
                            }
                            placeholder="0"
                          />
                        </label>
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Batch expiry (optional)
                          <input
                            className={inputClass + " mt-1"}
                            type="date"
                            value={draft.expiry}
                            onChange={(event) =>
                              setReceiveDrafts((current) => ({
                                ...current,
                                [item.id]: { ...draft, expiry: event.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Total batch cost (optional)
                          <input
                            className={inputClass + " mt-1"}
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.cost}
                            onChange={(event) =>
                              setReceiveDrafts((current) => ({
                                ...current,
                                [item.id]: { ...draft, cost: event.target.value },
                              }))
                            }
                            placeholder="₱"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-xs text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setReceivingOrder(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving ? "Saving…" : "Save delivery"}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Edit-order modal                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {editingOrder && createPortal(
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 p-4 st-overlay-in"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setEditingOrder(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void confirmEditOrder();
            }}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl st-modal-in"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Edit purchase order · PO-{editingOrder.id}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Update the supplier, dates, or ordered quantities.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={17} />
              </button>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="edit-supplier">
                Supplier
                <select
                  id="edit-supplier"
                  className={inputClass + " app-select mt-1.5"}
                  value={editSupplier}
                  onChange={(event) => {
                    setEditSupplier(event.target.value);
                    setEditDraftLines([]);
                    setEditProductId("");
                  }}
                >
                  <option value="">Select supplier</option>
                  {editSupplierOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Order date
                <input
                  className={inputClass + " mt-1.5"}
                  type="date"
                  value={editOrderedAt}
                  onChange={(event) => setEditOrderedAt(event.target.value)}
                  required
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Expected delivery (optional)
                <input
                  className={inputClass + " mt-1.5"}
                  type="date"
                  value={editExpectedDate}
                  onChange={(event) => setEditExpectedDate(event.target.value)}
                />
              </label>
            </div>

            {/* Product picker */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2.5 items-end mt-3">
              <label className="text-xs font-medium text-muted-foreground">
                Product
                <select
                  className={inputClass + " app-select mt-1.5"}
                  value={editProductId}
                  onChange={(event) => setEditProductId(event.target.value)}
                  disabled={!editSupplier}
                >
                  <option value="">{editSupplier ? "Select a product" : "Select a supplier first"}</option>
                  {editSupplierProducts
                    .filter((product) => !editDraftLines.some((line) => line.productId === product.id))
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Quantity ordered
                <input
                  className={inputClass + " mt-1.5"}
                  type="number"
                  min="1"
                  step="1"
                  value={editQtyOrdered}
                  onChange={(event) => setEditQtyOrdered(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={editAddDraftLine}
                disabled={!editSupplier}
                className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Plus size={13} /> Add item
              </button>
            </div>

            {/* Draft lines with inline qty editing */}
            {editDraftLines.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border mt-3">
                {editDraftLines.map((line) => (
                  <div key={line.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="text-foreground">{line.productName}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.qtyOrdered}
                        onChange={(event) =>
                          setEditDraftLines((lines) =>
                            lines.map((l) =>
                              l.productId === line.productId
                                ? { ...l, qtyOrdered: event.target.value === "" ? 0 : Number(event.target.value) }
                                : l
                            )
                          )
                        }
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                      />
                      <span className="text-muted-foreground">ordered</span>
                      <button
                        type="button"
                        aria-label={"Remove " + line.productName}
                        onClick={() =>
                          setEditDraftLines((lines) => lines.filter((l) => l.productId !== line.productId))
                        }
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p role="alert" className="mt-3 text-xs text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || editDraftLines.length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Cancel-order confirmation                                                */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {cancellingOrder && createPortal(
        <ConfirmDialog
          title="Cancel purchase order?"
          message={<>PO-{cancellingOrder.id} · <span className="font-semibold text-foreground">{cancellingOrder.supplier}</span>. This marks the order as cancelled and cannot be undone.</>}
          confirmLabel={saving ? "Cancelling…" : "Cancel order"}
          cancelLabel="Keep order"
          variant="danger"
          onConfirm={() => void confirmCancelOrder()}
          onCancel={() => setCancellingOrder(null)}
        />,
        document.body,
      )}
    </div>
  );
}
