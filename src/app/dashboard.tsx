import { Package, AlertTriangle, ShoppingCart, RotateCcw, Clock } from "lucide-react";
import { memo, useMemo, useState } from "react";
import {
  sortBatchesByExpiry,
  getEarliestExpiry,
  parseExpiry,
  groupCartTransactions,
  hasUserRole,
  type AuthUser,
  type Product,
  type Transaction,
} from "./data";
import type { CashierDashboardSummary } from "./api";
import { fmt, PESO, PesoIcon, SvgAreaChart, StatCard, StockBadge, TxTypeBadge, TxBadge, InfoTip } from "./shared";

// ─── Shared helpers used across all role views ────────────────────────────────
const isExplicitTestProduct = (name: string) => /TEST ITEM\s*-\s*REMOVE AFTER TEST/i.test(name);

function parseTransactionDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year, hour = "0", minute = "0"] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) return null;
  return parsed;
}

function normalizeStaffName(name: string): string {
  return name.replace(/[.\s]+/g, "").toLocaleLowerCase();
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateRange(start: Date, end: Date): string {
  const format = (date: Date) => date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  return `${format(start)} – ${format(end)}`;
}

function getSalesOverview(inventory: Product[], transactions: Transaction[], days: 7 | 30, now: number) {
  const markedTestIds = new Set(inventory.filter(product => isExplicitTestProduct(product.name)).map(product => String(product.id)));
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);

  const slots = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: dateKey(date),
      day: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      revenue: 0,
    };
  });
  const slotByDate = new Map(slots.map(slot => [slot.key, slot]));
  const products = new Map<string, { name: string; productId?: string; sold: number }>();
  let saleCount = 0;

  transactions.forEach(tx => {
    if (tx.type !== "sale") return;
    if (isExplicitTestProduct(tx.product) || (tx.productId && markedTestIds.has(String(tx.productId)))) return;
    const transactionDate = parseTransactionDate(tx.date);
    if (!transactionDate || transactionDate < start || transactionDate >= new Date(end.getTime() + 86400000)) return;
    const slot = slotByDate.get(dateKey(transactionDate));
    if (!slot) return;
    slot.revenue += Number(tx.amount) || 0;
    saleCount += 1;

    const productKey = tx.productId ? String(tx.productId) : tx.product;
    const product = products.get(productKey) ?? { name: tx.product, productId: tx.productId, sold: 0 };
    product.sold += Number(tx.qty) || 0;
    products.set(productKey, product);
  });

  const productsById = new Map(inventory.map(product => [String(product.id), product]));
  const productsByName = new Map(inventory.map(product => [product.name.trim().toLocaleLowerCase(), product]));
  const topProducts = Array.from(products.values())
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5)
    .map(product => {
      const currentProduct = product.productId
        ? productsById.get(String(product.productId))
        : productsByName.get(product.name.trim().toLocaleLowerCase());
      const stock = currentProduct?.stock ?? null;
      const dailyRate = product.sold / Math.max(days, 1);
      const daysLeft = stock != null && dailyRate > 0 ? Math.round(stock / dailyRate) : null;
      return { ...product, stock, daysLeft };
    });

  return {
    start,
    end,
    dateRange: formatDateRange(start, end),
    trend: saleCount > 0 ? slots : [],
    revenue: slots.reduce((sum, slot) => sum + slot.revenue, 0),
    hasSales: saleCount > 0,
    topProducts,
  };
}

function useComputedData(inventory: Product[], transactions: Transaction[]) {
  return useMemo(() => {
    const now = Date.now();
    const markedTestIds = new Set<string>();
    const operationalInventory: Product[] = [];
    for (const product of inventory) {
      if (isExplicitTestProduct(product.name)) {
        markedTestIds.add(String(product.id));
      } else {
        operationalInventory.push(product);
      }
    }
    const operationalTransactions = transactions.filter(tx =>
      !isExplicitTestProduct(tx.product) && !(tx.productId && markedTestIds.has(String(tx.productId)))
    );
    const lowStock = operationalInventory.filter(i => i.status === "out_of_stock" || i.status === "low" || i.status === "critical");

    const expired: Product[] = [];
    const within30: Product[] = [];
    const within90: Product[] = [];
    operationalInventory.forEach(p => {
      const batches = sortBatchesByExpiry(p.batches);
      if (batches.length === 0 || !batches[0].expiryDate) return;
      const earliest = batches[0];
      const msLeft = parseExpiry(earliest.expiryDate!).getTime() - now;
      if (Number.isNaN(msLeft)) return;
      const daysLeft = msLeft / (1000 * 60 * 60 * 24);
      if (daysLeft <= 0) expired.push(p);
      else if (daysLeft <= 30) within30.push(p);
      else if (daysLeft <= 90) within90.push(p);
    });
    const expiryAlerts = { expired, within30, within90 };
    const totalExpiryAlerts = expired.length + within30.length + within90.length;
    const totalAlertBadge = lowStock.length + totalExpiryAlerts;

    return { operationalInventory, operationalTransactions, lowStock, expiryAlerts, totalExpiryAlerts, totalAlertBadge };
  }, [inventory, transactions]);
}

// ─── Shared sub-components ────────────────────────────────────────────────────
const RecentTransactionsCard = memo(function RecentTransactionsCard({
  transactions,
  fullHeight = false,
}: {
  transactions: Transaction[];
  fullHeight?: boolean;
}) {
  const recentTransactions = useMemo(() => groupCartTransactions(transactions).slice(0, 6), [transactions]);
  return (
    <div className={`bg-card border border-border/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col ${fullHeight ? "h-full" : ""}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/70 bg-card/50">
        <h3 className="text-sm font-bold text-foreground">Recent Transactions</h3>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "transactions" }))}
          className="st-chip-btn"
        >
          View All
        </button>
      </div>
      <div className={`overflow-x-auto overflow-y-auto max-h-72 ${fullHeight ? "flex-1" : ""}`} data-table-scroll="fixed">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-card shadow-sm">
            <tr className="border-b border-border/70 bg-muted/30">
              {["ID", "Product", "Type", "Date", "Amount", "Status"].map(h => (
                <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 first:px-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-muted-foreground">No transactions yet</td>
              </tr>
            ) : (
              recentTransactions.slice(0, 6).map(tx => (
                <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-2.5 text-[11px] text-muted-foreground font-mono">{tx.id}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{tx.product}</td>
                  <td className="px-4 py-2.5"><TxTypeBadge type={tx.type} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{tx.date}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{fmt(tx.amount)}</td>
                  <td className="px-4 py-2.5"><TxBadge status={tx.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const StockAlertsCard = memo(function StockAlertsCard({
  inventory, expiryAlerts,
}: {
  inventory: Product[];
  expiryAlerts: { expired: Product[]; within30: Product[]; within90: Product[] };
}) {
  const { listWithExpiry, inStockCount, lowCount, outCount } = useMemo(() => {
    const map = new Map<string, Product>();
    let inStock = 0;
    let low = 0;
    let out = 0;
    for (const p of inventory) {
      if (p.status === "good" || p.status === "moderate") inStock++;
      else if (p.status === "low" || p.status === "critical") low++;
      else if (p.status === "out_of_stock") out++;
      if ((p.status === "out_of_stock" || p.status === "critical" || p.status === "low") && !isExplicitTestProduct(p.name)) {
        map.set(p.id, p);
      }
    }
    for (const p of expiryAlerts.expired) map.set(p.id, p);
    for (const p of expiryAlerts.within30) map.set(p.id, p);
    for (const p of expiryAlerts.within90) map.set(p.id, p);
    const rows = Array.from(map.values()).map(item => ({
      item,
      earliestExpiry: getEarliestExpiry(item.batches),
    }));
    return { listWithExpiry: rows, inStockCount: inStock, lowCount: low, outCount: out };
  }, [inventory, expiryAlerts]);

  return (
    <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/70 bg-card/50">
        <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-bold text-foreground">Inventory Status &amp; Alerts</h3>
          <InfoTip
            title="Stock & Expiry Alerts"
            color="amber"
            lines={[
              "Products needing restock or batch review.",
              { label: "Critical / Low", value: "Available stock is at or below reorder level" },
              { label: "Out of Stock", value: "Zero sellable units remaining" },
              { label: "Expiring", value: "Earliest batch expires within 30 to 90 days" },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}
          className="st-chip-btn"
        >
          View All
        </button>
      </div>
      <div className="px-5 py-3 border-b border-border/60 bg-muted/10">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Inventory status: ${inStockCount} in stock, ${lowCount} low stock, ${outCount} out of stock`}>
          <div className="flex h-full w-full st-bar-fill">
            {[
              { count: inStockCount, color: "bg-teal-500" },
              { count: lowCount, color: "bg-amber-400" },
              { count: outCount, color: "bg-rose-500" },
            ].map((segment, index) => (
              <span key={index} className={segment.color} style={{ width: inventory.length ? `${segment.count / inventory.length * 100}%` : "0%" }} />
            ))}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span><i className="inline-block size-2 rounded-full bg-teal-500 mr-1.5" />In stock <b className="text-foreground">{inStockCount}</b></span>
          <span><i className="inline-block size-2 rounded-full bg-amber-400 mr-1.5" />Low stock <b className="text-foreground">{lowCount}</b></span>
          <span><i className="inline-block size-2 rounded-full bg-rose-500 mr-1.5" />Out of stock <b className="text-foreground">{outCount}</b></span>
        </div>
      </div>
      <div className="divide-y divide-border/40 max-h-72 overflow-y-auto">
        {listWithExpiry.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">All stock levels healthy ✓</p>
        ) : (
          listWithExpiry.map(({ item, earliestExpiry }) => (
            <div key={item.id} className="px-5 py-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground leading-tight">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {item.stock} units · reorder at {item.reorder}
                    {earliestExpiry !== "—" && ` · Exp: ${earliestExpiry}`}
                  </p>
                </div>
                <StockBadge status={item.status} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

// ─── Role-specific greeting ───────────────────────────────────────────────────
function greeting(user: AuthUser): string {
  const hour = new Date().getHours();
  const tod  = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const first = user.name.split(" ")[0];
  return `Good ${tod}, ${first}.`;
}

function roleSub(role: string): string {
  if (role === "admin" || role === "admin/owner") return "Here's your store overview for today.";
  if (role === "inventory_manager")               return "Here's your inventory snapshot for today.";
  return "Here's your shift summary for today.";
}

function DateRangeSelect({ value, onChange }: { value: 7 | 30; onChange: (days: 7 | 30) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="sr-only">Sales date range</span>
      <select
        value={value}
        onChange={event => onChange(Number(event.target.value) as 7 | 30)}
        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <option value={7}>Last 7 days</option>
        <option value={30}>Last 30 days</option>
      </select>
    </label>
  );
}

function StockVsSalesChart({ data, dateRange }: { data: { name: string; productId?: string; sold: number; stock: number | null; daysLeft?: number | null }[]; dateRange: string }) {
  if (data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <p className="text-sm font-medium text-foreground">No sales recorded in this period</p>
        <p className="mt-1 text-xs text-muted-foreground">Product comparisons will appear after sales are recorded.</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.flatMap(item => [item.sold, item.stock ?? 0]), 1);
  return (
    <div className="h-full overflow-y-auto pr-1">
      <div key={dateRange} className="space-y-2.5">
        {data.map((product, idx) => (
          <div key={product.productId ?? product.name}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="truncate text-[11px] font-semibold text-foreground" title={product.name}>{product.name}</p>
              {product.daysLeft != null && (
                <span className={`shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold border ${
                  product.daysLeft <= 14
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {product.daysLeft === 0 ? "Out of stock" : `~${product.daysLeft > 90 ? "90+" : product.daysLeft}d stock left`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-[40px_minmax(0,1fr)_38px] items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <span>Stock</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-label={product.stock === null ? "Current stock unavailable" : `Current stock: ${product.stock} units`}>
                {product.stock !== null && (
                  <span
                    className="block h-full rounded-full bg-blue-600 st-bar-fill"
                    style={{ width: `${product.stock / maxValue * 100}%`, animationDelay: `${Math.min(idx * 45, 270)}ms` }}
                  />
                )}
              </span>
              <span className="text-right tabular-nums">{product.stock === null ? "—" : product.stock.toLocaleString()}</span>
              <span>Sold</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`${product.sold} units sold ${dateRange}`}>
                <span
                  className="block h-full rounded-full bg-violet-500 st-bar-fill"
                  style={{ width: `${product.sold / maxValue * 100}%`, animationDelay: `${Math.min(idx * 45 + 60, 330)}ms` }}
                />
              </span>
              <span className="text-right tabular-nums">{product.sold.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN / OWNER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({ computed }: {
  computed: ReturnType<typeof useComputedData>;
}) {
  const [periodDays, setPeriodDays] = useState<7 | 30>(7);
  const { operationalInventory, operationalTransactions, lowStock, expiryAlerts, totalExpiryAlerts, totalAlertBadge } = computed;
  const sales = useMemo(
    () => getSalesOverview(operationalInventory, operationalTransactions, periodDays, Date.now()),
    [operationalInventory, operationalTransactions, periodDays]
  );
  const totalUnits = useMemo(
    () => operationalInventory.reduce((s, p) => s + p.stock, 0),
    [operationalInventory]
  );
  const chartLines = useMemo(() => [{ key: "revenue", color: "#2563eb", name: "Revenue" }], []);
  const yFormatter = useMemo(
    () => (v: number) => `${PESO}${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}`,
    []
  );

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 st-grid">
        <StatCard
          label="Sales Revenue"
          value={fmt(sales.revenue)}
          sub={sales.dateRange}
          icon={PesoIcon}
          color="#2563eb"
        />
        <StatCard
          label="Current Stock"
          value={totalUnits.toLocaleString()}
          sub={`${operationalInventory.length} product lines`}
          icon={Package}
          color="#8b5cf6"
        />
        <StatCard
          label="Stock Alerts"
          value={String(totalAlertBadge)}
          sub={`${lowStock.length} low-stock alerts · ${totalExpiryAlerts} expiry alerts`}
          icon={AlertTriangle}
          trend={
            <button
              type="button"
              aria-label={`Review ${totalAlertBadge} stock and expiry alerts`}
              onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}
              className="st-chip-btn st-chip-btn--amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Review Alerts
            </button>
          }
          trendUp={false}
          showTrendIcon={false}
          color="#f59e0b"
        />
      </div>

      {/* Recorded sales + product performance */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-foreground">Revenue</h3>
                <InfoTip
                  title="Revenue Trend"
                  lines={[
                    "Daily sales totals across the selected date window.",
                    { label: "Metric scope", value: "Gross sales revenue only; operating expenses are tracked separately" },
                    { label: "Excluded", value: "Voids & test entries" },
                  ]}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Recorded sales · {sales.dateRange}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />Revenue (₱)</span>
              </div>
              <DateRangeSelect value={periodDays} onChange={setPeriodDays} />
            </div>
          </div>
          <div className="text-foreground" style={{ height: 200 }}>
            {sales.hasSales ? (
              <SvgAreaChart
                data={sales.trend}
                lines={chartLines}
                xTickInterval={periodDays === 7 ? 1 : 5}
                yFormatter={yFormatter}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-sm font-medium text-foreground">No sales recorded in this period</p>
                <p className="mt-1 text-xs text-muted-foreground">Try another date range or check back after sales are recorded.</p>
              </div>
            )}
          </div>
        </div>
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-foreground">Stock &amp; Sales by Product</h3>
                <InfoTip
                  title="Current Stock & Sales"
                  lines={[
                    `Products ranked by units sold for ${sales.dateRange}.`,
                    { label: "Stock vs sold", value: "Pairs live Inventory counts against completed POS sales" },
                    { label: "Days left", value: "Estimated from recent daily sales pace" },
                  ]}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem("smarttrack_analytics_section", "Forecast"); } catch { /* ignore */ }
                  window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "analytics" }));
                }}
                className="st-chip-btn"
              >
                Open Forecast
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">Current stock vs units sold · {sales.dateRange}</p>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-blue-600" />Stock</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-violet-500" />Sold</span>
              </div>
            </div>
          </div>
          <div className="text-foreground" style={{ height: 200 }}>
            <StockVsSalesChart data={sales.topProducts} dateRange={sales.dateRange} />
          </div>
        </div>
      </div>

      {/* Recent transactions + stock alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        <div className="xl:col-span-2 flex flex-col">
          <RecentTransactionsCard transactions={operationalTransactions} fullHeight />
        </div>
        <StockAlertsCard inventory={operationalInventory} expiryAlerts={expiryAlerts} />
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY MANAGER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function InventoryManagerDashboard({ computed }: {
  computed: ReturnType<typeof useComputedData>;
}) {
  const [periodDays, setPeriodDays] = useState<7 | 30>(7);
  const { operationalInventory, operationalTransactions, lowStock, expiryAlerts, totalExpiryAlerts, totalAlertBadge } = computed;
  const sales = useMemo(
    () => getSalesOverview(operationalInventory, operationalTransactions, periodDays, Date.now()),
    [operationalInventory, operationalTransactions, periodDays]
  );

  const { totalStock, criticalCount, lowCount, outOfStockCount, retailValue } = useMemo(() => {
    let stockSum = 0;
    let retailSum = 0;
    let crit = 0;
    let lw = 0;
    let out = 0;
    for (const p of operationalInventory) {
      stockSum += p.stock;
      retailSum += p.stock * p.price;
    }
    for (const i of lowStock) {
      if (i.status === "critical") crit++;
      else if (i.status === "low") lw++;
      else if (i.status === "out_of_stock") out++;
    }
    return { totalStock: stockSum, criticalCount: crit, lowCount: lw, outOfStockCount: out, retailValue: retailSum };
  }, [operationalInventory, lowStock]);

  return (
    <>
      {/* KPI cards — inventory-focused */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 st-grid">
        <StatCard
          label="Total Stock Units"
          value={totalStock.toLocaleString()}
          sub={`${operationalInventory.length} product lines`}
          icon={Package}
          color="#8b5cf6"
        />
        <StatCard
          label="Stock Retail Value"
          value={fmt(retailValue)}
          sub="Current units × selling price"
          icon={PesoIcon}
          color="#2563eb"
        />
        <StatCard
          label="Stock Alerts"
          value={String(totalAlertBadge)}
          sub={`${outOfStockCount} out of stock · ${criticalCount} critical · ${lowCount} low`}
          icon={AlertTriangle}
          trend={
            <button
              type="button"
              aria-label={`Review ${totalAlertBadge} stock and expiry alerts`}
              onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}
              className="st-chip-btn st-chip-btn--amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Review Alerts
            </button>
          }
          trendUp={false}
          showTrendIcon={false}
          color="#f59e0b"
        />
        <StatCard
          label="Expiring Soon"
          value={String(totalExpiryAlerts)}
          sub={`${expiryAlerts.expired.length} expired · ${expiryAlerts.within30.length} within 30 days`}
          icon={Clock}
          trendUp={false}
          color="#ef4444"
        />
      </div>

      {/* Top products + stock alerts side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="mb-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-foreground">Stock &amp; Sales by Product</h3>
              <InfoTip
                title="Current Stock & Sales"
                lines={[
                  `Products ranked by units sold for ${sales.dateRange}.`,
                  { label: "Shared scale", value: "Bars compare current Inventory stock side-by-side with recent sales" },
                  { label: "Excluded", value: "Test data entries" },
                ]}
              />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground">Current stock vs units sold · {sales.dateRange}</p>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-blue-600" />Stock</span>
                  <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-violet-500" />Sold</span>
                </div>
              </div>
              <DateRangeSelect value={periodDays} onChange={setPeriodDays} />
            </div>
          </div>
          <div className="text-foreground" style={{ height: 210 }}>
            <StockVsSalesChart data={sales.topProducts} dateRange={sales.dateRange} />
          </div>
        </div>
        <StockAlertsCard inventory={operationalInventory} expiryAlerts={expiryAlerts} />
      </div>

      {/* Expiry breakdown cards */}
      {totalExpiryAlerts > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Expired",        items: expiryAlerts.expired,  color: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",    text: "text-red-700 dark:text-red-400" },
            { label: "Expires ≤ 30 d", items: expiryAlerts.within30, color: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800", text: "text-orange-700 dark:text-orange-400" },
            { label: "Expires ≤ 90 d", items: expiryAlerts.within90, color: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",   text: "text-amber-700 dark:text-amber-400" },
          ].map(({ label, items, color, text }) => (
            <div key={label} className={`rounded-xl border p-4 shadow-sm ${color}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${text}`}>{label}</p>
              <p className={`text-3xl font-bold tabular-nums mt-2 ${text}`}>{items.length}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {items.length === 0 ? "None" : items.slice(0, 3).map(p => p.name).join(", ") + (items.length > 3 ? "…" : "")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Recent transactions */}
      <RecentTransactionsCard transactions={operationalTransactions} />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHIER / PHARMACIST DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function CashierDashboard({ user, computed, summary }: {
  user: AuthUser;
  computed: ReturnType<typeof useComputedData>;
  summary: CashierDashboardSummary | null;
}) {
  const { operationalInventory, operationalTransactions, expiryAlerts } = computed;

  // Filter to this cashier's own transactions
  const myTxns = useMemo(() => {
    const [firstName, ...remainingName] = user.name.trim().split(/\s+/);
    const abbreviatedName = [firstName ? `${firstName[0]}.` : "", ...remainingName]
      .join(" ")
      .toLocaleLowerCase();
    const cashierNames = new Set([normalizeStaffName(user.name), normalizeStaffName(abbreviatedName)]);
    return operationalTransactions.filter(tx =>
      tx.staffId === user.id ||
      (!tx.staffId && cashierNames.has(normalizeStaffName(tx.staff)))
    );
  }, [operationalTransactions, user.id, user.name]);

  return (
    <>
      {/* Cashier KPIs — their own numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 st-grid">
        <StatCard
          label="My Sales Today"
          value={summary ? fmt(summary.todayRevenue) : "—"}
          sub={summary ? `${summary.todaySalesCount} transaction${summary.todaySalesCount !== 1 ? "s" : ""}` : "Database unavailable"}
          icon={PesoIcon}
          color="#2563eb"
        />
        <StatCard
          label="Units Dispensed Today"
          value={summary ? summary.todayUnits.toLocaleString() : "—"}
          sub="Items sold today"
          icon={ShoppingCart}
          color="#8b5cf6"
        />
        <StatCard
          label="My Returns Today"
          value={summary ? String(summary.todayReturnsCount) : "—"}
          sub={summary ? `${summary.todayReturnedUnits} units returned` : "Database unavailable"}
          icon={RotateCcw}
          trendUp={false}
          color="#f97316"
        />
        <StatCard
          label="Stock Alerts"
          value={summary ? String(summary.stockAlertCount) : "—"}
          sub="Items needing attention"
          icon={AlertTriangle}
          trend={
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}
              className="st-chip-btn st-chip-btn--amber"
            >
              Review Alerts
            </button>
          }
          trendUp={false}
          showTrendIcon={false}
          color="#f59e0b"
        />
      </div>

      {/* Weekly summary bar */}
      <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">My Sales This Week</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">All transactions attributed to your account</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Revenue</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{summary ? fmt(summary.weekRevenue) : "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Transactions</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{summary ? summary.weekSalesCount : "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* My recent transactions + stock alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        <div className="xl:col-span-2">
          <RecentTransactionsCard transactions={myTxns} fullHeight />
        </div>
        <StockAlertsCard inventory={operationalInventory} expiryAlerts={expiryAlerts} />
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — routes to the right dashboard by role
// ══════════════════════════════════════════════════════════════════════════════
const DashboardView = memo(function DashboardView({ user, inventory, transactions, cashierDashboard }: {
  user: AuthUser;
  inventory: Product[];
  transactions: Transaction[];
  cashierDashboard: CashierDashboardSummary | null;
}) {
  const computed = useComputedData(inventory, transactions);
  const isAdmin  = hasUserRole(user, "admin") || hasUserRole(user, "admin/owner");
  const isInventoryManager = hasUserRole(user, "inventory_manager");
  const isCashier = hasUserRole(user, "cashier");

  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: "calc(100dvh - 56px)" }}>
      {/* Fixed Header — same for all roles */}
      <div className="flex-shrink-0 st-shell-px pt-4 sm:pt-5 pb-3 bg-background border-b border-border/60 z-20">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {greeting(user)} {roleSub(isAdmin ? "admin" : isInventoryManager ? "inventory_manager" : "cashier")}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto st-shell-px py-5 space-y-5" data-table-scroll="fixed">
        {isAdmin && <AdminDashboard computed={computed} />}
        {!isAdmin && isInventoryManager && <InventoryManagerDashboard computed={computed} />}
        {!isAdmin && !isInventoryManager && isCashier && <CashierDashboard user={user} computed={computed} summary={cashierDashboard} />}
      </div>
    </div>
  );
});

export default DashboardView;
