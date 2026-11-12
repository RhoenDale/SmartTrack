import { useEffect, useState } from "react";
import { Package, AlertTriangle, Check, X, Pencil, RefreshCw, Calendar, Search } from "lucide-react";
import { getReorderUnits, hasUserRole, sortBatchesByExpiry, type Product } from "./data";
import { StockBadge } from "./shared";

export default function StockAlertsPage({
  inventory,
  onGoToInventory,
  onEditProduct,
  userRoles,
  canManageStock: canManageStockOverride,
}: {
  inventory: Product[];
  onGoToInventory: () => void;
  onEditProduct: (product: Product) => void;
  userRoles: string[];
  canManageStock?: boolean;
}) {
  const canManageStock = canManageStockOverride ?? hasUserRole({ roles: userRoles }, "inventory_manager");

  const outOfStock = inventory.filter(i => i.status === "out_of_stock");
  const critical   = inventory.filter(i => i.status === "critical");
  const low        = inventory.filter(i => i.status === "low");
  const moderate   = inventory.filter(i => i.status === "moderate");
  const alertItems = [...outOfStock, ...critical, ...low, ...moderate];

  const now = Date.now();

  const getExpiryStatus = (p: Product) => {
    const batches = sortBatchesByExpiry(p.batches);
    if (batches.length === 0 || !batches[0].expiryDate) return null;
    const daysLeft = (new Date(batches[0].expiryDate).getTime() - now) / (1000 * 60 * 60 * 24);
    const expiry = batches[0].expiry;
    if (daysLeft <= 0)      return { level: "expired"  as const, daysLeft: Math.abs(Math.ceil(daysLeft)), expiry, batchId: batches[0].batchId };
    if (daysLeft <= 30) return { level: "within30" as const, daysLeft: Math.ceil(daysLeft), expiry, batchId: batches[0].batchId };
    if (daysLeft <= 90) return { level: "within90" as const, daysLeft: Math.ceil(daysLeft), expiry, batchId: batches[0].batchId };
    return null;
  };

  const expiryProducts = inventory
    .map(p => ({ product: p, info: getExpiryStatus(p) }))
    .filter(x => x.info !== null) as {
      product: Product;
      info: { level: "expired" | "within30" | "within90"; daysLeft: number; expiry: string; batchId: string };
    }[];

  const expired    = expiryProducts.filter(x => x.info.level === "expired");
  const expiring30 = expiryProducts.filter(x => x.info.level === "within30");
  const expiring90 = expiryProducts.filter(x => x.info.level === "within90");

  const severityConfig: Record<Product["status"], { bar: string }> = {
    out_of_stock: { bar: "bg-red-600" },
    critical: { bar: "bg-rose-500" },
    low: { bar: "bg-amber-500" },
    moderate: { bar: "bg-yellow-500" },
    good: { bar: "bg-emerald-500" },
  };

  const [activeTab, setActiveTab] = useState<"stock" | "expiry">(() => {
    try {
      const saved = localStorage.getItem("smarttrack_stockalerts_tab");
      if (saved === "stock" || saved === "expiry") return saved;
    } catch { /* ignore */ }
    return "stock";
  });
  useEffect(() => {
    try { localStorage.setItem("smarttrack_stockalerts_tab", activeTab); } catch { /* ignore */ }
  }, [activeTab]);

  const [stockSearch, setStockSearch] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState<"all" | "out_of_stock" | "critical" | "low" | "moderate">("all");
  const [expirySearch, setExpirySearch] = useState("");
  const [expiryStatusFilter, setExpiryStatusFilter] = useState<"all" | "expired" | "within30" | "within90">("all");

  const filteredAlertItems = alertItems.filter(item => {
    if (stockStatusFilter !== "all" && item.status !== stockStatusFilter) return false;
    const query = stockSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    const batchIds = item.batches.map(batch => batch.batchId).join(" ");
    const categories = item.categories?.join(" ") ?? "";
    return [item.name, item.id, item.category, categories, batchIds]
      .some(value => value.toLocaleLowerCase().includes(query));
  });
  const filteredExpiryProducts = expiryProducts.filter(({ product, info }) => {
    if (expiryStatusFilter !== "all" && info.level !== expiryStatusFilter) return false;
    const query = expirySearch.trim().toLocaleLowerCase();
    if (!query) return true;
    const categories = product.categories?.join(" ") ?? "";
    return [product.name, product.id, product.category, categories, info.batchId]
      .some(value => value.toLocaleLowerCase().includes(query));
  });

  return (
    <div className="flex flex-col w-full max-w-[1480px] mx-auto" style={{ height: "calc(100dvh - 56px)" }}>

      {/* ── Fixed header ── */}
      <div className="flex-shrink-0 px-4 sm:px-7 lg:px-8 pt-5 sm:pt-7 pb-0 bg-background border-b border-border/70 z-20">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Stock alerts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {alertItems.length + expiryProducts.length === 0
                ? "Inventory levels and expiry dates at a glance"
                : `${alertItems.length} stock items · ${expiryProducts.length} expiry items to review`}
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToInventory}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-medium text-foreground bg-card hover:bg-muted/50 transition-colors flex-shrink-0"
          >
            <Package size={14} />View inventory
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-5 mt-5">
          <button
            type="button"
            onClick={() => setActiveTab("stock")}
            aria-current={activeTab === "stock" ? "page" : undefined}
            className={`flex items-center gap-2 border-b-2 px-0.5 py-3 text-sm transition-colors ${activeTab === "stock" ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground"}`}
          >
            <AlertTriangle size={14} />Stock levels
            {alertItems.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {alertItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expiry")}
            aria-current={activeTab === "expiry" ? "page" : undefined}
            className={`flex items-center gap-2 border-b-2 px-0.5 py-3 text-sm transition-colors ${activeTab === "expiry" ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground"}`}
          >
            <Calendar size={14} />Expiry dates
            {expiryProducts.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {expiryProducts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 lg:px-8 py-6 space-y-6">

      {/* ── Stock Levels tab ──────────────────────────────────────────────── */}
      {activeTab === "stock" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Out of Stock", count: outOfStock.length, key: "out_of_stock" as const, color: "text-rose-600 dark:text-rose-400", icon: <X size={15} /> },
              { label: "Critical", count: critical.length, key: "critical" as const, color: "text-red-600 dark:text-red-400", icon: <AlertTriangle size={15} /> },
              { label: "Low", count: low.length, key: "low" as const, color: "text-amber-600 dark:text-amber-400", icon: <AlertTriangle size={15} /> },
              { label: "Moderate", count: moderate.length, key: "moderate" as const, color: "text-yellow-700 dark:text-yellow-400", icon: <AlertTriangle size={15} /> },
            ].map(c => (
              <button
                key={c.label}
                type="button"
                aria-pressed={stockStatusFilter === c.key}
                onClick={() => setStockStatusFilter(c.key)}
                className={`rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm ${
                  stockStatusFilter === c.key ? "border-primary ring-2 ring-primary/15" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                  <span className={c.color}>{c.icon}</span>
                </div>
                <p className={`text-2xl font-semibold tabular-nums tracking-tight ${c.color}`}>{c.count}</p>
                <p className="text-[11px] text-muted-foreground mt-1">products</p>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={stockSearch}
                onChange={event => setStockSearch(event.target.value)}
                placeholder="Search medicine, ID, category, or batch"
                aria-label="Search stock alerts"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </label>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {[
                { label: "All", key: "all" as const, count: alertItems.length },
                { label: "Out of Stock", key: "out_of_stock" as const, count: outOfStock.length },
                { label: "Critical", key: "critical" as const, count: critical.length },
                { label: "Low", key: "low" as const, count: low.length },
                { label: "Moderate", key: "moderate" as const, count: moderate.length },
              ].map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={stockStatusFilter === filter.key}
                  onClick={() => setStockStatusFilter(filter.key)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    stockStatusFilter === filter.key
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filter.label} <span className="ml-1 tabular-nums opacity-75">{filter.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {filteredAlertItems.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${alertItems.length === 0 ? "bg-emerald-500/10" : "bg-muted"}`}>
                {alertItems.length === 0 ? <Check size={22} className="text-emerald-600 dark:text-emerald-400" /> : <Search size={20} className="text-muted-foreground" />}
              </div>
              <p className="text-sm font-semibold text-foreground">{alertItems.length === 0 ? "All stock levels are healthy" : "No matching products"}</p>
              <p className="text-xs text-muted-foreground mt-1">{alertItems.length === 0 ? "No products currently need reordering" : "Try another search or choose a different status filter."}</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto" data-table-scroll="fixed">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border bg-muted/30">
                      {["Product", "Category", "Current Stock", "Reorder Point", "Shortage", "Status", ...(canManageStock ? [""] : [])].map(h => (
                        <th key={h} className="text-[11px] font-medium text-muted-foreground py-3 text-left px-4 first:px-5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlertItems.map(item => {
                      const reorderUnits = getReorderUnits(item);
                      const pct          = reorderUnits > 0 ? Math.min(100, Math.round((item.stock / (reorderUnits * 1.5)) * 100)) : 100;
                      const shortage     = Math.max(0, reorderUnits - item.stock);
                      const cfg          = severityConfig[item.status as keyof typeof severityConfig] ?? severityConfig.good;
                      return (
                        <tr key={item.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors">
                          {/* Product */}
                          <td className="px-5 py-3 min-w-[180px]">
                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              ID {item.id}
                              {item.batches.length > 0 && <span> · Batch {sortBatchesByExpiry(item.batches)[0]?.batchId ?? "—"}</span>}
                            </p>
                          </td>
                          {/* Category */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.category || "—"}</td>
                          {/* Current Stock + bar */}
                          <td className="px-4 py-3 min-w-[160px]">
                            <span className="text-sm font-semibold tabular-nums text-foreground">{item.stock.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">units</span></span>
                            <div className="mt-2 h-1.5 w-32 bg-muted rounded-full overflow-hidden" role="progressbar" aria-label={`${item.name} stock relative to reorder point`} aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100}>
                              <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          {/* Reorder point */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            <span className="text-xs font-medium text-foreground">{item.reorder} packs</span>
                            <span className="block text-[11px] text-muted-foreground">{reorderUnits.toLocaleString()} units</span>
                          </td>
                          {/* Shortage */}
                          <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap">
                            {shortage > 0
                              ? <span className="font-semibold text-red-600 dark:text-red-400">−{shortage.toLocaleString()} units</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          {/* Status badge */}
                          <td className="px-4 py-3">
                            <StockBadge status={item.status} />
                          </td>
                          {/* Action */}
                          {canManageStock && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button
                                onClick={() => onEditProduct(item)}
                                type="button"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                              >
                                <RefreshCw size={12} />Reorder
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
                Showing {filteredAlertItems.length} of {alertItems.length} products
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Expiry Dates tab ──────────────────────────────────────────────── */}
      {activeTab === "expiry" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Expired", count: expired.length, key: "expired" as const, color: "text-red-600 dark:text-red-400", icon: <X size={15} /> },
              { label: "Within 30 days", count: expiring30.length, key: "within30" as const, color: "text-orange-600 dark:text-orange-400", icon: <AlertTriangle size={15} /> },
              { label: "Within 90 days", count: expiring90.length, key: "within90" as const, color: "text-amber-600 dark:text-amber-400", icon: <Calendar size={15} /> },
            ].map(c => (
              <button
                key={c.label}
                type="button"
                aria-pressed={expiryStatusFilter === c.key}
                onClick={() => setExpiryStatusFilter(c.key)}
                className={`rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm ${
                  expiryStatusFilter === c.key ? "border-primary ring-2 ring-primary/15" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                  <span className={c.color}>{c.icon}</span>
                </div>
                <p className={`text-2xl font-semibold tabular-nums tracking-tight ${c.color}`}>{c.count}</p>
                <p className="text-[11px] text-muted-foreground mt-1">products</p>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={expirySearch}
                onChange={event => setExpirySearch(event.target.value)}
                placeholder="Search medicine, ID, category, or batch"
                aria-label="Search expiry alerts"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </label>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {[
                { label: "All", key: "all" as const, count: expiryProducts.length },
                { label: "Expired", key: "expired" as const, count: expired.length },
                { label: "Within 30 days", key: "within30" as const, count: expiring30.length },
                { label: "Within 90 days", key: "within90" as const, count: expiring90.length },
              ].map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={expiryStatusFilter === filter.key}
                  onClick={() => setExpiryStatusFilter(filter.key)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    expiryStatusFilter === filter.key
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filter.label} <span className="ml-1 tabular-nums opacity-75">{filter.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {filteredExpiryProducts.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${expiryProducts.length === 0 ? "bg-emerald-500/10" : "bg-muted"}`}>
                {expiryProducts.length === 0 ? <Check size={22} className="text-emerald-600 dark:text-emerald-400" /> : <Search size={20} className="text-muted-foreground" />}
              </div>
              <p className="text-sm font-semibold text-foreground">{expiryProducts.length === 0 ? "No expiry alerts" : "No matching products"}</p>
              <p className="text-xs text-muted-foreground mt-1">{expiryProducts.length === 0 ? "No batches are currently within the alert window." : "Try another search or choose a different expiry filter."}</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto" data-table-scroll="fixed">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border bg-muted/30">
                      {["Product", "Category", "Expiry Date", "Days Left / Ago", "Stock", "Status", ...(canManageStock ? [""] : [])].map(h => (
                        <th key={h} className="text-[11px] font-medium text-muted-foreground py-3 text-left px-4 first:px-5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpiryProducts.map(({ product: item, info }) => {
                      const isExpired   = info.level === "expired";
                      const isWithin30  = info.level === "within30";

                      const statusBadge = isExpired
                        ? "border-red-200 bg-red-500/10 text-red-700 dark:border-red-500/30 dark:text-red-300"
                        : isWithin30
                        ? "border-orange-200 bg-orange-500/10 text-orange-700 dark:border-orange-500/30 dark:text-orange-300"
                        : "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:text-amber-300";

                      const statusLabel = isExpired ? "Expired" : isWithin30 ? "Within 30 days" : "Within 90 days";

                      const daysText = isExpired
                        ? `${info.daysLeft} day${info.daysLeft !== 1 ? "s" : ""} ago`
                        : `${info.daysLeft} day${info.daysLeft !== 1 ? "s" : ""} left`;

                      const daysBadge = isExpired
                        ? "border-red-200 bg-red-500/10 text-red-700 dark:border-red-500/30 dark:text-red-300"
                        : isWithin30
                        ? "border-orange-200 bg-orange-500/10 text-orange-700 dark:border-orange-500/30 dark:text-orange-300"
                        : "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:text-amber-300";

                      return (
                        <tr key={item.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors">
                          {/* Product */}
                          <td className="px-5 py-3 min-w-[180px]">
                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">ID {item.id} · Batch {info.batchId}</p>
                          </td>
                          {/* Category */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.category || "—"}</td>
                          {/* Expiry date */}
                          <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums whitespace-nowrap">{info.expiry}</td>
                          {/* Days */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${daysBadge}`}>{daysText}</span>
                          </td>
                          {/* Stock */}
                          <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums whitespace-nowrap">{item.stock.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">units</span></td>
                          {/* Status badge */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadge}`}>
                              {statusLabel}
                            </span>
                          </td>
                          {/* Action */}
                          {canManageStock && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => onEditProduct(item)}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-background text-foreground rounded-lg text-xs font-medium hover:bg-muted transition-colors"
                              >
                                <Pencil size={12} />{isExpired ? "Update batch" : "Review"}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
                Showing {filteredExpiryProducts.length} of {expiryProducts.length} products
              </div>
            </div>
          )}
        </>
      )}
      </div>{/* end scrollable content */}
    </div>
  );
}
