import { useEffect, useMemo, useState } from "react";
import {
  Package,
  TrendingUp,
  RotateCcw,
  X,
  Info,
  Download,
  RefreshCw,
  AlertTriangle,
  Search,
  Calculator,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  ArrowRight,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar, LabelList } from "recharts";
import {
  PIE_COLORS, getReorderUnits, hasUserRole,
  getMonthlyDemand, computeSMA, estimateEOQ,
  type Product, type Transaction,
} from "./data";
import { fmt, StockBadge, InfoTip, ConfirmDialog } from "./shared";
import { analyticsApi, purchaseOrdersApi, type PurchaseOrder, type SupplierPerformance } from "./api";

const ANALYTICS_CARD_CLASS = "rounded-2xl border border-border/60 bg-card/90 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const CATEGORY_COLORS = ["#0d9488", "#06b6d4", "#8b5cf6", "#f59e0b", "#3b82f6", "#ec4899", "#64748b"];

function AnalyticsColumnHeader({
  label,
  title,
  description,
  align = "left",
}: {
  label: string;
  title: string;
  description: string;
  align?: "left" | "right";
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}>
      <span>{label}</span>
      <InfoTip title={title} lines={[description]} />
    </span>
  );
}

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
    <div className="flex flex-col items-center justify-center py-4 px-5 bg-muted/40 border border-border/70 rounded-2xl text-foreground shadow-sm select-none transition-colors">
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
          <div className="w-full h-[2.5px] bg-foreground/70 rounded-full" />
          <div className="pt-1.5 text-base sm:text-lg font-extrabold">
            {type === "sma3" ? "3" : type === "sma6" ? "6" : "n"}
          </div>
        </div>
      </div>
      <div className="mt-3 w-full border-t border-border/70 pt-3 text-[10px] font-medium">
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
    <div className="flex flex-col items-center justify-center py-4 px-5 bg-muted/40 border border-border/70 rounded-2xl text-foreground shadow-sm select-none transition-colors">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">EOQ =</span>
          <div className="flex items-center">
            <span className="text-4xl sm:text-5xl font-light leading-none -mr-0.5 select-none font-serif">√</span>
            <div className="border-t-2 border-foreground/70 pt-1 -ml-1">
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

        <div className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-l border-border/70 pl-3">
          <span>·</span>
          <span>H = C × I</span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-border/70 text-[11px] font-medium text-center">
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
  periodUnit = "month",
}: {
  history: { month: string; demand: number; sma3?: number | null; sma6?: number | null }[];
  nextPeriod: string;
  sma3: number;
  sma6: number;
  periodUnit?: "month" | "week";
}) {
  const lastIdx = history.length - 1;
  const unitShort = periodUnit === "week" ? "wk" : "mo";
  const data = [
    ...history.map((point, idx) => ({
      month: point.month,
      actual: point.demand,
      sma3Forecast: point.sma3 != null ? Math.round(point.sma3) : (idx === lastIdx ? point.demand : null),
      sma6Forecast: point.sma6 != null ? Math.round(point.sma6) : (idx === lastIdx ? point.demand : null),
    })),
    {
      month: nextPeriod,
      actual: null,
      sma3Forecast: Math.round(sma3),
      sma6Forecast: Math.round(sma6),
    },
  ];
  return (
    <div className="h-[260px] w-full" aria-label={`Historical ${periodUnit}ly sales and next-${periodUnit} SMA forecasts`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 18, bottom: 4, left: 2 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} opacity={0.65} />
          <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (value == null) return [null, null];
              return [`${Number(value).toLocaleString()} units`, name];
            }}
            labelFormatter={label => `${label}${label === nextPeriod ? ` · Forecasted Next ${periodUnit === "week" ? "Week" : "Month"}` : " · Historical Back-test & Actual Sales"}`}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11, color: "var(--foreground)" }}
          />
          <ReferenceLine x={nextPeriod} stroke="var(--border)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="actual" name="Actual sales" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3.5, fill: "#2563eb" }} activeDot={{ r: 5.5 }} connectNulls={false} />
          <Line
            type="monotone"
            dataKey="sma3Forecast"
            name={`SMA-3 Forecast (3-${unitShort} avg)`}
            stroke="#f97316"
            strokeWidth={2.2}
            strokeDasharray="6 4"
            dot={(props: { cx?: number; cy?: number; payload?: { month?: string } }) =>
              props.cx != null && props.cy != null ? (
                <circle
                  key={`sma3-dot-${props.payload?.month}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={props.payload?.month === nextPeriod ? 5.5 : 3}
                  fill="#f97316"
                  stroke="var(--card)"
                  strokeWidth={props.payload?.month === nextPeriod ? 2 : 1}
                />
              ) : <g key={`sma3-empty-${props.payload?.month}`} />
            }
            activeDot={{ r: 6 }}
            connectNulls={true}
          />
          <Line
            type="monotone"
            dataKey="sma6Forecast"
            name={`SMA-6 Forecast (6-${unitShort} avg)`}
            stroke="#8b5cf6"
            strokeWidth={2.2}
            strokeDasharray="3 4"
            dot={(props: { cx?: number; cy?: number; payload?: { month?: string } }) =>
              props.cx != null && props.cy != null ? (
                <circle
                  key={`sma6-dot-${props.payload?.month}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={props.payload?.month === nextPeriod ? 5.5 : 3}
                  fill="#8b5cf6"
                  stroke="var(--card)"
                  strokeWidth={props.payload?.month === nextPeriod ? 2 : 1}
                />
              ) : <g key={`sma6-empty-${props.payload?.month}`} />
            }
            activeDot={{ r: 6 }}
            connectNulls={true}
          />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close sMAPE details" className="fixed inset-0 cursor-default" onClick={onClose} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto">
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
  onSetOverrideQty,
}: {
  data: {
    product: Product;
    rawEoq: number;
    eoq: number;
    shortage: number;
    annualDemand: number;
    unitCost: number;
    orderCost: number;
    holdingCost: number;
    holdingPercent: number;
    leadTimeDays: number;
    safetyBufferPercent: number;
    demandSourceLabel: string;
    costSourceLabel: string;
    totalSold: number;
    overrideQty?: number | null;
  };
  onClose: () => void;
  onReorder?: (product: Product) => void;
  onSetOverrideQty?: (productId: string, qty: number | null) => void;
}) {
  const {
    product,
    rawEoq,
    eoq,
    shortage,
    annualDemand,
    unitCost,
    orderCost,
    holdingCost,
    holdingPercent,
    leadTimeDays,
    safetyBufferPercent,
    demandSourceLabel,
    costSourceLabel,
    overrideQty,
  } = data;
  const [customQtyInput, setCustomQtyInput] = useState(
    overrideQty != null ? String(overrideQty) : String(eoq)
  );
  const numerator = 2 * annualDemand * orderCost;
  const ratio = holdingCost > 0 ? numerator / holdingCost : 0;
  const effectiveQty = overrideQty != null ? overrideQty : eoq;
  const monthlyRate = annualDemand / 12;
  const fifoMonths = monthlyRate > 0 ? effectiveQty / monthlyRate : null;
  const unitsPerPack = Math.max(1, product.unitsPerPack ?? 1);
  const effectivePacks = unitsPerPack > 1 ? Math.ceil(effectiveQty / unitsPerPack) : null;
  const leadTimeDemand = Math.round((annualDemand / 365) * leadTimeDays);
  const safetyStockUnits = Math.round((annualDemand / 365) * leadTimeDays * (safetyBufferPercent / 100));
  const suggestedRop = Math.max(1, Math.round((annualDemand / 365) * leadTimeDays * (1 + safetyBufferPercent / 100)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col overflow-hidden max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h3 className="text-sm font-semibold text-foreground truncate">EOQ &amp; ROP Calculation — {product.name}</h3>
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Variables &amp; Data Sources</p>
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden text-[11px]">
              {[
                { label: "Annual Demand (D)", value: `${annualDemand.toLocaleString()} units/yr`, sub: demandSourceLabel, help: "Estimated units needed in a year. This follows the selected demand basis and is used in EOQ calculations." },
                { label: "Order Cost (S)", value: `₱${orderCost.toFixed(2)} / order`, sub: "Configurable in Cost Parameters", help: "Estimated fixed cost each time a purchase order is placed, such as delivery and administration." },
                { label: "Unit Purchase Cost (C)", value: `₱${unitCost.toFixed(2)}`, sub: costSourceLabel, help: "Purchase cost for one base unit, taken from the displayed cost source." },
                { label: "Annual Carrying Rate (I)", value: `${holdingPercent}%`, sub: "Configurable storage & capital rate", help: "Estimated yearly share of unit cost spent holding stock, including storage and tied-up capital." },
                { label: "Unit Holding Cost (H = C × I)", value: `₱${holdingCost.toFixed(2)} / unit / yr`, sub: `₱${unitCost.toFixed(2)} × ${holdingPercent}%`, help: "Estimated annual cost of holding one unit. EOQ compares this with the cost of placing orders." },
              ].map((v, i) => (
                <div key={i} className={`flex items-start justify-between gap-3 px-3.5 py-2 ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                  <div className="min-w-0">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {v.label}
                      <InfoTip title={v.label} lines={[v.help]} />
                    </span>
                    <span className="text-[10px] text-muted-foreground/80">{v.sub}</span>
                  </div>
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
              <p className="font-mono text-[11px] text-muted-foreground break-words">3. Formula EOQ = √({Math.round(ratio).toLocaleString()}) ≈ <strong>{rawEoq.toLocaleString()} units</strong></p>
              {eoq > rawEoq && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  Note: Raised from {rawEoq.toLocaleString()} to {eoq.toLocaleString()} units so the order covers the configured minimum level ({getReorderUnits(product).toLocaleString()} units).
                </p>
              )}
              <div className="border-t border-border mt-2 pt-2 text-xs font-semibold text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                <span>Stock: <span className="text-foreground">{product.stock.toLocaleString()}</span></span>
                <span>Shortage: <span className="text-red-500">{shortage > 0 ? `-${shortage.toLocaleString()}` : "—"}</span></span>
                <span>Recommended EOQ: <span className="text-foreground">{eoq.toLocaleString()} units</span></span>
                {fifoMonths != null && (
                  <span>FIFO Sell-Through: <span className="text-teal-700 dark:text-teal-300">~{fifoMonths.toFixed(1)} mos</span></span>
                )}
              </div>
            </div>
          </div>

          {/* User Override Control (100% Flexible Decision Support) */}
          {onSetOverrideQty && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Your Planned Order Quantity (User Override)
                </p>
                {overrideQty != null ? (
                  <span className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold">
                    Custom Override Active
                  </span>
                ) : (
                  <span className="rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                    Using EOQ Recommendation
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                EOQ is a recommendation only. You can override this quantity for supplier box sizes, budget limits, or seasonal judgement.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customQtyInput}
                  onChange={e => setCustomQtyInput(e.target.value)}
                  className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsed = Math.max(1, Math.round(Number(customQtyInput) || eoq));
                    setCustomQtyInput(String(parsed));
                    onSetOverrideQty(product.id, parsed === eoq ? null : parsed);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 cursor-pointer"
                >
                  Apply Qty
                </button>
                {unitsPerPack > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const roundedPacks = Math.max(1, Math.ceil(effectiveQty / unitsPerPack));
                      const roundedUnits = roundedPacks * unitsPerPack;
                      setCustomQtyInput(String(roundedUnits));
                      onSetOverrideQty(product.id, roundedUnits === eoq ? null : roundedUnits);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-[11px] font-semibold text-foreground cursor-pointer"
                  >
                    Round to Pack ({unitsPerPack}u/pk)
                  </button>
                )}
                {overrideQty != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomQtyInput(String(eoq));
                      onSetOverrideQty(product.id, null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                  >
                    Reset to EOQ ({eoq})
                  </button>
                )}
              </div>
              {effectivePacks != null && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Equivalent to <strong>{effectivePacks} packs</strong> ({unitsPerPack} base units per pack) · Est. cost: <strong>{fmt(effectiveQty * unitCost)}</strong>
                </p>
              )}
            </div>
          )}

          {/* ROP */}
          <div className="px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Suggested Lead-Time ROP</p>
              <span className="text-[10px] text-muted-foreground">{leadTimeDays}-day lead time · {safetyBufferPercent}% buffer</span>
            </div>
            <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-2 text-[11px]">
              <div className="bg-background/80 rounded-md p-2 font-mono text-[11px] text-center text-foreground border border-border/50 text-xs">
                ROP = (Daily Demand × Lead Time) + Safety Stock
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-background/60 p-2 rounded border border-border/40">
                  <span className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    Lead Time Demand
                    <InfoTip title="Lead-time demand" lines={["Estimated units expected to sell while waiting for the supplier's delivery, based on annual demand and lead time."]} />
                  </span>
                  <span className="font-semibold text-foreground font-mono">{leadTimeDemand.toLocaleString()} units</span>
                  <span className="text-[9px] text-muted-foreground block">({(annualDemand / 365).toFixed(1)}/day × {leadTimeDays}d)</span>
                </div>
                <div className="bg-background/60 p-2 rounded border border-border/40">
                  <span className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    Safety Stock ({safetyBufferPercent}%)
                    <InfoTip title="Safety stock" lines={["An extra reserve added to lead-time demand to help cover delays or higher-than-usual demand. The percentage is adjustable in parameters."]} />
                  </span>
                  <span className="font-semibold text-foreground font-mono">{safetyStockUnits.toLocaleString()} units</span>
                  <span className="text-[9px] text-muted-foreground block">Buffer reserve</span>
                </div>
                <div className="bg-primary/10 p-2 rounded border border-primary/20">
                  <span className="flex items-center justify-center gap-1 text-[10px] text-primary font-medium">
                    Suggested ROP
                    <InfoTip title="Suggested reorder point" lines={["The stock threshold for considering a new order: estimated demand during supplier lead time plus safety stock. It is advisory and does not place an order."]} />
                  </span>
                  <span className="font-bold text-primary font-mono">{suggestedRop.toLocaleString()} units</span>
                  <span className="text-[9px] text-muted-foreground block">Configured: {product.reorder} packs ({getReorderUnits(product)} units)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Smart Decision Support Note */}
          <div className="px-4 py-3">
            <div className="p-3 bg-teal-50/70 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/30 rounded-xl text-[11px] space-y-1 text-teal-900 dark:text-teal-200">
              <p className="font-bold flex items-center gap-1.5">
                <span>💡</span> FIFO &amp; Decision Guidance:
              </p>
              <p className="leading-relaxed opacity-90">
                Suggested ROP uses a {leadTimeDays}-day supplier lead time and {safetyBufferPercent}% safety buffer. Your configured threshold ({product.reorder} packs / {getReorderUnits(product)} units) remains the active stock alert trigger until you edit the product. Ordering <strong>{effectiveQty.toLocaleString()} units</strong> balances ordering cost (₱{orderCost.toFixed(2)}) against annual holding cost ({holdingPercent}%).
                {fifoMonths != null && (
                  <> At current demand (~{Math.round(monthlyRate).toLocaleString()} units/month), this batch will sell through in <strong>~{fifoMonths.toFixed(1)} months under FIFO (First-In, First-Out)</strong>—ensure supplier expiry dates exceed this window.</>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground hidden sm:inline">100% flexible decision guide</span>
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

function EoqSettingsModal({
  orderCost,
  holdingPercent,
  leadTimeDays,
  safetyBufferPercent,
  onSave,
  onReset,
  onClose,
}: {
  orderCost: number;
  holdingPercent: number;
  leadTimeDays: number;
  safetyBufferPercent: number;
  onSave: (orderCost: number, holdingPercent: number, leadTimeDays: number, safetyBufferPercent: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [formOrderCost, setFormOrderCost] = useState(String(orderCost));
  const [formHoldingPercent, setFormHoldingPercent] = useState(String(holdingPercent));
  const [formLeadTimeDays, setFormLeadTimeDays] = useState(String(leadTimeDays));
  const [formSafetyBuffer, setFormSafetyBuffer] = useState(String(safetyBufferPercent));

  const applyPreset = (cost: number, hold: number, lead: number, buffer: number) => {
    setFormOrderCost(String(cost));
    setFormHoldingPercent(String(hold));
    setFormLeadTimeDays(String(lead));
    setFormSafetyBuffer(String(buffer));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cost = Math.max(1, parseFloat(formOrderCost) || 120);
    const hold = Math.min(100, Math.max(1, parseFloat(formHoldingPercent) || 20));
    const lead = Math.min(90, Math.max(1, Math.round(parseFloat(formLeadTimeDays) || 7)));
    const buffer = Math.min(200, Math.max(0, Math.round(parseFloat(formSafetyBuffer) || 20)));
    onSave(cost, hold, lead, buffer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-foreground">EOQ &amp; ROP Operational Parameters</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Configure ordering costs, holding rate, supplier lead time, and safety stock buffer</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Content & Plain Language Explanation */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2 text-xs leading-relaxed">
            <h4 className="font-bold text-foreground text-xs">
              Why SmartTrack Uses Configurable Pharmacy Presets
            </h4>
            <p className="text-muted-foreground">
              Every pharmacy has different supplier fees and storage conditions. <strong className="text-foreground">Order Cost (S)</strong> covers delivery &amp; admin effort per PO; <strong className="text-foreground">Holding Rate (I)</strong> covers air-conditioning, shelf space, and capital lockup; <strong className="text-foreground">Lead Time &amp; Buffer</strong> determine your Reorder Point (ROP) safety cushion.
            </p>
          </div>

          {/* 1-Click Operational Presets */}
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Quick Pharmacy Operational Presets
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  name: "Local Fast Courier",
                  desc: "Nearby distributor · low delivery fee",
                  cost: 60,
                  hold: 15,
                  lead: 3,
                  buffer: 15,
                },
                {
                  name: "Tangub Benchmark",
                  desc: "Standard retail pharmacy default",
                  cost: 120,
                  hold: 20,
                  lead: 7,
                  buffer: 20,
                },
                {
                  name: "Regional / Cold-Chain",
                  desc: "Freight shipping · higher A/C storage",
                  cost: 250,
                  hold: 25,
                  lead: 14,
                  buffer: 30,
                },
              ].map(preset => {
                const isSelected =
                  Number(formOrderCost) === preset.cost &&
                  Number(formHoldingPercent) === preset.hold &&
                  Number(formLeadTimeDays) === preset.lead &&
                  Number(formSafetyBuffer) === preset.buffer;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset.cost, preset.hold, preset.lead, preset.buffer)}
                    className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border bg-background hover:bg-muted/50"
                    }`}
                  >
                    <span className="block text-xs font-bold text-foreground">{preset.name}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">{preset.desc}</span>
                    <span className="block text-[10px] font-mono font-semibold text-primary mt-1">
                      ₱{preset.cost} · {preset.hold}% · {preset.lead}d · +{preset.buffer}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Order Cost S (₱ per purchase order)
              </label>
              <input
                type="number"
                step="any"
                min="1"
                value={formOrderCost}
                onChange={e => setFormOrderCost(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">Default: ₱120.00 / order</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Annual Holding Rate I (% of unit cost)
              </label>
              <input
                type="number"
                step="any"
                min="1"
                max="100"
                value={formHoldingPercent}
                onChange={e => setFormHoldingPercent(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">Default: 20% per year</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Supplier Lead Time (days to deliver)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="90"
                value={formLeadTimeDays}
                onChange={e => setFormLeadTimeDays(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">Default: 7 days</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Safety Stock Buffer (% above lead demand)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="200"
                value={formSafetyBuffer}
                onChange={e => setFormSafetyBuffer(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                required
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">Default: 20% buffer</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => {
                onReset();
                onClose();
              }}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              Reset to Defaults (₱120 · 20% · 7d · 20%)
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs cursor-pointer"
              >
                Save &amp; Recalculate
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AnalyticsPage({
  inventory,
  transactions,
  userRoles,
  onEditProduct,
}: {
  inventory: Product[];
  transactions: Transaction[];
  userRoles: string[];
  onEditProduct?: (product: Product) => void;
}) {
  const [scope, setScope] = useState("all");
  const [activeSection, setActiveSection] = useState<"Overview" | "Forecast" | "Restocking" | "Products">(() => {
    try {
      const saved = localStorage.getItem("smarttrack_analytics_section");
      if (saved === "Overview" || saved === "Forecast" || saved === "Restocking" || saved === "Products") {
        return saved;
      }
    } catch { /* ignore */ }
    return "Overview";
  });

  useEffect(() => {
    try {
      localStorage.setItem("smarttrack_analytics_section", activeSection);
    } catch { /* ignore */ }
  }, [activeSection]);
  const [smaInspector, setSmaInspector] = useState<"sma3" | "sma6" | "eoq" | null>(null);
  const [smapeInspector, setSmapeInspector] = useState<"sma3" | "sma6" | null>(null);

  const [selectedEoqProductId, setSelectedEoqProductId] = useState<string | null>(null);

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
  const canEdit = hasUserRole({ roles: userRoles }, "inventory_manager");

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

  const chartCategoryData = useMemo(() => {
    if (categoryData.length <= 7) return categoryData;
    const top = categoryData.slice(0, 6);
    const rest = categoryData.slice(6);
    const restTotal = Math.round(rest.reduce((acc, c) => acc + c.value, 0) * 10) / 10;
    if (restTotal > 0) {
      return [...top, { name: `Other Categories (${rest.length})`, value: restTotal }];
    }
    return top;
  }, [categoryData]);

  const [forecastPeriodUnit, setForecastPeriodUnit] = useState<"month" | "week">("month");
  const [productForecastSearch, setProductForecastSearch] = useState("");
  const [productForecastFilter, setProductForecastFilter] = useState<"all" | "shortfall" | "rising" | "high_confidence">("all");
  const [productForecastPage, setProductForecastPage] = useState(1);
  const PRODUCT_FORECAST_PAGE_SIZE = 10;

  const monthlyDemand = useMemo(() => getMonthlyDemand(transactions), [transactions]);
  const demandValues = monthlyDemand.map(d => d.demand);

  const scopedProductIds = useMemo(() => new Set(scopedInventory.map(product => String(product.id))), [scopedInventory]);

  // Weekly series for the active scope (supports newer pharmacies / short history)
  const weeklyScopeData = useMemo(() => {
    const scopedSales = transactions.flatMap(tx => {
      if (tx.type !== "sale") return [];
      if (scope !== "all" && (!tx.productId || !scopedProductIds.has(String(tx.productId)))) return [];
      const parsed = parseTransactionDate(tx.date);
      return parsed ? [{ date: parsed, qty: tx.qty }] : [];
    });
    if (scopedSales.length === 0) {
      return {
        chartData: [] as { month: string; demand: number; supply: number; sma3: number | null; sma6: number | null }[],
        sma3: 0,
        sma6: 0,
        nextLabel: "Next week",
      };
    }
    const allSaleDates = transactions
      .filter(tx => tx.type === "sale")
      .map(tx => parseTransactionDate(tx.date))
      .filter((d): d is Date => d !== null);
    const maxTime = Math.max(...(allSaleDates.length ? allSaleDates : scopedSales.map(s => s.date)).map(d => d.getTime()));
    const minTime = Math.min(...scopedSales.map(s => s.date.getTime()));

    // Align to 7-day buckets ending at maxTime
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const totalWeeks = Math.min(24, Math.max(1, Math.ceil((maxTime - minTime + 1) / msPerWeek)));
    const buckets: { month: string; demand: number; supply: number }[] = [];
    for (let i = totalWeeks - 1; i >= 0; i--) {
      const bucketEnd = new Date(maxTime - i * msPerWeek);
      const bucketStart = new Date(bucketEnd.getTime() - msPerWeek + 1);
      const qty = scopedSales
        .filter(s => s.date >= bucketStart && s.date <= bucketEnd)
        .reduce((sum, s) => sum + s.qty, 0);
      const label = bucketEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      buckets.push({ month: `Wk ${label}`, demand: qty, supply: 0 });
    }
    const vals = buckets.map(b => b.demand);
    const chartData = buckets.map((b, idx) => ({
      ...b,
      sma3: idx >= 3 ? computeSMA(vals.slice(0, idx), 3) : null,
      sma6: idx >= 6 ? computeSMA(vals.slice(0, idx), 6) : null,
    }));
    const nextDate = new Date(maxTime + msPerWeek);
    const nextLabel = `Wk ${nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return {
      chartData,
      sma3: Math.round(computeSMA(vals, 3)),
      sma6: Math.round(computeSMA(vals, 6)),
      nextLabel,
    };
  }, [transactions, scope, scopedProductIds]);

  const smaChartData = forecastPeriodUnit === "week" ? weeklyScopeData.chartData : (smaData?.chartData ?? []);
  const forecastSMA3 = forecastPeriodUnit === "week" ? weeklyScopeData.sma3 : (smaData?.sma3 ?? 0);
  const forecastSMA6 = forecastPeriodUnit === "week" ? weeklyScopeData.sma6 : (smaData?.sma6 ?? 0);

  const onHandUnits = scopedInventory.reduce((sum, product) => sum + product.stock, 0);
  const scopedLowStockProducts = scopedInventory.filter(product => product.status === "out_of_stock" || product.status === "critical" || product.status === "low");
  const openOrderLines = useMemo(
    () => purchaseOrders.flatMap(order => order.items
      .filter(item => item.qtyRemaining > 0 && scopedProductIds.has(String(item.productId)))
      .map(item => ({ ...item, orderId: order.id, supplier: order.supplier, expectedDeliveryDate: order.expectedDeliveryDate }))),
    [purchaseOrders, scopedProductIds]
  );
  const incomingByProductMap = useMemo(() => {
    const map = new Map<string, number>();
    purchaseOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.qtyRemaining > 0) {
          const pid = String(item.productId);
          map.set(pid, (map.get(pid) ?? 0) + item.qtyRemaining);
        }
      });
    });
    return map;
  }, [purchaseOrders]);

  const incomingUnits = openOrderLines.reduce((sum, item) => sum + item.qtyRemaining, 0);
  const openOrderCount = new Set(openOrderLines.map(item => item.orderId)).size;
  const salesMonths = smaChartData.filter(point => point.demand > 0);
  const latestSalesMonth = smaChartData.length > 0 ? smaChartData[smaChartData.length - 1] : (salesMonths[salesMonths.length - 1] ?? null);
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
    if (forecastPeriodUnit === "week") return weeklyScopeData.nextLabel;
    const latestMonth = smaChartData[smaChartData.length - 1]?.month;
    if (!latestMonth) return "Next month";
    const [monthLabel, yearLabel] = latestMonth.split(" ");
    const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthLabel);
    if (monthIndex < 0 || !yearLabel) return "Next month";
    const next = new Date(Number(yearLabel), monthIndex + 1, 1);
    return next.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [smaChartData, forecastPeriodUnit, weeklyScopeData.nextLabel]);

  // ── Historical sMAPE score for comparing SMA-3 and SMA-6 ─────────────────
  function computeSmape(points: { actual: number; forecast: number }[]) {
    if (points.length === 0) return null;
    let sumSmape = 0;
    let validCount = 0;
    points.forEach(({ actual, forecast }) => {
      const denom = (Math.abs(actual) + Math.abs(forecast)) / 2;
      if (denom <= 0) return;
      const err = Math.abs(actual - forecast);
      sumSmape += err / denom;
      validCount++;
    });
    if (validCount === 0) return null;
    const smape = (sumSmape / validCount) * 100;
    return {
      smape: Math.round(smape * 10) / 10,
      points: validCount,
    };
  }

  function getAccuracyBadge(smape: number | null | undefined) {
    if (smape == null) {
      return { label: "Needs 4+ periods", tone: "bg-muted text-muted-foreground border-border" };
    }
    if (smape <= 20) {
      return { label: "High Accuracy", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
    }
    if (smape <= 50) {
      return { label: "Moderate Accuracy", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
    }
    return { label: "High Volatility", tone: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" };
  }

  // Back-test points come from the API's rolling forecasts. Each forecast uses
  // only earlier periods, never the actual sales of its own test period.
  const sma3Error = useMemo(() => {
    const valid = smaChartData
      .filter(d => d.sma3 != null && (d.demand > 0 || (d.sma3 ?? 0) > 0))
      .map(d => ({ actual: d.demand, forecast: d.sma3 ?? 0 }));
    return computeSmape(valid);
  }, [smaChartData]);

  const sma6Error = useMemo(() => {
    const valid = smaChartData
      .filter(d => d.sma6 != null && (d.demand > 0 || (d.sma6 ?? 0) > 0))
      .map(d => ({ actual: d.demand, forecast: d.sma6 ?? 0 }));
    const res = computeSmape(valid);
    if (!res) return { insufficientData: true as const, needed: 7, have: smaChartData.length };
    return { insufficientData: false as const, ...res };
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
    if (point.sma3 == null || (point.demand <= 0 && point.sma3 <= 0)) return [];
    const forecast = point.sma3;
    const difference = Math.abs(point.demand - forecast);
    const average = (Math.abs(point.demand) + Math.abs(forecast)) / 2;
    return [{
      period: point.month,
      actual: point.demand,
      forecast: Math.round(forecast),
      difference: Math.round(difference),
      score: average > 0 ? (difference / average) * 100 : 0,
    }];
  }), [smaChartData]);

  const sma6Checks = useMemo(() => smaChartData.flatMap(point => {
    if (point.sma6 == null || (point.demand <= 0 && point.sma6 <= 0)) return [];
    const forecast = point.sma6;
    const difference = Math.abs(point.demand - forecast);
    const average = (Math.abs(point.demand) + Math.abs(forecast)) / 2;
    return [{
      period: point.month,
      actual: point.demand,
      forecast: Math.round(forecast),
      difference: Math.round(difference),
      score: average > 0 ? (difference / average) * 100 : 0,
    }];
  }), [smaChartData]);

  const selectedForecast = useMemo(() => {
    const comparable = smaChartData
      .filter(point => point.demand > 0 && point.sma3 != null && point.sma6 != null)
      .map(point => ({ actual: point.demand, sma3: point.sma3 ?? 0, sma6: point.sma6 ?? 0 }));
    if (comparable.length < 1) {
      if (sma3Error) return { model: "SMA-3" as const, smape: sma3Error.smape, points: sma3Error.points };
      return null;
    }
    const sma3Score = computeSmape(comparable.map(point => ({ actual: point.actual, forecast: point.sma3 })));
    const sma6Score = computeSmape(comparable.map(point => ({ actual: point.actual, forecast: point.sma6 })));
    if (!sma3Score || !sma6Score) return null;
    const model = sma3Score.smape <= sma6Score.smape ? ("SMA-3" as const) : ("SMA-6" as const);
    const selected = model === "SMA-3" ? sma3Score : sma6Score;
    return { model, smape: selected.smape, points: comparable.length };
  }, [smaChartData, sma3Error]);

  const selectedForecastUnits = selectedForecast
    ? selectedForecast.model === "SMA-3" ? forecastSMA3 : forecastSMA6
    : null;

  // ── Product-Level SMA Forecast Engine (answers "Which specific products will sell?") ──
  const productForecastMap = useMemo(() => {
    const parsedSales = transactions.flatMap(tx => {
      if (tx.type !== "sale" || !tx.productId) return [];
      const d = parseTransactionDate(tx.date);
      if (!d) return [];
      return [{
        productId: String(tx.productId),
        date: d,
        qty: tx.qty,
        monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        monthLabel: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      }];
    });

    // Build storewide timeline so zero-sale periods are included honestly
    let periodKeys: { key: string; label: string; start?: Date; end?: Date }[] = [];
    if (forecastPeriodUnit === "month") {
      const allKeys = parsedSales.map(s => s.monthKey).sort();
      if (allKeys.length > 0) {
        const firstKey = allKeys[0];
        const lastKey = allKeys[allKeys.length - 1];
        const cursor = new Date(Number(firstKey.slice(0, 4)), Number(firstKey.slice(5, 7)) - 1, 1);
        const end = new Date(Number(lastKey.slice(0, 4)), Number(lastKey.slice(5, 7)) - 1, 1);
        while (cursor <= end) {
          const mk = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          const ml = cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          periodKeys.push({ key: mk, label: ml });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    } else {
      if (parsedSales.length > 0) {
        const maxTime = Math.max(...parsedSales.map(s => s.date.getTime()));
        const minTime = Math.min(...parsedSales.map(s => s.date.getTime()));
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const totalWeeks = Math.min(24, Math.max(1, Math.ceil((maxTime - minTime + 1) / msPerWeek)));
        for (let i = totalWeeks - 1; i >= 0; i--) {
          const bucketEnd = new Date(maxTime - i * msPerWeek);
          const bucketStart = new Date(bucketEnd.getTime() - msPerWeek + 1);
          const label = bucketEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          periodKeys.push({ key: `wk-${i}`, label: `Wk ${label}`, start: bucketStart, end: bucketEnd });
        }
      }
    }

    const byProduct = new Map<string, {
      product: Product;
      totalSold: number;
      sma3: number;
      sma6: number;
      monthlySma3: number;
      monthlySma6: number;
      recommendedModel: "SMA-3" | "SMA-6";
      recommendedForecast: number;
      monthlyEquivalentForecast: number;
      smape3: number | null;
      smape6: number | null;
      activePeriods: number;
      totalPeriods: number;
      recent3Periods: { label: string; qty: number }[];
      confidenceTier: "high" | "short" | "intermittent" | "insufficient";
      confidenceLabel: string;
      trendDirection: "rising" | "steady" | "slowing" | "none";
      trendPercent: number;
      incomingQty: number;
      daysOfSupply: number | null;
      projectedShortfall: number;
    }>();

    // Always also compute monthly SMA-3 and SMA-6 per product for EOQ annualization
    const allMonthKeys = parsedSales.map(s => s.monthKey).sort();
    const storeMonthList: string[] = [];
    if (allMonthKeys.length > 0) {
      const fKey = allMonthKeys[0];
      const lKey = allMonthKeys[allMonthKeys.length - 1];
      const cur = new Date(Number(fKey.slice(0, 4)), Number(fKey.slice(5, 7)) - 1, 1);
      const endM = new Date(Number(lKey.slice(0, 4)), Number(lKey.slice(5, 7)) - 1, 1);
      while (cur <= endM) {
        storeMonthList.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    inventory.forEach(p => {
      const pid = String(p.id);
      const prodSales = parsedSales.filter(s => s.productId === pid);
      const totalSold = prodSales.reduce((sum, s) => sum + s.qty, 0);

      // Monthly series from product's first sale month up to latest store month
      const monthTotals = new Map<string, number>();
      prodSales.forEach(s => {
        monthTotals.set(s.monthKey, (monthTotals.get(s.monthKey) ?? 0) + s.qty);
      });
      const firstProdMonthIdx = storeMonthList.findIndex(mk => (monthTotals.get(mk) ?? 0) > 0);
      const activeMonthWindow = firstProdMonthIdx >= 0 ? storeMonthList.slice(firstProdMonthIdx) : [];
      const monthlySeries = activeMonthWindow.map(mk => monthTotals.get(mk) ?? 0);
      const monthlySma3 = computeSMA(monthlySeries, 3);
      const monthlySma6 = computeSMA(monthlySeries, 6);

      // Active display period series (monthly or weekly)
      let displaySeries: { label: string; qty: number }[] = [];
      if (forecastPeriodUnit === "month") {
        const firstIdx = periodKeys.findIndex(pk => (monthTotals.get(pk.key) ?? 0) > 0);
        const sliced = firstIdx >= 0 ? periodKeys.slice(firstIdx) : [];
        displaySeries = sliced.map(pk => ({ label: pk.label, qty: monthTotals.get(pk.key) ?? 0 }));
      } else {
        const weekCounts = periodKeys.map(pk => {
          const qty = prodSales
            .filter(s => pk.start && pk.end && s.date >= pk.start && s.date <= pk.end)
            .reduce((sum, s) => sum + s.qty, 0);
          return { label: pk.label, qty };
        });
        const firstIdx = weekCounts.findIndex(w => w.qty > 0);
        displaySeries = firstIdx >= 0 ? weekCounts.slice(firstIdx) : [];
      }

      const vals = displaySeries.map(d => d.qty);
      const totalPeriods = vals.length;
      const activePeriods = vals.filter(v => v > 0).length;
      const recent6 = vals.slice(-6);
      const recent6Active = recent6.filter(v => v > 0).length;
      const sma3 = computeSMA(vals, 3);
      const sma6 = computeSMA(vals, 6);

      // Back-test accuracy on this product's series
      const bt3: { actual: number; forecast: number }[] = [];
      const bt6: { actual: number; forecast: number }[] = [];
      for (let i = 3; i < vals.length; i++) {
        bt3.push({ actual: vals[i], forecast: computeSMA(vals.slice(0, i), 3) });
      }
      for (let i = 6; i < vals.length; i++) {
        bt6.push({ actual: vals[i], forecast: computeSMA(vals.slice(0, i), 6) });
      }
      const err3 = computeSmape(bt3)?.smape ?? null;
      const err6 = computeSmape(bt6)?.smape ?? null;
      const recommendedModel: "SMA-3" | "SMA-6" =
        err3 != null && err6 != null ? (err3 <= err6 ? "SMA-3" : "SMA-6") : "SMA-3";
      const recommendedForecast = recommendedModel === "SMA-3" ? sma3 : sma6;
      const monthlyEquivalentForecast = forecastPeriodUnit === "week"
        ? (recommendedForecast * 4.33)
        : recommendedForecast;

      // Data maturity / confidence tier
      let confidenceTier: "high" | "short" | "intermittent" | "insufficient" = "insufficient";
      let confidenceLabel = "No Sales History";
      if (totalSold === 0 || totalPeriods === 0) {
        confidenceTier = "insufficient";
        confidenceLabel = "No Sales History";
      } else if (totalPeriods >= 6 && recent6Active >= 4) {
        confidenceTier = "high";
        confidenceLabel = `High Confidence (${totalPeriods} ${forecastPeriodUnit === "week" ? "wks" : "mos"})`;
      } else if (totalPeriods >= 3 && activePeriods >= 2 && recent6Active >= 2) {
        confidenceTier = "short";
        confidenceLabel = `Short History (${totalPeriods} ${forecastPeriodUnit === "week" ? "wks" : "mos"} · SMA-3)`;
      } else {
        confidenceTier = "intermittent";
        confidenceLabel = `Sporadic Sales (${activePeriods}/${ Math.max(totalPeriods, 1)} active)`;
      }

      // Trend calculation (comparing SMA-3 against SMA-6 or earlier baseline)
      let trendDirection: "rising" | "steady" | "slowing" | "none" = "none";
      let trendPercent = 0;
      if (totalSold > 0 && sma6 > 0 && totalPeriods >= 2) {
        trendPercent = Math.round(((sma3 - sma6) / sma6) * 100);
        if (trendPercent === 0 && vals.length >= 2) {
          const prevAvg = computeSMA(vals.slice(0, -1), 3);
          if (prevAvg > 0) {
            trendPercent = Math.round(((vals[vals.length - 1] - prevAvg) / prevAvg) * 100);
          }
        }
        if (trendPercent >= 10) trendDirection = "rising";
        else if (trendPercent <= -10) trendDirection = "slowing";
        else trendDirection = "steady";
      }

      const incomingQty = incomingByProductMap.get(pid) ?? 0;
      const dailyBurn = monthlyEquivalentForecast / 30;
      const daysOfSupply = dailyBurn > 0.05 ? Math.round(p.stock / dailyBurn) : null;
      const projectedShortfall = totalSold > 0
        ? Math.max(0, Math.round(monthlyEquivalentForecast) - (p.stock + incomingQty))
        : Math.max(0, getReorderUnits(p) - (p.stock + incomingQty));

      byProduct.set(pid, {
        product: p,
        totalSold,
        sma3,
        sma6,
        monthlySma3,
        monthlySma6,
        recommendedModel,
        recommendedForecast,
        monthlyEquivalentForecast,
        smape3: err3,
        smape6: err6,
        activePeriods,
        totalPeriods,
        recent3Periods: displaySeries.slice(-3),
        confidenceTier,
        confidenceLabel,
        trendDirection,
        trendPercent,
        incomingQty,
        daysOfSupply,
        projectedShortfall,
      });
    });

    return byProduct;
  }, [inventory, transactions, forecastPeriodUnit, incomingByProductMap]);

  const productForecastList = useMemo(() => {
    const rows = scopedInventory
      .map(p => productForecastMap.get(String(p.id)))
      .filter((r): r is NonNullable<typeof r> => r != null);
    return rows.sort((a, b) => {
      if (b.recommendedForecast !== a.recommendedForecast) {
        return b.recommendedForecast - a.recommendedForecast;
      }
      return b.projectedShortfall - a.projectedShortfall;
    });
  }, [scopedInventory, productForecastMap]);

  const filteredProductForecasts = useMemo(() => {
    const q = productForecastSearch.trim().toLowerCase();
    return productForecastList.filter(row => {
      if (productForecastFilter === "shortfall" && row.projectedShortfall <= 0) return false;
      if (productForecastFilter === "rising" && row.trendDirection !== "rising") return false;
      if (productForecastFilter === "high_confidence" && row.confidenceTier !== "high") return false;
      if (!q) return true;
      return (
        row.product.name.toLowerCase().includes(q) ||
        row.product.id.toLowerCase().includes(q) ||
        row.product.category.toLowerCase().includes(q)
      );
    });
  }, [productForecastList, productForecastSearch, productForecastFilter]);

  const paginatedProductForecasts = useMemo(() => {
    const start = (productForecastPage - 1) * PRODUCT_FORECAST_PAGE_SIZE;
    return filteredProductForecasts.slice(start, start + PRODUCT_FORECAST_PAGE_SIZE);
  }, [filteredProductForecasts, productForecastPage]);

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

  const [selectedModelOverride, setSelectedModelOverride] = useState<"SMA-3" | "SMA-6" | null>(null);
  const activeForecastModel = selectedModelOverride ?? selectedForecast?.model ?? "SMA-3";
  const activeForecastUnits = activeForecastModel === "SMA-3" ? forecastSMA3 : forecastSMA6;

  // ── EOQ & ROP Configurable Parameters + Demand Basis (100% Flexible Decision Support) ──
  const [demandBasis, setDemandBasis] = useState<"auto" | "sma3" | "sma6" | "historical">(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_demand_basis");
      if (saved === "auto" || saved === "sma3" || saved === "sma6" || saved === "historical") return saved;
    } catch { /* ignore */ }
    return "auto";
  });

  const handleSetDemandBasis = (basis: "auto" | "sma3" | "sma6" | "historical") => {
    setDemandBasis(basis);
    try {
      localStorage.setItem("smarttrack_eoq_demand_basis", basis);
    } catch { /* ignore */ }
  };

  const [orderCostSetting, setOrderCostSetting] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_order_cost");
      return saved ? Math.max(1, parseFloat(saved) || 120) : 120;
    } catch { return 120; }
  });
  const [holdingRateSetting, setHoldingRateSetting] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_holding_rate");
      return saved ? Math.max(0.01, parseFloat(saved) || 0.20) : 0.20;
    } catch { return 0.20; }
  });
  const [leadTimeDaysSetting, setLeadTimeDaysSetting] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_lead_time");
      return saved ? Math.min(90, Math.max(1, Math.round(parseFloat(saved) || 7))) : 7;
    } catch { return 7; }
  });
  const [safetyBufferSetting, setSafetyBufferSetting] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_safety_buffer");
      return saved != null ? Math.min(200, Math.max(0, Math.round(parseFloat(saved)))) : 20;
    } catch { return 20; }
  });
  const [eoqOverrides, setEoqOverrides] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_overrides");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [showEoqSettingsModal, setShowEoqSettingsModal] = useState(false);

  const handleSetOverrideQty = (productId: string, qty: number | null) => {
    setEoqOverrides(prev => {
      const next = { ...prev };
      if (qty == null || qty <= 0) delete next[productId];
      else next[productId] = Math.round(qty);
      try {
        localStorage.setItem("smarttrack_eoq_overrides", JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const handleSaveEoqSettings = (cost: number, holdPercent: number, leadDays: number, safetyBuf: number) => {
    const rate = holdPercent / 100;
    setOrderCostSetting(cost);
    setHoldingRateSetting(rate);
    setLeadTimeDaysSetting(leadDays);
    setSafetyBufferSetting(safetyBuf);
    try {
      localStorage.setItem("smarttrack_eoq_order_cost", String(cost));
      localStorage.setItem("smarttrack_eoq_holding_rate", String(rate));
      localStorage.setItem("smarttrack_eoq_lead_time", String(leadDays));
      localStorage.setItem("smarttrack_eoq_safety_buffer", String(safetyBuf));
    } catch { /* ignore */ }
  };

  const handleResetEoqSettings = () => {
    setOrderCostSetting(120);
    setHoldingRateSetting(0.20);
    setLeadTimeDaysSetting(7);
    setSafetyBufferSetting(20);
    try {
      localStorage.removeItem("smarttrack_eoq_order_cost");
      localStorage.removeItem("smarttrack_eoq_holding_rate");
      localStorage.removeItem("smarttrack_eoq_lead_time");
      localStorage.removeItem("smarttrack_eoq_safety_buffer");
    } catch { /* ignore */ }
  };

  const annualDemand = useMemo(() => {
    const histAnn = demandValues.reduce((sum, v) => sum + v, 0) * (12 / Math.max(monthlyDemand.length, 1));
    const storeSma3 = smaData?.sma3 ?? 0;
    const storeSma6 = smaData?.sma6 ?? 0;
    if (demandBasis === "sma3" && storeSma3 > 0) return storeSma3 * 12;
    if (demandBasis === "sma6" && storeSma6 > 0) return storeSma6 * 12;
    if (demandBasis === "auto" && (storeSma3 > 0 || storeSma6 > 0)) {
      return (activeForecastModel === "SMA-6" && storeSma6 > 0 ? storeSma6 : storeSma3) * 12;
    }
    return histAnn;
  }, [demandValues, monthlyDemand, demandBasis, smaData, activeForecastModel]);

  const eoqOverall = useMemo(
    () => estimateEOQ(Math.round(annualDemand), avgUnitCost, orderCostSetting, holdingRateSetting),
    [annualDemand, avgUnitCost, orderCostSetting, holdingRateSetting]
  );

  const [restockSearch, setRestockSearch] = useState("");
  const [restockStatusFilter, setRestockStatusFilter] = useState<"all" | "out_of_stock" | "critical" | "low">("all");
  const [restockPage, setRestockPage] = useState(1);
  const RESTOCK_PAGE_SIZE = 10;

  // Draft Purchase Order Modal state (closes the loop from EOQ to Supplier PO)
  const [poDraftModal, setPoDraftModal] = useState<{
    product: Product;
    recommendedEoq: number;
    shortage: number;
    qty: string;
    supplier: string;
    expectedDate: string;
  } | null>(null);
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poBannerMessage, setPoBannerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const openPoDraftModal = (product: Product, recommendedEoq: number, shortage: number, initialQty: number) => {
    const exp = new Date();
    exp.setDate(exp.getDate() + leadTimeDaysSetting);
    const expStr = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, "0")}-${String(exp.getDate()).padStart(2, "0")}`;
    setPoDraftModal({
      product,
      recommendedEoq,
      shortage,
      qty: String(Math.max(1, initialQty)),
      supplier: product.supplier?.trim() || "Primary Pharmacy Distributor",
      expectedDate: expStr,
    });
  };

  const handleConfirmCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poDraftModal) return;
    const qtyOrdered = Math.max(1, Math.round(Number(poDraftModal.qty) || poDraftModal.recommendedEoq));
    const supplierName = poDraftModal.supplier.trim() || "Primary Pharmacy Distributor";
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setPoSubmitting(true);
    setPoBannerMessage(null);
    try {
      await purchaseOrdersApi.create({
        supplier: supplierName,
        orderedAt: todayStr,
        expectedDeliveryDate: poDraftModal.expectedDate || null,
        items: [{ productId: poDraftModal.product.id, qtyOrdered }],
      });
      const updatedOrders = await purchaseOrdersApi.list();
      setPurchaseOrders(updatedOrders);
      setPoBannerMessage({
        type: "success",
        text: `Purchase Order created for ${qtyOrdered.toLocaleString()} units of ${poDraftModal.product.name} (${supplierName}).`,
      });
      setPoDraftModal(null);
    } catch (err) {
      setPoBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not create purchase order.",
      });
    } finally {
      setPoSubmitting(false);
    }
  };

  const [productPerfSearch, setProductPerfSearch] = useState("");
  const [productPerfDemandFilter, setProductPerfDemandFilter] = useState<"all" | "High" | "Moderate" | "Stable">("all");
  const [productPerfPage, setProductPerfPage] = useState(1);
  const PRODUCT_PERF_PAGE_SIZE = 10;

  const reorderRecs = useMemo(() => {
    const storeMonths = Math.max(monthlyDemand.length, 1);
    return inventory
      .filter(p => p.status === "out_of_stock" || p.status === "critical" || p.status === "low")
      .map(p => {
        const pf = productForecastMap.get(String(p.id));
        const totalSold = pf?.totalSold ?? transactions.filter(t => t.type === "sale" && t.productId === p.id).reduce((s, t) => s + t.qty, 0);
        const monthlySma3 = pf?.monthlySma3 ?? 0;
        const monthlySma6 = pf?.monthlySma6 ?? 0;
        const histMonthly = totalSold / storeMonths;
        const minReorderUnits = getReorderUnits(p);

        let annualProductDemand = 0;
        let isDemandFallback = false;
        let demandSourceLabel = "";

        if (totalSold === 0) {
          isDemandFallback = true;
          annualProductDemand = Math.max(10, minReorderUnits * 6);
          demandSourceLabel = `Fallback estimate (0 sales — 6× min threshold of ${minReorderUnits}u)`;
        } else if (demandBasis === "sma3") {
          const base = monthlySma3 > 0 ? monthlySma3 : histMonthly;
          annualProductDemand = base * 12;
          demandSourceLabel = monthlySma3 > 0
            ? `SMA-3 forecast (${Math.round(monthlySma3)} u/mo × 12)`
            : `All-time avg (${totalSold} sold ÷ ${storeMonths} mos × 12)`;
        } else if (demandBasis === "sma6") {
          const base = monthlySma6 > 0 ? monthlySma6 : histMonthly;
          annualProductDemand = base * 12;
          demandSourceLabel = monthlySma6 > 0
            ? `SMA-6 forecast (${Math.round(monthlySma6)} u/mo × 12)`
            : `All-time avg (${totalSold} sold ÷ ${storeMonths} mos × 12)`;
        } else if (demandBasis === "historical") {
          annualProductDemand = histMonthly * 12;
          demandSourceLabel = `All-time monthly avg (${totalSold} sold ÷ ${storeMonths} mos × 12)`;
        } else {
          // "auto" — use product's recommended SMA model
          const recModel = pf?.recommendedModel ?? "SMA-3";
          const chosenMonthly = recModel === "SMA-6" && monthlySma6 > 0 ? monthlySma6 : (monthlySma3 > 0 ? monthlySma3 : histMonthly);
          annualProductDemand = chosenMonthly * 12;
          demandSourceLabel = chosenMonthly > 0 && (monthlySma3 > 0 || monthlySma6 > 0)
            ? `Recommended ${recModel} (${Math.round(chosenMonthly)} u/mo × 12)`
            : `All-time avg (${totalSold} sold ÷ ${storeMonths} mos × 12)`;
        }

        const batchesWithCost = p.batches.filter(batch => batch.unitCost != null && batch.unitCost > 0);
        const costUnits = batchesWithCost.reduce((sum, batch) => sum + batch.qty, 0);
        const isCostEstimated = costUnits === 0;
        const productUnitCost = !isCostEstimated
          ? batchesWithCost.reduce((sum, batch) => sum + (batch.unitCost ?? 0) * batch.qty, 0) / costUnits
          : (p.price > 0 ? p.price * 0.7 : 5);
        const costSourceLabel = !isCostEstimated
          ? `Actual FIFO batch cost (${batchesWithCost.length} batch${batchesWithCost.length === 1 ? "" : "es"})`
          : `Estimated at 70% of ₱${p.price.toFixed(2)} selling price (no batch cost recorded)`;

        const orderCost = orderCostSetting;
        const holdingPercent = Math.round(holdingRateSetting * 100);
        const holdingCost = Math.max(0.2, productUnitCost * holdingRateSetting);
        const productEOQ = estimateEOQ(Math.round(annualProductDemand), productUnitCost, orderCost, holdingRateSetting);
        const eoq = Math.max(productEOQ, minReorderUnits);
        const suggestedRop = Math.max(
          1,
          Math.round((annualProductDemand / 365) * leadTimeDaysSetting * (1 + safetyBufferSetting / 100))
        );
        const overrideQty = eoqOverrides[p.id] ?? null;
        const effectiveOrderQty = overrideQty ?? eoq;
        const monthlyBurn = annualProductDemand / 12;
        const fifoSellThroughMonths = monthlyBurn > 0 ? effectiveOrderQty / monthlyBurn : null;

        return {
          product: p,
          rawEoq: productEOQ,
          eoq,
          overrideQty,
          effectiveOrderQty,
          fifoSellThroughMonths,
          suggestedRop,
          totalSold,
          shortage: Math.max(0, minReorderUnits - p.stock),
          annualDemand: Math.round(annualProductDemand),
          unitCost: productUnitCost,
          orderCost,
          holdingCost,
          holdingPercent,
          leadTimeDays: leadTimeDaysSetting,
          safetyBufferPercent: safetyBufferSetting,
          isDemandFallback,
          demandSourceLabel,
          isCostEstimated,
          costSourceLabel,
        };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }, [
    inventory,
    transactions,
    monthlyDemand,
    productForecastMap,
    demandBasis,
    orderCostSetting,
    holdingRateSetting,
    leadTimeDaysSetting,
    safetyBufferSetting,
    eoqOverrides,
  ]);

  const selectedEoqProduct = useMemo(
    () => (selectedEoqProductId ? reorderRecs.find(r => r.product.id === selectedEoqProductId) ?? null : null),
    [selectedEoqProductId, reorderRecs]
  );

  const filteredReorderRecs = useMemo(() => {
    const q = restockSearch.trim().toLowerCase();
    return reorderRecs.filter(rec => {
      const matchesStatus = restockStatusFilter === "all" || rec.product.status === restockStatusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        rec.product.name.toLowerCase().includes(q) ||
        rec.product.id.toLowerCase().includes(q) ||
        rec.product.category.toLowerCase().includes(q)
      );
    });
  }, [reorderRecs, restockSearch, restockStatusFilter]);

  const paginatedReorderRecs = useMemo(() => {
    const start = (restockPage - 1) * RESTOCK_PAGE_SIZE;
    return filteredReorderRecs.slice(start, start + RESTOCK_PAGE_SIZE);
  }, [filteredReorderRecs, restockPage]);

  const totalEoqUnits = useMemo(
    () => reorderRecs.reduce((sum, rec) => sum + rec.effectiveOrderQty, 0),
    [reorderRecs]
  );
  const estimatedRestockCost = useMemo(
    () => reorderRecs.reduce((sum, rec) => sum + rec.effectiveOrderQty * rec.unitCost, 0),
    [reorderRecs]
  );

  const scopeLabel = useMemo(() => {
    if (scope === "all") return "All products";
    if (scope.startsWith("product:")) {
      const pid = scope.slice(8);
      const found = inventory.find(p => String(p.id) === pid);
      return found ? `${found.name} (${found.id})` : pid;
    }
    return scope.replace("category:", "");
  }, [scope, inventory]);

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

  const filteredPerf = useMemo(() => {
    const q = productPerfSearch.trim().toLowerCase();
    return perf.filter(row => {
      const matchesDemand = productPerfDemandFilter === "all" || row.level === productPerfDemandFilter;
      if (!matchesDemand) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.cat && row.cat.toLowerCase().includes(q))
      );
    });
  }, [perf, productPerfSearch, productPerfDemandFilter]);

  const paginatedPerf = useMemo(() => {
    const start = (productPerfPage - 1) * PRODUCT_PERF_PAGE_SIZE;
    return filteredPerf.slice(start, start + PRODUCT_PERF_PAGE_SIZE);
  }, [filteredPerf, productPerfPage, PRODUCT_PERF_PAGE_SIZE]);

  /* --- SMA inspector computed values --- */
  const smaMonths = useMemo(
    () => smaChartData.map(({ month, demand }) => ({ month, demand })),
    [smaChartData]
  );
  const last3 = smaMonths.slice(-3);
  const last6 = smaMonths.slice(-6);
  const sma3Computed = forecastSMA3;
  const sma6Computed = forecastSMA6;
  const globalOrderCost = orderCostSetting;
  const globalHoldingCost = Math.max(0.2, avgUnitCost * holdingRateSetting);
  const eoqNumerator = 2 * annualDemand * globalOrderCost;
  const eoqRatio = globalHoldingCost > 0 ? eoqNumerator / globalHoldingCost : 0;

  const handleExportCsv = () => {
    const lines: string[] = [];
    lines.push("SMARTTRACK PHARMACY — ANALYTICS & DEMAND FORECAST SUMMARY");
    lines.push(`Export Date,${new Date().toLocaleDateString("en-PH")} ${new Date().toLocaleTimeString("en-PH")}`);
    lines.push(`Filter Scope,"${scopeLabel}"`);
    lines.push(`Forecast Granularity,${forecastPeriodUnit === "week" ? "Weekly (3-Wk / 6-Wk)" : "Monthly (3-Mo / 6-Mo)"}`);
    lines.push(`EOQ Demand Basis,${demandBasis.toUpperCase()} (S=₱${orderCostSetting}, I=${Math.round(holdingRateSetting * 100)}%, Lead=${leadTimeDaysSetting}d, Buffer=${safetyBufferSetting}%)`);
    lines.push("");

    lines.push("--- DEMAND FORECASTING (SMA) ---");
    lines.push("Metric,Value,Description");
    lines.push(`SMA-3 Forecast,${Math.round(forecastSMA3)} units,Short-term 3-period moving average demand`);
    lines.push(`SMA-6 Forecast,${Math.round(forecastSMA6)} units,Medium-term 6-period moving average demand`);
    if (sma3Error) {
      lines.push(`SMA-3 Historical sMAPE,${sma3Error.smape}%,Used to compare forecast estimates with actual sales; lower is closer`);
      lines.push(`SMA-3 Back-test periods,${sma3Error.points},Recorded sales periods compared`);
    }
    lines.push(`Overall EOQ Guide,${eoqOverall} units,All-products planning estimate`);
    lines.push("");

    lines.push("--- PRODUCT-LEVEL DEMAND FORECASTS ---");
    lines.push("Product ID,Product Name,Category,SMA-3 Forecast,SMA-6 Forecast,Trend,Confidence Tier,Current Stock,Incoming PO,Days of Supply,Projected Shortfall");
    productForecastList.forEach(pf => {
      lines.push(`"${pf.product.id}","${pf.product.name}","${pf.product.category}",${Math.round(pf.sma3)},${Math.round(pf.sma6)},"${pf.trendDirection} (${pf.trendPercent}%)","${pf.confidenceLabel}",${pf.product.stock},${pf.incomingQty},${pf.daysOfSupply ?? "N/A"},${pf.projectedShortfall}`);
    });
    lines.push("");

    lines.push("--- EOQ REORDER RECOMMENDATIONS (DECISION SUPPORT) ---");
    lines.push("Product ID,Product Name,Category,Current Stock,Low-Stock Level (Units),Stock Gap,Recommended EOQ,Planned Order Qty,Demand Source,Unit Cost,Cost Source,Suggested ROP,Status");
    reorderRecs.forEach(r => {
      lines.push(`"${r.product.id}","${r.product.name}","${r.product.category}",${r.product.stock},${getReorderUnits(r.product)},${r.shortage},${r.eoq},${r.effectiveOrderQty},"${r.demandSourceLabel}",₱${r.unitCost.toFixed(2)},"${r.costSourceLabel}",${r.suggestedRop},"${r.product.status}"`);
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
    "Overview":          { icon: "📊", title: "Supply & Demand Overview",   desc: "Sales, stock, and incoming orders at a glance." },
    "Forecast":          { icon: "🔮", title: "Demand Forecast",   desc: `Moving-average estimates for ${nextForecastMonth}, with historical back-testing.` },
    "Restocking":        { icon: "⚡", title: "Restock Planning", desc: "Review reorder quantities, lead-time thresholds, and planning assumptions." },
    "Products":          { icon: "🏷️", title: "Product Performance",         desc: "Sales volume, revenue, and demand by product." },
  };
  const sectionTabs = ["Overview", "Forecast", "Restocking", "Products"] as const;

  return (
    <div className="flex w-full max-w-[1480px] mx-auto flex-col font-sans" style={{ height: "calc(100dvh - 56px)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      {/* ── Fixed header: title + tab nav ── */}
      <div className="flex-shrink-0 px-4 sm:px-7 lg:px-8 pt-5 sm:pt-7 pb-0 bg-background border-b border-border/70 z-20">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Sales performance, demand forecasts, and replenishment</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmExportCsv(true)}
              className="flex items-center gap-2 px-3 py-2 border border-border bg-card text-foreground rounded-lg text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer flex-shrink-0 st-btn-ghost"
              title="Export full analytics dataset as CSV"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Section navigation */}
        <nav aria-label="Analytics sections" className="mt-5 pb-3">
          <div role="tablist" aria-label="Analytics views" className="relative grid w-full grid-cols-4 rounded-2xl border border-border/70 bg-muted/45 p-1 sm:w-[min(100%,520px)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1 left-1 rounded-xl border border-border/50 bg-card shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={{ width: "calc((100% - 0.5rem) / 4)", transform: `translateX(${sectionTabs.indexOf(activeSection) * 100}%)` }}
            />
            {sectionTabs.map(section => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={activeSection === section}
                onClick={() => setActiveSection(section)}
                className={`relative z-10 rounded-xl px-2 py-2 text-xs transition-colors duration-200 ease-out motion-reduce:transition-none sm:px-3 sm:text-sm ${
                  activeSection === section ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {section}
                {section === "Restocking" && reorderRecs.length > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{reorderRecs.length}</span>}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 lg:px-8 py-6 space-y-6">

      {/* Section banner — shows what the active tab is for */}
      {(() => {
        const meta = sectionMeta[activeSection];
        if (!meta) return null;
        const showScopeFilter = activeSection === "Overview" || activeSection === "Forecast";
        return (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-border/60 pb-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="min-w-0">
                <p className="text-base font-semibold tracking-tight text-foreground">{meta.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{meta.desc}</p>
              </div>
            </div>
            {showScopeFilter && (
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {activeSection === "Forecast" && (
                  <div className="inline-flex items-center rounded-2xl border border-border/70 bg-muted/45 p-1 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setForecastPeriodUnit("month")}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        forecastPeriodUnit === "month"
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Monthly (3/6 Mo)
                    </button>
                    <button
                      type="button"
                      onClick={() => setForecastPeriodUnit("week")}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        forecastPeriodUnit === "week"
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Weekly (3/6 Wk)
                    </button>
                  </div>
                )}
                <InfoTip
                  title="Scope & Granularity"
                  lines={[
                    "Choose all products, one product, or one category to review its sales history and forecast.",
                    { label: "Product Table", value: "Shows individual SMA-3 & SMA-6 forecasts for every product below." },
                    { label: "Connected EOQ", value: "Restocking EOQ & ROP connect directly to your chosen SMA forecast or historical average." },
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
                {scope !== "all" && (
                  <button
                    type="button"
                    onClick={() => setScope("all")}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Overview: Executive Intelligence, Direct Detail Linking, and Decision Metrics */}
      {activeSection === "Overview" && <>
      {/* ── 1. Executive Intelligence & Synthesis Strip ("Pharmacy Operational Pulse") ── */}
      <div className={`${ANALYTICS_CARD_CLASS} p-5 sm:p-6 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground">Business summary</p>
              <InfoTip title="How to read this summary" lines={["Estimated demand is based on the active forecast model. Restock counts use current stock thresholds, and estimated restock cost uses the planned order quantities. These are decision-support estimates, not automatic orders."]} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Based on recorded sales and current inventory</p>
          </div>
          <span className="text-xs text-muted-foreground">{scopedInventory.length} products</span>
        </div>

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 text-sm text-foreground leading-relaxed">
          {(() => {
            const forecastVal = Math.round(activeForecastUnits);
            const latestSales = latestSalesMonth?.demand ?? 0;
            const diff = forecastVal - latestSales;
            const diffPct = latestSales > 0 ? Math.round((Math.abs(diff) / latestSales) * 100) : 100;
            const outCount = reorderRecs.filter(r => r.product.status === "out_of_stock").length;
            const critCount = reorderRecs.filter(r => r.product.status === "critical").length;

            return (
              <>
                <span>Estimated demand</span>
                <strong className="font-semibold tabular-nums text-foreground">{forecastVal.toLocaleString()} units</strong>
                <span>for {nextForecastMonth}.</span>
                {latestSalesMonth ? (
                  diff >= 0 ? (
                    <span className="text-xs text-muted-foreground">↑ {diff.toLocaleString()} ({diffPct}%) vs {latestSalesMonth.month}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">↓ {Math.abs(diff).toLocaleString()} ({diffPct}%) vs {latestSalesMonth.month}</span>
                  )
                ) : null}
                <span className="text-muted-foreground">·</span>
                <span>{reorderRecs.length} products to review</span>
                {(outCount > 0 || critCount > 0) && (
                  <span className="text-xs text-muted-foreground">
                    ({outCount} out of stock, {critCount} critical)
                  </span>
                )}
                <span className="text-muted-foreground">·</span>
                <span>Estimated restock</span>
                <strong className="font-semibold tabular-nums text-foreground">{fmt(estimatedRestockCost)}</strong>
                <span className="text-xs text-muted-foreground">for {totalEoqUnits.toLocaleString()} units</span>
              </>
            );
          })()}
        </p>

        {/* Direct Action Navigation Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
          <button
            type="button"
            onClick={() => setActiveSection("Forecast")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span>View forecast</span>
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("Restocking")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer"
          >
            <span>Review restocking</span>
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("Products")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer"
          >
            <span>Product performance</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* ── 2. Interconnected Executive Stat Tiles ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Tile 1: Projected Demand (Direct link to Forecast) */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Projected Demand · {nextForecastMonth}</p>
              <InfoTip
                title="Next-Month Demand Forecast"
                color="sky"
                lines={[
                  `Customer demand projection for ${nextForecastMonth} calculated via Moving Average models.`,
                  `SMA-3: ${Math.round(forecastSMA3).toLocaleString()} units · SMA-6: ${Math.round(forecastSMA6).toLocaleString()} units.`,
                ]}
              />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-foreground">
              {Math.round(activeForecastUnits).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">units</span>
            </p>
          </div>
          <div className="mt-3 border-t border-border/50 pt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {latestSalesMonth ? `${latestSalesMonth.month}: ${latestSalesMonth.demand.toLocaleString()} sold` : "Recent sales"}
            </span>
            <button
              type="button"
              onClick={() => setActiveSection("Forecast")}
              className="text-xs font-bold text-primary hover:underline cursor-pointer inline-flex items-center gap-0.5"
            >
              Forecast →
            </button>
          </div>
        </div>

        {/* Tile 2: Restock Capital Needed (Direct link to Restocking) */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Restock Urgency (EOQ)</p>
              <InfoTip
                title="Restock Capital Requirement"
                color="amber"
                lines={[
                  `Estimated total budget needed to restock ${reorderRecs.length} items below minimum safety levels.`,
                  `Total planned batch order: ${totalEoqUnits.toLocaleString()} units.`,
                ]}
              />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
              {fmt(estimatedRestockCost)}
            </p>
          </div>
          <div className="mt-3 border-t border-border/50 pt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {reorderRecs.length} items ({reorderRecs.filter(r => r.product.status === "out_of_stock").length} Out · {reorderRecs.filter(r => r.product.status === "critical").length} Crit)
            </span>
            <button
              type="button"
              onClick={() => setActiveSection("Restocking")}
              className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer inline-flex items-center gap-0.5"
            >
              Restock →
            </button>
          </div>
        </div>

        {/* Tile 3: Current Stock on Hand (Direct link to Products) */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Stock on Hand</p>
              <InfoTip
                title="Current Physical Inventory"
                lines={[
                  "Total quantity available in batches across all active pharmacy items.",
                  "Does not include unreceived units from pending purchase orders.",
                ]}
              />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-foreground">
              {onHandUnits.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">units</span>
            </p>
          </div>
          <div className="mt-3 border-t border-border/50 pt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              +{incomingUnits.toLocaleString()} on {openOrderCount} open PO{openOrderCount === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setActiveSection("Products")}
              className="text-xs font-bold text-primary hover:underline cursor-pointer inline-flex items-center gap-0.5"
            >
              Products →
            </button>
          </div>
        </div>

        {/* Tile 4: Top Demand Category (Direct link to Products) */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Top Category Volume</p>
              <InfoTip
                title="Top Therapeutic Category"
                lines={[
                  "Category generating the highest share of sales units in recorded transactions.",
                ]}
              />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-foreground truncate">
              {categoryData.length > 0 ? categoryData[0].name : "Analgesics"}
            </p>
          </div>
          <div className="mt-3 border-t border-border/50 pt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {categoryData.length > 0 ? `${categoryData[0].value}% of total sales` : "No sales data"}
            </span>
            <button
              type="button"
              onClick={() => setActiveSection("Products")}
              className="text-xs font-bold text-primary hover:underline cursor-pointer inline-flex items-center gap-0.5"
            >
              Breakdown →
            </button>
          </div>
        </div>
      </div>

      {scopedLowStockProducts.length > 0 && (
        <button
          type="button"
          onClick={() => setActiveSection("Restocking")}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-900/60 dark:bg-amber-950/25 dark:hover:bg-amber-950/40 cursor-pointer shadow-2xs"
        >
          <span>
            <span className="block text-xs font-bold text-amber-900 dark:text-amber-200">
              {scopedLowStockProducts.length} product{scopedLowStockProducts.length === 1 ? "" : "s"} require restock attention
            </span>
            <span className="mt-0.5 block text-[11px] text-amber-800/80 dark:text-amber-200/70">
              Current shelf stock is below reorder points. Click to review EOQ recommendations and create Purchase Orders.
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold text-amber-900 dark:text-amber-200 inline-flex items-center gap-1">
            Review Restocking <ArrowRight size={13} />
          </span>
        </button>
      )}
      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Current supply and recent demand by product */}
        <div className={`xl:col-span-2 ${ANALYTICS_CARD_CLASS} p-5 min-h-[340px]`}>
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />Stock on hand</span>
                {supplyDemandProductData.hasSales
                  ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Sales in {supplyDemandProductData.monthLabel}</span>
                  : <span className="text-muted-foreground">No recorded sales</span>}
              </div>
              <button
                type="button"
                onClick={() => setActiveSection("Forecast")}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer inline-flex items-center gap-1 ml-auto"
              >
                <span>Forecast Trends</span>
                <ArrowRight size={12} />
              </button>
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
        <div className={`${ANALYTICS_CARD_CLASS} p-5 h-[340px] flex flex-col min-h-0`}>
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
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
            <button
              type="button"
              onClick={() => setActiveSection("Products")}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer inline-flex items-center gap-1 shrink-0 mt-0.5"
            >
              <span>Product Margins</span>
              <ArrowRight size={12} />
            </button>
          </div>
          <div className="h-[160px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {chartCategoryData.length > 0 && (
                  <>
                    <Pie
                      data={chartCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {chartCategoryData.map((_, i) => <Cell key={`cell-${i}`} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
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
          ) : chartCategoryData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center">No sales data available.</p>
          ) : <div className="space-y-2 mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
            {chartCategoryData.map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  <span className="text-xs text-muted-foreground truncate">{cat.name}</span>
                </div>
                <span className="text-xs font-semibold text-foreground flex-shrink-0">{cat.value}%</span>
              </div>
            ))}
          </div>}
        </div>
      </div>

      </>}


      {/* Demand forecast: Product-level & Scope SMA estimates */}
      {activeSection === "Forecast" && <>
      <section className="space-y-4">
        {/* Focused Product Inspection Banner when a specific product is selected */}
        {scope !== "all" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
            <div className="text-xs">
              <span className="font-bold text-primary uppercase tracking-wider text-[10px] mr-2">Focused Forecast Scope</span>
              <span className="font-semibold text-foreground">{scopeLabel}</span>
              <span className="text-muted-foreground ml-2">· Showing historical sales, back-test overlay, and SMA calculations for this selection</span>
            </div>
            <button
              type="button"
              onClick={() => setScope("all")}
              className="rounded-lg bg-card border border-border hover:bg-muted px-3 py-1 text-xs font-bold text-foreground cursor-pointer shadow-2xs"
            >
              ← View All Products
            </button>
          </div>
        )}

        {/* ── Row 1: Clean Executive Hero Card (Dynamic, Zero Hardcoded Numbers) ── */}
        {(() => {
          const periodNoun = forecastPeriodUnit === "week" ? "Week" : "Month";
          const periodPlural = forecastPeriodUnit === "week" ? "Weeks" : "Months";
          const periodShort = forecastPeriodUnit === "week" ? "Wk" : "Mo";
          const sma3Acc = getAccuracyBadge(sma3Error?.smape);
          const sma6Acc = getAccuracyBadge(sma6Error && !sma6Error.insufficientData ? sma6Error.smape : null);
          const has6Periods = smaMonths.length >= 6;
          return (
            <div className={`${ANALYTICS_CARD_CLASS} p-5 sm:p-7`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <TrendingUp size={14} className="text-primary" />
                      Projected Demand · <span className="text-foreground font-bold">{nextForecastMonth}</span>
                    </span>
                    <InfoTip
                      title="Projected demand"
                      color="sky"
                      lines={[
                        `This is an estimate of units customers may buy in ${nextForecastMonth}, based on completed sales periods for ${scopeLabel}.`,
                        "SMA-3 follows recent changes more closely; SMA-6 smooths short-term swings with a longer baseline.",
                        "Use it as a planning aid, not a guarantee of future sales.",
                      ]}
                    />
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground font-medium">{scopeLabel}</span>
                  </div>

                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight text-foreground">
                      {Math.round(activeForecastUnits).toLocaleString()}
                    </span>
                    <span className="text-sm sm:text-base font-semibold text-muted-foreground">
                      units expected
                    </span>
                    {latestSalesMonth && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        Math.round(activeForecastUnits) >= latestSalesMonth.demand
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-amber-700 dark:text-amber-300"
                      }`}>
                        {Math.round(activeForecastUnits) >= latestSalesMonth.demand ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {Math.round(activeForecastUnits) >= latestSalesMonth.demand ? "+" : "−"}
                        {Math.abs(Math.round(activeForecastUnits) - latestSalesMonth.demand).toLocaleString()} vs {latestSalesMonth.month} ({latestSalesMonth.demand.toLocaleString()} sold)
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                    {smaMonths.length === 0 ? (
                      "No recorded sales history yet for this selection."
                    ) : (
                      <>
                        Based on <strong className="text-foreground font-semibold">{activeForecastModel} ({Math.round(activeForecastUnits).toLocaleString()} units)</strong> · {last3.length} periods averaged ({last3.map(m => `${m.month}: ${m.demand.toLocaleString()}`).join(", ")}).
                        {activeForecastModel === "SMA-3" && sma3Error && (
                          <span className="ml-1 text-foreground">Back-test error: <strong className="font-semibold">{sma3Error.smape.toFixed(1)}% ({sma3Acc.label})</strong>.</span>
                        )}
                      </>
                    )}
                  </p>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSmaInspector(activeForecastModel === "SMA-3" ? "sma3" : "sma6")}
                      className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline cursor-pointer"
                    >
                      <Calculator size={13} />
                      View Calculation Math
                    </button>
                    <span className="text-border">·</span>
                    <button
                      type="button"
                      onClick={() => setSmapeInspector(activeForecastModel === "SMA-3" ? "sma3" : "sma6")}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                    >
                      Accuracy History ({activeForecastModel === "SMA-3" ? (sma3Error ? `${sma3Error.points} checks` : "Needs 4+ periods") : (sma6Error && !sma6Error.insufficientData ? `${sma6Error.points} checks` : "Needs 7+ periods")})
                    </button>
                    <InfoTip
                      title="Back-test accuracy and volatility"
                      lines={[
                      "SmartTrack re-estimates past periods using only sales that came before each period, then compares each estimate with recorded sales.",
                      "The score is an average relative difference: lower means closer. It is not the percentage of units missed.",
                      "High Volatility means the past differences were large; it does not predict future volatility.",
                      ]}
                    />
                  </div>
                </div>

                {/* Quick Model Selector Segment */}
                <div className="flex flex-col gap-1.5 shrink-0 border-t lg:border-t-0 lg:border-l border-border/80 pt-3 lg:pt-0 lg:pl-6">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Forecast Model</span>
                    <InfoTip
                      title="Choose a forecast model"
                      lines={[
                      "SMA-3 averages the latest three completed periods and responds faster when demand changes.",
                      "SMA-6 averages up to six periods, so it is a steadier baseline that is less affected by a single spike.",
                      "You can switch models at any time; this selection is a recommendation, not an automatic order.",
                      ]}
                    />
                  </div>
                  <div className="inline-flex rounded-2xl border border-border/70 bg-muted/45 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedModelOverride("SMA-3")}
                      className={`text-left px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                        activeForecastModel === "SMA-3"
                        ? "bg-card text-foreground shadow-sm font-bold ring-1 ring-border/50"
                          : "text-muted-foreground hover:text-foreground font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">SMA-3 ({periodShort})</span>
                        <span className="rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold px-1.5 py-0.2">
                          {selectedForecast?.model === "SMA-6" ? "Short-Term" : "Recommended"}
                        </span>
                      </div>
                      <span className="block text-sm font-extrabold tabular-nums mt-0.5">
                        {Math.round(forecastSMA3).toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">units</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedModelOverride("SMA-6")}
                      className={`text-left px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                        activeForecastModel === "SMA-6"
                          ? "bg-card text-foreground shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">SMA-6 ({periodShort})</span>
                        <span className="text-[9px] text-muted-foreground">
                          {has6Periods ? "Steady" : `${smaMonths.length}/6`}
                        </span>
                      </div>
                      <span className="block text-sm font-extrabold tabular-nums mt-0.5">
                        {Math.round(forecastSMA6).toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">units</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Row 2: Product-Level Demand Forecast Table (Answers "Which Specific Products Will Customers Buy?") ── */}
        <div className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-border space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-foreground">
                    Product-Level Demand Forecasts for {nextForecastMonth}
                  </h3>
                  <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold">
                    {filteredProductForecasts.length} of {productForecastList.length} medicines
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Individual product predictions ranked by expected demand. Click <strong>Inspect Chart</strong> on any medicine to plot its historical sales and SMA back-test above.
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { id: "all", label: `All (${productForecastList.length})` },
                  { id: "shortfall", label: `Shortfall Risk (${productForecastList.filter(r => r.projectedShortfall > 0).length})` },
                  { id: "rising", label: `↑ Rising Trend (${productForecastList.filter(r => r.trendDirection === "rising").length})` },
                  { id: "high_confidence", label: `High Confidence (${productForecastList.filter(r => r.confidenceTier === "high").length})` },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setProductForecastFilter(tab.id); setProductForecastPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                      productForecastFilter === tab.id
                        ? "bg-card text-foreground border-border shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={productForecastSearch}
                  onChange={e => { setProductForecastSearch(e.target.value); setProductForecastPage(1); }}
                  placeholder="Search specific medicine name, ID, or category…"
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {productForecastSearch && (
                  <button
                    type="button"
                    onClick={() => { setProductForecastSearch(""); setProductForecastPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Showing {forecastPeriodUnit === "week" ? "weekly (3-Wk / 6-Wk)" : "monthly (3-Mo / 6-Mo)"} product forecasts · Coverage compares stock against 30-day demand
              </span>
            </div>
          </div>

          <div className="overflow-x-auto" data-table-scroll="fixed">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-3 px-5 text-left">
                    <AnalyticsColumnHeader label="Medicine" title="Medicine & confidence" description="Each row is one medicine. High Confidence means at least six periods with sales in four of the latest six; Short History means there are at least three periods and some recent sales; Sporadic Sales means sales are intermittent. No Sales History means there is not enough activity to forecast from." />
                  </th>
                  <th className="py-3 px-4 text-left">
                    <AnalyticsColumnHeader label="Recent Sales" title="Recent recorded sales" description="The quantities sold in the latest completed periods shown here, plus the total sales in the history used for this medicine." />
                  </th>
                  <th className="py-3 px-4 text-left text-foreground bg-primary/[0.03]">
                    <AnalyticsColumnHeader label={`${nextForecastMonth} Forecast`} title="Projected demand" description={`A model-based estimate of how many units may sell in ${nextForecastMonth}. SMA-3 reacts more to recent changes; SMA-6 uses a longer history for a steadier estimate. It is guidance, not a guaranteed sale.`} />
                  </th>
                  <th className="py-3 px-4 text-left">
                    <AnalyticsColumnHeader label="Trend" title="Recent demand trend" description="Compares the short-term average with the longer baseline. Rising and slowing describe the observed direction; they do not guarantee what will happen next." />
                  </th>
                  <th className="py-3 px-4 text-left">
                    <AnalyticsColumnHeader label="Stock & Coverage" title="Stock and days of supply" description="Shows current stock, incoming purchase-order units, and the estimated days current stock can cover at recent forecast demand. A shortfall means expected demand may exceed stock plus incoming units." />
                  </th>
                  <th className="py-3 px-5 text-right">
                    <AnalyticsColumnHeader label="Action" title="Inspect or restock" description="Inspect focuses the forecast on this medicine. Restock opens its planning row when its stock status needs attention." align="right" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {paginatedProductForecasts.map(row => {
                  const {
                    product: p,
                    totalSold,
                    sma3,
                    sma6,
                    recommendedModel,
                    recommendedForecast,
                    recent3Periods,
                    confidenceTier,
                    confidenceLabel,
                    trendDirection,
                    trendPercent,
                    incomingQty,
                    daysOfSupply,
                    projectedShortfall,
                  } = row;
                  const isFocused = scope === `product:${p.id}`;

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isFocused ? "bg-primary/5" : "hover:bg-muted/20"
                      }`}
                    >
                      {/* Medicine */}
                      <td className="py-3 px-5">
                        <p className="font-semibold text-foreground text-xs">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">{p.category}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            confidenceTier === "high" ? "bg-emerald-500" :
                            confidenceTier === "short" ? "bg-amber-500" :
                            confidenceTier === "intermittent" ? "bg-orange-500" : "bg-muted-foreground/40"
                          }`} />
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {confidenceLabel}
                          </span>
                        </div>
                      </td>

                      {/* Recent 3 periods */}
                      <td className="py-3 px-4">
                        {recent3Periods.length > 0 ? (
                          <div>
                            <p className="text-xs font-medium tabular-nums text-foreground">
                              {recent3Periods.map(rp => rp.qty).join(" → ")}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {totalSold.toLocaleString()} units sold
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">0 sales</span>
                        )}
                      </td>

                      {/* Next Period Forecast */}
                      <td className="py-3 px-4 bg-primary/[0.02]">
                        {totalSold > 0 ? (
                          <div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs font-bold tabular-nums text-foreground">
                                {Math.round(recommendedForecast).toLocaleString()} units
                              </span>
                              <span className="text-[10px] font-semibold text-primary">
                                {recommendedModel}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              SMA-3: {Math.round(sma3)} · SMA-6: {Math.round(sma6)}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <span className="text-xs text-muted-foreground">Using min level</span>
                            <span className="block text-[10px] text-muted-foreground">({getReorderUnits(p)} units)</span>
                          </div>
                        )}
                      </td>

                      {/* Trend */}
                      <td className="py-3 px-4">
                        {trendDirection === "rising" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <ArrowUpRight size={13} /> +{trendPercent}%
                          </span>
                        ) : trendDirection === "slowing" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                            <ArrowDownRight size={13} /> {trendPercent}%
                          </span>
                        ) : trendDirection === "steady" ? (
                          <span className="text-[11px] text-muted-foreground">→ Steady</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Stock & Coverage */}
                      <td className="py-3 px-4">
                        <div className="text-xs font-medium tabular-nums text-foreground">
                          {p.stock.toLocaleString()} units
                          {incomingQty > 0 && <span className="text-[10px] text-sky-600 dark:text-sky-400 ml-1">+{incomingQty} PO</span>}
                        </div>
                        {projectedShortfall > 0 ? (
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 block mt-0.5">
                            Shortfall: {projectedShortfall.toLocaleString()}u{daysOfSupply != null ? ` (~${daysOfSupply}d)` : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            Covered ({daysOfSupply != null ? (daysOfSupply > 90 ? ">90d" : `~${daysOfSupply}d`) : "in stock"})
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setScope(isFocused ? "all" : `product:${p.id}`)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              isFocused
                                ? "bg-card text-foreground border-border shadow-sm"
                                : "bg-background hover:bg-muted text-foreground border-border"
                            }`}
                          >
                            {isFocused ? "Selected" : "Inspect"}
                          </button>
                          {(p.status === "out_of_stock" || p.status === "critical" || p.status === "low") && (
                            <button
                              type="button"
                              onClick={() => {
                                setRestockSearch(p.name);
                                setActiveSection("Restocking");
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Restock →
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredProductForecasts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                      No medicines match the selected forecast filter or search query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePager
            total={filteredProductForecasts.length}
            page={productForecastPage}
            pageSize={PRODUCT_FORECAST_PAGE_SIZE}
            onPage={setProductForecastPage}
          />
        </div>

        {/* ── Row 3: Historical Back-Test Overlay & Trend Chart ── */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {forecastPeriodUnit === "week" ? "Weekly" : "Monthly"} Sales History, Back-Test Overlay &amp; {nextForecastMonth} Projections ({scopeLabel})
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Solid blue line shows actual recorded sales. Dashed lines show historical back-test tracking and project {nextForecastMonth} demand using <strong>SMA-3 ({Math.round(forecastSMA3).toLocaleString()} units)</strong> and <strong>SMA-6 ({Math.round(forecastSMA6).toLocaleString()} units)</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue-600" />Actual Sales</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" />SMA-3 ({Math.round(forecastSMA3).toLocaleString()})</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-violet-500" />SMA-6 ({Math.round(forecastSMA6).toLocaleString()})</span>
            </div>
          </div>
          {smaLoading && forecastPeriodUnit === "month" ? (
            <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">Loading sales history…</div>
          ) : smaChartData.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">No sales history for this selection yet.</div>
          ) : (
            <ForecastTrendChart
              history={smaChartData}
              nextPeriod={nextForecastMonth}
              sma3={forecastSMA3}
              sma6={forecastSMA6}
              periodUnit={forecastPeriodUnit}
            />
          )}

          {/* Clean 3-Metric Summary Footer Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border/70 text-xs">
            <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Latest Recorded Sales</span>
                <InfoTip title="Latest recorded sales" lines={["Actual units recorded as sold in the most recent completed period with sales. This is historical data, not a forecast."]} />
              </div>
              <span className="text-base font-bold tabular-nums text-foreground mt-0.5 block">
                {latestSalesMonth ? `${latestSalesMonth.demand.toLocaleString()} units` : "No sales yet"}
              </span>
              <span className="text-[11px] text-muted-foreground">Recorded in {latestSalesMonth?.month ?? "recent transactions"}</span>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SMA-3 Short-Term Avg</span>
                <InfoTip title="SMA-3 short-term average" lines={["The average sales across up to the latest three completed periods. It follows recent changes more quickly than SMA-6."]} />
              </div>
              <span className="text-base font-bold tabular-nums text-foreground mt-0.5 block">
                {Math.round(forecastSMA3).toLocaleString()} units
              </span>
              <span className="text-[11px] text-muted-foreground">
                {last3.length > 0
                  ? `Avg of last ${last3.length} (${last3.map(m => m.demand.toLocaleString()).join(" + ")} ÷ ${last3.length})`
                  : "No periods recorded"}
              </span>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SMA-6 Steady Baseline</span>
                <InfoTip title="SMA-6 steady baseline" lines={["The average sales across up to the latest six completed periods. Its longer window smooths short-term swings compared with SMA-3."]} />
              </div>
              <span className="text-base font-bold tabular-nums text-foreground mt-0.5 block">
                {Math.round(forecastSMA6).toLocaleString()} units
              </span>
              <span className="text-[11px] text-muted-foreground">
                {last6.length > 0
                  ? `Avg of last ${last6.length} (${last6.reduce((s, m) => s + m.demand, 0).toLocaleString()} total ÷ ${last6.length})`
                  : "No periods recorded"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Row 4: Expandable SMA-3 vs. SMA-6 Detailed Formula Evaluation ── */}
        <details className={`group ${ANALYTICS_CARD_CLASS} overflow-hidden`}>
          <summary className="px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors select-none">
            <div className="flex items-center gap-2">
              <Calculator size={14} className="text-primary" />
              <span className="text-xs font-bold text-foreground">
                Model Math Comparison: SMA-3 vs. SMA-6 ({scopeLabel})
              </span>
              <span className="text-[11px] text-muted-foreground font-normal">
                · {smaMonths.length} historical {forecastPeriodUnit === "week" ? "weeks" : "months"} analyzed
              </span>
            </div>
            <span className="text-xs font-semibold text-primary">
              View Detailed Formulas ▼
            </span>
          </summary>

          <div className="overflow-x-auto border-t border-border/60" data-table-scroll="fixed">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-2.5 px-5 text-left"><AnalyticsColumnHeader label="Model" title="Forecast model" description="SMA-3 averages the latest three completed periods and responds faster to recent changes. SMA-6 averages up to six periods and gives a steadier baseline." /></th>
                  <th className="py-2.5 px-4 text-left"><AnalyticsColumnHeader label="Formula" title="How the average is calculated" description="Add the recorded sales from the available recent periods, then divide by the number of periods included. A₁, A₂, and so on represent each period's sales." /></th>
                  <th className="py-2.5 px-4 text-left"><AnalyticsColumnHeader label="Sales Averaged" title="Sales included in this model" description="These are the recorded units used for the displayed average. If there are fewer periods than the model's full window, the available periods are shown." /></th>
                  <th className="py-2.5 px-4 text-left"><AnalyticsColumnHeader label="Historical Accuracy (Back-Test)" title="Back-test difference and volatility" description="SmartTrack replays past estimates using only earlier sales, then compares them with what actually sold. The percentage is average relative difference, not percent of units missed; lower means closer. High Volatility means the past differences were large, not that future demand is certain to vary." /></th>
                  <th className="py-2.5 px-4 text-left font-bold text-foreground"><AnalyticsColumnHeader label={`${nextForecastMonth} Forecast`} title="Projected demand" description={`The model's estimated unit demand for ${nextForecastMonth}, based on the sales periods above. Treat it as a planning estimate rather than a promise.`} /></th>
                  <th className="py-2.5 px-5 text-right"><AnalyticsColumnHeader label="Calculation" title="Calculation details" description="Open the step-by-step calculation to see the inputs and arithmetic used for this model." align="right" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr className="hover:bg-muted/15 transition-colors">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-orange-500" />
                      <span className="font-bold text-foreground">SMA-3 (Short-Term)</span>
                      <span className="rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold px-1.5 py-0.2 uppercase">
                        {selectedForecast?.model === "SMA-6" ? "Responsive" : "Recommended"}
                      </span>
                    </div>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Reacts faster to recent prescription spikes</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-foreground">
                    (A₁ + A₂ + A₃) ÷ {Math.max(1, last3.length)}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {last3.length > 0
                      ? `Last ${last3.length} (${last3.map(m => m.demand.toLocaleString()).join(" + ")} = ${last3.reduce((s, m) => s + m.demand, 0).toLocaleString()} total)`
                      : "No recorded sales"}
                  </td>
                  <td className="py-3 px-4">
                    {sma3Error ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground tabular-nums">{sma3Error.smape.toFixed(1)}% diff</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${getAccuracyBadge(sma3Error.smape).tone}`}>
                          {getAccuracyBadge(sma3Error.smape).label}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Needs 4+ periods for back-test</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm font-extrabold tabular-nums text-foreground">
                      {Math.round(forecastSMA3).toLocaleString()} units
                    </span>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <button
                      type="button"
                      onClick={() => setSmaInspector("sma3")}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      View Steps →
                    </button>
                  </td>
                </tr>

                <tr className="hover:bg-muted/15 transition-colors">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-violet-500" />
                      <span className="font-bold text-foreground">SMA-6 (Steady Baseline)</span>
                      <span className="rounded bg-muted text-muted-foreground text-[9px] font-bold px-1.5 py-0.2 uppercase">
                        {smaMonths.length >= 6 ? "Steady" : `${smaMonths.length}/6 Periods`}
                      </span>
                    </div>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Filters out temporary one-period fluctuations</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-foreground">
                    (A₁ + … + A₆) ÷ {Math.max(1, last6.length)}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {last6.length > 0
                      ? `Last ${last6.length} (${last6.reduce((s, m) => s + m.demand, 0).toLocaleString()} total ÷ ${last6.length})`
                      : "No recorded sales"}
                  </td>
                  <td className="py-3 px-4">
                    {sma6Error && !sma6Error.insufficientData ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground tabular-nums">{sma6Error.smape.toFixed(1)}% diff</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${getAccuracyBadge(sma6Error.smape).tone}`}>
                          {getAccuracyBadge(sma6Error.smape).label}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Needs 7+ periods for back-test (has {smaMonths.length})</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm font-extrabold tabular-nums text-foreground">
                      {Math.round(forecastSMA6).toLocaleString()} units
                    </span>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <button
                      type="button"
                      onClick={() => setSmaInspector("sma6")}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      View Steps →
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>
      </>}

      {/* Restocking: Highlight EOQ (Economic Order Quantity) & Reorder Point (ROP) clearly */}
      {activeSection === "Restocking" && <>
      {/* ── Top Bar: Sleek Unified Control Strip (Linear Style) ── */}
      <div className={`${ANALYTICS_CARD_CLASS} flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-bold text-foreground">Demand Basis:</span>
          <InfoTip
            title="Restocking demand basis (D)"
            lines={[
              "D is the annual demand estimate used by EOQ and lead-time ROP calculations.",
              "Auto uses the selected forecast recommendation. SMA-3 responds faster to recent changes; SMA-6 is steadier; All-Time Avg uses the full available sales history.",
              "Changing the basis can change order quantities. It never creates an order by itself.",
            ]}
          />
          <div className="inline-flex rounded-2xl border border-border/70 bg-muted/45 p-1 text-xs font-semibold">
            {([
              { id: "auto", label: "Auto (SMA)" },
              { id: "sma3", label: "SMA-3" },
              { id: "sma6", label: "SMA-6" },
              { id: "historical", label: "All-Time Avg" },
            ] as const).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSetDemandBasis(opt.id)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  demandBasis === opt.id
                    ? "bg-card text-foreground font-bold shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowEoqSettingsModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <SlidersHorizontal size={13} className="text-primary" />
            <span>Parameters (S, I, Lead Time)</span>
          </button>
          <button
            type="button"
            onClick={() => setSmaInspector("eoq")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Calculator size={13} />
            <span>EOQ Formula</span>
          </button>
        </div>
      </div>

      {poBannerMessage && (
        <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-semibold ${
          poBannerMessage.type === "success"
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
            : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
        }`}>
          <span>{poBannerMessage.text}</span>
          <div className="flex items-center gap-2 shrink-0">
            {poBannerMessage.type === "success" && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "purchases" }))}
                className="underline font-bold cursor-pointer"
              >
                View Purchase Orders →
              </button>
            )}
            <button type="button" onClick={() => setPoBannerMessage(null)} className="p-1 hover:opacity-75 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── 4 Summary KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To Restock</p>
              <InfoTip title="Products to restock" lines={["Count of products currently below their configured reorder thresholds and included in this restock plan."]} />
            </div>
            <p className={`mt-1.5 text-2xl font-extrabold tabular-nums ${reorderRecs.length ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {reorderRecs.length} <span className="text-xs font-medium text-muted-foreground">products</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            {reorderRecs.filter(r => r.product.status === "out_of_stock").length} Out ·{" "}
            {reorderRecs.filter(r => r.product.status === "critical").length} Critical ·{" "}
            {reorderRecs.filter(r => r.product.status === "low").length} Low
          </p>
        </div>

        {/* Card 2 */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Planned Order Units</p>
              <InfoTip
                title="Planned Restock Units"
                color="sky"
                lines={[
                  `Planned total order volume across all ${reorderRecs.length} restocking items.`,
                  `Overall batch benchmark: ${eoqOverall.toLocaleString()} units.`,
                ]}
              />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-foreground">
              {totalEoqUnits.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">units</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            Benchmark: ~{eoqOverall.toLocaleString()} units / batch
          </p>
        </div>

        {/* Card 3 */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Advisory ROP</p>
              <InfoTip
                title="Reorder Point (ROP)"
                color="sky"
                lines={[
                  `Formula: (Daily Demand × ${leadTimeDaysSetting}d Lead) + ${safetyBufferSetting}% Safety Buffer.`,
                  `Holding rate: ${Math.round(holdingRateSetting * 100)}%/yr · Order cost: ₱${orderCostSetting}.`,
                ]}
              />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-foreground">
              {leadTimeDaysSetting} Days <span className="text-xs font-medium text-muted-foreground">lead</span>
            </p>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            +{safetyBufferSetting}% safety buffer · S=₱{orderCostSetting}
          </p>
        </div>

        {/* Card 4 */}
        <div className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estimated Budget</p>
              <InfoTip title="Estimated restock budget" lines={["Estimated cost of the planned order quantities across the products in this plan. Product-level costs use the unit cost shown in the calculation details."]} />
            </div>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-foreground">
              {fmt(estimatedRestockCost)}
            </p>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            Total planned order cost across all items
          </p>
        </div>
      </div>

      {/* ── Row 3: Actionable EOQ Reorder Recommendations Table ── */}
      {reorderRecs.length > 0 && (
        <div className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
          {/* Table Header + Search & Status Filter Bar */}
          <div className="px-5 py-3.5 border-b border-border space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Products Recommended for Restock</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optimal order batches and lead-time thresholds calculated from your demand forecasts.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {Object.keys(eoqOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEoqOverrides({});
                      try { localStorage.removeItem("smarttrack_eoq_overrides"); } catch { /* ignore */ }
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-semibold hover:bg-amber-500/25 cursor-pointer"
                  >
                    Reset {Object.keys(eoqOverrides).length} Override{Object.keys(eoqOverrides).length === 1 ? "" : "s"}
                  </button>
                )}
                <span className="text-xs px-2.5 py-1 rounded-lg bg-muted text-foreground font-semibold border border-border">
                  {filteredReorderRecs.length} of {reorderRecs.length} products
                </span>
              </div>
            </div>

            {/* Search & Status Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={restockSearch}
                  onChange={e => { setRestockSearch(e.target.value); setRestockPage(1); }}
                  placeholder="Search product name, ID, or category…"
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {restockSearch && (
                  <button
                    type="button"
                    onClick={() => { setRestockSearch(""); setRestockPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { id: "all", label: `All (${reorderRecs.length})` },
                  { id: "out_of_stock", label: `Out of Stock (${reorderRecs.filter(r => r.product.status === "out_of_stock").length})` },
                  { id: "critical", label: `Critical (${reorderRecs.filter(r => r.product.status === "critical").length})` },
                  { id: "low", label: `Low (${reorderRecs.filter(r => r.product.status === "low").length})` },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setRestockStatusFilter(tab.id); setRestockPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                      restockStatusFilter === tab.id
                        ? "bg-card text-foreground border-border shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto" data-table-scroll="fixed">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-card shadow-sm">
                <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-5 text-left"><AnalyticsColumnHeader label="Product" title="Product details" description="Medicine name, category, and supplier. The product identity helps you review the recommendation with its supplier." /></th>
                  <th className="py-3 px-4 text-left"><AnalyticsColumnHeader label="Stock vs. Min" title="Stock compared with minimum" description="Current on-hand units compared with the configured minimum reorder level. The shortage indicates how many units are below that threshold." /></th>
                  <th className="py-3 px-4 text-left"><AnalyticsColumnHeader label="Annual Demand (D)" title="Annual demand (D)" description={`The estimated number of units used in one year. Its source follows the selected demand basis (currently ${demandBasis === "sma3" ? "SMA-3" : demandBasis === "sma6" ? "SMA-6" : demandBasis === "historical" ? "All-Time Average" : "Auto"}); changing that basis can change the order recommendation.`} /></th>
                  <th className="py-3 px-4 text-left"><AnalyticsColumnHeader label="Advisory ROP" title="Reorder point (ROP)" description={`The stock level that signals when to reorder: expected demand during the ${leadTimeDaysSetting}-day supplier lead time plus a ${safetyBufferSetting}% safety buffer. It is advisory; your configured minimum still controls stock alerts.`} /></th>
                  <th className="py-3 px-4 text-left text-foreground bg-primary/[0.03]"><AnalyticsColumnHeader label="Planned Order (EOQ)" title="Economic order quantity (EOQ)" description="The recommended order size balances the cost of placing orders against the cost of holding inventory. Pack sizes can round this quantity, and FIFO sell-through estimates how long the batch may take to sell relative to shelf life." /></th>
                  <th className="py-3 px-4 text-left"><AnalyticsColumnHeader label="Est. Cost" title="Estimated order cost" description="Planned order units multiplied by the available unit purchase cost. The product's cost source is shown in its calculation details." /></th>
                  <th className="py-3 px-4 text-left"><AnalyticsColumnHeader label="Status" title="Current stock status" description="A status based on the product's current on-hand stock and configured reorder thresholds." /></th>
                  <th className="py-3 px-5 text-right"><AnalyticsColumnHeader label="Actions" title="Review or create an order" description="Math opens the calculation details. Create PO starts a purchase-order draft for human review; it does not place an order automatically." align="right" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {paginatedReorderRecs.map(rec => {
                  const {
                    product: p,
                    rawEoq,
                    eoq,
                    overrideQty,
                    effectiveOrderQty,
                    fifoSellThroughMonths,
                    suggestedRop,
                    shortage,
                    annualDemand: prodAnnDemand,
                    unitCost,
                    isDemandFallback,
                    demandSourceLabel,
                  } = rec;
                  const minUnits = getReorderUnits(p);
                  const unitsPerPack = Math.max(1, p.unitsPerPack ?? 1);
                  const effectivePacks = unitsPerPack > 1 ? Math.ceil(effectiveOrderQty / unitsPerPack) : null;
                  return (
                    <tr key={p.id} className="hover:bg-muted/15 transition-colors">
                      {/* Product */}
                      <td className="px-5 py-3">
                        <p className="text-xs font-semibold text-foreground">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">{p.category}{p.supplier ? ` · ${p.supplier}` : ""}</p>
                      </td>

                      {/* Stock vs Min */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold tabular-nums text-foreground">
                          {p.stock.toLocaleString()} <span className="text-muted-foreground font-normal text-[11px]">/ {minUnits.toLocaleString()}</span>
                        </div>
                        {shortage > 0 ? (
                          <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 tabular-nums">
                            −{shortage.toLocaleString()} below min
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">At threshold</span>
                        )}
                      </td>

                      {/* Demand (D) */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold tabular-nums text-foreground">
                          {prodAnnDemand.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">u/yr</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium block mt-0.5">
                          {isDemandFallback ? "Fallback (0 sales)" : demandSourceLabel.split(" (")[0]}
                        </span>
                      </td>

                      {/* Suggested ROP */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold tabular-nums text-foreground">
                          {suggestedRop.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">units</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{leadTimeDaysSetting}d lead</span>
                      </td>

                      {/* Planned Order */}
                      <td className="px-4 py-3 bg-primary/[0.02]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold tabular-nums text-foreground">
                            {effectiveOrderQty.toLocaleString()} units
                          </span>
                          {effectivePacks && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              ({effectivePacks} pk)
                            </span>
                          )}
                          {overrideQty != null && (
                            <span className="rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[9px] font-bold px-1.5 py-0.2">
                              Custom
                            </span>
                          )}
                        </div>
                        {unitsPerPack > 1 && effectiveOrderQty % unitsPerPack !== 0 && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium block mt-0.5" title="Order quantity includes loose units beyond full supplier packs">
                            {Math.floor(effectiveOrderQty / unitsPerPack)} pk + {effectiveOrderQty % unitsPerPack} loose
                          </span>
                        )}
                        {fifoSellThroughMonths != null && fifoSellThroughMonths > 9 ? (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium block mt-0.5">
                            ~{fifoSellThroughMonths.toFixed(0)}m FIFO
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground block mt-0.5">Optimal batch</span>
                        )}
                      </td>

                      {/* Est. Cost */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold tabular-nums text-foreground">
                          {fmt(effectiveOrderQty * unitCost)}
                        </div>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">@ ₱{unitCost.toFixed(2)}/u</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StockBadge status={p.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedEoqProductId(p.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors cursor-pointer"
                            title="Inspect formula & math breakdown"
                          >
                            <Calculator size={12} />
                            Math
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openPoDraftModal(p, eoq, shortage, effectiveOrderQty)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                              title="Create a Supplier Purchase Order using this quantity"
                            >
                              Create PO
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredReorderRecs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                      No restocking products match your search or status filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePager
            total={filteredReorderRecs.length}
            page={restockPage}
            pageSize={RESTOCK_PAGE_SIZE}
            onPage={setRestockPage}
          />
        </div>
      )}
      {reorderRecs.length === 0 && <div className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">No products are currently below their low-stock level.</div>}
      </>}


      {/* Product Performance table */}
      {activeSection === "Products" && <>
      {(() => {
        const perfTotal = perf.length;
        const perfColumns = [
          { label: "Product", title: "Product", description: "The medicine represented by this row." },
          { label: "Category", title: "Category", description: "The inventory category assigned to this medicine." },
          { label: "Units Sold", title: "Units sold", description: "Total units sold in the recorded transaction history used for this report." },
          { label: "Revenue", title: "Recorded revenue", description: "Sales revenue attributed to this product in the recorded transaction history." },
          { label: "Demand Level", title: "Demand level", description: "A relative grouping based on historical product sales. It summarizes past activity and is not a forecast guarantee." },
        ];
        return (
          <div className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-border/70 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">Product Performance</h3>
                    <InfoTip
                      title="Product Performance Overview"
                      lines={[
                        "Summary table of all individual products with sales volume, revenue, and demand level.",
                        { label: "High Demand", value: "Fast-moving top revenue generators" },
                        { label: "Moderate Demand", value: "Steady community medications" },
                        { label: "Stable Demand", value: "Slow or steady-moving items (avoid overstocking)" },
                      ]}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Based on historical sales transaction records</p>
                </div>
                {perfTotal > 0 && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium border border-border">
                    {filteredPerf.length === perfTotal
                      ? `${perfTotal} products`
                      : `${filteredPerf.length} of ${perfTotal} products`}
                  </span>
                )}
              </div>

              {/* Search & Demand Filter Controls */}
              {perfTotal > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                  <div className="relative flex-1 max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={productPerfSearch}
                      onChange={e => { setProductPerfSearch(e.target.value); setProductPerfPage(1); }}
                      placeholder="Search product or category…"
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    />
                    {productPerfSearch && (
                      <button
                        type="button"
                        onClick={() => { setProductPerfSearch(""); setProductPerfPage(1); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {(["all", "High", "Moderate", "Stable"] as const).map(lvl => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => { setProductPerfDemandFilter(lvl); setProductPerfPage(1); }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                          productPerfDemandFilter === lvl
                            ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                        }`}
                      >
                        {lvl === "all" ? "All Levels" : `${lvl} Demand`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto" data-table-scroll="fixed">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card shadow-sm">
                  <tr className="border-b border-border/60 bg-muted/20">
                    {perfColumns.map(column => (
                      <th key={column.label} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">
                        <AnalyticsColumnHeader label={column.label} title={column.title} description={column.description} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedPerf.length > 0 ? paginatedPerf.map(row => (
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
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                        {perfTotal === 0 ? "No sales data available yet" : "No products match your search or filter."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <TablePager
              total={filteredPerf.length}
              page={productPerfPage}
              pageSize={PRODUCT_PERF_PAGE_SIZE}
              onPage={setProductPerfPage}
            />
          </div>
        );
      })()}
      </>}

      {selectedEoqProduct && (
        <EoqBreakdownModal
          data={selectedEoqProduct}
          onClose={() => setSelectedEoqProductId(null)}
          onReorder={canEdit ? onEditProduct : undefined}
          onSetOverrideQty={handleSetOverrideQty}
        />
      )}

      {poDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !poSubmitting && setPoDraftModal(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Human-in-the-Loop Restocking</p>
                <h3 className="text-sm font-bold text-foreground mt-0.5">Create Purchase Order — {poDraftModal.product.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => !poSubmitting && setPoDraftModal(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleConfirmCreatePo} className="p-5 space-y-4 text-xs">
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Stock / Min Threshold:</span>
                  <strong className="text-foreground">{poDraftModal.product.stock} / {getReorderUnits(poDraftModal.product)} units</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recommended EOQ Batch:</span>
                  <strong className="text-primary">{poDraftModal.recommendedEoq.toLocaleString()} units</strong>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">Supplier Name</label>
                <input
                  type="text"
                  required
                  value={poDraftModal.supplier}
                  onChange={e => setPoDraftModal({ ...poDraftModal, supplier: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-foreground">Final Order Quantity (Base Units)</label>
                  <span className="text-[10px] text-muted-foreground">Accept EOQ or override</span>
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={poDraftModal.qty}
                  onChange={e => setPoDraftModal({ ...poDraftModal, qty: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setPoDraftModal({ ...poDraftModal, qty: String(poDraftModal.recommendedEoq) })}
                    className="px-2.5 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-[11px] font-semibold text-foreground cursor-pointer"
                  >
                    Use EOQ ({poDraftModal.recommendedEoq})
                  </button>
                  {poDraftModal.shortage > 0 && (
                    <button
                      type="button"
                      onClick={() => setPoDraftModal({ ...poDraftModal, qty: String(poDraftModal.shortage) })}
                      className="px-2.5 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-[11px] font-semibold text-foreground cursor-pointer"
                    >
                      Shortage Only ({poDraftModal.shortage})
                    </button>
                  )}
                  {(poDraftModal.product.unitsPerPack ?? 1) > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const pk = Math.max(1, poDraftModal.product.unitsPerPack ?? 1);
                        const cur = Math.max(1, Number(poDraftModal.qty) || poDraftModal.recommendedEoq);
                        setPoDraftModal({ ...poDraftModal, qty: String(Math.ceil(cur / pk) * pk) });
                      }}
                      className="px-2.5 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-[11px] font-semibold text-foreground cursor-pointer"
                    >
                      Round to Pack ({poDraftModal.product.unitsPerPack}u/pk)
                    </button>
                  )}
                </div>
                {(() => {
                  const pk = Math.max(1, poDraftModal.product.unitsPerPack ?? 1);
                  const q = Math.max(0, Number(poDraftModal.qty) || 0);
                  if (pk <= 1 || q === 0 || q % pk === 0) return null;
                  const full = Math.floor(q / pk);
                  const loose = q % pk;
                  return (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 font-medium">
                      ⚠️ Note: {q.toLocaleString()} units = {full} pack{full === 1 ? "" : "s"} of {pk} + {loose} loose unit{loose === 1 ? "" : "s"}. Click &ldquo;Round to Pack&rdquo; if supplier requires full boxes.
                    </p>
                  );
                })()}
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">
                  Expected Delivery Date ({leadTimeDaysSetting}-day lead time)
                </label>
                <input
                  type="date"
                  value={poDraftModal.expectedDate}
                  onChange={e => setPoDraftModal({ ...poDraftModal, expectedDate: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  disabled={poSubmitting}
                  onClick={() => setPoDraftModal(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted font-semibold text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={poSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {poSubmitting ? "Creating PO…" : "Confirm & Create Purchase Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {smaInspector === "sma3" && (
        <CalcInspectorModal
          title="SMA-3 forecast — calculation"
          formula={<SmaFormulaVisual type={last3.length === 3 ? "sma3" : "general"} />}
          explanation="Use SMA-3 for a quick, short-term estimate of how many units may sell in the next period. It averages sales from the latest 3 periods, so recent changes affect it faster. For a fair past check, each old estimate uses only sales from before that period."
          variables={[
            ...last3.slice().reverse().map((period, index) => ({
              label: `${index === 0 ? "Most recent" : `${index + 1} periods ago`} · t-${index + 1} (${period.month})`, value: `${period.demand.toLocaleString()} units sold`,
            })),
            { label: "Periods included", value: `${last3.length} of 3` },
            ...(sma3Error ? [
              { label: "Average past difference · Details", value: `${sma3Error.smape.toFixed(1)}% · lower was closer` },
              { label: "Past periods checked", value: `${sma3Error.points}` },
            ] : []),
          ]}
          trail={[
            last3.length
              ? `Add the sales from these periods: ${last3.slice().reverse().map(m => m.demand.toLocaleString()).join(" + ")} = ${last3.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} units.`
              : "No recorded sales periods are available for this scope.",
            ...(last3.length ? [`Divide by the ${last3.length} periods used: ${last3.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} ÷ ${last3.length} = about ${Math.round(sma3Computed).toLocaleString()} units expected in ${nextForecastMonth}.`] : []),
            ...(sma3Error ? [
              `Past check: compare an older estimate with the units actually sold that period (${sma3Error.points} periods checked).`,
              `Average past difference: ${sma3Error.smape.toFixed(1)}%. Lower means those estimates were closer.`,
            ] : []),
          ]}
          result={`Estimated demand for ${nextForecastMonth}: ≈ ${Math.round(sma3Computed).toLocaleString()} units`}
          onClose={() => setSmaInspector(null)}
        />
      )}

      {smaInspector === "sma6" && (
        <CalcInspectorModal
          title="SMA-6 forecast — calculation"
          formula={<SmaFormulaVisual type={last6.length === 6 ? "sma6" : "general"} />}
          explanation="Use SMA-6 for a steadier view of demand. It averages sales from up to the latest 6 periods, so one unusually high or low period has less effect. It changes more slowly than SMA-3. For a fair past check, each old estimate uses only sales from before that period."
          variables={[
            ...last6.slice().reverse().map((period, index) => ({
              label: `${index === 0 ? "Most recent" : `${index + 1} periods ago`} · t-${index + 1} (${period.month})`, value: `${period.demand.toLocaleString()} units sold`,
            })),
            { label: "Periods included", value: `${last6.length} of 6` },
            ...(sma6Error && !sma6Error.insufficientData ? [
              { label: "Average past difference · Details", value: `${sma6Error.smape.toFixed(1)}% · lower was closer` },
              { label: "Past periods checked", value: `${sma6Error.points}` },
            ] : []),
          ]}
          trail={[
            last6.length
              ? `Add the sales from these periods: ${last6.slice().reverse().map(m => m.demand.toLocaleString()).join(" + ")} = ${last6.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} units.`
              : "No recorded sales periods are available for this scope.",
            ...(last6.length ? [`Divide by the ${last6.length} periods used${last6.length < 6 ? ` (${6 - last6.length} more needed for a full 6-period average)` : ""}: ${last6.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} ÷ ${last6.length} = about ${Math.round(sma6Computed).toLocaleString()} units expected in ${nextForecastMonth}.`] : []),
            ...(sma6Error && !sma6Error.insufficientData ? [
              `Past check: compare an older estimate with the units actually sold that period (${sma6Error.points} periods checked).`,
              `Average past difference: ${sma6Error.smape.toFixed(1)}%. Lower means those estimates were closer.`,
            ] : []),
          ]}
          result={`Estimated demand for ${nextForecastMonth}: ≈ ${Math.round(sma6Computed).toLocaleString()} units`}
          onClose={() => setSmaInspector(null)}
        />
      )}

      {smaInspector === "eoq" && (
        <CalcInspectorModal
          title="EOQ Restocking — Calculation"
          formula={<EoqFormulaVisual />}
          explanation={`EOQ answers ‘what order size balances supplier ordering fees against the cost of holding stock?’ It connects directly to your chosen Demand Basis (${demandBasis.toUpperCase()}) and your configured cost parameters (S = ₱${globalOrderCost.toFixed(2)}, I = ${Math.round(holdingRateSetting * 100)}%).`}
          variables={[
            { label: `Annual Demand (D · ${demandBasis.toUpperCase()})`, value: `${Math.round(annualDemand).toLocaleString()} units/yr` },
            { label: "Order Cost (S)", value: `₱${globalOrderCost.toFixed(2)} / batch` },
            { label: "Avg Unit Cost (C)", value: `₱${avgUnitCost.toFixed(2)}` },
            { label: "Carrying Rate (I)", value: `${Math.round(holdingRateSetting * 100)}%` },
            { label: "Holding Cost (H = C × I)", value: `₱${globalHoldingCost.toFixed(2)} / unit / yr` },
          ]}
          trail={[
            `Numerator = 2 × ${Math.round(annualDemand).toLocaleString()} × ₱${globalOrderCost.toFixed(2)} = ${Math.round(eoqNumerator).toLocaleString()}`,
            `Ratio = ${Math.round(eoqNumerator).toLocaleString()} ÷ ₱${globalHoldingCost.toFixed(2)} = ${Math.round(eoqRatio).toLocaleString()}`,
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
      {showEoqSettingsModal && (
        <EoqSettingsModal
          orderCost={orderCostSetting}
          holdingPercent={Math.round(holdingRateSetting * 100)}
          leadTimeDays={leadTimeDaysSetting}
          safetyBufferPercent={safetyBufferSetting}
          onSave={handleSaveEoqSettings}
          onReset={handleResetEoqSettings}
          onClose={() => setShowEoqSettingsModal(false)}
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
