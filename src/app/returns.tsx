import React, { useCallback, useEffect, useState } from "react";
import {
  Check, Clock3, PackageCheck, PackageX, RefreshCw,
  RotateCcw, ShieldAlert, Plus,
} from "lucide-react";
import { returnRequestsApi, analyticsApi, type ReturnRequest } from "./api";
import type { AuthUser, Product } from "./data";
import { fmt, ProductSearchWidget, InfoTip, TablePager, ConfirmDialog } from "./shared";

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
      await onSubmit(selectedProduct.id, baseQty, reason.trim(), qtyNum, saleUnit, saleUnit === "pack" ? unitsPerPack : 1);
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <ProductSearchWidget inventory={inventory} onSelect={handleSelect} selectedProduct={selectedProduct} />

            {selectedProduct && (
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Broken by</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["unit", "pack"] as const).map(u => (
                    <button key={u} type="button"
                      disabled={u === "pack" && unitsPerPack <= 1}
                      onClick={() => { setSaleUnit(u); setQty("1"); }}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        saleUnit === u ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      {u === "unit" ? `1 ${unitLabel}` : unitsPerPack > 1 ? `1 pack (${unitsPerPack} ${unitLabel}s)` : "No pack available"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {saleUnit === "pack" ? "Packs Broken" : "Units Broken"} <span className="text-red-500">*</span>
              </label>
              <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)}
                placeholder="Enter quantity"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
              {selectedProduct && baseQty > maxQty && (
                <p className="mt-1 text-xs text-red-500">Cannot exceed available stock ({maxQty} {unitLabel}s)</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} required
                placeholder="e.g. Accidentally dropped, broken bottle…"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            {selectedProduct && qtyNum > 0 && baseQty <= maxQty && (
              <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 text-xs space-y-1">
                <p className="font-bold text-red-700 dark:text-red-400 uppercase tracking-wide text-[10px]">Stock Impact</p>
                <div className="flex justify-between text-muted-foreground">
                  <span>Current</span><span className="font-semibold text-foreground">{maxQty} {unitLabel}s</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Deducting</span><span className="font-semibold text-red-600 dark:text-red-400">−{baseQty} {unitLabel}s</span>
                </div>
                <div className="flex justify-between border-t border-red-200 dark:border-red-500/20 pt-1 text-muted-foreground">
                  <span>After</span><span className="font-bold text-red-600 dark:text-red-400">{maxQty - baseQty} {unitLabel}s</span>
                </div>
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;
  const [dispositionTarget, setDispositionTarget] = useState<{ request: ReturnRequest; disposition: "restocked" | "broken" } | null>(null);
  const [lossData, setLossData] = useState<{ returnLoss: number; brokenLoss: number; totalLoss: number; uncostedBrokenCount: number } | null>(null);

  useEffect(() => { setPage(1); }, [activeTab]);

  const canProcess      = user.role === "inventory_manager";
  const canReportBroken = user.role === "inventory_manager" || user.role === "cashier";

  const loadReturns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [returnsRes, smaRes] = await Promise.allSettled([
        returnRequestsApi.list(),
        analyticsApi.sma(),
      ]);
      if (returnsRes.status === "fulfilled") {
        setReturns(returnsRes.value);
      } else {
        throw returnsRes.reason;
      }
      if (smaRes.status === "fulfilled") {
        setLossData({
          returnLoss: smaRes.value.returnLoss ?? 0,
          brokenLoss: smaRes.value.brokenLoss ?? 0,
          totalLoss: smaRes.value.totalLoss ?? 0,
          uncostedBrokenCount: smaRes.value.uncostedBrokenCount ?? 0,
        });
      }
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

  const handleReportBroken = async (productId: string, qty: number, reason: string, saleQty: number, saleUnit: "unit" | "pack", unitsPerSale: number) => {
    await returnRequestsApi.reportBroken({ product_id: productId, qty, reason, sale_qty: saleQty, sale_unit: saleUnit, units_per_sale: unitsPerSale });
    await loadReturns();
    await onDispositionComplete();
    setActiveTab("broken");
  };

  const customerReturns = returns.filter(r => r.returnType === "return");
  const brokenRecords   = returns.filter(r => r.returnType === "adjustment");
  const pendingCount    = customerReturns.filter(r => r.disposition === "pending").length;
  const restockedCount  = customerReturns.filter(r => r.disposition === "restocked").length;
  const brokenCount     = returns.filter(r => r.disposition === "broken").length;

  const statusStyle: Record<ReturnRequest["disposition"], string> = {
    pending:   "bg-amber-500/10 text-amber-700 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
    restocked: "bg-blue-500/10 text-blue-700 border-blue-200/80 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
    broken:    "bg-rose-500/10 text-rose-700 border-rose-200/80 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30",
  };

  const activeReturns    = activeTab === "returns" ? customerReturns : brokenRecords;
  const paginatedReturns = activeReturns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      {showBrokenModal && (
        <BrokenProductModal inventory={inventory} onClose={() => setShowBrokenModal(false)} onSubmit={handleReportBroken} />
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">Returns</h1>
            <InfoTip title="Returns & Losses Guide" color="amber"
              lines={[
                "Manage customer product returns and damaged inventory write-offs.",
                { label: "Restock", value: "Undamaged returns safely added back to stock" },
                { label: "Broken / Scrap", value: "Compromised medication written off as financial loss" },
                { label: "Pending", value: "Awaiting inspection and disposition approval" },
                { label: "Refunds", value: "Reimburses original customer payment upon completion" },
              ]} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {canProcess ? "Inspect returned products and decide whether to restock or mark them broken." : "View return requests and their inventory inspection status."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canReportBroken && (
            <button type="button" onClick={() => setShowBrokenModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors">
              <Plus size={15} /> Add Broken Product
            </button>
          )}
          <button type="button" onClick={() => void loadReturns()} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => void loadReturns()} className="shrink-0 font-semibold underline">Retry</button>
        </div>
      )}

      {/* Loss & Accounting KPI Cards */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-foreground">Loss & Return Audit</p>
          <InfoTip
            title="Loss & Return Accounting Guide"
            color="amber"
            lines={[
              "Tracks all customer returns, damaged items, and inventory write-offs.",
              { label: "Pending", value: "Awaiting inspection (restock or dispose)" },
              { label: "Restocked", value: "Returned to stock safely under FIFO" },
              { label: "Broken / Lost", value: "Written off and deducted from gross profit" },
              "Essential for clean financial accounting and pharmacy compliance.",
            ]}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Returns · Pending</p>
            <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{pendingCount} return{pendingCount !== 1 ? "s" : ""}</p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">Awaiting disposition</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Returns · Restocked</p>
            <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{restockedCount} return{restockedCount !== 1 ? "s" : ""}</p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">Added back to inventory</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Returns · Broken</p>
            <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{brokenCount} record{brokenCount !== 1 ? "s" : ""}</p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">Marked out of stock</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Refund Loss</p>
            <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{fmt(lossData?.returnLoss ?? 0)}</p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">Customer refunds</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Broken Stock Loss</p>
            <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{fmt(lossData?.brokenLoss ?? 0)}</p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">
              {lossData?.uncostedBrokenCount ?? 0} uncosted record{(lossData?.uncostedBrokenCount ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 shadow-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Loss</p>
            <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{fmt(lossData?.totalLoss ?? 0)}</p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">Refunds + write-offs</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "returns" as const, label: "Customer Returns", icon: <RotateCcw size={14} />, badge: pendingCount > 0 ? pendingCount : null, badgeColor: "bg-amber-500" },
          { id: "broken" as const, label: "Broken Products", icon: <PackageX size={14} />, badge: brokenRecords.length > 0 ? brokenRecords.length : null, badgeColor: "bg-red-500" },
        ].map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab.id ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"
            }`}>
            <span className="flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.badge !== null && (
                <span className={`rounded-full ${tab.badgeColor} px-1.5 py-0.5 text-[10px] font-bold text-white leading-none`}>{tab.badge}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Panel */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between border-b border-border/70 bg-card/50 px-5 py-4">
          <div>
            {activeTab === "returns" ? (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">Customer Return Requests</h2>
                  <InfoTip title="Customer Return Lifecycle"
                    lines={[
                      "Workflow for customer item returns, physical condition inspection, and refund authorization.",
                      { label: "Inspected: Restock", value: "Returned to active FIFO shelf stock" },
                      { label: "Inspected: Discard", value: "Written off as damaged / unserviceable" },
                      { label: "Refund", value: "Reimbursed money deducted from store net revenue" },
                    ]} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{pendingCount} awaiting inspection · {customerReturns.length} total</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">Broken / Damaged Records</h2>
                  <InfoTip title="Damaged Inventory Losses"
                    lines={[
                      "Log of broken, dropped, or damaged medicines removed from inventory.",
                      { label: "Valuation", value: "Valued at batch unit cost recorded upon receipt" },
                      { label: "COGS Impact", value: "Deducted as operational loss from gross margin" },
                    ]} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{brokenRecords.length} product{brokenRecords.length !== 1 ? "s" : ""} recorded as broken</p>
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
            <p className="text-sm font-medium text-foreground">{activeTab === "returns" ? "No return requests yet" : "No broken products recorded"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeTab === "returns" ? "Returns submitted by cashiers will appear here." : "Use the \"Add Broken Product\" button to record damaged stock."}
            </p>
          </div>
        ) : (
          <div>
            <div className="divide-y divide-border/60">
              {paginatedReturns.map(request => (
                <article key={request.returnTxId} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {request.product} · {request.qty} unit{request.qty === 1 ? "" : "s"}
                        {request.saleUnit === "pack" && request.unitsPerSale > 1 && (
                          <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                            ({Math.floor(request.qty / request.unitsPerSale)} pack{Math.floor(request.qty / request.unitsPerSale) !== 1 ? "s" : ""}
                            {request.qty % request.unitsPerSale > 0 ? ` + ${request.qty % request.unitsPerSale} loose` : ""}
                            {" · "}{request.unitsPerSale} units/pack)
                          </span>
                        )}
                      </p>
                      {activeTab === "returns" && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusStyle[request.disposition]}`}>
                          {request.disposition}
                        </span>
                      )}
                      {activeTab === "broken" && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">Broken</span>
                      )}
                    </div>

                    {activeTab === "returns" ? (
                      <p className="text-xs text-muted-foreground">Return {request.returnTxId} · Sale {request.saleTxId} · Cashier {request.cashier} · Refund {fmt(request.refund)}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Record {request.returnTxId} · Reported by {request.cashier}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{activeTab === "returns" ? "Submitted" : "Recorded"} {request.createdAt} · Reason: {request.reason}</p>
                    {request.processedAt && activeTab === "returns" && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 size={12} /> Processed {request.processedAt}</p>
                    )}
                  </div>

                  {canProcess && activeTab === "returns" && request.disposition === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <button type="button" disabled={processingReturnId !== null}
                        onClick={() => setDispositionTarget({ request, disposition: "restocked" })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        <PackageCheck size={14} /> Restock
                        {request.saleUnit === "pack" && request.unitsPerSale > 1 && (
                          <span className="opacity-80 text-[10px]">({Math.floor(request.qty / request.unitsPerSale)} pk)</span>
                        )}
                      </button>
                      <button type="button" disabled={processingReturnId !== null}
                        onClick={() => setDispositionTarget({ request, disposition: "broken" })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                        <PackageX size={14} /> Mark Broken
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <TablePager total={activeReturns.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
          </div>
        )}
      </section>

      {dispositionTarget && (
        <ConfirmDialog
          title={dispositionTarget.disposition === "restocked" ? "Restock this return?" : "Mark as broken?"}
          message={
            dispositionTarget.disposition === "restocked"
              ? `Return ${dispositionTarget.request.qty} unit(s) of "${dispositionTarget.request.product}" back to active shelf stock?`
              : `Write off ${dispositionTarget.request.qty} unit(s) of "${dispositionTarget.request.product}" as damaged? This is a permanent loss.`
          }
          confirmLabel={dispositionTarget.disposition === "restocked" ? "Restock" : "Mark Broken"}
          cancelLabel="Cancel"
          variant={dispositionTarget.disposition === "restocked" ? "info" : "danger"}
          onConfirm={() => {
            const target = dispositionTarget;
            setDispositionTarget(null);
            void processReturn(target.request, target.disposition);
          }}
          onCancel={() => setDispositionTarget(null)}
        />
      )}
    </div>
  );
}
