import { useState } from "react";
import { Package, AlertTriangle, Check, X, Pencil, RefreshCw, Calendar } from "lucide-react";
import { sortBatchesByExpiry, type Product } from "./data";
import { fmt, StockBadge } from "./shared";

export default function StockAlertsPage({
  inventory,
  onGoToInventory,
  onEditProduct,
}: {
  inventory: Product[];
  onGoToInventory: () => void;
  onEditProduct: (product: Product) => void;
}) {
  const critical = inventory.filter(i => i.status === "critical");
  const low = inventory.filter(i => i.status === "low");
  const moderate = inventory.filter(i => i.status === "moderate");
  const alertItems = [...critical, ...low, ...moderate];

  const now = Date.now();

  const getExpiryStatus = (p: Product) => {
    const batches = sortBatchesByExpiry(p.batches);
    if (batches.length === 0) return null;
    const daysLeft = (new Date(batches[0].expiryDate).getTime() - now) / (1000 * 60 * 60 * 24);
    const expiry = batches[0].expiry;
    if (daysLeft <= 0) return { level: "expired" as const, daysLeft: Math.abs(Math.ceil(daysLeft)), expiry };
    if (daysLeft <= 30) return { level: "within30" as const, daysLeft: Math.ceil(daysLeft), expiry };
    if (daysLeft <= 90) return { level: "within90" as const, daysLeft: Math.ceil(daysLeft), expiry };
    return null;
  };

  const expiryProducts = inventory
    .map(p => ({ product: p, info: getExpiryStatus(p) }))
    .filter(x => x.info !== null) as { product: Product; info: { level: "expired" | "within30" | "within90"; daysLeft: number; expiry: string } }[];

  const expired = expiryProducts.filter(x => x.info.level === "expired");
  const expiring30 = expiryProducts.filter(x => x.info.level === "within30");
  const expiring90 = expiryProducts.filter(x => x.info.level === "within90");

  const severityConfig = {
    critical: { label: "Critical", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/30", text: "text-red-700 dark:text-red-400", bar: "bg-red-500", icon: "text-red-500" },
    low: { label: "Low", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/30", text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500", icon: "text-amber-500" },
    moderate: { label: "Moderate", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/30", text: "text-yellow-700 dark:text-yellow-400", bar: "bg-yellow-400", icon: "text-yellow-500" },
    good: { label: "Good", bg: "", border: "", text: "", bar: "bg-emerald-500", icon: "text-emerald-500" },
  };

  const [activeTab, setActiveTab] = useState<"stock" | "expiry">("stock");

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
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
          <Package size={13} />View Inventory
        </button>
      </div>

      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("stock")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "stock" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}
        >
          <AlertTriangle size={12} />Stock Levels
          {alertItems.length > 0 && <span className="ml-1 w-4 h-4 bg-amber-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">{alertItems.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab("expiry")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "expiry" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Calendar size={12} />Expiry Dates
          {expiryProducts.length > 0 && <span className="ml-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">{expiryProducts.length}</span>}
        </button>
      </div>

      {activeTab === "stock" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Critical", count: critical.length, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/20", icon: <AlertTriangle size={14} className="text-red-500" /> },
              { label: "Low", count: low.length, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20", icon: <AlertTriangle size={14} className="text-amber-500" /> },
              { label: "Moderate", count: moderate.length, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20", icon: <AlertTriangle size={14} className="text-yellow-400" /> },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
                <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</span>{c.icon}</div>
                <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.count}</p>
                <p className="text-[10px] text-muted-foreground mt-1">product{c.count !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>

          {alertItems.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3"><Check size={22} className="text-emerald-500" /></div>
              <p className="text-sm font-bold text-foreground">All stock levels are healthy</p>
              <p className="text-xs text-muted-foreground mt-1">No products currently need reordering</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(["critical", "low", "moderate"] as const).map(severity => {
                const items = inventory.filter(i => i.status === severity);
                if (items.length === 0) return null;
                const cfg = severityConfig[severity];
                return (
                  <div key={severity} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    <div className={`flex items-center gap-2 px-5 py-3 border-b ${cfg.border} ${cfg.bg}`}>
                      <AlertTriangle size={13} className={cfg.icon} />
                      <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label} • {items.length} product{items.length > 1 ? "s" : ""}</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {items.map(item => {
                        const pct = Math.min(100, Math.round((item.stock / (item.reorder * 1.5)) * 100));
                        const shortage = Math.max(0, item.reorder - item.stock);
                        return (
                          <div key={item.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-foreground">{item.name}</p>
                                  <span className="text-[10px] text-muted-foreground">{item.id}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{item.category} • Expires {item.expiry}</p>
                              </div>
                              <StockBadge status={item.status} />
                            </div>
                            <div className="mt-3 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">Current stock</span>
                                <span className={`font-bold tabular-nums ${cfg.text}`}>{item.stock.toLocaleString()} / {item.reorder} units</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} /></div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>Reorder point: {item.reorder}</span>
                                {shortage > 0 && <span className={`font-semibold ${cfg.text}`}>Need {shortage} more to reach reorder level</span>}
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <button onClick={() => onEditProduct(item)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[11px] font-bold hover:opacity-90 transition-opacity">
                                <RefreshCw size={10} />Reorder Now
                              </button>
                              <span className="text-[10px] text-muted-foreground">Unit price: {fmt(item.price)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "expiry" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Expired", count: expired.length, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/20", icon: <X size={14} className="text-red-500" /> },
              { label: "Within 30 Days", count: expiring30.length, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-200 dark:border-orange-500/20", icon: <AlertTriangle size={14} className="text-orange-500" /> },
              { label: "Within 90 Days", count: expiring90.length, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20", icon: <AlertTriangle size={14} className="text-amber-400" /> },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
                <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</span>{c.icon}</div>
                <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.count}</p>
                <p className="text-[10px] text-muted-foreground mt-1">product{c.count !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>

          {expiryProducts.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3"><Check size={22} className="text-emerald-500" /></div>
              <p className="text-sm font-bold text-foreground">No expiry alerts</p>
              <p className="text-xs text-muted-foreground mt-1">All batches are within safe expiry range</p>
            </div>
          ) : (
            <div className="space-y-3">
              {expired.length > 0 && (
                <div className="bg-card border border-red-200 dark:border-red-500/30 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10">
                    <X size={13} className="text-red-500" />
                    <span className="text-xs font-bold text-red-700 dark:text-red-400">Expired — {expired.length} product{expired.length !== 1 ? "s" : ""} · Remove from shelf immediately</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {expired.map(({ product: item, info }) => (
                      <div key={item.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.category} · {item.id}</p>
                            <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">Expired: {info.expiry} ({info.daysLeft} day{info.daysLeft !== 1 ? "s" : ""} ago)</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">EXPIRED</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{item.stock} units on shelf</span>
                          </div>
                        </div>
                        <div className="mt-3">
                          <button onClick={() => onEditProduct(item)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-[11px] font-bold hover:opacity-90 transition-opacity">
                            <Pencil size={10} />Update Batch
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expiring30.length > 0 && (
                <div className="bg-card border border-orange-200 dark:border-orange-500/30 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10">
                    <AlertTriangle size={13} className="text-orange-500" />
                    <span className="text-xs font-bold text-orange-700 dark:text-orange-400">Expiring Within 30 Days — {expiring30.length} product{expiring30.length !== 1 ? "s" : ""} · Prioritize sales</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {expiring30.map(({ product: item, info }) => (
                      <div key={item.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.category} · {item.id}</p>
                            <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mt-1">Expires: {info.expiry} ({info.daysLeft} day{info.daysLeft !== 1 ? "s" : ""} remaining)</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20">{info.daysLeft}d left</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{item.stock} units</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expiring90.length > 0 && (
                <div className="bg-card border border-amber-200 dark:border-amber-500/30 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10">
                    <AlertTriangle size={13} className="text-amber-500" />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Expiring Within 90 Days — {expiring90.length} product{expiring90.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {expiring90.map(({ product: item, info }) => (
                      <div key={item.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.category} · {item.id}</p>
                            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-1">Expires: {info.expiry} ({info.daysLeft} day{info.daysLeft !== 1 ? "s" : ""} remaining)</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">{info.daysLeft}d left</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{item.stock} units</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
