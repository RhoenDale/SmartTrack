import { Package, TrendingUp, AlertTriangle, ShoppingCart, RotateCcw, Clock } from "lucide-react";
import {
  sortBatchesFIFO,
  getEarliestExpiry,
  parseExpiry,
  type AuthUser,
  type Product,
  type Transaction,
} from "./data";
import { fmt, PESO, PesoIcon, SvgAreaChart, SvgBarChart, StatCard, StockBadge, TxTypeBadge, TxBadge } from "./shared";

// ─── Shared helpers used across all role views ────────────────────────────────
function useComputedData(inventory: Product[], transactions: Transaction[], now: number) {
  const lowStock = inventory.filter(i => i.status === "low" || i.status === "critical");

  const weekData = (() => {
    const days: { key: string; revenue: number; profit: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { weekday: "short" });
      days.push({ key, revenue: 0, profit: 0 });
    }
    transactions.forEach(tx => {
      if (tx.type !== "sale") return;
      const dt = new Date(tx.date);
      const dayKey = dt.toLocaleDateString("en-US", { weekday: "short" });
      const slot = days.find(d => d.key === dayKey);
      if (slot) { slot.revenue += tx.amount; slot.profit += tx.amount * 0.6; }
    });
    return days;
  })();

  const weekRevenue = weekData.reduce((s, d) => s + d.revenue, 0);
  const weekProfit  = weekData.reduce((s, d) => s + d.profit,  0);

  const topProducts = (() => {
    const counts = new Map<string, number>();
    transactions.forEach(tx => {
      if (tx.type !== "sale") return;
      counts.set(tx.product, (counts.get(tx.product) || 0) + tx.qty);
    });
    return Array.from(counts.entries())
      .map(([name, sold]) => ({ name, sold }))
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5);
  })();

  const expiryAlerts = (() => {
    const expired: Product[] = [];
    const within30: Product[] = [];
    const within90: Product[] = [];
    inventory.forEach(p => {
      const batches = sortBatchesFIFO(p.batches);
      if (batches.length === 0) return;
      const earliest = batches[0];
      const msLeft = parseExpiry(earliest.expiryDate ?? earliest.expiry).getTime() - now;
      const daysLeft = msLeft / (1000 * 60 * 60 * 24);
      if (daysLeft <= 0) expired.push(p);
      else if (daysLeft <= 30) within30.push(p);
      else if (daysLeft <= 90) within90.push(p);
    });
    return { expired, within30, within90 };
  })();

  const totalExpiryAlerts =
    expiryAlerts.expired.length + expiryAlerts.within30.length + expiryAlerts.within90.length;
  const totalAlertBadge = lowStock.length + totalExpiryAlerts;

  return { lowStock, weekData, weekRevenue, weekProfit, topProducts, expiryAlerts, totalExpiryAlerts, totalAlertBadge };
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function RecentTransactionsCard({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">Recent Transactions</h3>
        <span
          onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "transactions" }))}
          className="text-[11px] text-primary font-semibold cursor-pointer hover:underline"
        >
          View all
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["ID", "Product", "Type", "Date", "Amount", "Status"].map(h => (
                <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 first:px-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-muted-foreground">No transactions yet</td>
              </tr>
            ) : (
              transactions.slice(0, 6).map(tx => (
                <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
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
}

function StockAlertsCard({
  inventory, expiryAlerts,
}: {
  inventory: Product[];
  expiryAlerts: { expired: Product[]; within30: Product[]; within90: Product[] };
}) {
  const map = new Map<string, Product>();
  inventory.filter(i => i.status !== "good").forEach(p => map.set(p.id, p));
  [...expiryAlerts.expired, ...expiryAlerts.within30, ...expiryAlerts.within90].forEach(p => map.set(p.id, p));
  const list = Array.from(map.values());

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">Stock Alerts</h3>
        <span
          onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}
          className="text-[11px] text-primary font-semibold cursor-pointer hover:underline"
        >
          View all
        </span>
      </div>
      <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
        {list.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">All stock levels healthy ✓</p>
        ) : (
          list.map(item => (
            <div key={item.id} className="px-5 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground leading-tight">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {item.stock} units · reorder at {item.reorder} · Exp: {getEarliestExpiry(item.batches)}
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
}

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

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN / OWNER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({ user, inventory, transactions, computed }: {
  user: AuthUser;
  inventory: Product[];
  transactions: Transaction[];
  computed: ReturnType<typeof useComputedData>;
}) {
  const { lowStock, weekData, weekRevenue, weekProfit, topProducts, expiryAlerts, totalExpiryAlerts, totalAlertBadge } = computed;

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Weekly Revenue" value={fmt(weekRevenue)} sub="Last 7 days of sales" icon={PesoIcon} trend="+12.4% vs last week" trendUp color="#0d9488" />
        <StatCard label="Weekly Profit"  value={fmt(weekProfit)}  sub="Net after cost of goods" icon={TrendingUp} trend="+8.1% vs last week" trendUp color="#06b6d4" />
        <StatCard label="Total Stock Units" value={inventory.reduce((s, p) => s + p.stock, 0).toLocaleString()} sub={`${inventory.length} product lines`} icon={Package} color="#8b5cf6" />
        <StatCard
          label="Stock Alerts"
          value={String(totalAlertBadge)}
          sub={`${lowStock.filter(i => i.status === "critical").length} critical · ${lowStock.filter(i => i.status === "low").length} low · ${totalExpiryAlerts} expiring`}
          icon={AlertTriangle}
          trend={<span className="cursor-pointer underline" onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}>Needs attention</span>}
          trendUp={false}
          color="#f59e0b"
        />
      </div>

      {/* Revenue chart + top products */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Revenue &amp; Profit</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">This week</p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />Profit</span>
            </div>
          </div>
          <div className="text-foreground" style={{ height: 200 }}>
            <SvgAreaChart
              data={weekData}
              lines={[{ key: "revenue", color: "#0d9488", name: "Revenue" }, { key: "profit", color: "#06b6d4", name: "Profit" }]}
              yFormatter={v => `${PESO}${(v / 1000).toFixed(0)}k`}
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-foreground">Top Selling Products</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Units sold this week</p>
          </div>
          <div className="text-foreground" style={{ height: 200 }}>
            <SvgBarChart data={topProducts} />
          </div>
        </div>
      </div>

      {/* Recent transactions + stock alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <RecentTransactionsCard transactions={transactions} />
        </div>
        <StockAlertsCard inventory={inventory} expiryAlerts={expiryAlerts} />
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY MANAGER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function InventoryManagerDashboard({ inventory, transactions, computed }: {
  inventory: Product[];
  transactions: Transaction[];
  computed: ReturnType<typeof useComputedData>;
}) {
  const { lowStock, topProducts, expiryAlerts, totalExpiryAlerts, totalAlertBadge } = computed;

  const totalStock  = inventory.reduce((s, p) => s + p.stock, 0);
  const criticalCount = lowStock.filter(i => i.status === "critical").length;
  const lowCount      = lowStock.filter(i => i.status === "low").length;
  const totalValue    = inventory.reduce((s, p) => s + p.stock * p.price, 0);

  return (
    <>
      {/* KPI cards — inventory-focused */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Stock Units"
          value={totalStock.toLocaleString()}
          sub={`${inventory.length} product lines`}
          icon={Package}
          color="#8b5cf6"
        />
        <StatCard
          label="Inventory Value"
          value={fmt(totalValue)}
          sub="At purchase price"
          icon={PesoIcon}
          color="#0d9488"
        />
        <StatCard
          label="Stock Alerts"
          value={String(totalAlertBadge)}
          sub={`${criticalCount} critical · ${lowCount} low`}
          icon={AlertTriangle}
          trend={<span className="cursor-pointer underline" onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}>View alerts</span>}
          trendUp={false}
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
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-foreground">Top Selling Products</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Total units sold (all time)</p>
          </div>
          <div className="text-foreground" style={{ height: 210 }}>
            <SvgBarChart data={topProducts} />
          </div>
        </div>
        <StockAlertsCard inventory={inventory} expiryAlerts={expiryAlerts} />
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
      <RecentTransactionsCard transactions={transactions} />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHIER / PHARMACIST DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function CashierDashboard({ user, inventory, transactions, computed }: {
  user: AuthUser;
  inventory: Product[];
  transactions: Transaction[];
  computed: ReturnType<typeof useComputedData>;
}) {
  const { expiryAlerts, totalAlertBadge } = computed;

  // Filter to this cashier's own transactions
  const myTxns = transactions.filter(tx =>
    tx.staff?.toLowerCase().includes(user.name.split(" ")[0].toLowerCase())
  );

  // Today's date string prefix for matching
  const todayPrefix = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  const todaySales   = myTxns.filter(tx => tx.type === "sale"   && tx.date.startsWith(todayPrefix));
  const todayReturns = myTxns.filter(tx => tx.type === "return" && tx.date.startsWith(todayPrefix));
  const weekSales    = myTxns.filter(tx => tx.type === "sale");

  const todayRevenue = todaySales.reduce((s, tx) => s + tx.amount, 0);
  const weekRevenue  = weekSales.reduce((s, tx) => s + tx.amount, 0);
  const todayUnits   = todaySales.reduce((s, tx) => s + tx.qty, 0);

  return (
    <>
      {/* Cashier KPIs — their own numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="My Sales Today"
          value={fmt(todayRevenue)}
          sub={`${todaySales.length} transaction${todaySales.length !== 1 ? "s" : ""}`}
          icon={PesoIcon}
          color="#0d9488"
        />
        <StatCard
          label="Units Dispensed Today"
          value={todayUnits.toLocaleString()}
          sub="Items sold today"
          icon={ShoppingCart}
          color="#8b5cf6"
        />
        <StatCard
          label="My Returns Today"
          value={String(todayReturns.length)}
          sub={`${todayReturns.reduce((s, tx) => s + tx.qty, 0)} units returned`}
          icon={RotateCcw}
          trendUp={false}
          color="#f97316"
        />
        <StatCard
          label="Stock Alerts"
          value={String(totalAlertBadge)}
          sub="Items needing attention"
          icon={AlertTriangle}
          trend={<span className="cursor-pointer underline" onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}>View alerts</span>}
          trendUp={false}
          color="#f59e0b"
        />
      </div>

      {/* Weekly summary bar */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">My Sales This Week</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">All transactions attributed to your account</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Revenue</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(weekRevenue)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Transactions</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{weekSales.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* My recent transactions + stock alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <RecentTransactionsCard transactions={myTxns.length > 0 ? myTxns : transactions} />
        </div>
        <StockAlertsCard inventory={inventory} expiryAlerts={expiryAlerts} />
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — routes to the right dashboard by role
// ══════════════════════════════════════════════════════════════════════════════
export default function DashboardView({ user, inventory, transactions }: {
  user: AuthUser;
  inventory: Product[];
  transactions: Transaction[];
}) {
  const now      = Date.now();
  const computed = useComputedData(inventory, transactions, now);
  const isAdmin  = user.role === "admin" || user.role === "admin/owner";
  const isCashier = user.role === "cashier";

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      {/* Header — same for all roles */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {greeting(user)} {roleSub(user.role)}
        </p>
      </div>

      {isAdmin    && <AdminDashboard            user={user} inventory={inventory} transactions={transactions} computed={computed} />}
      {!isAdmin && !isCashier && <InventoryManagerDashboard inventory={inventory} transactions={transactions} computed={computed} />}
      {isCashier  && <CashierDashboard          user={user} inventory={inventory} transactions={transactions} computed={computed} />}
    </div>
  );
}
