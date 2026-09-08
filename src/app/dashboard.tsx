import { Package, TrendingUp, AlertTriangle } from "lucide-react";
import {
  sortBatchesFIFO,
  getEarliestExpiry,
  parseExpiry,
  type AuthUser,
  type Product,
  type Transaction,
} from "./data";
import { fmt, PESO, PesoIcon, SvgAreaChart, SvgBarChart, StatCard, StockBadge, TxTypeBadge, TxBadge } from "./shared";

export default function DashboardView({ user, inventory, transactions }: {
  user: AuthUser;
  inventory: Product[];
  transactions: Transaction[];
}) {
  const lowStock = inventory.filter(i => i.status === "low" || i.status === "critical");

  // Compute weekly revenue/profit from real transactions
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

  const now = Date.now();
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

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Good morning, {user.name.split(" ")[user.role === "admin" ? 1 : 0]}. Here&apos;s what&apos;s happening today.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Weekly Revenue" value={fmt(weekRevenue)} sub="Jun 19–25, 2025" icon={PesoIcon} trend="+12.4% vs last week" trendUp color="#0d9488" />
        <StatCard label="Weekly Profit" value={fmt(weekProfit)} sub="Net after cost of goods" icon={TrendingUp} trend="+8.1% vs last week" trendUp color="#06b6d4" />
        <StatCard label="Total Stock Units" value={inventory.reduce((s, p) => s + p.stock, 0).toLocaleString()} sub={`${inventory.length} product lines`} icon={Package} color="#8b5cf6" />
        <StatCard
          label="Stock Alerts"
          value={String(totalAlertBadge)}
          sub={`${lowStock.filter(i => i.status === "critical").length} critical • ${lowStock.filter(i => i.status === "low").length} low • ${totalExpiryAlerts} expiring`}
          icon={AlertTriangle}
          trend={<span className="cursor-pointer underline" onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "stock-alerts" }))}>Needs attention</span>}
          trendUp={false}
          color="#f59e0b"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Revenue &amp; Profit</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">This week · Jul 20–26</p>
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl overflow-hidden shadow-sm">
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
                {transactions.slice(0, 6).map(tx => (
                  <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-2.5 text-[11px] text-muted-foreground">{tx.id}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{tx.product}</td>
                    <td className="px-4 py-2.5"><TxTypeBadge type={tx.type} /></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{tx.date}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{fmt(tx.amount)}</td>
                    <td className="px-4 py-2.5"><TxBadge status={tx.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Stock Alerts</h3>
            <AlertTriangle size={14} className="text-amber-500" />
          </div>
          <div className="divide-y divide-border/50">
            {(() => {
              const map = new Map<string, Product>();
              inventory.filter(i => i.status !== "good").forEach(p => map.set(p.id, p));
              [...expiryAlerts.expired, ...expiryAlerts.within30, ...expiryAlerts.within90].forEach(p => map.set(p.id, p));
              const list = Array.from(map.values());
              if (list.length === 0)
                return <p className="text-center text-sm text-muted-foreground py-6">All stock levels healthy</p>;
              return list.map(item => (
                <div key={item.id} className="px-5 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-foreground leading-tight">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {item.stock} units • reorder at {item.reorder} • Exp: {getEarliestExpiry(item.batches)}
                      </p>
                    </div>
                    <StockBadge status={item.status} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
