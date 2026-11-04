import { useEffect, useMemo, useState, useRef } from "react";
import {
  Package,
  TrendingUp,
  RotateCcw,
  X,
  Info,
  Download,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar, LabelList } from "recharts";
import {
  PIE_COLORS, getReorderUnits,
  getMonthlyDemand, computeSMA, estimateEOQ,
  type Product, type Transaction,
} from "./data";
import { fmt, StockBadge, InfoTip, ConfirmDialog } from "./shared";
import { analyticsApi, purchaseOrdersApi, type PurchaseOrder, type SupplierPerformance } from "./api";

/* ---------- Pure Mathematical Formula Visualizers ---------- */
function parseTransactionDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year, hour = "0", minute = "0"] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function SmaFormulaVisual({
  type = "general",
}: {
  type?: "general" | "sma3" | "sma6";
}) {
  return (
    <div className="flex flex-col items-center justify-center py-4 px-5 bg-[#f4f2ea] dark:bg-[#1a2527] border border-[#e2ded2] dark:border-teal-900/40 rounded-xl text-[#1a4a52] dark:text-teal-200 shadow-inner select-none transition-colors">
      <div className="flex items-center gap-3.5 sm:gap-4">
        <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          SMA =
        </span>
        <div className="inline-flex flex-col items-center">
          <div className="px-2 pb-1.5 text-base sm:text-lg font-bold tracking-wide">
            {type === "sma3" ? (
              <>
                A<sub>t-1</sub> + A<sub>t-2</sub> + A<sub>t-3</sub>
              </>
            ) : type === "sma6" ? (
              <>
                A<sub>t-1</sub> + A<sub>t-2</sub> + … + A<sub>t-6</sub>
              </>
            ) : (
              <>
                A<sub>1</sub> + A<sub>2</sub> + … + A<sub>n</sub>
              </>
            )}
          </div>
          <div className="w-full h-[2.5px] bg-[#1a4a52] dark:bg-teal-200 rounded-full" />
          <div className="pt-1.5 text-base sm:text-lg font-extrabold">
            {type === "sma3" ? "3" : type === "sma6" ? "6" : "n"}
          </div>
        </div>
      </div>
      <div className="mt-3 w-full border-t border-[#1a4a52]/15 pt-3 text-[10px] font-medium opacity-90 dark:border-teal-200/20">
        <p className="mb-2 text-center font-semibold">
          {type === "general"
            ? "Add the sales shown, then divide by the number of periods (n)."
            : `Add sales from the latest ${type === "sma3" ? "3" : "6"} periods, then divide by ${type === "sma3" ? "3" : "6"}.`}
        </p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-center">
          <span><strong>A</strong> = units sold in a period</span>
          <span><strong>n</strong> = number of periods averaged</span>
          <span><strong>t</strong> = period being estimated</span>
          <span><strong>t−1</strong> = most recent completed period</span>
        </div>
      </div>
    </div>
  );
}

export function EoqFormulaVisual() {
  return (
    <div className="flex flex-col items-center justify-center py-4 px-5 bg-[#f4f2ea] dark:bg-[#1a2527] border border-[#e2ded2] dark:border-teal-900/40 rounded-xl text-[#1a4a52] dark:text-teal-200 shadow-inner select-none transition-colors">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">EOQ =</span>
          <div className="flex items-center">
            <span className="text-4xl sm:text-5xl font-light leading-none -mr-0.5 select-none font-serif">√</span>
            <div className="border-t-2 border-[#1a4a52] dark:border-teal-200 pt-1 -ml-1">
              <div className="inline-flex flex-col items-center px-1.5">
                <div className="px-2 pb-1 text-sm sm:text-base font-bold tracking-wide">
                  2 × D × S
                </div>
                <div className="w-full h-[2px] bg-[#1a4a52] dark:bg-teal-200 rounded-full" />
                <div className="pt-1 text-sm sm:text-base font-extrabold">
                  H
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs sm:text-sm font-semibold opacity-85 flex items-center gap-1.5 border-l border-[#1a4a52]/20 dark:border-teal-200/20 pl-3">
          <span>·</span>
          <span>H = C × I</span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-[#1a4a52]/15 dark:border-teal-200/20 text-[11px] font-medium opacity-85 text-center">
        D = Annual Demand · S = Order Cost · H = Holding Cost (Unit Cost C × Carrying Rate I)
      </div>
    </div>
  );
}

function ForecastErrorPanel({ error, onShowDetails }: {
  error: { smape: number; points: number } | null;
  onShowDetails: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2">
      <div className="flex items-baseline gap-2">
        <p className="text-[10px] font-medium text-muted-foreground">Past error</p>
        {error ? (
          <>
            <p className="text-sm font-bold tabular-nums text-foreground">{error.smape.toFixed(1)}%</p>
            <span className="text-[10px] text-muted-foreground">{error.points} checks · lower is better</span>
          </>
        ) : <p className="text-[10px] text-muted-foreground">Need more sales history</p>}
      </div>
      <button type="button" onClick={onShowDetails} className="rounded-md border border-border bg-card px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/5 cursor-pointer">
        Details
      </button>
    </div>
  );
}

function ForecastTrendChart({
  history,
  nextPeriod,
  sma3,
  sma6,
}: {
  history: { month: string; demand: number }[];
  nextPeriod: string;
  sma3: number;
  sma6: number;
}) {
  const data = [
    ...history.map(point => ({ month: point.month, actual: point.demand, sma3Forecast: null as number | null, sma6Forecast: null as number | null })),
    { month: nextPeriod, actual: null, sma3Forecast: sma3, sma6Forecast: sma6 },
  ];
  return (
    <div className="h-[245px] w-full" aria-label="Historical monthly sales and next-month SMA forecasts">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 14, bottom: 2, left: 2 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} opacity={0.65} />
          <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} width={42} allowDecimals={false} />
          <Tooltip
            formatter={(value: number, name: string) => [`${Number(value).toLocaleString()} units`, name]}
            labelFormatter={label => `${label}${label === nextPeriod ? " · forecast period" : " · actual sales"}`}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11, color: "var(--foreground)" }}
          />
          <ReferenceLine x={nextPeriod} stroke="var(--border)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="actual" name="Actual sales" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: "#2563eb" }} activeDot={{ r: 5 }} connectNulls={false} />
          <Line type="monotone" dataKey="sma3Forecast" name="SMA-3 estimate" stroke="#f97316" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 5, fill: "#f97316", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
          <Line type="monotone" dataKey="sma6Forecast" name="SMA-6 estimate" stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="3 4" dot={{ r: 5, fill: "#8b5cf6", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SmapeDetailsModal({
  model,
  error,
  example,
  checks,
  onClose,
}: {
  model: "SMA-3" | "SMA-6";
  error: { smape: number; points: number } | null;
  example: { period: string; actual: number; forecast: number } | null;
  checks: { period: string; actual: number; forecast: number; difference: number; score: number }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const difference = example ? Math.abs(example.actual - example.forecast) : 0;
  const average = example ? (Math.abs(example.actual) + Math.abs(example.forecast)) / 2 : 0;
  const exampleSmape = average > 0 ? (difference / average) * 100 : 0;
  const comparisonScale = example ? Math.max(example.actual, example.forecast, 1) : 1;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center p-4" style={{ top: "56px" }}>
      <button type="button" aria-label="Close sMAPE details" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] cursor-default" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="smape-modal-title" className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Past forecast check</p>
            <h2 id="smape-modal-title" className="mt-0.5 text-base font-bold text-foreground">How close was {model}?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close sMAPE details" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"><X size={17} /></button>
        </header>
        <div className="max-h-[78vh] space-y-3 overflow-y-auto p-5">
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Average past difference</p>
                {error ? (
                  <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">{error.smape.toFixed(1)}<span className="text-xl">%</span></p>
                ) : <p className="mt-1 text-sm font-semibold text-foreground">Not enough past sales yet</p>}
              </div>
              {error && <span className="pb-1 text-right text-[10px] leading-relaxed text-muted-foreground">{error.points} past months<br />compared</span>}
            </div>
            {error && (
              <>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {error.smape.toFixed(1)}% is the average of {error.points} monthly comparisons. Each month gets its own difference score first; those scores are then averaged.
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Average past difference ${error.smape.toFixed(1)} percent on a scale from zero to 200 percent`}>
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (error.smape / 200) * 100)}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0% · same sales</span><span>200% · furthest apart</span></div>
              </>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {error
                ? <><strong className="text-foreground">Recorded sales</strong> are the units actually sold that month. A <strong className="text-foreground">past estimate</strong> is what {model} would have predicted for that month using earlier recorded sales only. Lower means the estimate was closer; this is not the percent of units missed.</>
                : <> <strong className="text-foreground">Recorded sales</strong> are the units actually sold. A <strong className="text-foreground">past estimate</strong> is what {model} would have predicted using earlier sales. More history is needed to compare them.</>}
            </p>
          </div>
          {example ? (
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">One month, side by side</p>
                <span className="text-[10px] text-muted-foreground">{example.period}</span>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-teal-700 dark:text-teal-300">Recorded sales</span><strong className="tabular-nums text-foreground">{example.actual.toLocaleString()} units</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-teal-600 dark:bg-teal-400" style={{ width: `${(example.actual / comparisonScale) * 100}%` }} /></div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-orange-700 dark:text-orange-300">Past estimate</span><strong className="tabular-nums text-foreground">{example.forecast.toLocaleString()} units</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-orange-500" style={{ width: `${(example.forecast / comparisonScale) * 100}%` }} /></div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-1 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Difference for this month</span>
                <strong className="text-sm tabular-nums text-foreground">{difference.toLocaleString()} units <span className="text-xs font-normal text-muted-foreground">· {exampleSmape.toFixed(1)}% relative difference</span></strong>
              </div>
            </div>
          ) : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">No past month is ready for comparison yet. Recorded sales are needed to check an estimate against what actually sold.</p>}
          {example && (
            <details className="group rounded-xl border border-border">
              <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-primary">
                <span className="group-open:hidden">How is this percentage calculated?</span>
                <span className="hidden group-open:inline">Hide calculation</span>
              </summary>
              <div className="space-y-2 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                <p>For each past month, SmartTrack compares the estimate with recorded sales, then expresses the gap relative to the average of those two numbers. The monthly scores are averaged to get the {error?.smape.toFixed(1) ?? "—"}% above.</p>
                <p className="rounded-lg bg-muted/30 px-3 py-2 text-center font-semibold text-foreground">Gap ÷ average of sales and estimate × 100 = {exampleSmape.toFixed(1)}% for {example.period}</p>
                <p>This method is called sMAPE. Each estimate uses only earlier sales data, so it can be checked fairly against the actual sales for that month.</p>
              </div>
            </details>
          )}
          {checks.length > 0 && (
            <details className="group rounded-xl border border-border">
              <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-primary">
                <span className="group-open:hidden">See all {checks.length} past-month comparisons</span>
                <span className="hidden group-open:inline">Hide past-month comparisons</span>
              </summary>
              <div className="border-t border-border">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-muted/25 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Month</span><span className="text-right">Sales / estimate</span><span className="text-right">Difference</span>
                </div>
                {checks.map(check => (
                  <div key={check.period} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-border/60 px-4 py-2 text-xs">
                    <span className="text-muted-foreground">{check.period}</span>
                    <span className="text-right tabular-nums text-foreground">{check.actual.toLocaleString()} / {check.forecast.toLocaleString()} units</span>
                    <strong className="text-right tabular-nums text-foreground">{check.score.toFixed(1)}%</strong>
                  </div>
                ))}
                {error && (
                  <p className="border-t border-border bg-muted/20 px-4 py-2 text-right text-xs text-muted-foreground">
                    Average of {checks.length} monthly differences: <strong className="text-foreground">{error.smape.toFixed(1)}%</strong>
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}

/* ---------- Shared Table Pagination Controls ---------- */
function TablePager({
  total,
  page,
  pageSize,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build page number list with ellipsis
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-muted/10">
      <span className="text-[11px] text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of{" "}
        <span className="font-semibold text-foreground">{total}</span> results
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1 rounded text-[11px] font-medium border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          ← Prev
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-[11px] text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p as number)}
              className={`w-7 h-7 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                p === page
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:bg-muted text-foreground"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="px-2.5 py-1 rounded text-[11px] font-medium border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/* ---------- Calculation Inspector modal ---------- */
function CalcInspectorModal({
  title,
  formula,
  explanation,
  variables,
  trail,
  result,
  onClose,
}: {
  title: string;
  formula: React.ReactNode;
  explanation?: string;
  variables: { label: string; value: string }[];
  trail: string[];
  result: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center p-4" style={{ top: "56px" }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted cursor-pointer">
            <X size={16} />
          </button>
        </div>
        {/* Formula */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Formula at a glance</p>
          {typeof formula === "string" ? (
            <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 font-mono text-sm font-semibold text-foreground text-center">
              {formula}
            </div>
          ) : (
            formula
          )}
        </div>
        {explanation && (
          <div className="mx-5 mt-3 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5">
            <p className="text-[10px] font-semibold text-foreground mb-1">What this calculation is for</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{explanation}</p>
          </div>
        )}
        {/* Variables */}
        <div className="px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Recent sales used</p>
          <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {variables.map((v, i) => (
              <div key={i} className={`flex items-center justify-between px-3.5 py-2 text-[11px] ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                <span className="text-muted-foreground">{v.label}</span>
                <span className="font-semibold text-foreground font-mono">{v.value}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Computation steps */}
        <div className="px-5 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">How the estimate is worked out</p>
          <div className="space-y-2">
            {trail.map((step, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-muted/15 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                <p className="pt-1 text-xs leading-relaxed text-muted-foreground">{step}</p>
              </div>
            ))}
            <div className="rounded-lg border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm font-bold text-foreground">{result}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EoqBreakdownModal({
  data,
  onClose,
  onReorder,
}: {
  data: {
    product: Product;
    eoq: number;
    shortage: number;
    annualDemand: number;
    unitCost: number;
    orderCost: number;
    holdingCost: number;
    totalSold: number;
  };
  onClose: () => void;
  onReorder?: (product: Product) => void;
}) {
  const { product, eoq, shortage, annualDemand, unitCost, orderCost, holdingCost } = data;
  const numerator = 2 * annualDemand * orderCost;
  const ratio = holdingCost > 0 ? numerator / holdingCost : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ top: "56px" }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg flex flex-col overflow-hidden max-h-[92dvh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h3 className="text-sm font-semibold text-foreground truncate">EOQ Calculation — {product.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{product.id} · {product.category}</p>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 divide-y divide-border/40">
          {/* Formula */}
          <div className="px-4 pt-4 pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Mathematical Formula</p>
            <div className="overflow-x-auto">
              <EoqFormulaVisual />
            </div>
          </div>

          {/* Variables */}
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Variables (from database)</p>
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden text-[11px]">
              {[
                { label: "Annual Demand (D)", value: `${annualDemand.toLocaleString()} units/yr` },
                { label: "Order Cost (S)", value: `₱${orderCost.toFixed(2)} / batch` },
                { label: "Unit Purchase Cost (C)", value: `₱${unitCost.toFixed(2)}` },
                { label: "Annual Carrying Rate (I)", value: `20%` },
                { label: "Unit Holding Cost (H = C × I)", value: `₱${holdingCost.toFixed(2)} / unit / yr` },
              ].map((v, i) => (
                <div key={i} className={`flex items-start justify-between gap-3 px-3.5 py-2 ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                  <span className="text-muted-foreground">{v.label}</span>
                  <span className="font-semibold text-foreground font-mono text-right shrink-0">{v.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Step-by-step */}
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Step-by-step Computation</p>
            <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-1.5">
              <p className="font-mono text-[11px] text-muted-foreground break-words">1. Numerator = 2 × {annualDemand.toLocaleString()} × ₱{orderCost.toFixed(2)} = <strong>{numerator.toLocaleString()}</strong></p>
              <p className="font-mono text-[11px] text-muted-foreground break-words">2. Ratio = {numerator.toLocaleString()} ÷ ₱{holdingCost.toFixed(2)} = <strong>{Math.round(ratio).toLocaleString()}</strong></p>
              <p className="font-mono text-[11px] text-muted-foreground break-words">3. EOQ = √({Math.round(ratio).toLocaleString()}) ≈ <strong>{eoq.toLocaleString()} units</strong></p>
              <div className="border-t border-border mt-2 pt-2 text-xs font-semibold text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                <span>Stock: <span className="text-foreground">{product.stock}</span></span>
                <span>Shortage: <span className="text-red-500">{shortage > 0 ? `-${shortage}` : "—"}</span></span>
                <span>Optimal order: <span className="text-foreground">{eoq.toLocaleString()} units</span></span>
              </div>
            </div>
          </div>

          {/* ROP */}
          <div className="px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Suggested Lead-Time ROP</p>
              <span className="text-[10px] text-muted-foreground">7-day lead time · 20% buffer</span>
            </div>
            <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-2 text-[11px]">
              <div className="bg-background/80 rounded-md p-2 font-mono text-[11px] text-center text-foreground border border-border/50 text-xs">
                ROP = (Daily Demand × Lead Time) + Safety Stock
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-background/60 p-2 rounded border border-border/40">
                  <span className="text-[10px] text-muted-foreground block">Lead Time Demand</span>
                  <span className="font-semibold text-foreground font-mono">{Math.round((annualDemand / 365) * 7)} units</span>
                  <span className="text-[9px] text-muted-foreground block">({(annualDemand / 365).toFixed(1)}/day × 7d)</span>
                </div>
                <div className="bg-background/60 p-2 rounded border border-border/40">
                  <span className="text-[10px] text-muted-foreground block">Safety Stock (20%)</span>
                  <span className="font-semibold text-foreground font-mono">{Math.round((annualDemand / 365) * 7 * 0.2)} units</span>
                  <span className="text-[9px] text-muted-foreground block">Buffer reserve</span>
                </div>
                <div className="bg-primary/10 p-2 rounded border border-primary/20">
                  <span className="text-[10px] text-primary font-medium block">Suggested ROP</span>
                  <span className="font-bold text-primary font-mono">{Math.round((annualDemand / 365) * 7 * 1.2)} units</span>
                  <span className="text-[9px] text-muted-foreground block">Configured: {product.reorder} packs ({getReorderUnits(product)} units)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Smart Decision Support Note */}
          <div className="px-4 py-3">
            <div className="p-3 bg-teal-50/70 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/30 rounded-xl text-[11px] space-y-1 text-teal-900 dark:text-teal-200">
              <p className="font-bold flex items-center gap-1.5">
                <span>💡</span> Smart Decision Guidance:
              </p>
              <p className="leading-relaxed opacity-90">
                Suggested ROP is decision support based on annualized demand and an assumed 7-day supplier lead time with a 20% buffer. The configured threshold ({product.reorder} packs / {getReorderUnits(product)} units) remains the active stock alert threshold. Ordering <strong>{eoq.toLocaleString()} units</strong> balances procurement order cost (₱{orderCost.toFixed(2)}) against annual holding cost (20%). 
                Under <strong>FIFO (First-In, First-Out)</strong>, ensure new batches from suppliers have sufficient shelf life to prevent expiry loss.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground hidden sm:inline">Restocking guide only</span>
          {onReorder ? (
            <button
              type="button"
              onClick={() => { onClose(); onReorder(product); }}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs ml-auto"
            >
              <RefreshCw size={11} />
              Edit product in Inventory
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-muted text-foreground font-semibold rounded-lg text-xs hover:bg-muted/80 transition-opacity cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage({
  inventory,
  transactions,
  userRole,
  onEditProduct,
}: {
  inventory: Product[];
  transactions: Transaction[];
  userRole: string;
  onEditProduct?: (product: Product) => void;
}) {
  const [scope, setScope] = useState("all");
  const [activeSection, setActiveSection] = useState<"Overview" | "Forecast" | "Restocking" | "Products">("Overview");
  const [smaInspector, setSmaInspector] = useState<"sma3" | "sma6" | "eoq" | null>(null);
  const [smapeInspector, setSmapeInspector] = useState<"sma3" | "sma6" | null>(null);

  const [selectedEoqProduct, setSelectedEoqProduct] = useState<{
    product: Product;
    eoq: number;
    shortage: number;
    annualDemand: number;
    unitCost: number;
    orderCost: number;
    holdingCost: number;
    totalSold: number;
  } | null>(null);

  const [smaData, setSmaData] = useState<Awaited<ReturnType<typeof analyticsApi.sma>> | null>(null);
  const [smaLoading, setSmaLoading] = useState(true);
  const [categoryData, setCategoryData] = useState<Awaited<ReturnType<typeof analyticsApi.categorySales>>>([]);
  const [categorySalesLoading, setCategorySalesLoading] = useState(true);
  const [categorySalesError, setCategorySalesError] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(true);
  const [purchaseOrdersError, setPurchaseOrdersError] = useState(false);
  const [supplierPerformance, setSupplierPerformance] = useState<SupplierPerformance[]>([]);
  const [supplierPerformanceError, setSupplierPerformanceError] = useState(false);
  const canViewPurchaseData = true;
  const canEdit = userRole === "inventory_manager";

  const scopeFilter = useMemo(() => {
    if (scope.startsWith("product:")) return { productId: scope.slice(8) };
    if (scope.startsWith("category:")) return { category: scope.slice(9) };
    return {};
  }, [scope]);

  const scopedInventory = useMemo(() => {
    if (scope.startsWith("product:")) return inventory.filter(product => product.id === scope.slice(8));
    if (scope.startsWith("category:")) {
      const selectedCategory = scope.slice(9);
      return inventory.filter(product => {
        const productCategories = product.categories?.length ? product.categories : product.category.split(",").map(item => item.trim());
        return productCategories.includes(selectedCategory);
      });
    }
    return inventory;
  }, [inventory, scope]);

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
    if (!canViewPurchaseData) {
      setPurchaseOrdersLoading(false);
      return;
    }
    let active = true;
    setPurchaseOrdersLoading(true);
    setPurchaseOrdersError(false);
    setSupplierPerformanceError(false);
    Promise.allSettled([purchaseOrdersApi.list(), purchaseOrdersApi.performance()]).then(([ordersResult, performanceResult]) => {
      if (!active) return;
      if (ordersResult.status === "fulfilled") setPurchaseOrders(ordersResult.value);
      else setPurchaseOrdersError(true);
      if (performanceResult.status === "fulfilled") setSupplierPerformance(performanceResult.value);
      else setSupplierPerformanceError(true);
      setPurchaseOrdersLoading(false);
    });
    return () => { active = false; };
  }, [canViewPurchaseData]);

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

  const smaChartData = smaData?.chartData ?? [];
  const onHandUnits = scopedInventory.reduce((sum, product) => sum + product.stock, 0);
  const scopedLowStockProducts = scopedInventory.filter(product => product.status === "out_of_stock" || product.status === "critical" || product.status === "low");
  const scopedProductIds = useMemo(() => new Set(scopedInventory.map(product => product.id)), [scopedInventory]);
  const openOrderLines = useMemo(
    () => purchaseOrders.flatMap(order => order.items
      .filter(item => item.qtyRemaining > 0 && scopedProductIds.has(item.productId))
      .map(item => ({ ...item, orderId: order.id, supplier: order.supplier, expectedDeliveryDate: order.expectedDeliveryDate }))),
    [purchaseOrders, scopedProductIds]
  );
  const incomingUnits = openOrderLines.reduce((sum, item) => sum + item.qtyRemaining, 0);
  const openOrderCount = new Set(openOrderLines.map(item => item.orderId)).size;
  const salesMonths = smaChartData.filter(point => point.demand > 0);
  const latestSalesMonth = salesMonths[salesMonths.length - 1] ?? null;
  const orderedUnits = supplierPerformance.reduce((sum, supplier) => sum + supplier.qtyOrdered, 0);
  const fulfilledUnits = supplierPerformance.reduce((sum, supplier) => sum + supplier.qtyFulfilled, 0);
  const recordedOrderFillRate = orderedUnits > 0 ? (fulfilledUnits / orderedUnits) * 100 : null;
  const supplyDemandProductData = useMemo(() => {
    const scopedIds = new Set(scopedInventory.map(product => String(product.id)));
    const scopedSales = transactions.flatMap(transaction => {
      if (transaction.type !== "sale" || !transaction.productId) return [];
      const productId = String(transaction.productId);
      if (!scopedIds.has(productId)) return [];
      const date = parseTransactionDate(transaction.date);
      return date ? [{ productId, date, qty: transaction.qty, monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` }] : [];
    });
    const latestMonthKey = scopedSales.reduce((latest, sale) => sale.monthKey > latest ? sale.monthKey : latest, "");
    const demandByProduct = new Map<string, number>();
    scopedSales.filter(sale => sale.monthKey === latestMonthKey).forEach(sale => {
      demandByProduct.set(sale.productId, (demandByProduct.get(sale.productId) ?? 0) + sale.qty);
    });
    const rows = scopedInventory.map(product => ({
      productId: String(product.id),
      name: product.name,
      stock: product.stock,
      soldInLatestMonth: demandByProduct.get(String(product.id)) ?? 0,
    }));
    const withSales = rows.filter(row => row.soldInLatestMonth > 0).sort((a, b) => b.soldInLatestMonth - a.soldInLatestMonth);
    const monthDate = latestMonthKey ? new Date(Number(latestMonthKey.slice(0, 4)), Number(latestMonthKey.slice(5, 7)) - 1, 1) : null;
    const monthLabel = monthDate ? monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
    return {
      monthLabel,
      products: (withSales.length > 0 ? withSales : rows.filter(row => row.stock > 0).sort((a, b) => b.stock - a.stock)).slice(0, 8),
      hasSales: withSales.length > 0,
    };
  }, [transactions, scopedInventory]);
  const nextForecastMonth = useMemo(() => {
    const latestMonth = smaChartData[smaChartData.length - 1]?.month;
    if (!latestMonth) return "Next month";
    const [monthLabel, yearLabel] = latestMonth.split(" ");
    const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthLabel);
    if (monthIndex < 0 || !yearLabel) return "Next month";
    const next = new Date(Number(yearLabel), monthIndex + 1, 1);
    return next.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [smaChartData]);

  // ── Historical sMAPE score for comparing SMA-3 and SMA-6 ─────────────────
  function computeSmape(points: { actual: number; forecast: number }[]) {
    if (points.length === 0) return null;
    let sumSmape = 0;
    points.forEach(({ actual, forecast }) => {
      const err = Math.abs(actual - forecast);
      sumSmape += err / ((Math.abs(actual) + Math.abs(forecast)) / 2);
    });
    const smape = (sumSmape / points.length) * 100;
    return {
      smape: Math.round(smape * 10) / 10,
      points: points.length,
    };
  }

  // Back-test points come from the API's rolling forecasts. Each forecast uses
  // only earlier periods, never the actual sales of its own test period.
  const sma3Error = useMemo(() => {
    const valid = smaChartData
      .filter(d => d.sma3 != null && d.demand > 0)
      .map(d => ({ actual: d.demand, forecast: d.sma3 ?? 0 }));
    return computeSmape(valid);
  }, [smaChartData]);

  const sma6Error = useMemo(() => {
    const valid = smaChartData
      .filter(d => d.sma6 != null && d.demand > 0)
      .map(d => ({ actual: d.demand, forecast: d.sma6 ?? 0 }));
    if (valid.length === 0) return { insufficientData: true, needed: 7, have: smaChartData.length };
    return { insufficientData: false, ...computeSmape(valid)! };
  }, [smaChartData]);

  const sma3Example = useMemo(() => {
    const points = smaChartData.filter(point => point.sma3 != null && point.demand > 0);
    const point = points[points.length - 1];
    return point ? { period: point.month, actual: point.demand, forecast: point.sma3 ?? 0 } : null;
  }, [smaChartData]);

  const sma6Example = useMemo(() => {
    const points = smaChartData.filter(point => point.sma6 != null && point.demand > 0);
    const point = points[points.length - 1];
    return point ? { period: point.month, actual: point.demand, forecast: point.sma6 ?? 0 } : null;
  }, [smaChartData]);

  const sma3Checks = useMemo(() => smaChartData.flatMap(point => {
    if (point.sma3 == null || point.demand <= 0) return [];
    const forecast = point.sma3;
    const difference = Math.abs(point.demand - forecast);
    const average = (Math.abs(point.demand) + Math.abs(forecast)) / 2;
    return [{
      period: point.month,
      actual: point.demand,
      forecast,
      difference,
      score: average > 0 ? (difference / average) * 100 : 0,
    }];
  }), [smaChartData]);

  const sma6Checks = useMemo(() => smaChartData.flatMap(point => {
    if (point.sma6 == null || point.demand <= 0) return [];
    const forecast = point.sma6;
    const difference = Math.abs(point.demand - forecast);
    const average = (Math.abs(point.demand) + Math.abs(forecast)) / 2;
    return [{
      period: point.month,
      actual: point.demand,
      forecast,
      difference,
      score: average > 0 ? (difference / average) * 100 : 0,
    }];
  }), [smaChartData]);

  const selectedForecast = useMemo(() => {
    const comparable = smaChartData
      .filter(point => point.demand > 0 && point.sma3 != null && point.sma6 != null)
      .map(point => ({ actual: point.demand, sma3: point.sma3 ?? 0, sma6: point.sma6 ?? 0 }));
    if (comparable.length < 3) return null;
    const sma3Score = computeSmape(comparable.map(point => ({ actual: point.actual, forecast: point.sma3 })));
    const sma6Score = computeSmape(comparable.map(point => ({ actual: point.actual, forecast: point.sma6 })));
    if (!sma3Score || !sma6Score) return null;
    const model = sma3Score.smape <= sma6Score.smape ? "SMA-3" : "SMA-6";
    const selected = model === "SMA-3" ? sma3Score : sma6Score;
    return { model, smape: selected.smape, points: comparable.length };
  }, [smaChartData]);
  const selectedForecastUnits = selectedForecast
    ? selectedForecast.model === "SMA-3" ? forecastSMA3 : forecastSMA6
    : null;
  const forecastChange = selectedForecastUnits != null && latestSalesMonth
    ? Math.round(selectedForecastUnits) - latestSalesMonth.demand
    : null;

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
        const historicalAnnualDemand = (totalSold / months) * 12;
        const annualProductDemand = historicalAnnualDemand > 0 ? historicalAnnualDemand : Math.max(10, getReorderUnits(p) * 6);
        const batchesWithCost = p.batches.filter(batch => batch.unitCost != null);
        const costUnits = batchesWithCost.reduce((sum, batch) => sum + batch.qty, 0);
        const productUnitCost = costUnits > 0
          ? batchesWithCost.reduce((sum, batch) => sum + (batch.unitCost ?? 0) * batch.qty, 0) / costUnits
          : (p.price > 0 ? p.price * 0.7 : 5);
        const orderCost = 120;
        const holdingCost = Math.max(0.2, productUnitCost * 0.2);
        const productEOQ = estimateEOQ(Math.round(annualProductDemand), productUnitCost, orderCost, 0.2);
        return {
          product: p,
          eoq: Math.max(productEOQ, getReorderUnits(p)),
          totalSold,
          shortage: Math.max(0, getReorderUnits(p) - p.stock),
          annualDemand: Math.round(annualProductDemand),
          unitCost: productUnitCost,
          orderCost,
          holdingCost,
        };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }, [inventory, transactions, monthlyDemand]);
  const estimatedRestockCost = useMemo(
    () => reorderRecs.reduce((sum, rec) => sum + rec.eoq * rec.unitCost, 0),
    [reorderRecs]
  );

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
        const prod = inventory.find(p => p.id === t.productId) ?? inventory.find(p => p.name === t.product);
        map[t.product] = { name: t.product, cat: prod?.category ?? "", units: 0, rev: 0 };
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

  /* --- SMA inspector computed values --- */
  const smaMonths = useMemo(
    () => (smaData?.chartData ?? []).map(({ month, demand }) => ({ month, demand })),
    [smaData]
  );
  const last3 = smaMonths.slice(-3);
  const last6 = smaMonths.slice(-6);
  const sma3Computed = smaData?.sma3 ?? 0;
  const sma6Computed = smaData?.sma6 ?? 0;
  const globalOrderCost = 120;
  const globalHoldingCost = Math.max(0.2, avgUnitCost * 0.2);
  const eoqNumerator = 2 * annualDemand * globalOrderCost;
  const eoqRatio = globalHoldingCost > 0 ? eoqNumerator / globalHoldingCost : 0;

  const handleExportCsv = () => {
    const lines: string[] = [];
    lines.push("SMARTTRACK PHARMACY — ANALYTICS & DEMAND FORECAST SUMMARY");
    lines.push(`Export Date,${new Date().toLocaleDateString("en-PH")} ${new Date().toLocaleTimeString("en-PH")}`);
    lines.push(`Filter Scope,${scopeLabel}`);
    lines.push("");

    lines.push("--- DEMAND FORECASTING (SMA) ---");
    lines.push("Metric,Value,Description");
    lines.push(`SMA-3 Forecast,${Math.round(forecastSMA3)} units,Short-term 3-month moving average demand`);
    lines.push(`SMA-6 Forecast,${Math.round(forecastSMA6)} units,Medium-term 6-month moving average demand`);
    if (sma3Error) {
      lines.push(`SMA-3 Historical sMAPE,${sma3Error.smape}%,Used to compare forecast estimates with actual sales; lower is closer`);
      lines.push(`SMA-3 Back-test periods,${sma3Error.points},Recorded sales periods compared`);
    }
    lines.push(`Overall EOQ Guide,${eoqOverall} units,All-products planning estimate`);
    lines.push("");

    lines.push("--- EOQ REORDER RECOMMENDATIONS (DECISION SUPPORT) ---");
    lines.push("Product ID,Product Name,Category,Current Stock,Low-Stock Level (Units),Stock Gap,Suggested Order Quantity (Units),Unit Cost,Order Cost,Holding Cost,Status");
    reorderRecs.forEach(r => {
      lines.push(`"${r.product.id}","${r.product.name}","${r.product.category}",${r.product.stock},${getReorderUnits(r.product)},${r.shortage},${r.eoq},₱${r.unitCost.toFixed(2)},₱${r.orderCost.toFixed(2)},₱${r.holdingCost.toFixed(2)},"${r.product.status}"`);
    });
    lines.push("");

    lines.push("--- LOSS & RETURN ACCOUNTING ---");
    lines.push(`Refund Loss,₱${(smaData?.returnLoss ?? 0).toFixed(2)}`);
    lines.push(`Broken Stock Loss,₱${(smaData?.brokenLoss ?? 0).toFixed(2)}`);
    lines.push(`Total Financial Loss,₱${(smaData?.totalLoss ?? 0).toFixed(2)}`);

    const csvContent = lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smarttrack-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [confirmExportCsv, setConfirmExportCsv] = useState(false);

  const sectionMeta: Record<string, { icon: string; title: string; desc: string }> = {
    "Overview":          { icon: "📊", title: "Supply & Demand Overview",   desc: "Compare current stock on hand against recorded sales and open supplier orders." },
    "Forecast":          { icon: "🔮", title: "Demand Forecast",             desc: `SMA-3 and SMA-6 estimates for ${nextForecastMonth} — based on past sales history.` },
    "Restocking":        { icon: "📦", title: "Restocking Suggestions",      desc: "Products below their low-stock level. Suggested order quantities use EOQ — review before ordering." },
    "Products":          { icon: "🏷️", title: "Product Performance",         desc: "All products ranked by revenue. Helps identify fast-movers and slow stock." },
  };

  return (
    <div className="flex flex-col max-w-[1400px] mx-auto" style={{ height: "calc(100dvh - 56px)" }}>

      {/* ── Fixed header: title + tab nav ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 bg-background border-b border-border/50 z-20">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sales · Forecasts · Restocking
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmExportCsv(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-border bg-card text-foreground rounded-xl text-xs font-bold hover:bg-muted/50 transition-colors shadow-xs cursor-pointer flex-shrink-0 st-btn-ghost"
              title="Export full analytics dataset as CSV"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Section navigation */}
        <nav aria-label="Analytics sections" className="flex gap-1 overflow-x-auto rounded-xl border border-border/80 bg-card p-1 shadow-sm mt-3">
          {(["Overview", "Forecast", "Restocking", "Products"] as const).map(section => (
            <button
              key={section}
              type="button"
              aria-current={activeSection === section ? "page" : undefined}
              onClick={() => setActiveSection(section)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${activeSection === section ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
            >
              {section}
              {section === "Restocking" && reorderRecs.length > 0 && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${activeSection === section ? "bg-white/20" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"}`}>{reorderRecs.length}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">

      {/* Section banner — shows what the active tab is for */}
      {(() => {
        const meta = sectionMeta[activeSection];
        if (!meta) return null;
        const showScopeFilter = activeSection === "Overview" || activeSection === "Forecast";
        return (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3 shadow-sm">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{meta.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{meta.desc}</p>
              </div>
            </div>
            {showScopeFilter && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <InfoTip
                  title="Scope Filter"
                  lines={[
                    "Choose all products, one product, or one category to review its sales history and forecast.",
                    { label: "Forecasts", value: "SMA-3 and SMA-6 use the selected scope." },
                    { label: "EOQ", value: "Calculated separately from annualized historical sales; does not use the SMA forecast." },
                  ]}
                />
                <select
                  value={scope}
                  onChange={event => setScope(event.target.value)}
                  className="app-select w-full sm:w-52 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="all">All products</option>
                  <optgroup label="Products">
                    {inventory.map(product => <option key={`product-${product.id}`} value={`product:${product.id}`}>{product.name} ({product.id})</option>)}
                  </optgroup>
                  <optgroup label="Categories">
                    {categories.map(category => <option key={`category-${category}`} value={`category:${category}`}>{category}</option>)}
                  </optgroup>
                </select>
              </div>
            )}
          </div>
        );
      })()}

      {/* Overview: decision metrics first, followed by the supporting charts. */}
      {activeSection === "Overview" && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stock on hand</p>
            <InfoTip title="Stock on hand" lines={[
              "Current quantity in product batches for the selected products.",
              "Incoming purchase-order quantities are shown separately and are not included here until received.",
            ]} />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{onHandUnits.toLocaleString()} units</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Across {scopedInventory.length} selected products · current batch stock</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Incoming on open orders</p>
            <InfoTip title="Incoming order quantity" lines={[
              "Units still expected from purchase orders that have not been fully received.",
              "This is not current shelf stock. It becomes stock on hand after the delivery is received.",
            ]} />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-sky-700 dark:text-sky-300">
            {!canViewPurchaseData ? "—" : purchaseOrdersLoading ? "Loading…" : purchaseOrdersError ? "Unavailable" : `${incomingUnits.toLocaleString()} units`}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {!canViewPurchaseData ? "Order details unavailable" : purchaseOrdersError ? "Could not load purchase order records" : `${openOrderCount} open order${openOrderCount === 1 ? "" : "s"} · unreceived quantity`}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Demand · Latest Month</p>
            <InfoTip title="Latest-month demand" lines={[
              "Actual units sold in the latest month that has recorded sales for the selected products.",
              "The next-month estimate below is a forecast and is not included in this actual-sales total.",
            ]} />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{latestSalesMonth ? `${latestSalesMonth.demand.toLocaleString()} units` : "No sales yet"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Actual sales · {latestSalesMonth?.month ?? "from transactions"}</p>
          <div className="mt-2 border-t border-border/70 pt-2 flex items-center justify-between gap-1">
            <span className="text-[10px] text-muted-foreground">Next month est.</span>
            <span className="text-[10px] font-semibold text-foreground tabular-nums">
              {smaChartData.length === 0 ? "No history" : selectedForecast ? `~${Math.round(selectedForecast.model === "SMA-3" ? forecastSMA3 : forecastSMA6).toLocaleString()} · ${selectedForecast.model}` : `SMA-3 ~${Math.round(forecastSMA3).toLocaleString()}`}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recorded supplier fill rate</p>
            <InfoTip title="Supplier fill rate" lines={["Received ordered units ÷ total ordered units for purchase orders recorded in SmartTrack.", "This is a quantity fulfillment rate, not a delivery-time score.", "It summarizes all recorded orders, so it is not changed by the product filter."]} />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {!canViewPurchaseData ? "—" : supplierPerformanceError ? "Unavailable" : orderedUnits === 0 ? "No order history" : `${recordedOrderFillRate?.toFixed(1)}%`}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{orderedUnits > 0 ? `${fulfilledUnits.toLocaleString()} of ${orderedUnits.toLocaleString()} units received` : "Based on tracked purchase orders"}</p>
        </div>
      </div>
      {scopedLowStockProducts.length > 0 && <button type="button" onClick={() => setActiveSection("Restocking")} className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-900/60 dark:bg-amber-950/25 dark:hover:bg-amber-950/40 cursor-pointer">
        <span><span className="block text-xs font-bold text-amber-900 dark:text-amber-200">{scopedLowStockProducts.length} selected product{scopedLowStockProducts.length === 1 ? "" : "s"} need a stock review</span><span className="mt-0.5 block text-[10px] text-amber-800/80 dark:text-amber-200/70">Current stock is at a low, critical, or out-of-stock status.</span></span>
        <span className="shrink-0 text-xs font-semibold text-amber-900 dark:text-amber-200">Review Restocking <span aria-hidden="true">→</span></span>
      </button>}
      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Current supply and recent demand by product */}
        <div className="xl:col-span-2 bg-card border border-border/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] min-h-[340px]">
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Supply &amp; Demand by Product</h3>
                <InfoTip
                  title="How to read this chart"
                  lines={[
                    { label: "Supply", value: "Current stock on hand from the selected inventory products" },
                    { label: "Demand", value: `Actual units sold in ${supplyDemandProductData.monthLabel ?? "the latest recorded sales month"}, from transactions` },
                    "Both bars use base units. Stock is the current inventory snapshot; sales are from the latest month with recorded sales.",
                    "Incoming supplier orders are shown in the metric above and are not added to current stock.",
                    "The chart ranks products by units sold in that month. If no sales exist, it shows in-stock products and omits the sales series.",
                  ]}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{scopeLabel} · Current stock vs units sold{ supplyDemandProductData.monthLabel ? ` in ${supplyDemandProductData.monthLabel}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />Stock on hand</span>
              {supplyDemandProductData.hasSales
                ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Sales in {supplyDemandProductData.monthLabel}</span>
                : <span className="text-muted-foreground">No recorded sales</span>}
            </div>
          </div>
          <div className="text-foreground" style={{ height: 250 }}>
            {supplyDemandProductData.products.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No in-stock products to compare for this selection.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplyDemandProductData.products} layout="vertical" margin={{ top: 4, right: 32, bottom: 2, left: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={value => Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(1)}k` : String(value)} />
                  <YAxis type="category" dataKey="name" width={132} interval={0} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={value => String(value).length > 19 ? `${String(value).slice(0, 18)}…` : String(value)} />
                  <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString()} units`, name]} labelStyle={{ color: "var(--foreground)", fontWeight: 700 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11 }} />
                  <Bar dataKey="stock" name="Stock on hand" fill="#2563eb" barSize={11} radius={[0, 4, 4, 0]} />
                  {supplyDemandProductData.hasSales && <Bar dataKey="soldInLatestMonth" name={`Units sold · ${supplyDemandProductData.monthLabel}`} fill="#8b5cf6" barSize={11} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="soldInLatestMonth" position="right" formatter={value => Number(value) > 0 ? value : ""} style={{ fill: "#7c3aed", fontSize: 10, fontWeight: 600 }} />
                  </Bar>}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Stock is current; sales use the latest month with recorded transactions. Incoming orders are separate. The Forecast section shows next-month estimates.</p>
        </div>

        {/* Category pie chart */}
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] h-[340px] flex flex-col min-h-0">
          <div className="mb-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Sales by Category</h3>
              <InfoTip
                title="Sales Category Breakdown"
                lines={[
                  "Shows the percentage share of sales across therapeutic categories (e.g. Antibiotics, Analgesics, Vitamins).",
                  { label: "Purpose", value: "Identify key revenue drivers" },
                  "Helps allocate working capital effectively to high-turnover medication groups.",
                ]}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Share of all units sold by category</p>
          </div>
          <div className="h-[160px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {categoryData.length > 0 && (
                  <>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {categoryData.map((_, i) => <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `${v}%`}
                      labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                      itemStyle={{ color: "var(--foreground)" }}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "11px", color: "var(--foreground)", boxShadow: "0 8px 24px rgba(0,0,0,0.22)" }}
                      wrapperStyle={{ zIndex: 20, outline: "none" }}
                      position={{ x: 8, y: 8 }}
                      allowEscapeViewBox={{ x: false, y: false }}
                    />
                  </>
                )}
              </PieChart>
            </ResponsiveContainer>
          </div>
          {categorySalesLoading ? (
            <p className="text-xs text-muted-foreground text-center">Loading…</p>
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
                <span className="text-xs font-semibold text-foreground">{cat.value}%</span>
              </div>
            ))}
          </div>}
        </div>
      </div>

      </>}


      {/* Demand forecast: SMA estimates units likely to sell next month. */}
      {activeSection === "Forecast" && <>
      <section className="space-y-3">
        <div className="grid grid-cols-1 divide-y divide-border/60 rounded-xl border border-primary/25 bg-primary/[0.045] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next-month estimate</p>
              <InfoTip title="Next-month estimate" lines={[
                "Estimated units that may sell next month. It is not recorded sales or an order.",
                { label: "Selected model", value: "When both models have enough past checks, SmartTrack selects the one with the lower sMAPE." },
                "If there is not enough history to compare, review the SMA-3 and SMA-6 estimates below.",
              ]} />
            </div>
            {selectedForecast ? (
              <>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-primary">{Math.round(selectedForecastUnits ?? 0).toLocaleString()} <span className="text-sm font-semibold">units</span></p>
                <p className="text-[10px] text-muted-foreground">{nextForecastMonth} · {selectedForecast.model}</p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-base font-bold text-foreground">{smaLoading ? "Loading…" : "Compare below"}</p>
                <p className="text-[10px] text-muted-foreground">{smaLoading ? "Checking sales history" : "Need 3 matching checks"}</p>
              </>
            )}
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {latestSalesMonth ? `Change vs. ${latestSalesMonth.month}` : "Change vs. last month"}
              </p>
              <InfoTip title="Change from latest sales" lines={[
                "Subtract the latest recorded month's actual sales from the next-month estimate.",
                { label: "Positive", value: "The estimate is higher than latest-month sales." },
                { label: "Negative", value: "The estimate is lower than latest-month sales." },
              ]} />
            </div>
            {forecastChange != null && latestSalesMonth ? (
              <>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                  {forecastChange > 0 ? "+" : forecastChange < 0 ? "−" : ""}{Math.abs(forecastChange).toLocaleString()} <span className="text-sm font-semibold">units</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{latestSalesMonth.demand.toLocaleString()} units sold</p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-base font-bold text-foreground">{smaLoading ? "Loading…" : "—"}</p>
                <p className="text-[10px] text-muted-foreground">{smaLoading ? "Checking sales history" : "No model comparison yet"}</p>
              </>
            )}
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Past error</p>
              <InfoTip title="Past forecast error (sMAPE)" lines={[
                "Checks older estimates against the sales actually recorded in those same months.",
                { label: "Lower score", value: "Past estimates were closer to actual sales." },
                "It is an average comparison score, not a guarantee of next month's result. Select Details on an SMA card to inspect each check.",
              ]} />
            </div>
            {selectedForecast ? (
              <>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">{selectedForecast.smape.toFixed(1)}%</p>
                <p className="text-[10px] text-muted-foreground">{selectedForecast.model} · {selectedForecast.points} checks · lower is better</p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-base font-bold text-foreground">{smaLoading ? "Loading…" : "Not available"}</p>
                <p className="text-[10px] text-muted-foreground">{smaLoading ? "Checking sales history" : "Need more matching history"}</p>
              </>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Monthly sales &amp; forecast</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Actual sales and both next-month estimates.</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-blue-600" />Actual sales</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-orange-500" />SMA-3</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-violet-500" />SMA-6</span>
            </div>
          </div>
          {smaLoading ? <div className="flex h-[245px] items-center justify-center text-xs text-muted-foreground">Loading sales history…</div> : smaChartData.length === 0 ? <div className="flex h-[245px] items-center justify-center text-xs text-muted-foreground">No sales history for this selection yet.</div> : (
            <ForecastTrendChart history={smaChartData.map(({ month, demand }) => ({ month, demand }))} nextPeriod={nextForecastMonth} sma3={forecastSMA3} sma6={forecastSMA6} />
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">Dashed points are estimates, not recorded sales.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* SMA-3 */}
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">SMA-3 Forecast</p>
              <InfoTip
                title="SMA-3: short-term demand estimate"
                lines={[
                  "Answers: about how many units may sell in the next period? It averages the three most recent periods with recorded sales.",
                  { label: "Formula", value: "Ft = (At-1 + At-2 + At-3) ÷ 3" },
                  { label: "Why use it", value: "It reacts more quickly when recent demand changes." },
                  "The estimate supports review; it does not place an order. Open the calculation below to see the exact periods used.",
                ]}
              />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight mt-2">{Math.round(forecastSMA3).toLocaleString()} units</p>
          <p className="text-xs text-muted-foreground mt-1">{last3.length < 3 ? `Partial · ${last3.length} of 3 periods` : `${nextForecastMonth} · 3-period average`}</p>
          <ForecastErrorPanel error={sma3Error} onShowDetails={() => setSmapeInspector("sma3")} />
          <div className="border-t border-border/60 mt-3 pt-2.5">
            <button
              type="button"
              onClick={() => setSmaInspector("sma3")}
              className="text-[11px] text-primary hover:underline cursor-pointer"
            >
              How SMA-3 is calculated →
            </button>
          </div>
        </div>

        {/* SMA-6 */}
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">SMA-6 Forecast</p>
              <InfoTip
                title="SMA-6: smoother demand estimate"
                lines={[
                  "Answers: what does demand look like across a longer period? It averages the six most recent periods with recorded sales.",
                  { label: "Formula", value: "Ft = (Sum of the latest 6 periods) ÷ 6" },
                  { label: "Why use it", value: "It smooths short-term changes, but responds more slowly than SMA-3." },
                  "The estimate supports review; it does not place an order. Months without recorded sales are not included as zero-sales periods.",
                ]}
              />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight mt-2">{Math.round(forecastSMA6).toLocaleString()} units</p>
          <p className="text-xs text-muted-foreground mt-1">{last6.length < 6 ? `Partial · ${last6.length} of 6 periods` : `${nextForecastMonth} · 6-period average`}</p>
          <ForecastErrorPanel error={sma6Error && !sma6Error.insufficientData ? sma6Error : null} onShowDetails={() => setSmapeInspector("sma6")} />
          <div className="border-t border-border/60 mt-3 pt-2.5">
            <button
              type="button"
              onClick={() => setSmaInspector("sma6")}
              className="text-[11px] text-primary hover:underline cursor-pointer"
            >
              How SMA-6 is calculated →
            </button>
          </div>
        </div>
        </div>
      </section>
      </>}

      {/* Restocking: show action items and per-product order guidance. */}
      {activeSection === "Restocking" && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Products to review</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${reorderRecs.length ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>{reorderRecs.length}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Stock is low, critical, or out</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Overall EOQ guide</p>
            <InfoTip title="About the overall EOQ guide" color="sky" lines={["This is a general order-size estimate using annualized recorded sales and estimated cost for the whole inventory.", "The suggested quantity in each table row is calculated for that product. Staff should review the row before ordering.", "EOQ is a guide only. It does not create a supplier order."]} />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{eoqOverall.toLocaleString()} units</p>
          <button type="button" onClick={() => setSmaInspector("eoq")} className="mt-0.5 text-[10px] font-semibold text-primary hover:underline cursor-pointer">How EOQ is calculated →</button>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Estimated cost of listed suggestions</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-primary">{fmt(estimatedRestockCost)}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Uses each suggested quantity and estimated unit cost</p>
        </div>
      </div>

      {/* EOQ Reorder Recommendations table */}
      {reorderRecs.length > 0 && (
        <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">Products to restock</h3>
                <InfoTip
                  title="Why these products are listed"
                  color="sky"
                  lines={[
                    "These products currently have low, critical, or zero stock status.",
                    { label: "Suggested order quantity", value: "Product-level EOQ using recorded sales and estimated cost, at least the configured low-stock level." },
                    { label: "Stock gap", value: "How far current stock is below the configured low-stock level." },
                    "Use Details to review the calculation. Use Supplier Orders to create an order or record a delivery.",
                  ]}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Each row shows why stock is flagged and the suggested quantity for review.</p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium border border-border">
              {reorderRecs.length} product{reorderRecs.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-card shadow-sm">
                <tr className="border-b border-border/60 bg-muted/20">
                  {["Product", "Category", "Current Stock", "Low-Stock Level", "Stock Gap", "Suggested Order Quantity", "Status"].map(h => (
                    <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                  ))}
                  <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-right px-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reorderRecs.map(rec => {
                  const { product: p, eoq, shortage, annualDemand, unitCost, orderCost, holdingCost, totalSold } = rec;
                  return (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3"><p className="text-xs font-semibold text-foreground">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.id}</p></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.category}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-foreground">{p.stock}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{getReorderUnits(p).toLocaleString()} units <span className="text-[10px]">({p.reorder} packs)</span></td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">{shortage > 0 ? `${shortage.toLocaleString()} units` : "—"}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-foreground">{eoq.toLocaleString()} units</td>
                      <td className="px-4 py-3"><StockBadge status={p.status} /></td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedEoqProduct({ product: p, eoq, shortage, annualDemand, unitCost, orderCost, holdingCost, totalSold })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-[11px] font-medium border border-border transition-colors cursor-pointer"
                          >
                            <Info size={13} />
                            Details
                          </button>
                          {onEditProduct && canEdit && (
                            <button
                              type="button"
                              onClick={() => onEditProduct(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground rounded-md text-[11px] font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                            >
                              <RefreshCw size={11} />
                            Edit product
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {reorderRecs.length === 0 && <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">No products are currently below their low-stock level.</div>}
      </>}


      {/* Product Performance table */}
      {activeSection === "Products" && <>
      {(() => {
        const perfTotal = perf.length;
        return (
          <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="px-5 py-4 border-b border-border/70 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-foreground">Product Performance</h3>
                  <InfoTip
                    title="Product Performance Overview"
                    lines={[
                      "Summary table of all individual products with sales volume, revenue, and demand level.",
                      { label: "High Demand", value: "Fast-moving top revenue generators" },
                      { label: "Moderate Demand", value: "Steady community medications" },
                      { label: "Low Demand", value: "Slow-moving items (avoid overstocking)" },
                    ]}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Based on historical sales transaction records</p>
              </div>
              {perfTotal > 0 && (
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium border border-border">
                  {perfTotal} product{perfTotal > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card shadow-sm">
                  <tr className="border-b border-border/60 bg-muted/20">
                    {["Product", "Category", "Units Sold", "Revenue", "Demand Level"].map(h => (
                      <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perf.length > 0 ? perf.map(row => (
                    <tr key={row.name} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-xs font-semibold text-foreground">{row.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{row.cat || <span className="italic opacity-50">—</span>}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-foreground">{row.units}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-foreground">{fmt(row.rev)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          row.level === "High" ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20"
                          : row.level === "Moderate" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                          : "bg-muted text-muted-foreground border-border"
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
        );
      })()}
      </>}

      {selectedEoqProduct && (
        <EoqBreakdownModal
          data={selectedEoqProduct}
          onClose={() => setSelectedEoqProduct(null)}
          onReorder={canEdit ? onEditProduct : undefined}
        />
      )}

      {smaInspector === "sma3" && (
        <CalcInspectorModal
          title="SMA-3 forecast — calculation"
          formula={<SmaFormulaVisual type={last3.length === 3 ? "sma3" : "general"} />}
          explanation="Use SMA-3 for a quick, short-term estimate of how many units may sell next month. It averages sales from the latest 3 periods, so recent changes affect it faster. For a fair past check, each old estimate uses only sales from before that month."
          variables={[
            ...last3.slice().reverse().map((period, index) => ({
              label: `${index === 0 ? "Most recent" : `${index + 1} periods ago`} · t-${index + 1} (${period.month})`, value: `${period.demand.toLocaleString()} units sold`,
            })),
            { label: "Periods included", value: `${last3.length} of 3` },
            ...(sma3Error ? [
              { label: "Average past difference · Details", value: `${sma3Error.smape.toFixed(1)}% · lower was closer` },
              { label: "Past months checked", value: `${sma3Error.points}` },
            ] : []),
          ]}
          trail={[
            last3.length
              ? `Add the sales from these periods: ${last3.slice().reverse().map(m => m.demand.toLocaleString()).join(" + ")} = ${last3.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} units.`
              : "No recorded sales periods are available for this scope.",
            ...(last3.length ? [`Divide by the ${last3.length} periods used: ${last3.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} ÷ ${last3.length} = about ${Math.round(sma3Computed).toLocaleString()} units expected next month.`] : []),
            ...(sma3Error ? [
              `Past check: compare an older estimate with the units actually sold that month (${sma3Error.points} months checked).`,
              `Average past difference: ${sma3Error.smape.toFixed(1)}%. Lower means those estimates were closer. Open “Details” on the forecast card to see each month.`,
            ] : []),
          ]}
          result={`Estimated demand for next month: ≈ ${Math.round(sma3Computed).toLocaleString()} units`}
          onClose={() => setSmaInspector(null)}
        />
      )}

      {smaInspector === "sma6" && (
        <CalcInspectorModal
          title="SMA-6 forecast — calculation"
          formula={<SmaFormulaVisual type={last6.length === 6 ? "sma6" : "general"} />}
          explanation="Use SMA-6 for a steadier view of demand. It averages sales from up to the latest 6 periods, so one unusually high or low month has less effect. It changes more slowly than SMA-3. For a fair past check, each old estimate uses only sales from before that month."
          variables={[
            ...last6.slice().reverse().map((period, index) => ({
              label: `${index === 0 ? "Most recent" : `${index + 1} periods ago`} · t-${index + 1} (${period.month})`, value: `${period.demand.toLocaleString()} units sold`,
            })),
            { label: "Periods included", value: `${last6.length} of 6` },
            ...(sma6Error && !sma6Error.insufficientData ? [
              { label: "Average past difference · Details", value: `${sma6Error.smape.toFixed(1)}% · lower was closer` },
              { label: "Past months checked", value: `${sma6Error.points}` },
            ] : []),
          ]}
          trail={[
            last6.length
              ? `Add the sales from these periods: ${last6.slice().reverse().map(m => m.demand.toLocaleString()).join(" + ")} = ${last6.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} units.`
              : "No recorded sales periods are available for this scope.",
            ...(last6.length ? [`Divide by the ${last6.length} periods used${last6.length < 6 ? ` (${6 - last6.length} more needed for a full 6-period average)` : ""}: ${last6.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} ÷ ${last6.length} = about ${Math.round(sma6Computed).toLocaleString()} units expected next month.`] : []),
            ...(sma6Error && !sma6Error.insufficientData ? [
              `Past check: compare an older estimate with the units actually sold that month (${sma6Error.points} months checked).`,
              `Average past difference: ${sma6Error.smape.toFixed(1)}%. Lower means those estimates were closer. Open “Details” on the forecast card to see each month.`,
            ] : []),
          ]}
          result={`Estimated demand for next month: ≈ ${Math.round(sma6Computed).toLocaleString()} units`}
          onClose={() => setSmaInspector(null)}
        />
      )}

      {smaInspector === "eoq" && (
        <CalcInspectorModal
          title="EOQ Restocking — Calculation"
          formula={<EoqFormulaVisual />}
          explanation="EOQ answers ‘what order size balances ordering effort against the cost of holding stock?’ It uses annualized historical sales and the listed cost assumptions. SMA-3 and SMA-6 are shown for demand review but are not inputs to this EOQ calculation."
          variables={[
            { label: "Annual Demand (D)", value: `${Math.round(annualDemand).toLocaleString()} units/yr` },
            { label: "Order Cost (S)", value: `₱${globalOrderCost.toFixed(2)} / batch` },
            { label: "Avg Unit Cost (C)", value: `₱${avgUnitCost.toFixed(2)}` },
            { label: "Carrying Rate (I)", value: `20%` },
            { label: "Holding Cost (H = C × I)", value: `₱${globalHoldingCost.toFixed(2)} / unit / yr` },
          ]}
          trail={[
            `Numerator = 2 × ${Math.round(annualDemand).toLocaleString()} × ${globalOrderCost} = ${Math.round(eoqNumerator).toLocaleString()}`,
            `Ratio = ${Math.round(eoqNumerator).toLocaleString()} ÷ ${globalHoldingCost.toFixed(2)} = ${Math.round(eoqRatio).toLocaleString()}`,
            `EOQ = √(${Math.round(eoqRatio).toLocaleString()})`,
          ]}
          result={`EOQ ≈ ${eoqOverall.toLocaleString()} units — Optimal order batch size`}
          onClose={() => setSmaInspector(null)}
        />
      )}

      {smapeInspector && (
        <SmapeDetailsModal
          model={smapeInspector === "sma3" ? "SMA-3" : "SMA-6"}
          error={smapeInspector === "sma3" ? sma3Error : sma6Error && !sma6Error.insufficientData ? sma6Error : null}
          example={smapeInspector === "sma3" ? sma3Example : sma6Example}
          checks={smapeInspector === "sma3" ? sma3Checks : sma6Checks}
          onClose={() => setSmapeInspector(null)}
        />
      )}
      {confirmExportCsv && (
        <ConfirmDialog
          title="Export Analytics CSV?"
          message="This will download the full analytics and demand forecast dataset as a CSV file."
          confirmLabel="Export"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={() => { setConfirmExportCsv(false); handleExportCsv(); }}
          onCancel={() => setConfirmExportCsv(false)}
        />
      )}
      </div>{/* end scrollable content */}
    </div>
  );
}
