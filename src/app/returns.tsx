import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Minus,
  PackageCheck,
  PackageX,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  User as UserIcon,
  X,
} from "lucide-react";
import { returnRequestsApi, type ReturnRequest } from "./api";
import { hasUserRole, type AuthUser, type Product } from "./data";
import {
  ConfirmDialog,
  InfoTip,
  ProductSearchWidget,
  SegmentedTabs,
  TablePager,
  fmt,
} from "./shared";

const PAGE_SIZE = 20;

const QUICK_BROKEN_REASONS = [
  "Accidentally dropped",
  "Broken bottle / vial",
  "Crushed packaging",
  "Damaged seal / contaminated",
] as const;

function formatPackSummary(qty: number, saleUnit: "unit" | "pack", unitsPerSale: number): string | null {
  if (saleUnit !== "pack" || unitsPerSale <= 1) return null;
  const packs = Math.floor(qty / unitsPerSale);
  const loose = qty % unitsPerSale;
  return `${packs} pack${packs !== 1 ? "s" : ""}${loose > 0 ? ` + ${loose} loose` : ""} · ${unitsPerSale}/pk`;
}

// ─── Broken Product Modal ─────────────────────────────────────────────────────
function BrokenProductModal({
  inventory,
  onClose,
  onSubmit,
}: {
  inventory: Product[];
  onClose: () => void;
  onSubmit: (
    productId: string,
    qty: number,
    reason: string,
    saleQty: number,
    saleUnit: "unit" | "pack",
    unitsPerSale: number
  ) => Promise<void>;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [saleUnit, setSaleUnit] = useState<"unit" | "pack">("unit");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmBroken, setConfirmBroken] = useState(false);
  const [error, setError] = useState("");

  const qtyNum = parseInt(qty, 10) || 0;
  const unitsPerPack = selectedProduct?.unitsPerPack ?? 1;
  const baseQty = saleUnit === "pack" ? qtyNum * unitsPerPack : qtyNum;
  const maxQty = selectedProduct?.stock ?? 0;
  const maxSelectableQty =
    saleUnit === "pack" && unitsPerPack > 1 ? Math.floor(maxQty / unitsPerPack) : maxQty;
  const unitLabel = selectedProduct?.unitLabel ?? "unit";

  // Reset unit mode when product changes
  const handleSelect = (p: Product | null) => {
    setSelectedProduct(p);
    setSaleUnit("unit");
    setQty("1");
    setError("");
  };

  const adjustQty = (delta: number) => {
    const next = Math.max(1, qtyNum + delta);
    if (selectedProduct && maxSelectableQty > 0) {
      setQty(String(Math.min(next, maxSelectableQty)));
    } else {
      setQty(String(next));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || baseQty > maxQty || !reason.trim() || submitting) return;
    setConfirmBroken(true);
  };

  const doSubmitBroken = async () => {
    if (!selectedProduct || qtyNum <= 0 || baseQty > maxQty || !reason.trim() || submitting) return;
    setConfirmBroken(false);
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(
        selectedProduct.id,
        baseQty,
        reason.trim(),
        qtyNum,
        saleUnit,
        saleUnit === "pack" ? unitsPerPack : 1
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record broken product.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 st-overlay-in"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/80 bg-card shadow-2xl flex flex-col max-h-[90vh] overflow-hidden st-modal-in">
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3.5 border-b border-border/60 shrink-0 bg-card/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
              <ShieldAlert size={17} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">Add Broken Product</h2>
              <p className="text-[11px] text-muted-foreground">Deduct damaged or unsellable stock</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" data-table-scroll="fixed">
            {/* Product search */}
            <ProductSearchWidget
              inventory={inventory}
              onSelect={handleSelect}
              selectedProduct={selectedProduct}
            />

            {/* Unit / Pack segmented control — visible once product is selected */}
            {selectedProduct && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Damaged By
                  </label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    Available: <strong className="text-foreground">{maxQty.toLocaleString()}</strong> {unitLabel}s
                  </span>
                </div>
                <SegmentedTabs<"unit" | "pack">
                  fullWidth
                  ariaLabel="Damaged by unit or pack"
                  value={saleUnit}
                  onChange={mode => { setSaleUnit(mode); setQty("1"); }}
                  items={[
                    { id: "unit", label: `1 ${unitLabel}` },
                    {
                      id: "pack",
                      label: unitsPerPack > 1 ? `1 pack (${unitsPerPack} ${unitLabel}s)` : "No pack option",
                      disabled: unitsPerPack <= 1,
                    },
                  ]}
                />
              </div>
            )}

            {/* Quantity with stepper */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {saleUnit === "pack" ? "Packs Broken" : "Units Broken"} <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustQty(-1)}
                  disabled={qtyNum <= 1}
                  aria-label="Decrease quantity"
                  className="h-9 w-9 rounded-xl border border-border/80 bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 transition-colors shrink-0"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  placeholder="Enter quantity"
                  className="w-full h-9 rounded-xl border border-border/80 bg-background px-3 text-center text-sm font-semibold tabular-nums text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
                />
                <button
                  type="button"
                  onClick={() => adjustQty(1)}
                  disabled={selectedProduct ? qtyNum >= Math.max(1, maxSelectableQty) : false}
                  aria-label="Increase quantity"
                  className="h-9 w-9 rounded-xl border border-border/80 bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 transition-colors shrink-0"
                >
                  <Plus size={14} />
                </button>
              </div>

              {selectedProduct && saleUnit === "pack" && qtyNum > 0 && unitsPerPack > 1 && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Equals <span className="font-semibold text-foreground">{baseQty} {unitLabel}s</span> ({qtyNum} pack{qtyNum !== 1 ? "s" : ""} × {unitsPerPack})
                </p>
              )}
              {selectedProduct && baseQty > maxQty && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  Exceeds available stock ({maxQty} {unitLabel}s
                  {unitsPerPack > 1 ? ` / ${Math.floor(maxQty / unitsPerPack)} packs` : ""})
                </p>
              )}
            </div>

            {/* Reason + quick chips */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Damage Reason <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_BROKEN_REASONS.map(preset => {
                  const isChosen = reason.trim() === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReason(preset)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isChosen
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                required
                placeholder="Describe what happened (e.g. bottle slipped during restocking…)"
                className="w-full resize-none rounded-xl border border-border/80 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/75 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
              />
            </div>

            {/* Stock impact */}
            {selectedProduct && qtyNum > 0 && baseQty <= maxQty && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs space-y-1.5">
                <p className="font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide text-[10px]">
                  Inventory Write-Off Preview
                </p>
                <div className="flex justify-between text-muted-foreground">
                  <span>Current stock</span>
                  <span className="font-semibold tabular-nums text-foreground">{maxQty.toLocaleString()} {unitLabel}s</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Deducting</span>
                  <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                    −{baseQty.toLocaleString()} {unitLabel}s
                    {saleUnit === "pack" && unitsPerPack > 1 && ` (${qtyNum} pack${qtyNum !== 1 ? "s" : ""})`}
                  </span>
                </div>
                <div className="flex justify-between border-t border-red-500/20 pt-1.5 text-muted-foreground">
                  <span>Remaining stock</span>
                  <span className="font-bold tabular-nums text-red-600 dark:text-red-400">
                    {(maxQty - baseQty).toLocaleString()} {unitLabel}s
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer — fixed */}
          <div className="flex gap-2.5 px-5 py-3.5 border-t border-border/60 shrink-0 bg-muted/20">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-full border border-border/80 bg-background py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedProduct || qtyNum <= 0 || baseQty > maxQty || !reason.trim() || submitting}
              className="flex-1 rounded-full bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting ? "Recording…" : "Record Broken"}
            </button>
          </div>
        </form>
      </div>
      {confirmBroken && selectedProduct && (
        <ConfirmDialog
          title="Record Broken Stock?"
          message={
            <>
              Permanently deduct{" "}
              <span className="font-semibold text-foreground">
                {baseQty} {unitLabel}{baseQty === 1 ? "" : "s"}
              </span>{" "}
              of <span className="font-semibold text-foreground">{selectedProduct.name}</span> from inventory?
            </>
          }
          confirmLabel="Yes, Record Broken"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => void doSubmitBroken()}
          onCancel={() => setConfirmBroken(false)}
        />
      )}
    </div>
  );
}

// ─── Returns Page ─────────────────────────────────────────────────────────────
function ReturnsPage({
  user,
  inventory,
  onDispositionComplete,
}: {
  user: AuthUser;
  inventory: Product[];
  onDispositionComplete: () => Promise<void>;
}) {
  const [returns, setReturns] = useState<ReturnRequest[]>(() => returnRequestsApi.peekList() ?? []);
  const [loading, setLoading] = useState(() => !returnRequestsApi.peekList());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processingReturnId, setProcessingReturnId] = useState<string | null>(null);
  const [confirmDisposition, setConfirmDisposition] = useState<{
    request: ReturnRequest;
    disposition: "restocked" | "broken";
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"returns" | "broken">(() => {
    try {
      const saved = localStorage.getItem("smarttrack_returns_tab");
      if (saved === "returns" || saved === "broken") return saved;
    } catch { /* ignore */ }
    return "returns";
  });
  useEffect(() => {
    try { localStorage.setItem("smarttrack_returns_tab", activeTab); } catch { /* ignore */ }
  }, [activeTab]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "restocked" | "broken">("all");
  const [brokenSort, setBrokenSort] = useState<"newest" | "qty">("newest");
  const [page, setPage] = useState(1);
  const [showBrokenModal, setShowBrokenModal] = useState(false);

  const canProcess = hasUserRole(user, "inventory_manager");
  const canReportBroken =
    hasUserRole(user, "inventory_manager") ||
    hasUserRole(user, "cashier");

  const loadReturns = useCallback(async () => {
    if (!returnRequestsApi.peekList()) setLoading(true);
    setError("");
    try {
      setReturns(await returnRequestsApi.list());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load returns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReturns(); }, [loadReturns]);

  const processReturn = async (request: ReturnRequest, disposition: "restocked" | "broken") => {
    setProcessingReturnId(request.returnTxId);
    setError("");
    setNotice("");
    try {
      await returnRequestsApi.setDisposition(request.returnTxId, disposition);
      await loadReturns();
      await onDispositionComplete();
      const unitWord = request.qty === 1 ? "unit" : "units";
      setNotice(
        disposition === "restocked"
          ? `Restocked ${request.qty} ${unitWord} of ${request.product} back into sellable stock.`
          : `Marked ${request.qty} ${unitWord} of ${request.product} as broken.`
      );
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Unable to process this return.");
    } finally {
      setProcessingReturnId(null);
    }
  };

  const handleReportBroken = async (
    productId: string,
    qty: number,
    reason: string,
    saleQty: number,
    saleUnit: "unit" | "pack",
    unitsPerSale: number
  ) => {
    setNotice("");
    await returnRequestsApi.reportBroken({
      product_id: productId,
      qty,
      reason,
      sale_qty: saleQty,
      sale_unit: saleUnit,
      units_per_sale: unitsPerSale,
    });
    const matched = inventory.find(p => p.id === productId);
    await loadReturns();
    await onDispositionComplete();
    setActiveTab("broken");
    setPage(1);
    setNotice(
      `Recorded ${qty} unit${qty === 1 ? "" : "s"}${matched ? ` of ${matched.name}` : ""} as broken stock.`
    );
  };

  // Separate customer return requests from direct broken write-offs
  const customerReturns = useMemo(() => returns.filter(r => r.returnType === "return"), [returns]);
  const brokenRecords = useMemo(() => returns.filter(r => r.returnType === "adjustment"), [returns]);

  const pendingReturns = useMemo(
    () => customerReturns.filter(r => r.disposition === "pending"),
    [customerReturns]
  );
  const restockedReturns = useMemo(
    () => customerReturns.filter(r => r.disposition === "restocked"),
    [customerReturns]
  );
  const brokenReturnsCount = useMemo(
    () => customerReturns.filter(r => r.disposition === "broken").length,
    [customerReturns]
  );

  const pendingCount = pendingReturns.length;
  const pendingRefundTotal = useMemo(
    () => pendingReturns.reduce((sum, r) => sum + (Number(r.refund) || 0), 0),
    [pendingReturns]
  );
  const totalRefundedAmount = useMemo(
    () => customerReturns.reduce((sum, r) => sum + (Number(r.refund) || 0), 0),
    [customerReturns]
  );
  const totalBrokenUnits = useMemo(
    () => brokenRecords.reduce((sum, r) => sum + (Number(r.qty) || 0), 0),
    [brokenRecords]
  );

  const activeSourceList = activeTab === "returns" ? customerReturns : brokenRecords;

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = activeSourceList.filter(req => {
      if (activeTab === "returns" && statusFilter !== "all" && req.disposition !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        req.product.toLowerCase().includes(q) ||
        req.returnTxId.toLowerCase().includes(q) ||
        req.saleTxId.toLowerCase().includes(q) ||
        req.cashier.toLowerCase().includes(q) ||
        req.reason.toLowerCase().includes(q)
      );
    });
    if (activeTab === "broken" && brokenSort === "qty") {
      return [...list].sort((a, b) => b.qty - a.qty);
    }
    return list;
  }, [activeSourceList, activeTab, statusFilter, search, brokenSort]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedList = useMemo(
    () => filteredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredList, safePage]
  );

  const hasFilters = Boolean(search.trim()) || (activeTab === "returns" && statusFilter !== "all");
  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const statusMeta: Record<
    ReturnRequest["disposition"],
    { label: string; dot: string; pill: string }
  > = {
    pending: {
      label: "Pending Review",
      dot: "bg-amber-500",
      pill: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    restocked: {
      label: "Restocked",
      dot: "bg-emerald-500",
      pill: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    broken: {
      label: "Marked Broken",
      dot: "bg-red-500",
      pill: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
    },
  };

  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{ height: "calc(100dvh - 56px)" }}
    >
      {showBrokenModal && (
        <BrokenProductModal
          inventory={inventory}
          onClose={() => setShowBrokenModal(false)}
          onSubmit={handleReportBroken}
        />
      )}

      {/* ── Fixed top content: header + segmented tabs + banners + filter bar ── */}
      <div className="flex-shrink-0 st-shell-px pt-4 sm:pt-6 pb-3.5 bg-background border-b border-border/60 z-20 space-y-3.5">
        {/* Header row */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border shrink-0 transition-colors ${
                activeTab === "returns"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {activeTab === "returns" ? <RotateCcw size={20} /> : <PackageX size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Returns &amp; Broken
                </h1>
                <InfoTip
                  title="Returns & Broken Stock"
                  lines={[
                    canProcess
                      ? "Inspect returned products to restore sellable items or log damaged write-offs."
                      : "Track customer returns and recorded damaged inventory.",
                    { label: "Pending Review", value: "Returned items awaiting physical quality inspection" },
                    { label: "Restock", value: "Sealed, intact items returned to active stock" },
                    { label: "Broken", value: "Damaged or unsellable items permanently written off" },
                  ]}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {pendingCount} awaiting inspection · {restockedReturns.length} restocked · {brokenRecords.length} broken record{brokenRecords.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadReturns()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            {canReportBroken && (
              <button
                type="button"
                onClick={() => setShowBrokenModal(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors st-btn"
              >
                <Plus size={14} /> Add Broken Product
              </button>
            )}
          </div>
        </header>

        {/* Segmented switcher + compact queue summary */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SegmentedTabs<"returns" | "broken">
            ariaLabel="Returns and broken views"
            value={activeTab}
            onChange={id => { setActiveTab(id); setPage(1); }}
            buttonClassName="px-3.5 py-1.5 gap-2"
            items={([
              {
                id: "returns",
                label: "Customer Returns",
                count: customerReturns.length,
                badgeUrgent: pendingCount > 0,
                urgentCount: pendingCount,
                icon: RotateCcw,
              },
              {
                id: "broken",
                label: "Broken Products",
                count: brokenRecords.length,
                badgeUrgent: false,
                urgentCount: 0,
                icon: PackageX,
              },
            ] as const).map(({ id, label, count, badgeUrgent, urgentCount, icon: Icon }) => ({
              id,
              label,
              icon: <Icon size={13} />,
              badge: badgeUrgent ? (
                <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                  {urgentCount} pending
                </span>
              ) : (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                    activeTab === id
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              ),
            }))}
          />

          {/* Inline compact queue KPIs */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {activeTab === "returns" ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3 py-1 text-muted-foreground tabular-nums">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Pending refund:{" "}
                  <strong className="font-semibold text-foreground">{fmt(pendingRefundTotal)}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3 py-1 text-muted-foreground tabular-nums">
                  Total refunds:{" "}
                  <strong className="font-semibold text-foreground">{fmt(totalRefundedAmount)}</strong>
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3 py-1 text-muted-foreground tabular-nums">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Damaged units:{" "}
                  <strong className="font-semibold text-foreground">{totalBrokenUnits.toLocaleString()}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Feedback banners */}
        {notice && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5">
            <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex-1">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notice"
              className="p-1 rounded-full text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/15 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5"
          >
            <AlertTriangle size={15} className="text-red-500 shrink-0" />
            <p className="text-xs font-medium text-red-700 dark:text-red-300 flex-1">{error}</p>
            <button
              type="button"
              onClick={() => void loadReturns()}
              className="rounded-full border border-red-500/30 bg-background px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="p-1 rounded-full text-red-500 hover:bg-red-500/15 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                activeTab === "returns"
                  ? "Search medicine, return/sale ID, cashier, or reason…"
                  : "Search medicine, record ID, reporter, or damage reason…"
              }
              aria-label="Search returns and broken stock"
              className="w-full rounded-xl border border-border/70 bg-background/80 pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === "returns" ? (
              <SegmentedTabs<typeof statusFilter>
                size="sm"
                ariaLabel="Filter returns by status"
                value={statusFilter}
                onChange={next => {
                  setStatusFilter(next);
                  setPage(1);
                }}
                className="overflow-x-auto max-w-full"
                items={(
                  [
                    { id: "all", label: "All", count: customerReturns.length },
                    { id: "pending", label: "Pending", count: pendingCount },
                    { id: "restocked", label: "Restocked", count: restockedReturns.length },
                    { id: "broken", label: "Broken", count: brokenReturnsCount },
                  ] as const
                ).map(opt => ({
                  id: opt.id,
                  icon: opt.id === "pending" && opt.count > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : undefined,
                  label: opt.label,
                  badge: (
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                      statusFilter === opt.id
                        ? "bg-primary/15 text-primary dark:bg-blue-400/20 dark:text-blue-100"
                        : "text-muted-foreground/80"
                    }`}>
                      {opt.count}
                    </span>
                  ),
                }))}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <ArrowUpDown size={11} /> Sort
                </span>
                <SegmentedTabs<typeof brokenSort>
                  size="sm"
                  ariaLabel="Sort broken stock records"
                  value={brokenSort}
                  onChange={next => {
                    setBrokenSort(next);
                    setPage(1);
                  }}
                  items={[
                    { id: "newest", label: "Latest" },
                    { id: "qty", label: "Highest Qty" },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable List Container ── */}
      <div className="flex-1 min-h-0 flex flex-col st-shell-px pt-4 pb-3 overflow-hidden">
        {loading && activeSourceList.length === 0 ? (
          <div className="flex-1 min-h-0 rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-border/50 last:border-0"
              >
                <div className="space-y-2 flex-1">
                  <div className="yt-shimmer-box h-4 w-48 rounded-md" />
                  <div className="yt-shimmer-box h-3 w-72 rounded-md" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="yt-shimmer-box h-6 w-24 rounded-full" />
                  <div className="yt-shimmer-box h-8 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="w-full rounded-2xl border border-border/70 bg-card/60 py-14 px-6 flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-11 w-11 rounded-2xl bg-muted/70 border border-border/60 flex items-center justify-center text-muted-foreground">
                {activeTab === "returns" ? <RotateCcw size={20} /> : <PackageX size={20} />}
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-semibold text-foreground">
                  {hasFilters
                    ? "No matching records"
                    : activeTab === "returns"
                      ? "No return requests yet"
                      : "No broken products recorded"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasFilters
                    ? "Try clearing your search term or switching filters."
                    : activeTab === "returns"
                      ? "Customer returns submitted by cashiers will appear here for inspection."
                      : "Use \"Add Broken Product\" whenever damaged or broken stock needs to be deducted."}
                </p>
              </div>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-full border border-border/80 bg-background px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  Reset filters
                </button>
              ) : (
                activeTab === "broken" &&
                canReportBroken && (
                  <button
                    type="button"
                    onClick={() => setShowBrokenModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                  >
                    <Plus size={13} /> Add Broken Product
                  </button>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
            {/* Fixed Grouped Column Header */}
            {activeTab === "returns" ? (
              <div className="flex-shrink-0 hidden md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.45fr)_minmax(0,1.2fr)_132px_215px] items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-border/60 bg-muted/35 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Product &amp; Return Reason</span>
                <span>Reference &amp; Staff</span>
                <span>Refund &amp; Timeline</span>
                <span>Status</span>
                <span className="text-right">Disposition</span>
              </div>
            ) : (
              <div className="flex-shrink-0 hidden md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_132px] items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-border/60 bg-muted/35 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Product &amp; Damage Reason</span>
                <span>Record &amp; Reported By</span>
                <span>Recorded</span>
                <span className="text-right">Status</span>
              </div>
            )}

            {/* Scrollable Rows */}
            <div
              className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/60"
              data-table-scroll="fixed"
            >
              {paginatedList.map(request => {
                const packNote = formatPackSummary(
                  request.qty,
                  request.saleUnit,
                  request.unitsPerSale
                );
                const meta = statusMeta[request.disposition];
                const isPendingReturn =
                  activeTab === "returns" && request.disposition === "pending";
                const isBusy = processingReturnId === request.returnTxId;

                if (activeTab === "returns") {
                  return (
                    <article
                      key={request.returnTxId}
                      className={`px-4 sm:px-5 py-3.5 transition-colors hover:bg-muted/25 md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.45fr)_minmax(0,1.2fr)_132px_215px] md:items-center md:gap-3 flex flex-col gap-3 ${
                        isPendingReturn ? "border-l-2 border-l-amber-400/80" : ""
                      }`}
                    >
                      {/* Col 1: Product & Reason */}
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {request.product}
                          </p>
                          <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                            {request.qty} unit{request.qty === 1 ? "" : "s"}
                          </span>
                          {packNote && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              ({packNote})
                            </span>
                          )}
                        </div>
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed">
                          <MessageSquareText size={12} className="mt-0.5 shrink-0 text-muted-foreground/70" />
                          <span className="break-words">{request.reason || "No reason specified"}</span>
                        </p>
                      </div>

                      {/* Col 2: Reference & Staff */}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted/65 border border-border/60 px-1.5 py-0.5 font-mono text-foreground">
                            <Receipt size={10} className="text-muted-foreground" />
                            {request.returnTxId}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono text-muted-foreground">{request.saleTxId}</span>
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                          <UserIcon size={11} className="shrink-0 text-muted-foreground/75" />
                          <span className="truncate">Cashier {request.cashier}</span>
                        </p>
                      </div>

                      {/* Col 3: Refund & Timeline */}
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {fmt(request.refund)}
                        </p>
                        <div className="space-y-0.5 text-[11px] text-muted-foreground">
                          <p className="flex items-center gap-1 tabular-nums">
                            <Calendar size={10} className="shrink-0 text-muted-foreground/70" />
                            <span>Submitted {request.createdAt}</span>
                          </p>
                          {request.processedAt && (
                            <p className="flex items-center gap-1 tabular-nums">
                              <Clock3 size={10} className="shrink-0 text-muted-foreground/70" />
                              <span>Processed {request.processedAt}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Col 4: Status Pill */}
                      <div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${meta.pill}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </div>

                      {/* Col 5: Actions */}
                      <div className="flex items-center md:justify-end gap-2">
                        {isPendingReturn ? (
                          canProcess ? (
                            <>
                              <button
                                type="button"
                                disabled={processingReturnId !== null}
                                onClick={() =>
                                  setConfirmDisposition({ request, disposition: "restocked" })
                                }
                                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-2xs disabled:opacity-50"
                              >
                                <PackageCheck size={13} />
                                <span>{isBusy ? "Saving…" : "Restock"}</span>
                              </button>
                              <button
                                type="button"
                                disabled={processingReturnId !== null}
                                onClick={() =>
                                  setConfirmDisposition({ request, disposition: "broken" })
                                }
                                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                              >
                                <PackageX size={13} />
                                <span>Broken</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">
                              Manager inspection
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {request.disposition === "restocked"
                              ? "Returned to stock"
                              : "Written off"}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                }

                // Broken Products Row
                return (
                  <article
                    key={request.returnTxId}
                    className="px-4 sm:px-5 py-3.5 transition-colors hover:bg-muted/25 md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_132px] md:items-center md:gap-3 flex flex-col gap-3"
                  >
                    {/* Col 1: Product & Damage Reason */}
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {request.product}
                        </p>
                        <span className="inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-red-700 dark:text-red-300">
                          −{request.qty} unit{request.qty === 1 ? "" : "s"}
                        </span>
                        {packNote && (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            ({packNote})
                          </span>
                        )}
                      </div>
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed">
                        <MessageSquareText size={12} className="mt-0.5 shrink-0 text-muted-foreground/70" />
                        <span className="break-words">{request.reason || "No reason specified"}</span>
                      </p>
                    </div>

                    {/* Col 2: Record ID & Reporter */}
                    <div className="min-w-0 space-y-1">
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted/65 border border-border/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                          <Receipt size={10} className="text-muted-foreground" />
                          {request.returnTxId}
                        </span>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                        <UserIcon size={11} className="shrink-0 text-muted-foreground/75" />
                        <span className="truncate">Reported by {request.cashier}</span>
                      </p>
                    </div>

                    {/* Col 3: Date */}
                    <div className="min-w-0 text-xs text-muted-foreground flex items-center gap-1.5 tabular-nums">
                      <Calendar size={12} className="shrink-0 text-muted-foreground/75" />
                      <span>{request.createdAt}</span>
                    </div>

                    {/* Col 4: Status Pill */}
                    <div className="md:flex md:justify-end">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:text-red-300 whitespace-nowrap">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Written Off
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="flex-shrink-0">
              <TablePager
                total={filteredList.length}
                page={safePage}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          </div>
        )}
      </div>

      {confirmDisposition && (
        <ConfirmDialog
          title={
            confirmDisposition.disposition === "restocked"
              ? "Restock Returned Item?"
              : "Mark Return as Broken?"
          }
          message={
            confirmDisposition.disposition === "restocked" ? (
              <>
                Return{" "}
                <span className="font-semibold text-foreground">
                  {confirmDisposition.request.qty} unit
                  {confirmDisposition.request.qty === 1 ? "" : "s"}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {confirmDisposition.request.product}
                </span>{" "}
                back into active sellable stock?
              </>
            ) : (
              <>
                Write off{" "}
                <span className="font-semibold text-foreground">
                  {confirmDisposition.request.qty} unit
                  {confirmDisposition.request.qty === 1 ? "" : "s"}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {confirmDisposition.request.product}
                </span>{" "}
                as damaged/broken? This cannot be undone.
              </>
            )
          }
          confirmLabel={
            confirmDisposition.disposition === "restocked" ? "Yes, Restock" : "Yes, Mark Broken"
          }
          cancelLabel="Cancel"
          variant={confirmDisposition.disposition === "restocked" ? "info" : "danger"}
          onConfirm={() => {
            const target = confirmDisposition;
            setConfirmDisposition(null);
            void processReturn(target.request, target.disposition);
          }}
          onCancel={() => setConfirmDisposition(null)}
        />
      )}
    </div>
  );
}

export default memo(ReturnsPage);
