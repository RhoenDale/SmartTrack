import { useState, useEffect, useMemo, useCallback } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart,
  RotateCcw, Wrench, ChevronLeft, ChevronRight,
  Download, RefreshCw, Calendar, Users, BarChart3,
  ArrowUpRight, Printer,
} from "lucide-react";
import { financialApi } from "./api";
import { fmt, SvgAreaChart } from "./shared";
import type { AuthUser } from "./data";

// ─── Types mirroring financialApi return shapes ───────────────────────────────
type Summary = {
  totalRevenue: number; totalPreTax: number; totalVatCollected: number; netVatPayable: number;
  totalReturns: number; netRevenue: number;
  grossProfit: number; salesCount: number; returnsCount: number;
  adjustmentsCount: number; totalTransactions: number; avgOrderValue: number;
  todayRevenue: number; weekRevenue: number; monthRevenue: number;
};
type DailyRow   = { date: string; revenue: number; returns: number };
type MonthlyRow = { month: string; revenue: number; returns: number; net: number; sales_count: number };
type LedgerRow  = { id: string; type: string; product: string; qty: number; amount: number; staff: string; note: string; status: string; date: string };
type BreakdownRow = { category: string; revenue: number; units: number; share: number };
type StaffRow     = { staff: string; transactions: number; revenue: number; unitsSold: number };
type IncomeRow    = {
  productId: string; productName: string; category: string;
  unitsSold: number; revenue: number;
  totalCost: number | null; grossProfit: number | null;
  margin: number | null; avgUnitCost: number | null;
  multiCost: boolean; hasCostData: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  sale:       "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
  return:     "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20",
  adjustment: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20",
};
const TYPE_ICONS: Record<string, typeof ShoppingCart> = {
  sale:       ShoppingCart,
  return:     RotateCcw,
  adjustment: Wrench,
};
const CATEGORY_PALETTE = [
  "#0d9488","#8b5cf6","#f59e0b","#3b82f6","#ec4899","#10b981","#f97316","#6366f1",
];

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, color, icon: Icon, trend,
}: {
  label: string; value: string; sub?: string; color: string;
  icon: typeof DollarSign; trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color.replace("text-", "bg-").split(" ")[0]}/10`}>
          <Icon size={13} className={color.split(" ")[0]} />
        </div>
      </div>
      <p className={`text-xl font-bold tabular-nums tracking-tight ${color.split(" ")[0]}`}>{value}</p>
      {sub && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          {trend === "up"   && <ArrowUpRight size={11} className="text-emerald-500" />}
          {trend === "down" && <ArrowUpRight size={11} className="text-orange-500 rotate-90" />}
          {sub}
        </p>
      )}
    </div>
  );
}

function DateRangePicker({
  dateFrom, dateTo, onFromChange, onToChange, onClear,
}: {
  dateFrom: string; dateTo: string;
  onFromChange: (v: string) => void; onToChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar size={13} className="text-muted-foreground" />
      <label className="text-[11px] text-muted-foreground">From</label>
      <input type="date" value={dateFrom} onChange={e => onFromChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      <label className="text-[11px] text-muted-foreground">To</label>
      <input type="date" value={dateTo} onChange={e => onToChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      {(dateFrom || dateTo) && (
        <button onClick={onClear} className="text-xs text-primary hover:text-primary/80 font-semibold">Clear</button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FinancialPage({ user }: { user: AuthUser }) {
  type Tab = "overview" | "ledger" | "breakdown" | "staff" | "income";
  const [tab, setTab]           = useState<Tab>("overview");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data state
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [daily,     setDaily]     = useState<DailyRow[]>([]);
  const [monthly,   setMonthly]   = useState<MonthlyRow[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [staffData, setStaffData] = useState<StaffRow[]>([]);
  const [incomeData,    setIncomeData]    = useState<IncomeRow[]>([]);
  const [incomeTotals,  setIncomeTotals]  = useState<{ revenue: number; totalCost: number; grossProfit: number; margin: number | null } | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);

  // Ledger state
  const [ledger,        setLedger]        = useState<LedgerRow[]>([]);
  const [ledgerTotal,   setLedgerTotal]   = useState(0);
  const [ledgerPage,    setLedgerPage]    = useState(1);
  const [ledgerPages,   setLedgerPages]   = useState(1);
  const [ledgerType,    setLedgerType]    = useState("all");
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadOverview = useCallback(async (from: string, to: string) => {
    try {
      const [sumRes, dailyRes, monthlyRes] = await Promise.all([
        financialApi.summary(from, to),
        financialApi.daily(30),
        financialApi.monthly(),
      ]);
      setSummary(sumRes);
      setDaily(dailyRes);
      setMonthly(monthlyRes);
    } catch (e) { console.error("Financial summary load failed:", e); }
  }, []);

  const loadBreakdown = useCallback(async (from: string, to: string) => {
    try {
      const [brkRes, stfRes] = await Promise.all([
        financialApi.breakdown(from, to),
        financialApi.staff(from, to),
      ]);
      setBreakdown(brkRes);
      setStaffData(stfRes);
    } catch (e) { console.error("Financial breakdown load failed:", e); }
  }, []);

  const loadLedger = useCallback(async (from: string, to: string, type: string, page: number) => {
    setLedgerLoading(true);
    try {
      const res = await financialApi.records({ type, dateFrom: from, dateTo: to, page, perPage: 25 });
      setLedger(res.records);
      setLedgerTotal(res.total);
      setLedgerPages(res.pages);
    } catch (e) { console.error("Ledger load failed:", e); }
    finally { setLedgerLoading(false); }
  }, []);

  const loadIncome = useCallback(async (from: string, to: string) => {
    setIncomeLoading(true);
    try {
      const res = await financialApi.income(from, to);
      setIncomeData(res.rows);
      setIncomeTotals(res.totals);
    } catch (e) { console.error("Income load failed:", e); }
    finally { setIncomeLoading(false); }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([loadOverview("", ""), loadBreakdown("", "")]).finally(() => setLoading(false));
  }, [loadOverview, loadBreakdown]);

  // Reload on date filter change
  useEffect(() => {
    loadOverview(dateFrom, dateTo);
    loadBreakdown(dateFrom, dateTo);
  }, [dateFrom, dateTo, loadOverview, loadBreakdown]);

  // Ledger: load when tab opens or filters change
  useEffect(() => {
    if (tab === "ledger") loadLedger(dateFrom, dateTo, ledgerType, ledgerPage);
  }, [tab, dateFrom, dateTo, ledgerType, ledgerPage, loadLedger]);

  // Income: load when tab opens or filters change
  useEffect(() => {
    if (tab === "income") loadIncome(dateFrom, dateTo);
  }, [tab, dateFrom, dateTo, loadIncome]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOverview(dateFrom, dateTo), loadBreakdown(dateFrom, dateTo)]);
    if (tab === "ledger") await loadLedger(dateFrom, dateTo, ledgerType, ledgerPage);
    if (tab === "income") await loadIncome(dateFrom, dateTo);
    setRefreshing(false);
  };

  // ── Chart data ───────────────────────────────────────────────────────────────
  // Daily chart — last 14 days for readability in the chart
  const dailyChart = useMemo(() => daily.slice(-14), [daily]);

  // ── Render helpers ───────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: typeof DollarSign }[] = [
    { id: "overview",  label: "Overview",    icon: BarChart3 },
    { id: "ledger",    label: "Ledger",      icon: DollarSign },
    { id: "breakdown", label: "By Category", icon: TrendingUp },
    { id: "staff",     label: "By Staff",    icon: Users },
    { id: "income",    label: "Income",      icon: TrendingUp },
  ];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading financial data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] printable-financial">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .printable-financial, .printable-financial * { visibility: visible !important; }
        .printable-financial { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Financial Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dateFrom || dateTo
              ? `Filtered: ${dateFrom || "All time"} → ${dateTo || "Present"}`
              : "All-time financial records"}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-50">
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => financialApi.exportCsv(tab === "ledger" ? ledgerType : "all", dateFrom, dateTo)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            title="Download full financial ledger as CSV">
            <Download size={12} /> Export CSV
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            <Printer size={12} /> Print
          </button>
        </div>
      </div>

      {/* ── Date filter ── */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm no-print">
        <DateRangePicker
          dateFrom={dateFrom} dateTo={dateTo}
          onFromChange={v => { setDateFrom(v); setLedgerPage(1); }}
          onToChange={v => { setDateTo(v); setLedgerPage(1); }}
          onClear={() => { setDateFrom(""); setDateTo(""); setLedgerPage(1); }}
        />
      </div>

      {/* ── KPI headline cards ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label="Gross Revenue"    value={fmt(summary.totalRevenue)}        color="text-emerald-600 dark:text-emerald-400" icon={TrendingUp}   sub={`${summary.salesCount} sales · VAT-inclusive`} trend="up" />
          <KpiCard label="Pre-tax Revenue"  value={fmt(summary.totalPreTax)}         color="text-sky-600 dark:text-sky-400"         icon={BarChart3}    sub="Net of VAT (taxable base)" trend="up" />
          <KpiCard label="VAT Collected"    value={fmt(summary.totalVatCollected)}   color="text-violet-600 dark:text-violet-400"   icon={DollarSign}   sub={`Net payable to BIR: ${fmt(summary.netVatPayable)}`} />
          <KpiCard label="Total Returns"    value={fmt(summary.totalReturns)}        color="text-orange-600 dark:text-orange-400"   icon={TrendingDown} sub={`${summary.returnsCount} returns`} />
          <KpiCard label="Net Revenue"      value={fmt(summary.netRevenue)}          color="text-primary"                           icon={TrendingUp}   sub="Revenue minus returns" trend="up" />
          <KpiCard label="Avg Order Value"  value={fmt(summary.avgOrderValue)}       color="text-amber-600 dark:text-amber-400"     icon={ShoppingCart} sub="Per sale transaction" />
        </div>
      )}

      {/* ── Period spotlight ── */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today",     value: fmt(summary.todayRevenue),  color: "text-emerald-600 dark:text-emerald-400" },
            { label: "This Week", value: fmt(summary.weekRevenue),   color: "text-sky-600 dark:text-sky-400" },
            { label: "This Month",value: fmt(summary.monthRevenue),  color: "text-primary" },
          ].map(c => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm text-center">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums mt-2 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-full overflow-x-auto no-print">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-1 justify-center ${
              tab === t.id ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: OVERVIEW                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Daily revenue chart */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">Daily Revenue — Last 14 Days</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Revenue vs. returns per day</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Revenue</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Returns</span>
              </div>
            </div>
            <div className="text-foreground" style={{ height: 220 }}>
              {dailyChart.length > 0 ? (
                <SvgAreaChart
                  data={dailyChart}
                  lines={[
                    { key: "revenue", color: "#0d9488", name: "Revenue" },
                    { key: "returns", color: "#f97316", name: "Returns" },
                  ]}
                  yFormatter={v => v >= 1000 ? `₱${(v / 1000).toFixed(1)}k` : `₱${Math.round(v)}`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No data for selected range</div>
              )}
            </div>
          </div>

          {/* Monthly trend table */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Monthly Revenue Trend</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Last 12 months · revenue, returns, and net</p>
            </div>
            {monthly.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No monthly data available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["Month","Revenue","Returns","Net Revenue","Sales","Profit (est.)"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...monthly].reverse().map((m, i) => {
                      const profit = m.net * 0.4;
                      return (
                        <tr key={m.month} className={`hover:bg-muted/20 transition-colors ${i === 0 ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3 font-semibold text-foreground">{m.month}{i === 0 && <span className="ml-2 text-[10px] text-primary font-bold">(current)</span>}</td>
                          <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{fmt(m.revenue)}</td>
                          <td className="px-4 py-3 tabular-nums text-orange-600 dark:text-orange-400">{fmt(m.returns)}</td>
                          <td className="px-4 py-3 tabular-nums text-primary font-bold">{fmt(m.net)}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{m.sales_count.toLocaleString()}</td>
                          <td className="px-4 py-3 tabular-nums text-sky-600 dark:text-sky-400">{fmt(profit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {monthly.length > 1 && (() => {
                    const totRev = monthly.reduce((s, m) => s + m.revenue, 0);
                    const totRet = monthly.reduce((s, m) => s + m.returns, 0);
                    const totNet = monthly.reduce((s, m) => s + m.net, 0);
                    const totSales = monthly.reduce((s, m) => s + m.sales_count, 0);
                    return (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30 font-bold">
                          <td className="px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground">Total ({monthly.length} months)</td>
                          <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(totRev)}</td>
                          <td className="px-4 py-3 tabular-nums text-orange-600 dark:text-orange-400">{fmt(totRet)}</td>
                          <td className="px-4 py-3 tabular-nums text-primary">{fmt(totNet)}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{totSales.toLocaleString()}</td>
                          <td className="px-4 py-3 tabular-nums text-sky-600 dark:text-sky-400">{fmt(totNet * 0.4)}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: LEDGER                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "ledger" && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Type:</span>
            {["all","sale","return","adjustment"].map(t => (
              <button key={t} onClick={() => { setLedgerType(t); setLedgerPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  ledgerType === t ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {ledgerTotal.toLocaleString()} record{ledgerTotal !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {ledgerLoading ? (
              <div className="p-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Loading records…
              </div>
            ) : ledger.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No records found for the selected filters</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Transaction ID","Type","Product","Qty","Amount","Staff","Date","Status"].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ledger.map(r => {
                        const Icon = TYPE_ICONS[r.type] ?? ShoppingCart;
                        return (
                          <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.id}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${TYPE_COLORS[r.type] ?? ""}`}>
                                <Icon size={9} />{r.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-foreground max-w-[160px] truncate" title={r.product}>{r.product}</td>
                            <td className="px-4 py-3 tabular-nums text-foreground">{r.qty.toLocaleString()}</td>
                            <td className={`px-4 py-3 tabular-nums font-semibold ${
                              r.type === "sale" ? "text-emerald-600 dark:text-emerald-400" :
                              r.type === "return" ? "text-orange-600 dark:text-orange-400" :
                              "text-muted-foreground"
                            }`}>{fmt(r.amount)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.staff}</td>
                            <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{r.date}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {ledgerPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border no-print">
                    <p className="text-[11px] text-muted-foreground">
                      Page {ledgerPage} of {ledgerPages} · {ledgerTotal.toLocaleString()} total records
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setLedgerPage(p => Math.max(1, p - 1))} disabled={ledgerPage === 1}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 transition-all">
                        <ChevronLeft size={14} />
                      </button>
                      {/* Page number pills */}
                      {Array.from({ length: Math.min(ledgerPages, 5) }, (_, i) => {
                        const p = ledgerPages <= 5 ? i + 1
                          : ledgerPage <= 3 ? i + 1
                          : ledgerPage >= ledgerPages - 2 ? ledgerPages - 4 + i
                          : ledgerPage - 2 + i;
                        return (
                          <button key={p} onClick={() => setLedgerPage(p)}
                            className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                              p === ledgerPage ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}>
                            {p}
                          </button>
                        );
                      })}
                      <button onClick={() => setLedgerPage(p => Math.min(ledgerPages, p + 1))} disabled={ledgerPage === ledgerPages}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 transition-all">
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: BY CATEGORY                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "breakdown" && (
        <div className="space-y-4">
          {breakdown.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">No sales data for the selected range</div>
          ) : (
            <>
              {/* Horizontal bar chart */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-foreground mb-4">Revenue by Category</h3>
                <div className="space-y-3">
                  {breakdown.map((row, i) => (
                    <div key={row.category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground">{row.category}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{fmt(row.revenue)} · {row.share}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${row.share}%`, background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Breakdown table */}
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["#","Category","Revenue","Units Sold","Share"].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {breakdown.map((row, i) => (
                        <tr key={row.category} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }} />
                              <span className="font-semibold text-foreground">{row.category}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{fmt(row.revenue)}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{row.units.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden max-w-[80px]">
                                <div className="h-full rounded-full" style={{ width: `${row.share}%`, background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }} />
                              </div>
                              <span className="tabular-nums text-muted-foreground">{row.share}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-bold">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground">Total</td>
                        <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(breakdown.reduce((s, r) => s + r.revenue, 0))}</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">{breakdown.reduce((s, r) => s + r.units, 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: BY STAFF                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "staff" && (
        <div className="space-y-4">
          {staffData.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">No staff sales data for the selected range</div>
          ) : (
            <>
              {/* Staff leaderboard cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {staffData.slice(0, 6).map((s, i) => {
                  const maxRev = staffData[0]?.revenue ?? 1;
                  const fillPct = pct(s.revenue, maxRev);
                  const medals = ["🥇","🥈","🥉"];
                  return (
                    <div key={s.staff} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary">
                            {s.staff.split(" ").map((w: string) => w[0]).slice(0,2).join("").toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground leading-tight">{s.staff}</p>
                            <p className="text-[10px] text-muted-foreground">{s.transactions} txns</p>
                          </div>
                        </div>
                        {medals[i] && <span className="text-base">{medals[i]}</span>}
                      </div>
                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>Revenue share</span>
                          <span>{fillPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${fillPct}%` }} />
                        </div>
                      </div>
                      <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(s.revenue)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{s.unitsSold.toLocaleString()} units sold</p>
                    </div>
                  );
                })}
              </div>

              {/* Full staff table */}
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Rank","Staff Member","Transactions","Units Sold","Total Revenue"].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {staffData.map((s, i) => (
                        <tr key={s.staff} className={`hover:bg-muted/20 transition-colors ${i === 0 ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3 text-muted-foreground font-bold">{i + 1}</td>
                          <td className="px-4 py-3 font-semibold text-foreground">{s.staff}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{s.transactions.toLocaleString()}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{s.unitsSold.toLocaleString()}</td>
                          <td className="px-4 py-3 tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{fmt(s.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-bold">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground">Total</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">{staffData.reduce((s, r) => s + r.transactions, 0).toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">{staffData.reduce((s, r) => s + r.unitsSold, 0).toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(staffData.reduce((s, r) => s + r.revenue, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: INCOME (per-product revenue, cost, profit)                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "income" && (
        <div className="space-y-4">
          {/* Totals bar */}
          {incomeTotals && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm text-center">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-2">{fmt(incomeTotals.revenue)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm text-center">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Cost (Supplier)</p>
                <p className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400 mt-2">{fmt(incomeTotals.totalCost)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Only products with cost price set</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm text-center">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Gross Profit</p>
                <p className={`text-xl font-bold tabular-nums mt-2 ${incomeTotals.grossProfit >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"}`}>
                  {fmt(incomeTotals.grossProfit)}
                </p>
              </div>
            </div>
          )}

          {incomeLoading ? (
            <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading income data…
            </div>
          ) : incomeData.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
              No sales data for the selected range
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Product Income Breakdown</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Actual COGS from FIFO batch audit trail — cost is locked per batch at time of receipt,
                    so supplier price changes never distort past income.
                    Set <span className="font-semibold text-foreground">Batch Cost</span> when adding a batch in Inventory.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["#", "Product", "Category", "Units Sold", "Revenue", "Avg Unit Cost", "Total COGS", "Gross Profit", "Margin"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {incomeData.map((row, i) => (
                      <tr key={row.productId || row.productName} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-foreground max-w-[180px]">
                          <div className="truncate" title={row.productName}>{row.productName}</div>
                          {row.multiCost && (
                            <div className="text-[10px] text-sky-600 dark:text-sky-400 font-normal mt-0.5">↕ mixed batch costs</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">{row.unitsSold.toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{fmt(row.revenue)}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {row.hasCostData && row.avgUnitCost != null
                            ? fmt(row.avgUnitCost)
                            : <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">No batch cost</span>
                          }
                        </td>
                        <td className="px-4 py-3 tabular-nums text-orange-600 dark:text-orange-400">
                          {row.totalCost != null ? fmt(row.totalCost) : "—"}
                        </td>
                        <td className={`px-4 py-3 tabular-nums font-bold ${
                          row.grossProfit == null ? "text-muted-foreground" :
                          row.grossProfit >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"
                        }`}>
                          {row.grossProfit != null ? fmt(row.grossProfit) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {row.margin != null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden max-w-[60px]">
                                <div className={`h-full rounded-full ${row.margin >= 0 ? "bg-primary" : "bg-red-500"}`}
                                  style={{ width: `${Math.min(Math.abs(row.margin), 100)}%` }} />
                              </div>
                              <span className={`tabular-nums font-semibold ${row.margin >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"}`}>
                                {row.margin}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {incomeTotals && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-bold">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground" colSpan={2}>Total</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">
                          {incomeData.reduce((s, r) => s + r.unitsSold, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(incomeTotals.revenue)}</td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 tabular-nums text-orange-600 dark:text-orange-400">{fmt(incomeTotals.totalCost)}</td>
                        <td className="px-4 py-3 tabular-nums text-primary">{fmt(incomeTotals.grossProfit)}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {incomeTotals.margin != null ? `${incomeTotals.margin}%` : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}