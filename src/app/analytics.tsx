import { useMemo } from "react";
import { Package, TrendingUp, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  PIE_COLORS,
  getMonthlyDemand, computeSMA, estimateEOQ,
  type Product, type Transaction,
} from "./data";
import { fmt, SvgAreaChart, StockBadge } from "./shared";

export default function AnalyticsPage({
  inventory,
  transactions,
}: {
  inventory: Product[];
  transactions: Transaction[];
}) {
  const monthlyDemand = useMemo(() => getMonthlyDemand(transactions), [transactions]);
  const demandValues = monthlyDemand.map(d => d.demand);
  const forecastSMA3 = useMemo(() => computeSMA(demandValues, 3), [demandValues]);
  const forecastSMA6 = useMemo(() => computeSMA(demandValues, 6), [demandValues]);

  const avgUnitCost = useMemo(() => {
    if (inventory.length === 0) return 8.75;
    return inventory.reduce((s, p) => s + p.price, 0) / inventory.length;
  }, [inventory]);

  const annualDemand = useMemo(
    () => demandValues.reduce((sum, v) => sum + v, 0) * (12 / Math.max(monthlyDemand.length, 1)),
    [demandValues, monthlyDemand]
  );
  const eoqOverall = useMemo(() => estimateEOQ(Math.round(annualDemand), avgUnitCost), [annualDemand, avgUnitCost]);

  const reorderRecs = useMemo(() => {
    return inventory
      .filter(p => p.status === "critical" || p.status === "low")
      .map(p => {
        const salesForProduct = transactions.filter(t => t.type === "sale" && t.productId === p.id);
        const totalSold = salesForProduct.reduce((s, t) => s + t.qty, 0);
        const months = Math.max(monthlyDemand.length, 1);
        const annualProductDemand = (totalSold / months) * 12;
        const productEOQ = estimateEOQ(Math.round(annualProductDemand) || p.reorder * 4, p.price);
        return { product: p, eoq: productEOQ, totalSold, shortage: Math.max(0, p.reorder - p.stock) };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }, [inventory, transactions, monthlyDemand]);

  const smaChartData = useMemo(() => {
    return monthlyDemand.map((d, i) => ({
      month: d.month,
      demand: d.demand,
      supply: inventory.reduce((s, p) => s + (p.batches[i]?.qty ?? 0), 0) || Math.round(d.demand * 1.05),
      sma3: i >= 2 ? computeSMA(demandValues.slice(0, i + 1), 3) : null,
      sma6: i >= 5 ? computeSMA(demandValues.slice(0, i + 1), 6) : null,
    }));
  }, [monthlyDemand, inventory, demandValues]);

  // Compute category breakdown from live transactions
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    transactions.filter(t => t.type === "sale").forEach(t => {
      const prod = inventory.find(p => p.id === t.productId);
      const cat = prod?.category ?? "Other";
      map.set(cat, (map.get(cat) ?? 0) + t.qty);
    });
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, value: Math.round((qty / total) * 100) }));
  }, [transactions, inventory]);

  const perf = useMemo(() => {
    const map: Record<string, { name: string; cat: string; units: number; rev: number }> = {};
    transactions.filter(t => t.type === "sale").forEach(t => {
      if (!map[t.product]) {
        const prod = inventory.find(p => p.id === t.productId);
        map[t.product] = { name: t.product, cat: prod?.category ?? "—", units: 0, rev: 0 };
      }
      map[t.product].units += t.qty;
      map[t.product].rev += t.amount;
    });
    const rows = Object.values(map).sort((a, b) => b.rev - a.rev);
    const maxRev = rows[0]?.rev ?? 1;
    return rows.map(r => ({
      ...r,
      level: r.rev / maxRev > 0.5 ? "High" : r.rev / maxRev > 0.2 ? "Moderate" : "Stable",
    }));
  }, [transactions, inventory]);

  const adjustments = transactions.filter(t => t.type === "adjustment");
  const totalDamaged = adjustments.reduce((s, t) => s + (t.damagedQty ?? t.qty), 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Supply-Demand Analysis · SMA Forecast + EOQ Reorder Model</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "SMA Forecast (3-month)", value: `${Math.round(forecastSMA3).toLocaleString()} units`, sub: "Short-term demand forecast", color: "text-sky-600 dark:text-sky-400" },
          { label: "SMA Forecast (6-month)", value: `${Math.round(forecastSMA6).toLocaleString()} units`, sub: "Medium-term demand trend", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "EOQ Recommendation", value: `${eoqOverall.toLocaleString()} units`, sub: "Optimal replenishment quantity", color: "text-amber-600 dark:text-amber-400" },
          { label: "Damaged / Adjusted", value: `${totalDamaged} units`, sub: `${adjustments.length} adjustment record${adjustments.length !== 1 ? "s" : ""}`, color: "text-red-600 dark:text-red-400" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight">{m.value}</p>
            <p className={`text-xs mt-1 font-medium ${m.color}`}>{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Supply vs. Demand + SMA Forecast</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Computed from sales transactions · SMA overlays show forecast trend</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Supply</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Demand</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />SMA-3</span>
            </div>
          </div>
          <div className="text-foreground" style={{ height: 220 }}>
            <SvgAreaChart
              data={smaChartData}
              lines={[
                { key: "supply", color: "#0d9488", name: "Supply" },
                { key: "demand", color: "#8b5cf6", name: "Demand" },
                { key: "sma3", color: "#38bdf8", name: "SMA-3" },
              ]}
              yFormatter={v => v > 999 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))}
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-foreground">Sales by Category</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Based on transaction records</p>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={3} dataKey="value">
                {categoryData.map((_, i) => <Cell key={`cell-${i}`} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip
                formatter={(v: any) => `${v}%`}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "11px", color: "var(--foreground)" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {categoryData.map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-xs text-muted-foreground">{cat.name}</span>
                </div>
                <span className="text-xs font-bold text-foreground">{cat.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reorderRecs.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <TrendingUp size={14} className="text-amber-500" />
            <div>
              <h3 className="text-sm font-bold text-foreground">EOQ Reorder Recommendations</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Optimal order quantities computed using the Economic Order Quantity model</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  {["Product", "Category", "Current Stock", "Reorder Point", "Shortage", "EOQ (Optimal Order Qty)", "Action"].map(h => (
                    <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reorderRecs.map(({ product: p, eoq, shortage }) => (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.id}</p></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.category}</td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-foreground">{p.stock}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{p.reorder}</td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-red-600 dark:text-red-400">{shortage > 0 ? `-${shortage}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 rounded-lg text-xs font-bold tabular-nums">
                        <Package size={10} />{eoq.toLocaleString()} units
                      </span>
                    </td>
                    <td className="px-4 py-3"><StockBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Product Performance</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Computed from historical sales transaction records</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                {["Product", "Category", "Units Sold", "Revenue", "Demand Level"].map(h => (
                  <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perf.length > 0 ? perf.map(row => (
                <tr key={row.name} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-xs font-bold text-foreground">{row.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.cat}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-foreground">{row.units}</td>
                  <td className="px-4 py-3 text-xs font-bold tabular-nums text-foreground">{fmt(row.rev)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      row.level === "High" ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20"
                      : row.level === "Moderate" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                    }`}>{row.level}</span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No sales data available yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adjustments.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Inventory Adjustments &amp; Damage Records</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Managed through the Inventory Adjustments and Return/Refund Tracking process</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  {["Adj. ID", "Product", "Qty Deducted", "Staff", "Date", "Reason"].map(h => (
                    <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adjustments.map(tx => (
                  <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 text-[11px] text-muted-foreground">{tx.id}</td>
                    <td className="px-4 py-3 text-xs font-bold text-foreground">{tx.product}</td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-red-600 dark:text-red-400">{tx.qty}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tx.staff}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{tx.date}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tx.adjustmentReason ?? tx.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
