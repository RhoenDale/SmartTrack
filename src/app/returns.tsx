import React, { useCallback, useEffect, useState } from "react";
import {
  Check, Clock3, PackageCheck, PackageX, RefreshCw,
  RotateCcw, ShieldAlert, Plus,
} from "lucide-react";
import { returnRequestsApi, type ReturnRequest } from "./api";
import type { AuthUser, Product } from "./data";
import { fmt, ProductSearchWidget } from "./shared";

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
  const [error, setError] = useState("");

  const qtyNum      = parseInt(qty) || 0;
  const unitsPerPack = selectedProduct?.unitsPerPack ?? 1;
  const baseQty     = saleUnit === "pack" ? qtyNum * unitsPerPack : qtyNum;
  const maxQty      = selectedProduct?.stock ?? 0;
  const unitLabel   = selectedProduct?.unitLabel ?? "unit";

  // Reset unit mode when product changes
  const handleSelect = (p: Product | null) => {
    setSelectedProduct(p);
    setSaleUnit("unit");
    setQty("1");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || baseQty > maxQty || !reason.trim() || submitting) return;
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

        {/* Header — fixed */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/15 shrink-0">
              <ShieldAlert size={16} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Add Broken Product</h2>
              <p className="text-[11px] text-muted-foreground">Record accidentally broken or damaged stock</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <span className="text-base leading-none">✕</span>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

            {/* Product search */}
            <ProductSearchWidget
              inventory={inventory}
              onSelect={handleSelect}
              selectedProduct={selectedProduct}
            />

            {/* Unit / Pack toggle — always visible once a product is selected */}
            {selectedProduct && (
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Broken by
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button key="unit" type="button"
                    onClick={() => { setSaleUnit("unit"); setQty("1"); }}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      saleUnit === "unit"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    1 {unitLabel}
                  </button>
                  <button key="pack" type="button"
                    disabled={unitsPerPack <= 1}
                    onClick={() => { setSaleUnit("pack"); setQty("1"); }}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      saleUnit === "pack"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {unitsPerPack > 1
                      ? `1 pack (${unitsPerPack} ${unitLabel}s)`
                      : "No pack available"}
                  </button>
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {saleUnit === "pack" ? "Packs Broken" : "Units Broken"} <span className="text-red-500">*</span>
              </label>
              <input
                type="number" min={1} value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="Enter quantity"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {/* Show base-unit equivalent when in pack mode */}
              {selectedProduct && saleUnit === "pack" && qtyNum > 0 && unitsPerPack > 1 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  = {baseQty} {unitLabel}s total ({qtyNum} pack{qtyNum !== 1 ? "s" : ""} × {unitsPerPack} {unitLabel}s)
                </p>
              )}
              {selectedProduct && baseQty > maxQty && (
                <p className="mt-1 text-xs text-red-500">
                  Cannot exceed available stock ({maxQty} {unitLabel}s
                  {unitsPerPack > 1 ? ` / ${Math.floor(maxQty / unitsPerPack)} packs` : ""})
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason} onChange={e => setReason(e.target.value)} rows={2} required
                placeholder="e.g. Accidentally dropped, broken bottle, crushed packaging…"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Stock impact */}
            {selectedProduct && qtyNum > 0 && baseQty <= maxQty && (
              <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 text-xs space-y-1">
                <p className="font-bold text-red-700 dark:text-red-400 uppercase tracking-wide text-[10px]">Stock Impact</p>
                <div className="flex justify-between text-muted-foreground">
                  <span>Current stock</span>
                  <span className="font-semibold text-foreground">{maxQty} {unitLabel}s</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Deducting</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    −{baseQty} {unitLabel}s
                    {saleUnit === "pack" && unitsPerPack > 1 && ` (${qtyNum} pack${qtyNum !== 1 ? "s" : ""})`}
                  </span>
                </div>
                <div className="flex justify-between border-t border-red-200 dark:border-red-500/20 pt-1 text-muted-foreground">
                  <span>After recording</span>
                  <span className="font-bold text-red-600 dark:text-red-400">{maxQty - baseQty} {unitLabel}s</span>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Footer — fixed */}
          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all disabled:opacity-50">
              Cancel
            </button>
            <button type="submit"
              disabled={!selectedProduct || qtyNum <= 0 || baseQty > maxQty || !reason.trim() || submitting}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50">
              {submitting ? "Recording…" : "Record Broken"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Returns Page ─────────────────────────────────────────────────────────────
export default function ReturnsPage({
  user,
  inventory,
  onDispositionComplete,
}: {
  user: AuthUser;
  inventory: Product[];
  onDispositionComplete: () => Promise<void>;
}) {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingReturnId, setProcessingReturnId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"returns" | "broken">("returns");
  const [showBrokenModal, setShowBrokenModal] = useState(false);

  const canProcess = user.role === "inventory_manager";
  const canReportBroken =
    user.role === "inventory_manager" ||
    user.role === "cashier";

  const loadReturns = useCallback(async () => {
    setLoading(true);
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
    try {
      await returnRequestsApi.setDisposition(request.returnTxId, disposition);
      await loadReturns();
      await onDispositionComplete();
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
    await returnRequestsApi.reportBroken({
      product_id: productId,
      qty,
      reason,
      sale_qty: saleQty,
      sale_unit: saleUnit,
      units_per_sale: unitsPerSale,
    });
    await loadReturns();
    await onDispositionComplete();
    setActiveTab("broken");
  };

  // Separate the two lists
  const customerReturns = returns.filter(r => r.returnType === "return");
  const brokenRecords   = returns.filter(r => r.returnType === "adjustment");

  const pendingCount = customerReturns.filter(r => r.disposition === "pending").length;

  const statusStyle: Record<ReturnRequest["disposition"], string> = {
    pending:   "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    restocked: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    broken:    "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  };

  const activeReturns = activeTab === "returns" ? customerReturns : brokenRecords;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {showBrokenModal && (
        <BrokenProductModal
          inventory={inventory}
          onClose={() => setShowBrokenModal(false)}
          onSubmit={handleReportBroken}
        />
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Returns &amp; Broken</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canProcess
              ? "Inspect returned products and decide whether to restock or mark them broken."
              : "View return requests and their inventory inspection status."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canReportBroken && (
            <button
              type="button"
              onClick={() => setShowBrokenModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              <Plus size={15} /> Add Broken Product
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadReturns()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => void loadReturns()} className="shrink-0 font-semibold underline">Retry</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("returns")}
          className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "returns"
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-2">
            <RotateCcw size={14} />
            Customer Returns
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                {pendingCount}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("broken")}
          className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "broken"
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-2">
            <PackageX size={14} />
            Broken Products
            {brokenRecords.length > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                {brokenRecords.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Panel */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            {activeTab === "returns" ? (
              <>
                <h2 className="text-sm font-bold text-foreground">Customer Return Requests</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pendingCount} awaiting inspection · {customerReturns.length} total
                </p>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold text-foreground">Broken / Damaged Records</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {brokenRecords.length} product{brokenRecords.length !== 1 ? "s" : ""} recorded as broken
                </p>
              </>
            )}
          </div>
          {activeTab === "returns" ? <RotateCcw size={18} className="text-muted-foreground" /> : <PackageX size={18} className="text-muted-foreground" />}
        </div>

        {loading && activeReturns.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : activeReturns.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Check size={24} className="mx-auto mb-2 text-emerald-600" />
            <p className="text-sm font-medium text-foreground">
              {activeTab === "returns" ? "No return requests yet" : "No broken products recorded"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeTab === "returns"
                ? "Returns submitted by cashiers will appear here."
                : "Use the \"Add Broken Product\" button to record damaged stock."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {activeReturns.map(request => (
              <article key={request.returnTxId} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {request.product} · {request.qty} unit{request.qty === 1 ? "" : "s"}
                      {/* Show pack info if original sale was in packs */}
                      {request.saleUnit === "pack" && request.unitsPerSale > 1 && (
                        <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                          ({Math.floor(request.qty / request.unitsPerSale)} pack{Math.floor(request.qty / request.unitsPerSale) !== 1 ? "s" : ""}
                          {request.qty % request.unitsPerSale > 0 ? ` + ${request.qty % request.unitsPerSale} loose` : ""}
                          {" · "}{request.unitsPerSale} units/pack)
                        </span>
                      )}
                    </p>
                    {activeTab === "returns" && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusStyle[request.disposition]}`}>
                        {request.disposition}
                      </span>
                    )}
                    {activeTab === "broken" && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">
                        Broken
                      </span>
                    )}
                  </div>

                  {activeTab === "returns" ? (
                    <p className="text-xs text-muted-foreground">
                      Return {request.returnTxId} · Sale {request.saleTxId} · Cashier {request.cashier} · Refund {fmt(request.refund)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Record {request.returnTxId} · Reported by {request.cashier}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {activeTab === "returns" ? "Submitted" : "Recorded"} {request.createdAt} · Reason: {request.reason}
                  </p>

                  {request.processedAt && activeTab === "returns" && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 size={12} /> Processed {request.processedAt}
                    </p>
                  )}
                </div>

                {/* Disposition buttons — only for pending customer returns */}
                {canProcess && activeTab === "returns" && request.disposition === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={processingReturnId !== null}
                      onClick={() => void processReturn(request, "restocked")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <PackageCheck size={14} />
                      Restock
                      {request.saleUnit === "pack" && request.unitsPerSale > 1 && (
                        <span className="opacity-80 text-[10px]">
                          ({Math.floor(request.qty / request.unitsPerSale)} pk)
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={processingReturnId !== null}
                      onClick={() => void processReturn(request, "broken")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <PackageX size={14} /> Mark Broken
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
