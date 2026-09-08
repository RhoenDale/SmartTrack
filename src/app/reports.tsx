import { useState, useMemo } from "react";
import { ShoppingCart, AlertTriangle, Package, Printer } from "lucide-react";
import { type AuthUser, type Product, type Transaction } from "./data";
import { fmt, StockBadge } from "./shared";

export default function ReportsPage({
  inventory,
  transactions,
  user,
}: {
  inventory: Product[];
  transactions: Transaction[];
  user: AuthUser;
}) {
  const [activeTab, setActiveTab] = useState<"sales" | "stock" | "inventory">("sales");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const parseTransactionDate = (date: string) => {
    const [rawDate] = date.split(" ");
    const [mm, dd, yyyy] = rawDate.split("/");
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
  };

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const txDate = parseTransactionDate(tx.date);
      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`);
        if (txDate < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59`);
        if (txDate > toDate) return false;
      }
      return true;
    });
  }, [transactions, dateFrom, dateTo]);

  const sales = filteredTransactions.filter(t => t.type === "sale");
  const purchases = filteredTransactions.filter(t => t.type === "return");
  const returns = filteredTransactions.filter(t => t.type === "return");
  const totalRevenue = sales.reduce((s, t) => s + t.amount, 0);
  const totalReturns = returns.reduce((s, t) => s + t.amount, 0);
  const netRevenue = totalRevenue - totalReturns;

  const salesByProduct = useMemo(() => {
    const map: Record<string, { product: string; qty: number; amount: number }> = {};
    sales.forEach(t => {
      if (!map[t.product]) map[t.product] = { product: t.product, qty: 0, amount: 0 };
      map[t.product].qty += t.qty;
      map[t.product].amount += t.amount;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [sales]);

  const totalStock = inventory.reduce((s, p) => s + p.stock, 0);
  const totalValue = inventory.reduce((s, p) => s + p.stock * p.price, 0);
  const critical = inventory.filter(i => i.status === "critical");
  const low = inventory.filter(i => i.status === "low");
  const moderate = inventory.filter(i => i.status === "moderate");
  const good = inventory.filter(i => i.status === "good");

  const tabs: { id: "sales" | "stock" | "inventory"; label: string; icon: any }[] = [
    { id: "sales", label: "Sales Report", icon: ShoppingCart },
    { id: "stock", label: "Stock Alerts", icon: AlertTriangle },
    { id: "inventory", label: "Inventory", icon: Package },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] printable-report">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .printable-report, .printable-report * { visibility: visible !important; }
        .printable-report { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dateFrom || dateTo ? (
              <>Filtered: {dateFrom || "All time"} to {dateTo || "Present"}</>
            ) : (
              <>All-time data</>
            )}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0 no-print"
        >
          <Printer size={13} />Print
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm no-print">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Range:</label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-muted-foreground">From</label>
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)} 
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" 
            />
            <label className="text-[11px] text-muted-foreground">To</label>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)} 
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" 
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-primary hover:text-primary/80 font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-full overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-1 justify-center ${
              activeTab === t.id ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>

      {activeTab === "sales" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue", value: fmt(totalRevenue), color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Returns / Refunds", value: fmt(totalReturns), color: "text-orange-600 dark:text-orange-400" },
              { label: "Net Revenue", value: fmt(netRevenue), color: "text-primary" },
              { label: "Total Returns", value: fmt(totalReturns), color: "text-violet-600 dark:text-violet-400" },
            ].map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className={`text-lg font-bold mt-2 tabular-nums tracking-tight ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Sales", count: sales.length, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Purchase Orders", count: purchases.length, color: "text-violet-600 dark:text-violet-400" },
              { label: "Returns", count: returns.length, color: "text-orange-600 dark:text-orange-400" },
            ].map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm text-center">
                <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.count}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Sales by Product</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {dateFrom || dateTo ? `${dateFrom || "All time"} to ${dateTo || "Present"}` : "All time"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Product", "Qty Sold", "Revenue", "% of Sales"].map(h => (
                      <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salesByProduct.map(row => (
                    <tr key={row.product} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-xs font-semibold text-foreground">{row.product}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{row.qty}</td>
                      <td className="px-4 py-3 text-xs font-bold text-foreground">{fmt(row.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((row.amount / totalRevenue) * 100)}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground w-7">{Math.round((row.amount / totalRevenue) * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {salesByProduct.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">No sales recorded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "stock" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Critical", count: critical.length, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/20" },
              { label: "Low Stock", count: low.length, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20" },
              { label: "Moderate", count: moderate.length, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20" },
              { label: "Healthy", count: good.length, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className={`text-2xl font-bold tabular-nums ${c.color} mt-2`}>{c.count}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Items Requiring Action</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {critical.length + low.length + moderate.length} products below or near reorder threshold
                {dateFrom || dateTo ? ` · ${dateFrom || "All time"} to ${dateTo || "Present"}` : ""}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Product", "Category", "Current Stock", "Reorder At", "Shortage", "Status"].map(h => (
                      <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...critical, ...low, ...moderate].map(item => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{item.name}</p><p className="text-[10px] text-muted-foreground">{item.id}</p></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-xs font-bold text-foreground">{item.stock}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.reorder}</td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span className={item.stock < item.reorder ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                          {item.stock < item.reorder ? `-${item.reorder - item.stock}` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                    </tr>
                  ))}
                  {critical.length + low.length + moderate.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">All products are at healthy stock levels</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Total Products", value: String(inventory.length), color: "text-foreground" },
              { label: "Total Stock Units", value: totalStock.toLocaleString(), color: "text-primary" },
              { label: "Total Inventory Value", value: fmt(totalValue), color: "text-emerald-600 dark:text-emerald-400" },
            ].map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className={`text-xl font-bold mt-2 tabular-nums tracking-tight ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Complete Inventory</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                All products as of {new Date().toLocaleDateString()}
                {dateFrom || dateTo ? ` · Filtered by: ${dateFrom || "All time"} to ${dateTo || "Present"}` : ""}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Product", "Category", "Stock", "Unit Price", "Stock Value", "Expiry", "Status"].map(h => (
                      <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{item.name}</p><p className="text-[10px] text-muted-foreground">{item.id}</p></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-xs font-bold text-foreground">{item.stock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(item.price)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-foreground">{fmt(item.stock * item.price)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.expiry}</td>
                      <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
