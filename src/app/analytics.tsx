import { useEffect, useMemo, useState } from "react";
import { Package, TrendingUp, RotateCcw } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  PIE_COLORS, getReorderUnits,
  getMonthlyDemand, computeSMA, estimateEOQ,
  type Product, type Transaction,
} from "./data";
import { fmt, SvgAreaChart, StockBadge } from "./shared";
import { analyticsApi, returnRequestsApi, type ReturnRequest } from "./api";

export default function AnalyticsPage({
  inventory,
  transactions,
}: {
  inventory: Product[];
  transactions: Transaction[];
}) {
  const [scope, setScope] = useState("all");
  const [smaData, setSmaData] = useState<Awaited<ReturnType<typeof analyticsApi.sma>> | null>(null);
  const [smaLoading, setSmaLoading] = useState(true);
  const [categoryData, setCategoryData] = useState<Awaited<ReturnType<typeof analyticsApi.categorySales>>>([]);
  const [categorySalesLoading, setCategorySalesLoading] = useState(true);
  const [categorySalesError, setCategorySalesError] = useState(false);

  const scopeFilter = useMemo(() => {
    if (scope.startsWith("product:")) return { productId: scope.slice(8) };
    if (scope.startsWith("category:")) return { category: scope.slice(9) };
    return {};
  }, [scope]);

  useEffect(() => {
    let active = true;
    setSmaLoading(true);
    analyticsApi.sma(scopeFilter)
      .then(data => { if (active) setSmaData(data); })
      .catch(error => console.error("Analytics chart load failed:", error))
      .finally(() => { if (active) setSmaLoading(false); });
    return () => { active = false; };
  }, [scopeFilter]);

  useEffect(() => {
    let active = true;
    setCategorySalesLoading(true);
    setCategorySalesError(false);
    analyticsApi.categorySales()
      .then(data => { if (active) setCategoryData(data); })
      .catch(error => {
        console.error("Category sales chart load failed:", error);
        if (active) setCategorySalesError(true);
      })
      .finally(() => { if (active) setCategorySalesLoading(false); });
    return () => { active = false; };
  }, [transactions, inventory]);

  const monthlyDemand = useMemo(() => getMonthlyDemand(transactions), [transactions]);
  const demandValues = monthlyDemand.map(d => d.demand);
  const forecastSMA3 = smaData?.sma3 ?? 0;
  const forecastSMA6 = smaData?.sma6 ?? 0;

  const avgUnitCost = useMemo(() => {
    const batches = inventory.flatMap(product => product.batches);
    const unitsWithCost = batches.reduce((sum, batch) => sum + (batch.unitCost != null ? batch.qty : 0), 0);
    if (unitsWithCost === 0) return 0;
    const inventoryCost = batches.reduce(
      (sum, batch) => sum + (batch.unitCost != null ? batch.unitCost * batch.qty : 0),
      0
    );
    return inventoryCost / unitsWithCost;
  }, [inventory]);

  const annualDemand = useMemo(
    () => demandValues.reduce((sum, v) => sum + v, 0) * (12 / Math.max(monthlyDemand.length, 1)),
    [demandValues, monthlyDemand]
  );
  const eoqOverall = useMemo(() => estimateEOQ(Math.round(annualDemand), avgUnitCost), [annualDemand, avgUnitCost]);

  const reorderRecs = useMemo(() => {
    return inventory
      .filter(p => p.status === "out_of_stock" || p.status === "critical" || p.status === "low")
      .map(p => {
        const salesForProduct = transactions.filter(t => t.type === "sale" && t.productId === p.id);
        const totalSold = salesForProduct.reduce((s, t) => s + t.qty, 0);
        const months = Math.max(monthlyDemand.length, 1);
        const annualProductDemand = (totalSold / months) * 12;
        const batchesWithCost = p.batches.filter(batch => batch.unitCost != null);
        const costUnits = batchesWithCost.reduce((sum, batch) => sum + batch.qty, 0);
        const productUnitCost = costUnits > 0
          ? batchesWithCost.reduce((sum, batch) => sum + (batch.unitCost ?? 0) * batch.qty, 0) / costUnits
          : 0;
        const productEOQ = estimateEOQ(Math.round(annualProductDemand), productUnitCost);
        return { product: p, eoq: productEOQ, totalSold, shortage: Math.max(0, getReorderUnits(p) - p.stock) };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }, [inventory, transactions, monthlyDemand]);

  const smaChartData = smaData?.chartData ?? [];
  const scopeLabel = scope === "all" ? "All products" : scope.replace("product:", "").replace("category:", "");
  const categories = useMemo(
    () => Array.from(new Set(inventory.flatMap(product =>
      product.categories?.length ? product.categories : product.category.split(",").map(category => category.trim()).filter(Boolean)
    ))).sort(),
    [inventory]
  );

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

  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [returnRequestsLoading, setReturnRequestsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setReturnRequestsLoading(true);
    returnRequestsApi.list()
      .then(data => { if (active) setReturnRequests(data); })
      .catch(error => console.error("Return requests load failed:", error))
      .finally(() => { if (active) setReturnRequestsLoading(false); });
    return () => { active = false; };
  }, [transactions]);

  const restockedCount = returnRequests.filter(r => r.disposition === "restocked").length;
  const brokenCount    = returnRequests.filter(r => r.disposition === "broken").length;
  const pendingCount   = returnRequests.filter(r => r.disposition === "pending").length;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Supply-Demand Analysis · SMA Forecast + EOQ Reorder Model</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex-1">
          <p className="text-xs font-bold text-foreground">Supply-Demand Scope</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Compare database sales, received stock, and forecast for a product or category.</p>
        </div>
        <select
          value={scope}
          onChange={event => setScope(event.target.value)}
          className="w-full sm:w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          <option value="all">All products</option>
          <optgroup label="Products">
            {inventory.map(product => <option key={product.id} value={`product:${product.id}`}>{product.name} ({product.id})</option>)}
          </optgroup>
          <optgroup label="Categories">
            {categories.map(category => <option key={category} value={`category:${category}`}>{category}</option>)}
          </optgroup>
        </select>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {[
          { label: "SMA Forecast (3-month)", value: `${Math.round(forecastSMA3).toLocaleString()} units`, sub: "Short-term demand forecast", color: "text-sky-600 dark:text-sky-400" },
          { label: "SMA Forecast (6-month)", value: `${Math.round(forecastSMA6).toLocaleString()} units`, sub: "Medium-term demand trend", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "EOQ Recommendation", value: `${eoqOverall.toLocaleString()} units`, sub: "Optimal replenishment quantity", color: "text-amber-600 dark:text-amber-400" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight">{m.value}</p>
            <p className={`text-xs mt-1 font-medium ${m.color}`}>{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Returns · Pending</p>
          <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight">{pendingCount} return{pendingCount !== 1 ? "s" : ""}</p>
          <p className="text-xs mt-1 font-medium text-amber-600 dark:text-amber-400">Awaiting disposition</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Returns · Restocked</p>
          <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight">{restockedCount} return{restockedCount !== 1 ? "s" : ""}</p>
          <p className="text-xs mt-1 font-medium text-emerald-600 dark:text-emerald-400">Added back to inventory</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Returns · Broken</p>
          <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight">{brokenCount} return{brokenCount !== 1 ? "s" : ""}</p>
          <p className="text-xs mt-1 font-medium text-red-600 dark:text-red-400">Marked out of stock</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm h-[420px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Supply vs. Demand + SMA Forecast</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{scopeLabel} · Database sales and received batches · SMA forecast</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Supply</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Demand</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />SMA-3</span>
            </div>
          </div>
          <div className="text-foreground" style={{ height: 300 }}>
            {smaLoading ? (
              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Loading database analytics…</div>
            ) : smaChartData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No sales data for this scope.</div>
            ) : (
              <SvgAreaChart
                data={smaChartData}
                lines={[
                  { key: "supply", color: "#0d9488", name: "Supply", axis: "right" },
                  { key: "demand", color: "#8b5cf6", name: "Demand" },
                  { key: "sma3", color: "#f97316", name: "SMA-3" },
                ]}
                yFormatter={v => v > 999 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))}
              />
            )}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-[420px] flex flex-col min-h-0">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-foreground">Sales by Category</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Sales for products assigned to each category</p>
          </div>
          <div className="h-[170px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {categoryData.length > 0 && (
                  <>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={3} dataKey="value">
                      {categoryData.map((_, i) => <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `${v}%`}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "11px", color: "var(--foreground)" }}
                    />
                  </>
                )}
              </PieChart>
            </ResponsiveContainer>
          </div>
          {categorySalesLoading ? (
            <p className="text-xs text-muted-foreground text-center">Loading category sales…</p>
          ) : categorySalesError ? (
            <p className="text-xs text-destructive text-center">Unable to load category sales.</p>
          ) : categoryData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center">No sales data available.</p>
          ) : <div className="space-y-2 mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
            {categoryData.map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-xs text-muted-foreground">{cat.name}</span>
                </div>
                <span className="text-xs font-bold text-foreground">{cat.value}%</span>
              </div>
            ))}
          </div>}
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
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{p.reorder} packs ({getReorderUnits(p)} units)</td>
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

      {returnRequests.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <RotateCcw size={14} className="text-orange-500" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Return Records</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">All customer returns — restocked back to inventory or marked as broken</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  {["Return ID", "Product", "Qty", "Cashier", "Date", "Reason", "Disposition"].map(h => (
                    <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {returnRequests.map(r => (
                  <tr key={r.returnTxId} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 text-[11px] text-muted-foreground font-mono">{r.returnTxId}</td>
                    <td className="px-4 py-3 text-xs font-bold text-foreground">{r.product}</td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400">{r.qty}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.cashier}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{r.createdAt}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.reason}</td>
                    <td className="px-4 py-3">
                      {r.disposition === "restocked" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Restocked</span>
                      )}
                      {r.disposition === "broken" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Broken</span>
                      )}
                      {r.disposition === "pending" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Pending</span>
                      )}
                    </td>
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
