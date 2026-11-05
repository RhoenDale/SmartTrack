import { useEffect, useState } from "react";
import { Package, AlertTriangle, Check, X, Pencil, RefreshCw, Calendar } from "lucide-react";
import { getReorderUnits, sortBatchesByExpiry, type Product } from "./data";
import { fmt, StockBadge } from "./shared";

export default function StockAlertsPage({
  inventory,
  onGoToInventory,
  onEditProduct,
  userRole,
}: {
  inventory: Product[];
  onGoToInventory: () => void;
  onEditProduct: (product: Product) => void;
  userRole: string;
}) {
  const canManageStock = userRole === "inventory_manager";

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
    if (daysLeft <= 0)  return { level: "expired"  as const, daysLeft: Math.abs(Math.ceil(daysLeft)), expiry };
    if (daysLeft <= 30) return { level: "within30" as const, daysLeft: Math.ceil(daysLeft), expiry };
    if (daysLeft <= 90) return { level: "within90" as const, daysLeft: Math.ceil(daysLeft), expiry };
    return null;
  };

  const expiryProducts = inventory
    .map(p => ({ product: p, info: getExpiryStatus(p) }))
    .filter(x => x.info !== null) as {
      product: Product;
      info: { level: "expired" | "within30" | "within90"; daysLeft: number; expiry: string };
    }[];

  const expired    = expiryProducts.filter(x => x.info.level === "expired");
  const expiring30 = expiryProducts.filter(x => x.info.level === "within30");
  const expiring90 = expiryProducts.filter(x => x.info.level === "within90");

  const severityConfig = {
    out_of_stock: { label: "Out of Stock", text: "text-red-800 dark:text-red-300",   bar: "bg-red-700",   badge: "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40" },
    critical:     { label: "Critical",     text: "text-red-700 dark:text-red-400",   bar: "bg-red-500",   badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30" },
    low:          { label: "Low",          text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30" },
    moderate:     { label: "Moderate",     text: "text-yellow-700 dark:text-yellow-400", bar: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/30" },
    good:         { label: "Good",         text: "",                                  bar: "bg-emerald-500", badge: "" },
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

  const filteredAlertItems = alertItems;
  const filteredExpiryProducts = expiryProducts;

  return (
    <div className="flex flex-col w-full max-w-[1400px] mx-auto" style={{ height: "calc(100dvh - 56px)" }}>

      {/* ── Fixed header ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 bg-background border-b border-border/50 z-20">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Stock Alerts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {alertItems.length + expiryProducts.length === 0
                ? "All stock levels and expiry dates are healthy"
                : `${alertItems.length} stock alert${alertItems.length !== 1 ? "s" : ""} · ${expiryProducts.length} expiry alert${expiryProducts.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={onGoToInventory}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0"
          >
            <Package size={13} />View Products
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-fit mt-3">
          <button
            onClick={() => setActiveTab("stock")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "stock" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}
          >
            <AlertTriangle size={12} />Stock Levels
            {alertItems.length > 0 && (
              <span className="ml-1 w-4 h-4 bg-amber-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                {alertItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("expiry")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "expiry" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Calendar size={12} />Expiry Dates
            {expiryProducts.length > 0 && (
              <span className="ml-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                {expiryProducts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">

      {/* ── Stock Levels tab ──────────────────────────────────────────────── */}
      {activeTab === "stock" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Out of Stock", count: outOfStock.length, color: "text-red-800 dark:text-red-300",     bg: "bg-red-100 dark:bg-red-500/15",    border: "border-red-300 dark:border-red-500/40",    icon: <X size={14} className="text-red-700 dark:text-red-300" /> },
              { label: "Critical",     count: critical.length,   color: "text-red-600 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-500/10",     border: "border-red-200 dark:border-red-500/20",    icon: <AlertTriangle size={14} className="text-red-500" /> },
              { label: "Low",          count: low.length,        color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20", icon: <AlertTriangle size={14} className="text-amber-500" /> },
              { label: "Moderate",     count: moderate.length,   color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20", icon: <AlertTriangle size={14} className="text-yellow-400" /> },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</span>
                  {c.icon}
                </div>
                <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.count}</p>
                <p className="text-[10px] text-muted-foreground mt-1">product{c.count !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {filteredAlertItems.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <Check size={22} className="text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-foreground">All stock levels are healthy</p>
              <p className="text-xs text-muted-foreground mt-1">No products currently need reordering</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto" data-table-scroll="fixed">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border/60 bg-muted/20">
                      {["Product", "Category", "Current Stock", "Reorder Point", "Shortage", "Status", ...(canManageStock ? [""] : [])].map(h => (
                        <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5 whitespace-nowrap">{h}</th>
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
                        <tr key={item.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                          {/* Product */}
                          <td className="px-5 py-3 min-w-[180px]">
                            <p className="text-xs font-bold text-foreground">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">ID {item.id}</p>
                            {item.expiry && item.expiry !== "—" && (
                              <p className="text-[10px] text-muted-foreground">Exp {item.expiry}</p>
                            )}
                          </td>
                          {/* Category */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.category}</td>
                          {/* Current Stock + bar */}
                          <td className="px-4 py-3 min-w-[160px]">
                            <span className={`text-xs font-bold tabular-nums ${cfg.text}`}>{item.stock.toLocaleString()} units</span>
                            <div className="mt-1.5 h-1.5 w-28 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          {/* Reorder point */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {item.reorder} packs
                            <span className="block text-[10px]">({reorderUnits.toLocaleString()} units)</span>
                          </td>
                          {/* Shortage */}
                          <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap">
                            {shortage > 0
                              ? <span className={`font-semibold ${cfg.text}`}>−{shortage.toLocaleString()} units</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          {/* Status badge */}
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                          </td>
                          {/* Action */}
                          {canManageStock && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button
                                onClick={() => onEditProduct(item)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[11px] font-bold hover:opacity-90 transition-opacity"
                              >
                                <RefreshCw size={10} />Reorder
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2 border-t border-border/40 text-[11px] text-muted-foreground">
                Showing {filteredAlertItems.length} alert{filteredAlertItems.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Expiry Dates tab ──────────────────────────────────────────────── */}
      {activeTab === "expiry" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Expired",         count: expired.length,    color: "text-red-600 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-500/10",      border: "border-red-200 dark:border-red-500/20",     icon: <X size={14} className="text-red-500" /> },
              { label: "Within 30 Days",  count: expiring30.length, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-200 dark:border-orange-500/20", icon: <AlertTriangle size={14} className="text-orange-500" /> },
              { label: "Within 90 Days",  count: expiring90.length, color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-500/10",   border: "border-amber-200 dark:border-amber-500/20",  icon: <AlertTriangle size={14} className="text-amber-400" /> },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</span>
                  {c.icon}
                </div>
                <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.count}</p>
                <p className="text-[10px] text-muted-foreground mt-1">product{c.count !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {filteredExpiryProducts.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <Check size={22} className="text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-foreground">No expiry alerts</p>
              <p className="text-xs text-muted-foreground mt-1">All batches are within safe expiry range</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto" data-table-scroll="fixed">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border/60 bg-muted/20">
                      {["Product", "Category", "Expiry Date", "Days Left / Ago", "Stock", "Status", ...(canManageStock ? [""] : [])].map(h => (
                        <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpiryProducts.map(({ product: item, info }) => {
                      const isExpired   = info.level === "expired";
                      const isWithin30  = info.level === "within30";

                      const statusBadge = isExpired
                        ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"
                        : isWithin30
                        ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20"
                        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";

                      const statusLabel = isExpired ? "Expired" : isWithin30 ? "< 30 days" : "< 90 days";

                      const daysText = isExpired
                        ? `${info.daysLeft} day${info.daysLeft !== 1 ? "s" : ""} ago`
                        : `${info.daysLeft} day${info.daysLeft !== 1 ? "s" : ""} left`;

                      const daysColor = isExpired
                        ? "text-red-600 dark:text-red-400"
                        : isWithin30
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-amber-600 dark:text-amber-400";

                      return (
                        <tr key={item.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                          {/* Product */}
                          <td className="px-5 py-3 min-w-[180px]">
                            <p className="text-xs font-bold text-foreground">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">ID {item.id}</p>
                          </td>
                          {/* Category */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.category}</td>
                          {/* Expiry date */}
                          <td className="px-4 py-3 text-xs text-foreground tabular-nums whitespace-nowrap">{info.expiry}</td>
                          {/* Days */}
                          <td className={`px-4 py-3 text-xs font-semibold tabular-nums whitespace-nowrap ${daysColor}`}>{daysText}</td>
                          {/* Stock */}
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{item.stock.toLocaleString()} units</td>
                          {/* Status badge */}
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusBadge}`}>
                              {statusLabel}
                            </span>
                          </td>
                          {/* Action */}
                          {canManageStock && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {isExpired && (
                                <button
                                  onClick={() => onEditProduct(item)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-[11px] font-bold hover:opacity-90 transition-opacity"
                                >
                                  <Pencil size={10} />Update Batch
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2 border-t border-border/40 text-[11px] text-muted-foreground">
                Showing {filteredExpiryProducts.length} product{filteredExpiryProducts.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </>
      )}
      </div>{/* end scrollable content */}
    </div>
  );
}
