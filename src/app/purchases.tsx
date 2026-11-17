import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, CalendarDays, ChevronDown, ChevronUp, PackageCheck, Pencil, Plus, RefreshCw, Search, Truck, X } from "lucide-react";
import { clearApiCache, productsApi, purchaseOrdersApi, type PurchaseOrder, type SupplierPerformance } from "./api";
import { hasUserRole, type Product } from "./data";
import { InfoTip, TablePager, ConfirmDialog, SegmentedTabs } from "./shared";

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

function PurchaseOrdersPage({
  inventory,
  onInventoryChanged,
  userRoles,
}: {
  inventory: Product[];
  onInventoryChanged: () => void;
  userRoles: string[];
}) {
  const [orders, setOrders] = useState<PurchaseOrder[]>(() => purchaseOrdersApi.peekList() ?? []);
  const [performance, setPerformance] = useState<SupplierPerformance[]>(() => purchaseOrdersApi.peekPerformance() ?? []);
  const [loading, setLoading] = useState(() => !(purchaseOrdersApi.peekList() && purchaseOrdersApi.peekPerformance()));
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

  // ── View tab, Filter & Pagination ────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<"orders" | "fulfillment">(() => {
    try {
      const saved = localStorage.getItem("smarttrack_purchases_section");
      if (saved === "orders" || saved === "fulfillment") return saved;
    } catch { /* ignore */ }
    return "orders";
  });
  useEffect(() => {
    try { localStorage.setItem("smarttrack_purchases_section", activeSection); } catch { /* ignore */ }
  }, [activeSection]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | "open" | "received" | "cancelled">("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<number, boolean>>({});
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PAGE_SIZE = 25;

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

  const handleManualRefresh = useCallback(async () => {
    clearApiCache();
    setLoading(true);
    await load();
  }, [load]);

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

  // ── KPI values & filtered orders ───────────────────────────────────────────
  const { totalOpen, receivedCount, cancelledCount, overallRate } = useMemo(() => {
    let open = 0;
    let receivedOrders = 0;
    let cancelledOrders = 0;
    for (const o of orders) {
      if (o.status === "received") receivedOrders++;
      else if (o.status === "cancelled") cancelledOrders++;
      else open++;
    }
    const ordered = performance.reduce((sum, row) => sum + row.qtyOrdered, 0);
    const received = performance.reduce((sum, row) => sum + row.qtyFulfilled, 0);
    const rate = ordered > 0 ? (received / ordered) * 100 : null;
    return {
      totalOpen: open,
      receivedCount: receivedOrders,
      cancelledCount: cancelledOrders,
      overallRate: rate,
    };
  }, [orders, performance]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((order) => {
      if (orderStatusFilter === "open" && (order.status === "received" || order.status === "cancelled")) return false;
      if (orderStatusFilter === "received" && order.status !== "received") return false;
      if (orderStatusFilter === "cancelled" && order.status !== "cancelled") return false;
      if (!q) return true;
      return (
        `po-${order.id}`.includes(q) ||
        order.supplier.toLowerCase().includes(q) ||
        order.items.some((item) => item.productName.toLowerCase().includes(q))
      );
    });
  }, [orders, orderStatusFilter, orderSearch]);

  useEffect(() => {
    setOrdersPage(1);
  }, [orderStatusFilter, orderSearch]);

  const paginatedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ORDERS_PAGE_SIZE;
    return filteredOrders.slice(start, start + ORDERS_PAGE_SIZE);
  }, [filteredOrders, ordersPage]);

  // ── ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: "calc(100dvh - 56px)" }}>
      {/* Fixed Header + View Switcher */}
      <div className="flex-shrink-0 st-shell-px pt-4 sm:pt-5 pb-0 bg-background border-b border-border/60 z-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <Truck size={19} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground truncate">Supplier Orders</h1>
                <InfoTip
                  title="Supplier Orders & Fulfillment"
                  lines={[
                    "Create supplier purchase orders and reconcile incoming deliveries.",
                    { label: "Purchase Orders", value: "Log incoming orders before arrival without inflating active stock" },
                    { label: "Record Delivery", value: "Receive items into inventory batches with expiry and unit cost" },
                    { label: "Edit / Cancel", value: "Available until the first delivery is recorded" },
                    { label: "Fulfillment Rate", value: "Received quantity divided by ordered quantity per supplier" },
                  ]}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track supplier orders, record deliveries, and monitor fulfillment.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canModify && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-[opacity,background-color]"
              >
                <Plus size={14} /> New Order
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        <SegmentedTabs<"orders" | "fulfillment">
          variant="underline"
          ariaLabel="Supplier order sections"
          value={activeSection}
          onChange={setActiveSection}
          className="mt-3.5"
          items={[
            {
              id: "orders",
              label: "Purchase orders",
              icon: <CalendarDays size={14} />,
              badge: (
                <span className="text-xs tabular-nums text-muted-foreground">{orders.length}</span>
              ),
            },
            {
              id: "fulfillment",
              label: "Supplier fulfillment",
              icon: <PackageCheck size={14} />,
              badge: (
                <span className="text-xs tabular-nums text-muted-foreground">{performance.length}</span>
              ),
            },
          ]}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Fixed Chrome — ONLY the inner list/table scrolls                        */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col st-shell-px py-4 gap-3.5 overflow-hidden">
        {/* Banners */}
        {error && (
          <div role="alert" className="flex-shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="flex-shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200">
            {notice}
          </div>
        )}

        {/* Fixed KPI cards */}
        <div className="flex-shrink-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Suppliers tracked</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{performance.length}</p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Open orders</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{totalOpen}</p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Overall fulfillment</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-primary">
              {overallRate === null ? "—" : overallRate.toFixed(1) + "%"}
            </p>
          </div>
        </div>

        {/* Purchase orders (list-only scroll) */}
        {activeSection === "orders" && (
          <section className="flex-1 min-h-0 flex flex-col rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
            <div className="flex-shrink-0 px-4 py-3 border-b border-border/80 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays size={15} className="text-primary shrink-0" />
                <h2 className="text-sm font-bold text-foreground">Purchase orders</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {filteredOrders.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <SegmentedTabs<"all" | "open" | "received" | "cancelled">
                  ariaLabel="Filter purchase orders"
                  value={orderStatusFilter}
                  onChange={setOrderStatusFilter}
                  size="sm"
                  items={[
                    { id: "all", label: `All (${orders.length})` },
                    { id: "open", label: `Open (${totalOpen})` },
                    { id: "received", label: `Received (${receivedCount})` },
                    { id: "cancelled", label: `Cancelled (${cancelledCount})` },
                  ]}
                />
                <label className="relative block w-full sm:w-56">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search PO, supplier, item..."
                    aria-label="Search purchase orders"
                    className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </label>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3" data-table-scroll="fixed">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-b-0">
                    <div className="space-y-1">
                      <div className="yt-shimmer-box h-4 w-32 rounded-md" />
                      <div className="yt-shimmer-box h-3 w-48 rounded-md" />
                    </div>
                    <div className="yt-shimmer-box h-6 w-20 rounded-full" />
                    <div className="yt-shimmer-box h-8 w-24 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-sm text-muted-foreground text-center">No purchase orders recorded yet.</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-sm text-muted-foreground text-center">No purchase orders match your filter.</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/70" data-table-scroll="fixed">
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
                    const isExpanded = Boolean(expandedOrderIds[order.id]);
                    const visibleItems = isExpanded ? order.items : order.items.slice(0, 3);
                    const hiddenCount = Math.max(0, order.items.length - 3);
                    return (
                      <div
                        key={order.id}
                        className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between hover:bg-muted/15 transition-colors"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              PO-{order.id} · {order.supplier}
                            </p>
                            <span
                              className={
                                "rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase whitespace-nowrap " +
                                statusClass
                              }
                            >
                              {statusLabel(order.status)}
                            </span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {order.items.length} item{order.items.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Ordered {order.orderedAt}
                            {order.expectedDeliveryDate ? " · Expected " + order.expectedDeliveryDate : ""}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {visibleItems.map((item) => {
                              const done = item.qtyReceived >= item.qtyOrdered && item.qtyOrdered > 0;
                              return (
                                <span
                                  key={`${order.id}-${item.id}`}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] ${
                                    done
                                      ? "border-emerald-500/20 bg-emerald-500/5 text-foreground"
                                      : "border-border/70 bg-muted/35 text-muted-foreground"
                                  }`}
                                >
                                  <span className="max-w-[180px] truncate font-medium text-foreground">{item.productName}</span>
                                  <span className="tabular-nums text-[10px] text-muted-foreground">
                                    {item.qtyReceived.toLocaleString()}/{item.qtyOrdered.toLocaleString()}
                                  </span>
                                </span>
                              );
                            })}
                            {hiddenCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedOrderIds((prev) => ({ ...prev, [order.id]: !prev[order.id] }))
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                              >
                                {isExpanded ? (
                                  <>
                                    Show less <ChevronUp size={11} />
                                  </>
                                ) : (
                                  <>
                                    +{hiddenCount} more <ChevronDown size={11} />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                          {!isCancelled && (
                            <div className="text-left sm:text-right shrink-0 whitespace-nowrap tabular-nums min-w-[96px]">
                              <p className="text-xs font-semibold text-foreground">{rate.toFixed(1)}% received</p>
                              <p className="text-[11px] text-muted-foreground">
                                {received.toLocaleString()} / {ordered.toLocaleString()}
                              </p>
                            </div>
                          )}
                          {!isCancelled && order.status !== "received" && canModify && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {order.status === "ordered" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => beginEdit(order)}
                                    className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                                  >
                                    <Pencil size={13} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCancellingOrder(order)}
                                    className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-red-300/60 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                  >
                                    <Ban size={13} /> Cancel
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => beginReceiving(order)}
                                className="inline-flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-[opacity,background-color]"
                              >
                                Record delivery
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex-shrink-0">
                  <TablePager
                    total={filteredOrders.length}
                    page={ordersPage}
                    pageSize={ORDERS_PAGE_SIZE}
                    onPage={setOrdersPage}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* Supplier fulfillment (table-only scroll) */}
        {activeSection === "fulfillment" && (
          <section className="flex-1 min-h-0 flex flex-col rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
            <div className="flex-shrink-0 px-4 py-3 border-b border-border/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">Supplier fulfillment</h2>
                <InfoTip
                  title="Supplier Fulfillment Rate"
                  lines={[
                    "Measures received quantity against ordered quantity across purchase orders.",
                    { label: "Focus", value: "Tracks order completeness, not delivery speed" },
                    { label: "Coverage", value: "Applies to SmartTrack purchase orders only (excludes legacy batches)" },
                    { label: "Rate formula", value: "Total units received ÷ total units ordered" },
                  ]}
                />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {performance.length} supplier{performance.length === 1 ? "" : "s"}
              </span>
            </div>
            {performance.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-sm text-muted-foreground text-center">No purchase order history yet.</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto" data-table-scroll="fixed">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/70 bg-muted/30">
                      <th className="px-4 py-2.5">Supplier</th>
                      <th className="px-4 py-2.5 text-right">Orders</th>
                      <th className="px-4 py-2.5 text-right">Units ordered</th>
                      <th className="px-4 py-2.5 text-right">Units received</th>
                      <th className="px-4 py-2.5">Fulfillment</th>
                      <th className="px-4 py-2.5 text-right">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {performance.map((row) => {
                      const ratePct = row.fulfillmentRate ?? 0;
                      return (
                        <tr key={row.supplier} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-xs font-semibold text-foreground whitespace-nowrap">{row.supplier}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground text-right tabular-nums">{row.orderCount}</td>
                          <td className="px-4 py-3 text-xs tabular-nums text-foreground text-right">{row.qtyOrdered.toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs tabular-nums text-foreground text-right">{row.qtyFulfilled.toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs">
                            {row.fulfillmentRate === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="flex items-center gap-2 min-w-[110px]">
                                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden shrink-0">
                                  <div
                                    className={`h-full rounded-full ${ratePct >= 95 ? "bg-emerald-500" : ratePct > 0 ? "bg-primary" : "bg-muted-foreground/30"}`}
                                    style={{ width: `${Math.min(100, Math.max(0, ratePct))}%` }}
                                  />
                                </div>
                                <span className={`font-semibold tabular-nums ${ratePct >= 95 ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`}>
                                  {row.fulfillmentRate.toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-right tabular-nums">
                            {row.openOrders > 0 ? (
                              <span className="inline-flex items-center justify-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                {row.openOrders}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
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
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-[opacity,background-color] st-btn"
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
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-[opacity,background-color]"
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

export default memo(PurchaseOrdersPage);
