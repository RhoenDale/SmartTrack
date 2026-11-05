import { useState, useEffect, useMemo, useCallback } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart,
  RotateCcw, Wrench, ChevronLeft, ChevronRight,
  Download, RefreshCw, Calendar, Users, BarChart3,
  ArrowUpRight, Printer, Clock, ChevronUp, ChevronDown,
} from "lucide-react";
import { financialApi } from "./api";
import { fmt, SvgAreaChart, InfoTip, TablePager, ConfirmDialog } from "./shared";
import type { AuthUser } from "./data";

// ─── Types mirroring financialApi return shapes ───────────────────────────────
type Summary = {
  totalRevenue: number; totalPreTax: number; totalVatCollected: number; netVatPayable: number;
  totalReturns: number; netRevenue: number;
  brokenStockLoss: number; totalLosses: number; netAfterLosses: number;
  uncostedBrokenCount: number;
  salesCount: number; returnsCount: number;
  adjustmentsCount: number; totalTransactions: number; avgOrderValue: number;
  todayRevenue: number; weekRevenue: number; monthRevenue: number;
};
type DailyRow   = { date: string; revenue: number; returns: number; brokenLoss: number };
type MonthlyRow = { month: string; revenue: number; returns: number; brokenLoss: number; net: number; netAfterLosses: number; sales_count: number };
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
  "#2563eb","#8b5cf6","#f59e0b","#0ea5e9","#ec4899","#10b981","#f97316","#6366f1",
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
    <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-2 hover:shadow-[0_6px_20px_-4px_rgba(13,148,136,0.1),0_2px_4px_rgba(0,0,0,0.03)] transition-all duration-200">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-2xs ${color.replace("text-", "bg-").split(" ")[0]}/15 border border-current/10`}>
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
  const [incomeTotals,  setIncomeTotals]  = useState<{ revenue: number; costedRevenue: number; totalCost: number; grossProfit: number; margin: number | null } | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [confirmExportCsv, setConfirmExportCsv] = useState(false);
  const [confirmPrint,     setConfirmPrint]     = useState(false);

  // Ledger state
  const [ledger,        setLedger]        = useState<LedgerRow[]>([]);
  const [ledgerTotal,   setLedgerTotal]   = useState(0);
  const [ledgerPage,    setLedgerPage]    = useState(1);
  const [ledgerPages,   setLedgerPages]   = useState(1);
  const [ledgerType,    setLedgerType]    = useState("all");
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [incomePage,    setIncomePage]    = useState(1);
  const INCOME_PAGE_SIZE = 10;
  const [breakdownPage, setBreakdownPage] = useState(1);
  const BREAKDOWN_PAGE_SIZE = 15;
  const [staffPage,     setStaffPage]     = useState(1);
  const STAFF_PAGE_SIZE = 10;
  const [showDetailedKpis, setShowDetailedKpis] = useState(false);

  // Quick date presets
  const handlePreset = (preset: "all" | "today" | "week" | "month") => {
    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
      setLedgerPage(1);
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (preset === "today") {
      setDateFrom(toStr);
      setDateTo(toStr);
    } else if (preset === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      const fromStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      setDateFrom(fromStr);
      setDateTo(toStr);
    } else if (preset === "month") {
      const fromStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      setDateFrom(fromStr);
      setDateTo(toStr);
    }
    setLedgerPage(1);
  };

  const activePreset = useMemo(() => {
    if (!dateFrom && !dateTo) return "all";
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (dateFrom === toStr && dateTo === toStr) return "today";
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    const weekStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (dateFrom === weekStr && dateTo === toStr) return "week";
    const monthStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    if (dateFrom === monthStr && dateTo === toStr) return "month";
    return "custom";
  }, [dateFrom, dateTo]);

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
    setBreakdownPage(1);
    setStaffPage(1);
  }, [dateFrom, dateTo, loadOverview, loadBreakdown]);

  // Ledger: load when tab opens or filters change
  useEffect(() => {
    if (tab === "ledger") loadLedger(dateFrom, dateTo, ledgerType, ledgerPage);
  }, [tab, dateFrom, dateTo, ledgerType, ledgerPage, loadLedger]);

  // Load cost-backed income totals for the overview and the Income tab.
  useEffect(() => {
    loadIncome(dateFrom, dateTo);
    setIncomePage(1);
  }, [dateFrom, dateTo, loadIncome]);

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

  // Income tab pagination
  const paginatedIncome = useMemo(() => {
    const start = (incomePage - 1) * INCOME_PAGE_SIZE;
    return incomeData.slice(start, start + INCOME_PAGE_SIZE);
  }, [incomeData, incomePage]);

  // Breakdown tab pagination
  const paginatedBreakdown = useMemo(() => {
    const start = (breakdownPage - 1) * BREAKDOWN_PAGE_SIZE;
    return breakdown.slice(start, start + BREAKDOWN_PAGE_SIZE);
  }, [breakdown, breakdownPage]);

  // Staff tab pagination
  const paginatedStaff = useMemo(() => {
    const start = (staffPage - 1) * STAFF_PAGE_SIZE;
    return staffData.slice(start, start + STAFF_PAGE_SIZE);
  }, [staffData, staffPage]);

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
    <div className="p-4 sm:p-6 space-y-5 w-full max-w-[1400px] mx-auto printable-financial">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .printable-financial, .printable-financial * { visibility: visible !important; }
        .printable-financial { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      {/* ── Header & Action Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground tracking-tight">Financial Management</h1>
            <InfoTip
              title="Financial Management Guide"
              lines={[
                "Comprehensive revenue, profit margins, tax obligations, and loss ledgers.",
                { label: "Gross Revenue", value: "Total customer transaction receipts" },
                { label: "Returns / Refunds", value: "Direct reimbursements deducted from revenue" },
                { label: "Broken Losses", value: "Cost value of damaged inventory written off" },
                { label: "12% VAT", value: "Output tax collected and estimated BIR payable" },
                { label: "Income & COGS", value: "Gross profit margins based on batch purchase cost" },
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dateFrom || dateTo
              ? `Filtered: ${dateFrom || "All time"} → ${dateTo || "Present"}`
              : "Executive financial dashboard & store transaction performance"}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border/80 bg-card rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all shadow-2xs disabled:opacity-50">
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setConfirmExportCsv(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border/80 bg-card rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all shadow-2xs"
            title="Download full financial ledger as CSV">
            <Download size={12} /> Export CSV
          </button>
          <button onClick={() => setConfirmPrint(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border/80 bg-card rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all shadow-2xs">
            <Printer size={12} /> Print
          </button>
        </div>
      </div>

      {/* ── Compact Filter & Preset Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-card border border-border/80 rounded-2xl p-2.5 px-3.5 shadow-xs no-print">
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick preset buttons */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl">
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "week", label: "7 Days" },
              { id: "month", label: "This Month" },
            ].map(p => {
              const isActive = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePreset(p.id as any)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    isActive ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Range Picker */}
          <div className="flex items-center gap-1.5 pl-2 sm:border-l border-border/70 text-xs">
            <Calendar size={13} className="text-muted-foreground" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setLedgerPage(1); }}
              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setLedgerPage(1); }}
              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(""); setDateTo(""); setLedgerPage(1); }}
                className="text-xs text-primary hover:underline font-semibold ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {summary && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums font-medium">
              {summary.salesCount.toLocaleString()} total sales
            </span>
          </div>
        )}
      </div>

      {/* ── Executive 4-Pillar Financial Summary ── */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Pillar 1: Gross Revenue */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Gross Revenue</span>
                <InfoTip
                  title="Gross Revenue"
                  lines={[
                    "Total customer transaction receipts recorded before tax deductions or returns.",
                    { label: "Tax status", value: "Includes 12% output VAT" },
                    { label: "Sales count", value: `${summary.salesCount} total completed receipts` },
                  ]}
                />
              </div>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <TrendingUp size={14} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                {fmt(summary.totalRevenue)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {summary.salesCount.toLocaleString()} recorded sales · VAT-inclusive
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Pre-tax: <strong className="text-foreground">{fmt(summary.totalPreTax)}</strong></span>
              <span>12% VAT: <strong className="text-violet-600 dark:text-violet-400">{fmt(summary.totalVatCollected)}</strong></span>
            </div>
          </div>

          {/* Pillar 2: Net Revenue */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Net Revenue</span>
                <InfoTip
                  title="Net Revenue"
                  lines={[
                    "Gross customer payments minus customer returns and refunds.",
                    { label: "Returns deducted", value: fmt(summary.totalReturns) },
                    { label: "Post-loss net", value: "Net revenue minus damaged stock write-offs" },
                  ]}
                />
              </div>
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <DollarSign size={14} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-primary">
                {fmt(summary.netRevenue)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Revenue minus returns deducted
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Post-loss net: <strong className="text-foreground">{fmt(summary.netAfterLosses)}</strong></span>
              <span>Avg order: <strong className="text-foreground">{fmt(summary.avgOrderValue)}</strong></span>
            </div>
          </div>

          {/* Pillar 3: Gross Profit */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-teal-500/40 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Gross Profit</span>
                <InfoTip
                  title="Gross Profit & Margins"
                  lines={[
                    "Profit calculated from actual FIFO batch purchase costs (Cost of Goods Sold).",
                    { label: "COGS Basis", value: "Locked unit cost per inventory batch" },
                    { label: "Scope", value: "Batches with recorded supplier invoice costs" },
                  ]}
                />
              </div>
              <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
                <BarChart3 size={14} />
              </div>
            </div>
            <div>
              <p className={`text-2xl font-bold tabular-nums tracking-tight ${
                (incomeTotals?.grossProfit ?? 0) >= 0 ? "text-teal-600 dark:text-teal-400" : "text-red-600 dark:text-red-400"
              }`}>
                {fmt(incomeTotals?.grossProfit ?? summary.netRevenue * 0.4)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Margin: <strong className="text-foreground">{incomeTotals?.margin != null ? `${incomeTotals.margin}%` : "40% est."}</strong>
                {incomeTotals ? ` · ${fmt(incomeTotals.costedRevenue)} costed` : ""}
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>COGS: <strong className="text-orange-600 dark:text-orange-400">{incomeTotals ? fmt(incomeTotals.totalCost) : "—"}</strong></span>
              <span>Post-loss profit: <strong className="text-foreground">{fmt((incomeTotals?.grossProfit ?? 0) - summary.totalReturns - summary.brokenStockLoss)}</strong></span>
            </div>
          </div>

          {/* Pillar 4: Losses & Damage */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-red-500/40 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Losses</span>
                <InfoTip
                  title="Total Financial Losses"
                  lines={[
                    "Comprehensive financial losses from customer reimbursements and damaged/expired stock write-offs.",
                    { label: "Returns", value: "Refunds issued to customers" },
                    { label: "Broken stock", value: "Damaged inventory written off at batch cost" },
                  ]}
                />
              </div>
              <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                <TrendingDown size={14} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-red-600 dark:text-red-400">
                {fmt(summary.totalLosses)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Refunds + damaged stock write-offs
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Returns: <strong className="text-orange-600 dark:text-orange-400">{fmt(summary.totalReturns)}</strong> ({summary.returnsCount})</span>
              <span>Broken: <strong className="text-red-600 dark:text-red-400">{fmt(summary.brokenStockLoss)}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* ── Compact Velocity Bar & Expand Toggle ── */}
      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-card border border-border/80 text-xs shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={12} className="text-primary" /> Velocity:
            </span>
            <span className="text-xs">
              <span className="text-muted-foreground mr-1">Today:</span>
              <span className="tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{fmt(summary.todayRevenue)}</span>
            </span>
            <span className="text-muted-foreground/30">•</span>
            <span className="text-xs">
              <span className="text-muted-foreground mr-1">This Week:</span>
              <span className="tabular-nums font-bold text-sky-600 dark:text-sky-400">{fmt(summary.weekRevenue)}</span>
            </span>
            <span className="text-muted-foreground/30">•</span>
            <span className="text-xs">
              <span className="text-muted-foreground mr-1">This Month:</span>
              <span className="tabular-nums font-bold text-primary">{fmt(summary.monthRevenue)}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowDetailedKpis(v => !v)}
            className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 py-0.5 no-print"
          >
            {showDetailedKpis ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showDetailedKpis ? "Hide detailed 13 metric cards" : "Expand all 13 metric cards"}
          </button>
        </div>
      )}

      {/* ── Optional Expanded 13-KPI Grid ── */}
      {summary && showDetailedKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <KpiCard label="Gross Revenue"    value={fmt(summary.totalRevenue)}        color="text-emerald-600 dark:text-emerald-400" icon={TrendingUp}   sub={`${summary.salesCount} sales · VAT-inclusive`} trend="up" />
          <KpiCard label="Pre-tax Revenue"  value={fmt(summary.totalPreTax)}         color="text-sky-600 dark:text-sky-400"         icon={BarChart3}    sub="Net of VAT (taxable base)" trend="up" />
          <KpiCard label="VAT Collected"    value={fmt(summary.totalVatCollected)}   color="text-violet-600 dark:text-violet-400"   icon={DollarSign}   sub={`Net payable to BIR: ${fmt(summary.netVatPayable)}`} />
          <KpiCard label="Total Returns"    value={fmt(summary.totalReturns)}        color="text-orange-600 dark:text-orange-400"   icon={TrendingDown} sub={`${summary.returnsCount} returns`} />
          <KpiCard label="Broken Stock Loss" value={fmt(summary.brokenStockLoss)} color="text-red-600 dark:text-red-400" icon={Wrench} sub={summary.uncostedBrokenCount > 0 ? `${summary.uncostedBrokenCount} records no batch cost` : "Valued at batch cost"} />
          <KpiCard label="Total Losses"     value={fmt(summary.totalLosses)}         color="text-red-600 dark:text-red-400"         icon={TrendingDown} sub="Refunds + broken stock write-offs" />
          <KpiCard label="Net Revenue"      value={fmt(summary.netRevenue)}          color="text-primary"                           icon={TrendingUp}   sub="Revenue minus returns" trend="up" />
          <KpiCard label="Net After Losses" value={fmt(summary.netAfterLosses)} color="text-primary" icon={TrendingDown} sub="Refunds deducted; minus broken cost" />
          {incomeTotals && <KpiCard label="Gross Profit" value={fmt(incomeTotals.grossProfit)} color={incomeTotals.grossProfit >= 0 ? "text-teal-600 dark:text-teal-400" : "text-red-600 dark:text-red-400"} icon={TrendingUp} sub={`Gross margin ${incomeTotals.margin == null ? "—" : `${incomeTotals.margin}%`} · ${fmt(incomeTotals.costedRevenue)} costed`} />}
          <KpiCard label="Avg Order Value"  value={fmt(summary.avgOrderValue)}       color="text-amber-600 dark:text-amber-400"     icon={ShoppingCart} sub="Per sale transaction" />
          <KpiCard label="Today" value={fmt(summary.todayRevenue)} color="text-emerald-600 dark:text-emerald-400" icon={Clock} sub="Real-time daily revenue" />
          <KpiCard label="This Week" value={fmt(summary.weekRevenue)} color="text-sky-600 dark:text-sky-400" icon={TrendingUp} sub="Past 7 days revenue" />
          <KpiCard label="This Month" value={fmt(summary.monthRevenue)} color="text-primary" icon={BarChart3} sub="Calendar month revenue" />
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-full overflow-x-auto no-print">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex-1 justify-center ${
              tab === t.id ? "bg-card text-foreground shadow-2xs border border-border/80" : "text-muted-foreground hover:text-foreground"
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
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">Daily Revenue — Last 14 Days</h3>
                  <InfoTip
                    title="Daily Revenue Timeline"
                    lines={[
                      "Day-by-day revenue receipts, customer refunds, and broken stock write-offs over the past 14 days.",
                      { label: "Blue area", value: "Daily customer sales revenue" },
                      { label: "Orange line", value: "Refunds issued to customers" },
                      { label: "Red line", value: "Damaged inventory written off" },
                    ]}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Revenue, refunds, and broken stock write-offs per day</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Revenue</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Returns</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Broken stock</span>
              </div>
            </div>
            <div className="text-foreground" style={{ height: 220 }}>
              {dailyChart.length > 0 ? (
                <SvgAreaChart
                  data={dailyChart}
                  lines={[
                    { key: "revenue", color: "#2563eb", name: "Revenue" },
                    { key: "returns", color: "#f97316", name: "Returns" },
                    { key: "brokenLoss", color: "#ef4444", name: "Broken stock loss" },
                  ]}
                  yFormatter={v => v >= 1000 ? `₱${(v / 1000).toFixed(1)}k` : `₱${Math.round(v)}`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No data for selected range</div>
              )}
            </div>
          </div>

          {/* Monthly trend table */}
          <div className="bg-card border border-border/80 rounded-2xl shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Monthly Revenue Trend</h3>
                <InfoTip
                  title="Monthly Revenue Trend"
                  lines={[
                    "12-month historical revenue trajectory, customer refunds, damaged stock losses, and net income after deductions.",
                    { label: "Profit (est.)", value: "Estimated 40% margin on net sales" },
                    { label: "Current", value: "Ongoing calendar month" },
                  ]}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Last 12 months · revenue, refunds, broken-stock loss, and net after losses</p>
            </div>
            {monthly.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No monthly data available</div>
            ) : (
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/95 backdrop-blur-xs z-10">
                    <tr className="border-b border-border">
                      {["Month","Revenue","Returns","Broken Loss","Net After Losses","Sales","Profit (est.)"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...monthly].reverse().map((m, i) => {
                      const profit = m.netAfterLosses * 0.4;
                      return (
                        <tr key={m.month} className={`hover:bg-muted/20 transition-colors ${i === 0 ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3 font-semibold text-foreground">{m.month}{i === 0 && <span className="ml-2 text-[10px] text-primary font-bold">(current)</span>}</td>
                          <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{fmt(m.revenue)}</td>
                          <td className="px-4 py-3 tabular-nums text-orange-600 dark:text-orange-400">{fmt(m.returns)}</td>
                          <td className="px-4 py-3 tabular-nums text-red-600 dark:text-red-400">{fmt(m.brokenLoss)}</td>
                          <td className="px-4 py-3 tabular-nums text-primary font-bold">{fmt(m.netAfterLosses)}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{m.sales_count.toLocaleString()}</td>
                          <td className="px-4 py-3 tabular-nums text-sky-600 dark:text-sky-400">{fmt(profit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {monthly.length > 1 && (() => {
                    const totRev = monthly.reduce((s, m) => s + m.revenue, 0);
                    const totRet = monthly.reduce((s, m) => s + m.returns, 0);
                    const totBroken = monthly.reduce((s, m) => s + m.brokenLoss, 0);
                    const totNetAfterLosses = monthly.reduce((s, m) => s + m.netAfterLosses, 0);
                    const totSales = monthly.reduce((s, m) => s + m.sales_count, 0);
                    return (
                      <tfoot className="sticky bottom-0 bg-card border-t-2 border-border shadow-xs">
                        <tr className="font-bold">
                          <td className="px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground">Total ({monthly.length} months)</td>
                          <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(totRev)}</td>
                          <td className="px-4 py-3 tabular-nums text-orange-600 dark:text-orange-400">{fmt(totRet)}</td>
                          <td className="px-4 py-3 tabular-nums text-red-600 dark:text-red-400">{fmt(totBroken)}</td>
                          <td className="px-4 py-3 tabular-nums text-primary">{fmt(totNetAfterLosses)}</td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{totSales.toLocaleString()}</td>
                          <td className="px-4 py-3 tabular-nums text-sky-600 dark:text-sky-400">{fmt(totNetAfterLosses * 0.4)}</td>
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
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Type:</span>
              <InfoTip
                title="Financial Audit Ledger"
                lines={[
                  "Real-time transaction audit trail across the pharmacy store.",
                  { label: "Sale", value: "Customer payment received" },
                  { label: "Return", value: "Customer refund reimbursement" },
                  { label: "Adjustment", value: "Stock audit discrepancy correction" },
                ]}
              />
            </div>
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

          <div className="bg-card border border-border/80 rounded-2xl shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
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
                    <thead className="sticky top-0 z-10 bg-card shadow-sm">
                      <tr className="border-b border-border/70 bg-muted/30">
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
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-foreground">Revenue by Category</h3>
                  <InfoTip
                    title="Category Revenue Breakdown"
                    lines={[
                      "Relative revenue share and volume contribution across medicine categories.",
                      { label: "Share", value: "Percentage of total gross sales" },
                      { label: "Units", value: "Total quantity dispensed per category" },
                    ]}
                  />
                </div>
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
                    <thead className="sticky top-0 z-10 bg-card shadow-sm">
                      <tr className="border-b border-border bg-muted/30">
                        {["#","Category","Revenue","Units Sold","Share"].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                    {paginatedBreakdown.map((row, i) => (
                        <tr key={row.category} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground">{i + (breakdownPage - 1) * BREAKDOWN_PAGE_SIZE + 1}</td>
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
                <TablePager total={breakdown.length} page={breakdownPage} pageSize={BREAKDOWN_PAGE_SIZE} onPage={setBreakdownPage} />
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
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-bold text-foreground">Staff Sales Leaderboard</h3>
                <InfoTip
                  title="Staff Sales Performance"
                  lines={[
                    "Sales performance and total transactions processed per staff member.",
                    { label: "Transactions", value: "Total completed sales registered" },
                    { label: "Share", value: "Relative percentage of top performer" },
                  ]}
                />
              </div>
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
                    <thead className="sticky top-0 z-10 bg-card shadow-sm">
                      <tr className="border-b border-border bg-muted/30">
                        {["Rank","Staff Member","Transactions","Units Sold","Total Revenue"].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedStaff.map((s, i) => (
                        <tr key={s.staff} className={`hover:bg-muted/20 transition-colors ${i === 0 && staffPage === 1 ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3 text-muted-foreground font-bold">{i + (staffPage - 1) * STAFF_PAGE_SIZE + 1}</td>
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
                <TablePager total={staffData.length} page={staffPage} pageSize={STAFF_PAGE_SIZE} onPage={setStaffPage} />
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="bg-card border border-border/80 rounded-xl p-3 shadow-2xs">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">{fmt(incomeTotals.revenue)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Recorded customer receipts</p>
              </div>
              <div className="bg-card border border-border/80 rounded-xl p-3 shadow-2xs">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Supplier COGS</p>
                <p className="text-lg font-bold tabular-nums text-orange-600 dark:text-orange-400 mt-1">{fmt(incomeTotals.totalCost)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Costed batch inventory only</p>
              </div>
              <div className="bg-card border border-border/80 rounded-xl p-3 shadow-2xs">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Gross Profit</p>
                <p className={`text-lg font-bold tabular-nums mt-1 ${incomeTotals.grossProfit >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"}`}>
                  {fmt(incomeTotals.grossProfit)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Margin: <span className="font-semibold text-foreground">{incomeTotals.margin != null ? `${incomeTotals.margin}%` : "—"}</span>
                </p>
              </div>
              {summary && (
                <div className="bg-card border border-border/80 rounded-xl p-3 shadow-2xs">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Profit After Losses</p>
                  <p className={`text-lg font-bold tabular-nums mt-1 ${
                    incomeTotals.grossProfit - summary.totalReturns - summary.brokenStockLoss >= 0
                      ? "text-primary"
                      : "text-red-600 dark:text-red-400"
                  }`}>
                    {fmt(incomeTotals.grossProfit - summary.totalReturns - summary.brokenStockLoss)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Minus returns & damaged stock</p>
                </div>
              )}
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground">Product Income Breakdown</h3>
                    <InfoTip
                      title="Product Income & COGS"
                      lines={[
                        "Per-product gross profit calculations utilizing First-In, First-Out (FIFO) batch purchase costs.",
                        { label: "COGS", value: "Total batch purchase cost from supplier" },
                        { label: "Margin", value: "Gross profit divided by sales revenue" },
                        { label: "Mixed costs", value: "Dispensed across batches with varying purchase costs" },
                      ]}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Actual COGS from FIFO batch audit trail — cost is locked per batch at time of receipt,
                    so supplier price changes never distort past income.
                    Set <span className="font-semibold text-foreground">Batch Cost</span> when adding a batch in Inventory.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-card shadow-sm">
                    <tr className="border-b border-border bg-muted/30">
                      {["#", "Product", "Category", "Units Sold", "Revenue", "Avg Unit Cost", "Total COGS", "Gross Profit", "Margin"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedIncome.map((row, i) => (
                      <tr key={row.productId || row.productName} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{i + (incomePage - 1) * INCOME_PAGE_SIZE + 1}</td>
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
              <TablePager total={incomeData.length} page={incomePage} pageSize={INCOME_PAGE_SIZE} onPage={setIncomePage} />
            </div>
          )}
        </div>
      )}
      {confirmExportCsv && (
        <ConfirmDialog
          title="Export Financial CSV?"
          message="This will download the financial ledger data for the selected date range and view."
          confirmLabel="Export"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={() => { setConfirmExportCsv(false); financialApi.exportCsv(tab === "ledger" ? ledgerType : "all", dateFrom, dateTo); }}
          onCancel={() => setConfirmExportCsv(false)}
        />
      )}
      {confirmPrint && (
        <ConfirmDialog
          title="Print Financial Report?"
          message="This will open the print dialog for the current financial view."
          confirmLabel="Print"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={() => { setConfirmPrint(false); window.print(); }}
          onCancel={() => setConfirmPrint(false)}
        />
      )}
    </div>
  );
}
