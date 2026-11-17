import { memo, useState, useMemo, useEffect } from "react";
import { ShoppingCart, AlertTriangle, Package, Printer } from "lucide-react";
import { getReorderUnits, type AuthUser, type Product, type Transaction } from "./data";
import { fmt, StockBadge, InfoTip, ConfirmDialog, SegmentedTabs, AnimatedMetricText } from "./shared";

const ReportsPage = memo(function ReportsPage({
  inventory,
  transactions,
  user: _user,
}: {
  inventory: Product[];
  transactions: Transaction[];
  user: AuthUser;
}) {
  const [activeTab, setActiveTab] = useState<"sales" | "stock" | "inventory">(() => {
    try {
      const saved = localStorage.getItem("smarttrack_reports_tab");
      if (saved === "sales" || saved === "stock" || saved === "inventory") return saved;
    } catch { /* ignore */ }
    return "sales";
  });
  useEffect(() => {
    try { localStorage.setItem("smarttrack_reports_tab", activeTab); } catch { /* ignore */ }
  }, [activeTab]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmPrint, setConfirmPrint] = useState(false);

  const parseTransactionDate = (date: string) => {
    const [rawDate] = date.split(" ");
    const [mm, dd, yyyy] = rawDate.split("/");
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
  };

  const filteredTransactions = useMemo(() => {
    if (!dateFrom && !dateTo) return transactions;
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    return transactions.filter(tx => {
      const txDate = parseTransactionDate(tx.date);
      if (fromDate && txDate < fromDate) return false;
      if (toDate && txDate > toDate) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo]);

  const { sales, returns, totalRevenue, totalReturns, netRevenue, salesByProduct } = useMemo(() => {
    const salesList: Transaction[] = [];
    const returnsList: Transaction[] = [];
    let rev = 0;
    let ret = 0;
    const map: Record<string, { product: string; qty: number; amount: number }> = {};

    for (const t of filteredTransactions) {
      if (t.type === "sale") {
        salesList.push(t);
        rev += t.amount;
        if (!map[t.product]) map[t.product] = { product: t.product, qty: 0, amount: 0 };
        map[t.product].qty += t.qty;
        map[t.product].amount += t.amount;
      } else if (t.type === "return") {
        returnsList.push(t);
        ret += t.amount;
      }
    }

    return {
      sales: salesList,
      returns: returnsList,
      totalRevenue: rev,
      totalReturns: ret,
      netRevenue: rev - ret,
      salesByProduct: Object.values(map).sort((a, b) => b.amount - a.amount),
    };
  }, [filteredTransactions]);

  const { totalStock, totalValue, outOfStock, critical, low, moderate, good, actionItems } = useMemo(() => {
    let stock = 0;
    let value = 0;
    const out: Product[] = [];
    const crit: Product[] = [];
    const lw: Product[] = [];
    const mod: Product[] = [];
    const gd: Product[] = [];

    for (const i of inventory) {
      stock += i.stock;
      value += i.stock * i.price;
      if (i.status === "out_of_stock") out.push(i);
      else if (i.status === "critical") crit.push(i);
      else if (i.status === "low") lw.push(i);
      else if (i.status === "moderate") mod.push(i);
      else gd.push(i);
    }

    return {
      totalStock: stock,
      totalValue: value,
      outOfStock: out,
      critical: crit,
      low: lw,
      moderate: mod,
      good: gd,
      actionItems: [...out, ...crit, ...lw, ...mod],
    };
  }, [inventory]);

  const tabs: { id: "sales" | "stock" | "inventory"; label: string; icon: any }[] = [
    { id: "sales",     label: "Sales Report", icon: ShoppingCart },
    { id: "stock",     label: "Stock Alerts", icon: AlertTriangle },
    { id: "inventory", label: "Inventory",    icon: Package },
  ];

  return (
    <div className="flex flex-col w-full printable-report overflow-hidden print:!h-auto print:!overflow-visible" style={{ height: "calc(100dvh - 56px)" }}>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .printable-report, .printable-report * { visibility: visible !important; }
        .printable-report { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      {/* ── Fixed header ── */}
      <div className="flex-shrink-0 st-shell-px pt-4 sm:pt-6 pb-3 bg-background border-b border-border/50 z-20 space-y-3">
        {/* Title + Print */}
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {dateFrom || dateTo ? <>Filtered: {dateFrom || "All time"} to {dateTo || "Present"}</> : <>All-time data</>}
            </p>
          </div>
          <button onClick={() => setConfirmPrint(true)}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0 no-print">
            <Printer size={13} /> Print
          </button>
        </div>

        {/* Date filter */}
        <div className="bg-card border border-border/80 rounded-xl px-4 py-2.5 no-print">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Range:</label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-muted-foreground">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded-xl border border-border/80 bg-background/90 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary" />
              <label className="text-[11px] text-muted-foreground">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded-xl border border-border/80 bg-background/90 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary" />
              {(dateFrom || dateTo) && (
                <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="st-chip-btn">Clear</button>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <SegmentedTabs<"sales" | "stock" | "inventory">
          fullWidth
          ariaLabel="Report sections"
          value={activeTab}
          onChange={setActiveTab}
          className="overflow-x-auto no-print"
          buttonClassName="py-2"
          items={tabs.map(t => ({
            id: t.id,
            label: t.label,
            icon: <t.icon size={12} />,
          }))}
        />
      </div>

      {/* ── Fixed tab body (table scrolls internally) ── */}
      <div className="flex-1 min-h-0 flex flex-col st-shell-px py-4 overflow-hidden print:!overflow-visible">

        {/* ── Sales Report ── */}
        {activeTab === "sales" && (
          <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden print:!overflow-visible">
            <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Total Revenue", value: fmt(totalRevenue), color: "text-emerald-600 dark:text-emerald-400" },
                { label: "Net Revenue",   value: fmt(netRevenue),   color: "text-primary" },
                { label: "Total Returns", value: fmt(totalReturns), color: "text-violet-600 dark:text-violet-400" },
              ].map(c => (
                <div key={c.label} className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm st-card">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <p className={`text-lg font-bold mt-2 tabular-nums tracking-tight ${c.color}`}>
                    <AnimatedMetricText value={c.value} />
                  </p>
                </div>
              ))}
            </div>
            <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Sales",   count: sales.length,   color: "text-emerald-600 dark:text-emerald-400" },
                { label: "Returns", count: returns.length,  color: "text-orange-600 dark:text-orange-400" },
              ].map(c => (
                <div key={c.label} className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm text-center">
                  <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
                </div>
              ))}
            </div>

            <div className="flex-1 min-h-0 flex flex-col bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm print:!overflow-visible">
              <div className="flex-shrink-0 px-5 py-4 border-b border-border/70">
                <h3 className="text-sm font-bold text-foreground">Sales by Product</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {dateFrom || dateTo ? `${dateFrom || "All time"} to ${dateTo || "Present"}` : "All time"} · {salesByProduct.length} products
                </p>
              </div>
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto print:!overflow-visible" data-table-scroll="fixed">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border/70 bg-muted/30">
                      {["Product", "Qty Sold", "Revenue", "% of Sales"].map(h => (
                        <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {salesByProduct.map((row, idx) => (
                      <tr key={row.product} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3 text-xs font-semibold text-foreground">{row.product}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{row.qty}</td>
                        <td className="px-4 py-3 text-xs font-bold text-foreground">{fmt(row.amount)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full st-bar-fill"
                                style={{
                                  width: `${Math.round((row.amount / totalRevenue) * 100)}%`,
                                  animationDelay: `${Math.min(idx * 30, 240)}ms`,
                                }}
                              />
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

        {/* ── Stock Alerts ── */}
        {activeTab === "stock" && (
          <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden print:!overflow-visible">
            <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Out of Stock", count: outOfStock.length, color: "text-red-800 dark:text-red-300",       bg: "bg-red-100 dark:bg-red-500/15",       border: "border-red-300 dark:border-red-500/40" },
                { label: "Critical",     count: critical.length,   color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-500/10",        border: "border-red-200 dark:border-red-500/20" },
                { label: "Low Stock",    count: low.length,        color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-500/10",    border: "border-amber-200 dark:border-amber-500/20" },
                { label: "Moderate",     count: moderate.length,   color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10",  border: "border-yellow-200 dark:border-yellow-500/20" },
                { label: "Healthy",      count: good.length,       color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
              ].map(c => (
                <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${c.color} mt-2`}>{c.count}</p>
                </div>
              ))}
            </div>

            <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm print:!overflow-visible">
              <div className="flex-shrink-0 px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">Items Requiring Action</h3>
                  <InfoTip title="Restocking Priority"
                    lines={[
                      "Out-of-stock, critical, and low-inventory products needing attention.",
                      { label: "Threshold", value: "Configured reorder point per item" },
                      { label: "Next step", value: "Create orders in Supplier Orders" },
                    ]} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {actionItems.length} products below or near reorder threshold
                </p>
              </div>
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto print:!overflow-visible" data-table-scroll="fixed">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border bg-muted/30">
                      {["Product", "Category", "Current Stock", "Reorder At", "Shortage", "Status"].map(h => (
                        <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {actionItems.map(item => (
                      <tr key={item.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{item.name}</p><p className="text-[10px] text-muted-foreground">{item.id}</p></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                        <td className="px-4 py-3 text-xs font-bold text-foreground">{item.stock}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{item.reorder} packs ({getReorderUnits(item)} units)</td>
                        <td className="px-4 py-3 text-xs font-semibold">
                          <span className={item.stock < getReorderUnits(item) ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                            {item.stock < getReorderUnits(item) ? `-${getReorderUnits(item) - item.stock}` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                      </tr>
                    ))}
                    {actionItems.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">All products are at healthy stock levels</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Inventory ── */}
        {activeTab === "inventory" && (
          <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden print:!overflow-visible">
            <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Total Products",       value: String(inventory.length),    color: "text-foreground" },
                { label: "Total Stock Units",     value: totalStock.toLocaleString(), color: "text-primary" },
                { label: "Total Inventory Value", value: fmt(totalValue),             color: "text-emerald-600 dark:text-emerald-400" },
              ].map(c => (
                <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <p className={`text-xl font-bold mt-2 tabular-nums tracking-tight ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm print:!overflow-visible">
              <div className="flex-shrink-0 px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Complete Inventory</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">All {inventory.length} products as of {new Date().toLocaleDateString()}</p>
              </div>
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto print:!overflow-visible" data-table-scroll="fixed">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border bg-muted/30">
                      {["Product", "Category", "Stock", "Unit Price", "Stock Value", "Expiry", "Status"].map(h => (
                        <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(item => (
                      <tr key={item.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{item.name}</p><p className="text-[10px] text-muted-foreground">{item.id}</p></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                        <td className="px-4 py-3 text-xs font-bold text-foreground">{item.stock.toLocaleString()}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(item.price)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-foreground">{fmt(item.stock * item.price)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{item.expiry === "—" ? "" : item.expiry}</td>
                        <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                      </tr>
                    ))}
                    {inventory.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No inventory items</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>{/* end scrollable content */}

      {confirmPrint && (
        <ConfirmDialog
          title="Print Report?"
          message="This will open the print dialog for the current report view."
          confirmLabel="Print"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={() => { setConfirmPrint(false); window.print(); }}
          onCancel={() => setConfirmPrint(false)}
        />
      )}
    </div>
  );
});

export default ReportsPage;
