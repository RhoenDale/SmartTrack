import { useState, useMemo } from "react";
import {
  Package, AlertTriangle, Check, X, RefreshCw, Calendar,
  Search, ShieldAlert, Clock, ArrowRight,
} from "lucide-react";
import {
  getReorderUnits, sortBatchesByExpiry, sortBatchesFIFO,
  type Product, type Transaction,
} from "./data";
import { fmt, StockBadge, InfoTip, TablePager } from "./shared";

export default function StockAlertsPage({
  inventory,
  transactions,
  onGoToInventory,
  onEditProduct,
  userRole,
}: {
  inventory: Product[];
  transactions: Transaction[];
  onGoToInventory: () => void;
  onEditProduct: (product: Product, suggestedQty?: number) => void;
  userRole: string;
}) {
  const canManageStock = userRole !== "cashier";
  const [activeTab, setActiveTab] = useState<"stock" | "expiry">("stock");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockSeverityFilter, setStockSeverityFilter] = useState<"all" | "out_of_stock" | "critical" | "low" | "moderate">("all");
  const [expirySeverityFilter, setExpirySeverityFilter] = useState<"all" | "expired" | "within30" | "within90">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  // Reset page when filters change
  const handleTabChange = (tab: "stock" | "expiry") => {
    setActiveTab(tab);
    setPage(1);
  };

  const now = Date.now();
  const assumedLeadTimeDays = 7;

  // Stock severity collections
  const outOfStock = useMemo(() => inventory.filter(i => i.status === "out_of_stock"), [inventory]);
  const critical   = useMemo(() => inventory.filter(i => i.status === "critical"), [inventory]);
  const low        = useMemo(() => inventory.filter(i => i.status === "low"), [inventory]);
  const moderate   = useMemo(() => inventory.filter(i => i.status === "moderate"), [inventory]);
  const alertItems = useMemo(() => [...outOfStock, ...critical, ...low, ...moderate], [outOfStock, critical, low, moderate]);

  // Runaway demand calculation
  const getDemandRunway = (product: Product) => {
    const windowDays = 90;
    const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
    const recentUnits = transactions
      .filter(tx => {
        if (tx.type !== "sale" || tx.productId !== product.id) return false;
        const transactedAt = new Date(tx.date).getTime();
        return transactedAt >= cutoff && transactedAt <= now;
      })
      .reduce((sum, tx) => sum + tx.qty, 0);
    const dailyDemand = recentUnits / windowDays;

    return {
      dailyDemand,
      daysOfSupply: dailyDemand > 0 ? product.stock / dailyDemand : null,
      assumedLeadTimeDays,
    };
  };

  // Expiry velocity calculation
  const getExpiryVelocityRisk = (product: Product, daysLeft: number) => {
    const cutoff = now - 90 * 24 * 60 * 60 * 1000;
    const recentUnits = transactions
      .filter(tx => tx.type === "sale" && tx.productId === product.id && new Date(tx.date).getTime() >= cutoff)
      .reduce((sum, tx) => sum + tx.qty, 0);
    const dailyDemand = recentUnits / 90;
    const nearestExpiry = sortBatchesByExpiry(product.batches).find(batch => batch.expiryDate || batch.expiry);
    const expiryKey = nearestExpiry?.expiryDate ?? nearestExpiry?.expiry;
    const projectedDemand = dailyDemand * Math.max(0, daysLeft);
    let remainingDemand = projectedDemand;
    let remainingExpiringUnits = 0;
    sortBatchesFIFO(product.batches).forEach(batch => {
      const consumed = Math.min(batch.qty, remainingDemand);
      remainingDemand -= consumed;
      if ((batch.expiryDate ?? batch.expiry) === expiryKey) remainingExpiringUnits += batch.qty - consumed;
    });
    return {
      dailyDemand,
      atRiskUnits: Math.max(0, Math.ceil(remainingExpiringUnits)),
    };
  };

  // Expiry status extractor
  const getExpiryStatus = (p: Product) => {
    const batches = sortBatchesByExpiry(p.batches);
    if (batches.length === 0 || !batches[0].expiryDate) return null;
    const daysLeft = (new Date(batches[0].expiryDate).getTime() - now) / (1000 * 60 * 60 * 24);
    const expiry = batches[0].expiry;
    if (daysLeft <= 0) return { level: "expired" as const, daysLeft: Math.abs(Math.ceil(daysLeft)), expiry };
    if (daysLeft <= 30) return { level: "within30" as const, daysLeft: Math.ceil(daysLeft), expiry };
    if (daysLeft <= 90) return { level: "within90" as const, daysLeft: Math.ceil(daysLeft), expiry };
    return null;
  };

  const expiryProducts = useMemo(() => {
    return inventory
      .map(p => ({ product: p, info: getExpiryStatus(p) }))
      .filter(x => x.info !== null) as { product: Product; info: { level: "expired" | "within30" | "within90"; daysLeft: number; expiry: string } }[];
  }, [inventory]);

  const expired    = useMemo(() => expiryProducts.filter(x => x.info.level === "expired"), [expiryProducts]);
  const expiring30 = useMemo(() => expiryProducts.filter(x => x.info.level === "within30"), [expiryProducts]);
  const expiring90 = useMemo(() => expiryProducts.filter(x => x.info.level === "within90"), [expiryProducts]);

  // Filtered Stock Items
  const filteredStockItems = useMemo(() => {
    let list = alertItems;
    if (stockSeverityFilter !== "all") {
      list = list.filter(i => i.status === stockSeverityFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
    }
    return list;
  }, [alertItems, stockSeverityFilter, searchQuery]);

  // Filtered Expiry Items
  const filteredExpiryItems = useMemo(() => {
    let list = expiryProducts;
    if (expirySeverityFilter !== "all") {
      list = list.filter(x => x.info.level === expirySeverityFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(x => x.product.name.toLowerCase().includes(q) || x.product.category.toLowerCase().includes(q) || x.product.id.toLowerCase().includes(q));
    }
    return list;
  }, [expiryProducts, expirySeverityFilter, searchQuery]);

  // Active paginated data
  const totalCount = activeTab === "stock" ? filteredStockItems.length : filteredExpiryItems.length;
  const paginatedStock = useMemo(() => {
    return filteredStockItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filteredStockItems, page]);

  const paginatedExpiry = useMemo(() => {
    return filteredExpiryItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filteredExpiryItems, page]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* ── Page Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">Stock Alerts</h1>
            <InfoTip
              title="Stock & Expiry Alerts Guide"
              color="amber"
              lines={[
                "Automated safety warnings for stock replenishment and batch expiry timelines.",
                { label: "Out of Stock", value: "Zero units available; requires emergency supplier reorder" },
                { label: "Critical Stock", value: "Stock is severely depleted below 40% of buffer threshold" },
                { label: "Low Stock", value: "Stock is below safety reorder threshold" },
                { label: "Expiry Windows", value: "Batches expiring within 30 days, 90 days, or already expired" },
              ]}
            />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {alertItems.length + expiryProducts.length === 0
              ? "All catalog lines and inventory batches are healthy"
              : `${alertItems.length} replenishment alert${alertItems.length !== 1 ? "s" : ""} · ${expiryProducts.length} batch expiry notice${expiryProducts.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToInventory}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border bg-card text-foreground rounded-xl text-xs font-semibold hover:bg-muted/60 transition-colors shadow-xs"
        >
          <Package size={13} />
          View Full Inventory
        </button>
      </header>

      {/* ── Dynamic Executive 4-Pillar KPI Row (Consolidated in 1 row) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {activeTab === "stock" ? (
          <>
            {/* Pillar 1: Out of Stock */}
            <div
              onClick={() => { setStockSeverityFilter("out_of_stock"); setPage(1); }}
              className={`rounded-2xl border p-3.5 shadow-xs cursor-pointer transition-all ${
                stockSeverityFilter === "out_of_stock"
                  ? "border-red-400 bg-red-100/60 dark:bg-red-500/20 ring-2 ring-red-400/30"
                  : "border-red-200/80 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10 hover:border-red-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">Out of Stock</span>
                <span className="p-1 rounded-lg bg-red-500/20 text-red-600 dark:text-red-400">
                  <X size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-red-700 dark:text-red-300 tabular-nums mt-2">
                {outOfStock.length} <span className="text-xs font-medium text-muted-foreground">items</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">0 units available</p>
            </div>

            {/* Pillar 2: Critical */}
            <div
              onClick={() => { setStockSeverityFilter("critical"); setPage(1); }}
              className={`rounded-2xl border p-3.5 shadow-xs cursor-pointer transition-all ${
                stockSeverityFilter === "critical"
                  ? "border-rose-400 bg-rose-100/60 dark:bg-rose-500/20 ring-2 ring-rose-400/30"
                  : "border-rose-200/80 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/10 hover:border-rose-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wide">Critical Buffer</span>
                <span className="p-1 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-rose-700 dark:text-rose-300 tabular-nums mt-2">
                {critical.length} <span className="text-xs font-medium text-muted-foreground">items</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Below 40% reorder level</p>
            </div>

            {/* Pillar 3: Low Stock */}
            <div
              onClick={() => { setStockSeverityFilter("low"); setPage(1); }}
              className={`rounded-2xl border p-3.5 shadow-xs cursor-pointer transition-all ${
                stockSeverityFilter === "low"
                  ? "border-amber-400 bg-amber-100/60 dark:bg-amber-500/20 ring-2 ring-amber-400/30"
                  : "border-amber-200/80 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 hover:border-amber-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Low Stock</span>
                <span className="p-1 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-amber-700 dark:text-amber-300 tabular-nums mt-2">
                {low.length} <span className="text-xs font-medium text-muted-foreground">items</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Below safety threshold</p>
            </div>

            {/* Pillar 4: Moderate */}
            <div
              onClick={() => { setStockSeverityFilter("moderate"); setPage(1); }}
              className={`rounded-2xl border p-3.5 shadow-xs cursor-pointer transition-all ${
                stockSeverityFilter === "moderate"
                  ? "border-blue-400 bg-blue-100/60 dark:bg-blue-500/20 ring-2 ring-blue-400/30"
                  : "border-border/80 bg-card hover:border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Moderate Buffer</span>
                <span className="p-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <ShieldAlert size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-foreground tabular-nums mt-2">
                {moderate.length} <span className="text-xs font-medium text-muted-foreground">items</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Approaching reorder point</p>
            </div>
          </>
        ) : (
          <>
            {/* Expiry Pillar 1: Expired */}
            <div
              onClick={() => { setExpirySeverityFilter("expired"); setPage(1); }}
              className={`rounded-2xl border p-3.5 shadow-xs cursor-pointer transition-all ${
                expirySeverityFilter === "expired"
                  ? "border-red-400 bg-red-100/60 dark:bg-red-500/20 ring-2 ring-red-400/30"
                  : "border-red-200/80 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10 hover:border-red-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">Expired Batches</span>
                <span className="p-1 rounded-lg bg-red-500/20 text-red-600 dark:text-red-400">
                  <X size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-red-700 dark:text-red-300 tabular-nums mt-2">
                {expired.length} <span className="text-xs font-medium text-muted-foreground">batches</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Remove from shelf immediately</p>
            </div>

            {/* Expiry Pillar 2: Expiring <= 30 Days */}
            <div
              onClick={() => { setExpirySeverityFilter("within30"); setPage(1); }}
              className={`rounded-2xl border p-3.5 shadow-xs cursor-pointer transition-all ${
                expirySeverityFilter === "within30"
                  ? "border-orange-400 bg-orange-100/60 dark:bg-orange-500/20 ring-2 ring-orange-400/30"
                  : "border-orange-200/80 dark:border-orange-500/30 bg-orange-50/50 dark:bg-orange-500/10 hover:border-orange-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide">Expiring ≤ 30 Days</span>
                <span className="p-1 rounded-lg bg-orange-500/20 text-orange-600 dark:text-orange-400">
                  <Clock size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-orange-700 dark:text-orange-300 tabular-nums mt-2">
                {expiring30.length} <span className="text-xs font-medium text-muted-foreground">batches</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">High velocity priority</p>
            </div>

            {/* Expiry Pillar 3: Expiring <= 90 Days */}
            <div
              onClick={() => { setExpirySeverityFilter("within90"); setPage(1); }}
              className={`rounded-2xl border p-3.5 shadow-xs cursor-pointer transition-all ${
                expirySeverityFilter === "within90"
                  ? "border-amber-400 bg-amber-100/60 dark:bg-amber-500/20 ring-2 ring-amber-400/30"
                  : "border-amber-200/80 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 hover:border-amber-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Expiring ≤ 90 Days</span>
                <span className="p-1 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Calendar size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-amber-700 dark:text-amber-300 tabular-nums mt-2">
                {expiring90.length} <span className="text-xs font-medium text-muted-foreground">batches</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Quarterly planning notice</p>
            </div>

            {/* Expiry Pillar 4: Safe Batches */}
            <div
              onClick={() => { setExpirySeverityFilter("all"); setPage(1); }}
              className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs cursor-pointer hover:border-border transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total At-Risk</span>
                <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Check size={13} />
                </span>
              </div>
              <p className="text-xl font-bold tracking-tight text-foreground tabular-nums mt-2">
                {expiryProducts.length} <span className="text-xs font-medium text-muted-foreground">notices</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Batches monitored for expiry</p>
            </div>
          </>
        )}
      </div>

      {/* ── Segmented Tabs & Filter Toolbar (Compact 1-row) ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-card border border-border/80 rounded-2xl p-2.5 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
        {/* Main Category Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => handleTabChange("stock")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "stock"
                ? "bg-card text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle size={12} />
            Stock Levels
            {alertItems.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-bold text-white leading-none">
                {alertItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("expiry")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "expiry"
                ? "bg-card text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calendar size={12} />
            Expiry Windows
            {expiryProducts.length > 0 && (
              <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-bold text-white leading-none">
                {expiryProducts.length}
              </span>
            )}
          </button>
        </div>

        {/* Severity filter pills + Search */}
        <div className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end">
          {/* Quick Severity Buttons */}
          <div className="hidden md:flex items-center gap-1 bg-muted/40 p-1 rounded-xl">
            {activeTab === "stock" ? (
              <>
                {(["all", "out_of_stock", "critical", "low", "moderate"] as const).map(sev => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => { setStockSeverityFilter(sev); setPage(1); }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold capitalize transition-all ${
                      stockSeverityFilter === sev
                        ? "bg-card text-foreground shadow-2xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sev === "all" ? "All" : sev.replace(/_/g, " ")}
                  </button>
                ))}
              </>
            ) : (
              <>
                {(["all", "expired", "within30", "within90"] as const).map(sev => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => { setExpirySeverityFilter(sev); setPage(1); }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      expirySeverityFilter === sev
                        ? "bg-card text-foreground shadow-2xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sev === "all" ? "All" : sev === "within30" ? "≤ 30d" : sev === "within90" ? "≤ 90d" : "Expired"}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[170px] flex-1 sm:flex-initial">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search product, category, ID..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-border/80 bg-background/80 pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main High-Density Table with Internal Scroll (max-h-[460px]) ── */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="px-4 py-3 border-b border-border/70 bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
              {activeTab === "stock" ? "Prioritized Inventory Replenishment" : "Batch Expiry Monitoring"}
            </h2>
            <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full font-medium">
              {totalCount} item{totalCount !== 1 ? "s" : ""}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {activeTab === "stock" ? "Urgent inventory stockouts ranked first" : "Nearest expiration dates ranked first"}
          </span>
        </div>

        {totalCount === 0 ? (
          <div className="py-12 text-center">
            <Check size={22} className="mx-auto mb-2 text-emerald-600" />
            <p className="text-xs font-semibold text-foreground">
              {searchQuery ? "No matching stock items found" : "All product stock levels are healthy"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {searchQuery
                ? "Try clearing your search query or reset the severity filters."
                : "No products currently need replenishment or have reached reorder thresholds."}
            </p>
          </div>
        ) : (
          <div>
            <div className="max-h-[460px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/70 shadow-2xs">
                  {activeTab === "stock" ? (
                    <tr>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4 first:px-5">Product</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Status</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Stock vs Reorder</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Runway (Sales)</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Suggested to order</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-right px-5">Action</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4 first:px-5">Product & ID</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Expiry Date</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Timeline</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Stock on Shelf</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-left px-4">Velocity Risk</th>
                      <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 text-right px-5">Action</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-border/40">
                  {activeTab === "stock"
                    ? paginatedStock.map(item => {
                        const reorderUnits = getReorderUnits(item);
                        const runway = getDemandRunway(item);
                        const pct = reorderUnits > 0 ? Math.min(100, Math.round((item.stock / (reorderUnits * 1.5)) * 100)) : 100;
                        const targetStock = runway.dailyDemand > 0
                          ? Math.max(reorderUnits, Math.ceil(runway.dailyDemand * 30))
                          : reorderUnits;
                        const unroundedSuggestion = Math.max(0, targetStock - item.stock);
                        const packSize = Math.max(1, item.unitsPerPack ?? 1);
                        const suggestedQty = unroundedSuggestion > 0 && packSize > 1
                          ? Math.ceil(unroundedSuggestion / packSize) * packSize
                          : unroundedSuggestion;
                        const suggestionBasis = runway.dailyDemand > 0
                          ? "30 days of recent sales"
                          : "top up to alert threshold (no recent sales)";

                        return (
                          <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                            {/* Product Column */}
                            <td className="px-5 py-3">
                              <p className="text-xs font-bold text-foreground">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{item.id} · {item.category}</p>
                            </td>

                            {/* Status Column */}
                            <td className="px-4 py-3">
                              <StockBadge status={item.status} />
                            </td>

                            {/* Stock vs Reorder Bar */}
                            <td className="px-4 py-3">
                              <div className="w-36 space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-bold tabular-nums">
                                  <span className="text-foreground">{item.stock.toLocaleString()}</span>
                                  <span className="text-muted-foreground font-normal">/ {reorderUnits} u</span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      item.status === "out_of_stock" || item.status === "critical"
                                        ? "bg-rose-500"
                                        : item.status === "low"
                                        ? "bg-amber-500"
                                        : "bg-blue-500"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Runway */}
                            <td className="px-4 py-3 text-xs">
                              {runway.daysOfSupply === null ? (
                                <span className="text-muted-foreground text-[11px]">—</span>
                              ) : (
                                <div>
                                  <p className={`font-semibold tabular-nums text-xs ${
                                    runway.daysOfSupply <= assumedLeadTimeDays
                                      ? "text-rose-600 dark:text-rose-400 font-bold"
                                      : "text-foreground"
                                  }`}>
                                    {runway.daysOfSupply.toFixed(1)} days supply
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {runway.dailyDemand.toFixed(1)} u/day rate
                                  </p>
                                </div>
                              )}
                            </td>

                            {/* Suggested replenishment quantity */}
                            <td className="px-4 py-3 text-xs">
                              {suggestedQty > 0 ? (
                                <>
                                  <p className="font-bold text-foreground tabular-nums">
                                    {suggestedQty.toLocaleString()} {item.unitLabel ?? "units"}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{suggestionBasis}</p>
                                </>
                              ) : (
                                <>
                                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">No reorder needed</p>
                                  <p className="text-[10px] text-muted-foreground">Stock meets the target</p>
                                </>
                              )}
                            </td>

                            {/* Action Button */}
                            <td className="px-5 py-3 text-right">
                              {canManageStock && (
                                <button
                                  type="button"
                                  onClick={() => onEditProduct(item, suggestedQty)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-[11px] font-semibold hover:opacity-90 shadow-2xs transition-all"
                                >
                                  <RefreshCw size={11} />
                                  Add stock
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    : paginatedExpiry.map(({ product: item, info }) => {
                        const risk = getExpiryVelocityRisk(item, info.daysLeft);
                        const isExpired = info.level === "expired";
                        const is30 = info.level === "within30";

                        return (
                          <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                            {/* Product & Category */}
                            <td className="px-5 py-3">
                              <p className="text-xs font-bold text-foreground">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{item.id} · {item.category}</p>
                            </td>

                            {/* Expiry Date */}
                            <td className="px-4 py-3 text-xs font-semibold tabular-nums">
                              <span className={isExpired ? "text-rose-600 dark:text-rose-400 font-bold" : "text-foreground"}>
                                {info.expiry}
                              </span>
                            </td>

                            {/* Timeline Badge */}
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                isExpired
                                  ? "bg-rose-500/10 text-rose-700 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30"
                                  : is30
                                  ? "bg-orange-500/10 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30"
                                  : "bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
                              }`}>
                                {isExpired ? `${info.daysLeft}d ago` : `${info.daysLeft}d left`}
                              </span>
                            </td>

                            {/* Stock on Shelf */}
                            <td className="px-4 py-3 text-xs font-bold text-foreground tabular-nums">
                              {item.stock.toLocaleString()} units
                            </td>

                            {/* Velocity Risk */}
                            <td className="px-4 py-3 text-xs">
                              {isExpired ? (
                                <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                  Discard immediate
                                </span>
                              ) : risk.atRiskUnits > 0 ? (
                                <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                  ~{risk.atRiskUnits} units at risk
                                </span>
                              ) : (
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                  Sufficient velocity
                                </span>
                              )}
                            </td>

                            {/* Action Button */}
                            <td className="px-5 py-3 text-right">
                              {canManageStock && (
                                <button
                                  type="button"
                                  onClick={() => onEditProduct(item)}
                                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-white shadow-2xs transition-all ${
                                    isExpired
                                      ? "bg-rose-600 hover:bg-rose-700"
                                      : "bg-orange-600 hover:bg-orange-700"
                                  }`}
                                >
                                  Manage Batch
                                  <ArrowRight size={11} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-border/60 bg-card/40 px-3 py-1">
              <TablePager total={totalCount} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
