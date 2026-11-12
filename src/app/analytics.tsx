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
  parseExpiry, sortBatchesByExpiry,
  type Product, type Transaction,
} from "./data";
import { fmt, StockBadge, InfoTip, ConfirmDialog } from "./shared";
import { analyticsApi, purchaseOrdersApi, type PurchaseOrder, type SupplierPerformance } from "./api";

const ANALYTICS_CARD_CLASS = "rounded-2xl border border-border/70 bg-card shadow-sm";
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

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <section className={`${ANALYTICS_CARD_CLASS} min-w-0 p-4 sm:p-5`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-foreground" title={value}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </section>
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
            ) : smaLoading ? (
              <p className="mt-3 text-xs text-muted-foreground">Loading sales history to compare the estimates…</p>
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
  activeModel = "SMA-3",
  showBothModels = false,
  periodUnit = "month",
}: {
  history: { month: string; demand: number; sma3?: number | null; sma6?: number | null }[];
  nextPeriod: string;
  sma3: number;
  sma6: number;
  activeModel?: "SMA-3" | "SMA-6";
  showBothModels?: boolean;
  periodUnit?: "month" | "week";
}) {
  const bestNextVal = activeModel === "SMA-6" ? Math.round(sma6) : Math.round(sma3);
  const data = [
    ...history.map((point, idx) => {
      const s3 = point.sma3 != null ? Math.round(point.sma3) : null;
      const s6 = point.sma6 != null ? Math.round(point.sma6) : null;
      const bestPast = activeModel === "SMA-6" ? (s6 ?? s3) : (s3 ?? s6);
      // Connect the last recorded actual point smoothly to next month's forecast
      const isLast = idx === history.length - 1;
      return {
        month: point.month,
        actual: point.demand,
        smartFit: bestPast ?? (isLast ? point.demand : null),
        sma3Forecast: s3,
        sma6Forecast: s6,
      };
    }),
    {
      month: nextPeriod,
      actual: null,
      smartFit: bestNextVal,
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
              const label = name === "actual"
                ? "Recorded sales"
                : name === "smartFit"
                  ? `Best-Fit Forecast (${activeModel})`
                  : name === "sma3Forecast"
                    ? "SMA-3 (Fast 3-mo)"
                    : "SMA-6 (Steady 6-mo)";
              return [`${Number(value).toLocaleString()} units`, label];
            }}
            labelFormatter={label => `${label}${label === nextPeriod ? ` · Projected ${periodUnit === "week" ? "week" : "month"}` : " · Historical performance"}`}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11, color: "var(--foreground)" }}
          />
          <ReferenceLine x={nextPeriod} stroke="var(--border)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="actual" name="actual" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3.5, fill: "#2563eb" }} activeDot={{ r: 5.5 }} connectNulls={false} isAnimationActive={false} />
          {!showBothModels ? (
            <Line
              type="monotone"
              dataKey="smartFit"
              name="smartFit"
              stroke="#0d9488"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: { month?: string } }) =>
                props.cx != null && props.cy != null ? (
                  <circle
                    key={`smartfit-dot-${props.payload?.month}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={props.payload?.month === nextPeriod ? 6 : 3}
                    fill="#0d9488"
                    stroke="var(--card)"
                    strokeWidth={props.payload?.month === nextPeriod ? 2 : 1}
                  />
                ) : <g key={`smartfit-empty-${props.payload?.month}`} />
              }
              activeDot={{ r: 6.5 }}
              connectNulls={true}
            />
          ) : (
            <>
              <Line
                type="monotone"
                dataKey="sma3Forecast"
                name="sma3Forecast"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="6 4"
                isAnimationActive={false}
                dot={{ r: 3, fill: "#f97316" }}
                activeDot={{ r: 5.5 }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="sma6Forecast"
                name="sma6Forecast"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="3 4"
                isAnimationActive={false}
                dot={{ r: 3, fill: "#8b5cf6" }}
                activeDot={{ r: 5.5 }}
                connectNulls={true}
              />
            </>
          )}
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
      <button type="button" aria-label="Close math details" className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="calc-inspector-title" className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[84vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 id="calc-inspector-title" className="text-sm font-semibold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted cursor-pointer">
            <X size={16} />
          </button>
        </div>
        {/* Formula */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Formula</p>
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
            <p className="text-[10px] font-semibold text-foreground mb-1">In plain language</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{explanation}</p>
          </div>
        )}
        {/* Variables */}
        <div className="px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Values used</p>
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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Steps</p>
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
    leadTimeDays: number;
    safetyBufferPercent: number;
    totalSold: number;
    demandSourceLabel: string;
    costSourceLabel: string;
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
  const unitsPerPack = Math.max(1, product.unitsPerPack ?? 1);
  const effectivePacks = unitsPerPack > 1 ? Math.ceil(effectiveQty / unitsPerPack) : null;
  const suggestedRop = Math.max(1, Math.round((annualDemand / 365) * leadTimeDays * (1 + safetyBufferPercent / 100)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close math details" onClick={onClose} className="fixed inset-0 bg-black/30" />
      <div role="dialog" aria-modal="true" aria-labelledby="restock-math-title" className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 id="restock-math-title" className="truncate text-sm font-semibold text-foreground">Show Math · {product.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{product.category}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5 text-sm">
          <div>
            <p className="font-medium text-foreground">Economic Order Quantity (EOQ)</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">This is a suggested order size that balances order-placement and stock-holding costs. Review it before placing an order.</p>
            <p className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-center font-mono text-xs text-foreground">EOQ = √(2 × D × S ÷ H)</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
              <p className="text-muted-foreground">D · Expected yearly demand <strong className="text-foreground">{annualDemand.toLocaleString()} units</strong></p>
              <p className="text-muted-foreground sm:col-span-2">Demand source <strong className="text-foreground">{demandSourceLabel}</strong></p>
              <p className="text-muted-foreground">S · Cost to place an order <strong className="text-foreground">{fmt(orderCost)}</strong></p>
              <p className="text-muted-foreground">H · Yearly holding cost/unit <strong className="text-foreground">{fmt(holdingCost)}</strong></p>
              <p className="text-muted-foreground">Unit cost <strong className="text-foreground">{fmt(unitCost)}</strong></p>
              <p className="text-muted-foreground sm:col-span-2">Cost source <strong className="text-foreground">{costSourceLabel}</strong></p>
            </div>
            <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>1. 2 × {annualDemand.toLocaleString()} × {fmt(orderCost)} = <strong className="text-foreground">{numerator.toLocaleString()}</strong></li>
              <li>2. {numerator.toLocaleString()} ÷ {fmt(holdingCost)} = <strong className="text-foreground">{Math.round(ratio).toLocaleString()}</strong></li>
              <li>3. √{Math.round(ratio).toLocaleString()} = <strong className="text-foreground">{rawEoq.toLocaleString()} units</strong></li>
            </ol>
            <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-semibold text-foreground">
              Suggested order: {eoq.toLocaleString()} units
              {eoq > rawEoq && <span className="block text-xs font-normal text-muted-foreground">Raised to meet the configured minimum of {getReorderUnits(product).toLocaleString()} units.</span>}
            </p>
          </div>

          <div className="border-t border-border/60 pt-4">
            <p className="font-medium text-foreground">Restock point (ROP)</p>
            <p className="mt-1 text-xs text-muted-foreground">Restock when stock reaches the estimated demand during supplier lead time, plus the configured buffer.</p>
            <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-center font-mono text-xs text-foreground">ROP = (D ÷ 365 × {leadTimeDays} days) × (1 + {safetyBufferPercent}% buffer)</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Calculation: ({annualDemand.toLocaleString()} ÷ 365 × {leadTimeDays}) × (1 + {safetyBufferPercent}%) = <strong className="text-foreground">{suggestedRop.toLocaleString()} units</strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Current stock: {product.stock.toLocaleString()} units{shortage > 0 ? ` · ${shortage.toLocaleString()} below minimum` : ""}</p>
          </div>

          {onSetOverrideQty && (
            <div className="border-t border-border/60 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="planned-order-qty" className="text-xs font-medium text-foreground">Your order quantity</label>
                <input
                  id="planned-order-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={customQtyInput}
                  onChange={event => setCustomQtyInput(event.target.value)}
                  className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsed = Math.max(1, Math.round(Number(customQtyInput) || eoq));
                    setCustomQtyInput(String(parsed));
                    onSetOverrideQty(product.id, parsed === eoq ? null : parsed);
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Apply
                </button>
                {unitsPerPack > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const roundedUnits = Math.max(1, Math.ceil(effectiveQty / unitsPerPack)) * unitsPerPack;
                      setCustomQtyInput(String(roundedUnits));
                      onSetOverrideQty(product.id, roundedUnits === eoq ? null : roundedUnits);
                    }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Round to {unitsPerPack}-unit pack
                  </button>
                )}
                {overrideQty != null && (
                  <button type="button" onClick={() => { setCustomQtyInput(String(eoq)); onSetOverrideQty(product.id, null); }} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                    Reset
                  </button>
                )}
              </div>
              {effectivePacks != null && <p className="mt-1.5 text-xs text-muted-foreground">{effectivePacks} packs · estimated cost {fmt(effectiveQty * unitCost)}. The recommendation does not place an order.</p>}
            </div>
          )}
        </div>

        {onReorder && (
          <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" onClick={() => { onClose(); onReorder(product); }} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
              Edit medicine
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function EoqSettingsModal({
  orderCost,
  holdingPercent,
  leadTimeDays,
  safetyBufferPercent,
  smartRecs,
  onSave,
  onReset,
  onClose,
}: {
  orderCost: number;
  holdingPercent: number;
  leadTimeDays: number;
  safetyBufferPercent: number;
  smartRecs: {
    hasEmpiricalData: boolean;
    recommendedLeadDays: number;
    recommendedSafetyBuffer: number;
    benchmarkOrderCost: number;
    benchmarkHoldingRate: number;
    totalReceiptsCount: number;
    fulfillmentPct: number;
    supplierBreakdown: { name: string; leadDays: number; receipts: number; fulfillment: number }[];
  };
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

  const isSmartAuto =
    Number(formOrderCost) === smartRecs.benchmarkOrderCost &&
    Number(formHoldingPercent) === smartRecs.benchmarkHoldingRate &&
    Number(formLeadTimeDays) === smartRecs.recommendedLeadDays &&
    Number(formSafetyBuffer) === smartRecs.recommendedSafetyBuffer;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cost = Math.max(1, parseFloat(formOrderCost) || 120);
    const hold = Math.min(100, Math.max(1, parseFloat(formHoldingPercent) || 20));
    const lead = Math.min(90, Math.max(1, Math.round(parseFloat(formLeadTimeDays) || smartRecs.recommendedLeadDays)));
    const buffer = Math.min(200, Math.max(0, Math.round(parseFloat(formSafetyBuffer) || smartRecs.recommendedSafetyBuffer)));
    onSave(cost, hold, lead, buffer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="restock-settings-title" className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="restock-settings-title" className="text-base font-semibold text-foreground">Restocking settings</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                isSmartAuto
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-border bg-muted/50 text-muted-foreground"
              }`}>
                {isSmartAuto ? "Suggested values" : "Custom values"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Set the costs and delivery timing used to estimate when and how much to reorder.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close restocking settings" className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-5">
          <section className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">Suggested starting values</h4>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  {smartRecs.hasEmpiricalData
                    ? `Average delivery time is based on ${smartRecs.totalReceiptsCount} recorded supplier deliveries (${smartRecs.recommendedLeadDays} days). Order cost and holding rate are editable starting estimates.`
                    : "No supplier delivery history is available yet. These values are editable starting points—adjust them to match your suppliers and costs."}
                </p>
              </div>
              {!isSmartAuto && (
                <button
                  type="button"
                  onClick={() => applyPreset(smartRecs.benchmarkOrderCost, smartRecs.benchmarkHoldingRate, smartRecs.recommendedLeadDays, smartRecs.recommendedSafetyBuffer)}
                  className="inline-flex shrink-0 items-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  Use suggested values
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Delivery time (L)</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{smartRecs.recommendedLeadDays} days</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{smartRecs.hasEmpiricalData ? "Supplier history" : "Starting value"}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Safety buffer (SS)</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">+{smartRecs.recommendedSafetyBuffer}%</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Extra stock cushion</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Order cost (S)</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">₱{smartRecs.benchmarkOrderCost}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Freight + processing</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Holding rate (I)</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{smartRecs.benchmarkHoldingRate}% / year</p>
                <p className="mt-1 text-[10px] text-muted-foreground">A/C + storage + risk</p>
              </div>
            </div>

            {smartRecs.supplierBreakdown && smartRecs.supplierBreakdown.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Recorded distributor lead times:</span>
                {smartRecs.supplierBreakdown.map(s => (
                  <span key={s.name} className="tabular-nums">
                    <strong className="text-foreground">{s.name.replace(/ (Corporation|\(Unilab\)|Inc\.|Supplies|Distributors|Traders|Pharma)/g, "")}</strong>: {s.leadDays.toFixed(1)}d ({s.receipts} receipts)
                  </span>
                ))}
              </div>
            )}
          </section>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">Quick presets</h4>
              <span className="text-[11px] text-muted-foreground">Examples to start from; review before saving.</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                {
                  name: "Nearby supplier",
                  desc: "Shorter delivery · lower order cost",
                  cost: 60,
                  hold: 15,
                  lead: 3,
                  buffer: 15,
                },
                {
                  name: "Standard order",
                  desc: "General-purpose starting point",
                  cost: 120,
                  hold: 20,
                  lead: smartRecs.recommendedLeadDays,
                  buffer: smartRecs.recommendedSafetyBuffer,
                },
                {
                  name: "Long-distance supplier",
                  desc: "Longer delivery · larger buffer",
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
                    aria-pressed={isSelected}
                    onClick={() => applyPreset(preset.cost, preset.hold, preset.lead, preset.buffer)}
                    className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      isSelected
                        ? "border-primary/50 bg-primary/[0.06]"
                        : "border-border bg-background hover:bg-muted/50"
                    }`}
                  >
                    <span className="block text-xs font-semibold text-foreground">{preset.name}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{preset.desc}</span>
                    <span className="mt-2 block text-[10px] font-medium tabular-nums text-muted-foreground">
                      ₱{preset.cost} / order · {preset.hold}% / yr · {preset.lead} days · +{preset.buffer}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="restock-order-cost" className="text-xs font-semibold text-foreground">
                  Order cost S
                </label>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono font-medium text-primary">
                  Drives EOQ batch size
                </span>
              </div>
              <input
                id="restock-order-cost"
                type="number"
                step="any"
                min="1"
                value={formOrderCost}
                onChange={e => setFormOrderCost(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Tangub benchmark (₱120): ₱90 regional courier + ₱30 clerical PO processing.
              </span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="restock-holding-rate" className="text-xs font-semibold text-foreground">
                  Annual holding rate I
                </label>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono font-medium text-primary">
                  Drives EOQ holding penalty
                </span>
              </div>
              <input
                id="restock-holding-rate"
                type="number"
                step="any"
                min="1"
                max="100"
                value={formHoldingPercent}
                onChange={e => setFormHoldingPercent(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Pharmacy carrying cost (20%/yr): 8% A/C climate control + 6% capital + 6% expiry risk.
              </span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="restock-lead-time" className="text-xs font-semibold text-foreground">
                  Supplier delivery time L
                </label>
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono font-medium text-amber-600 dark:text-amber-400">
                  Drives ROP reorder day
                </span>
              </div>
              <input
                id="restock-lead-time"
                type="number"
                step="1"
                min="1"
                max="90"
                value={formLeadTimeDays}
                onChange={e => setFormLeadTimeDays(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Empirical average from {smartRecs.totalReceiptsCount} deliveries: {smartRecs.recommendedLeadDays} days from PO to receipt.
              </span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="restock-safety-buffer" className="mb-1 text-xs font-semibold text-foreground">
                  Safety stock buffer SS
                </label>
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono font-medium text-amber-600 dark:text-amber-400">
                  Drives ROP safety cushion
                </span>
              </div>
              <input
                id="restock-safety-buffer"
                type="number"
                step="1"
                min="0"
                max="200"
                value={formSafetyBuffer}
                onChange={e => setFormSafetyBuffer(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Extra stock cushion calibrated to current supplier delivery reliability ({smartRecs.fulfillmentPct}% on-time).
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => {
                onReset();
                onClose();
              }}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <RotateCcw size={14} />
              Reset to suggested defaults
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              Save changes
            </button>
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
  showToast,
}: {
  inventory: Product[];
  transactions: Transaction[];
  userRoles: string[];
  onEditProduct?: (product: Product) => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
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
  const [showChartModelComparison, setShowChartModelComparison] = useState(false);
  const [selectedSmaProductId, setSelectedSmaProductId] = useState<string | null>(null);

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
      .filter(point => point.sma3 != null && point.sma6 != null)
      .map(point => ({ actual: point.demand, sma3: point.sma3 ?? 0, sma6: point.sma6 ?? 0 }));
    if (comparable.length < 1) return null;
    const sma3Score = computeSmape(comparable.map(point => ({ actual: point.actual, forecast: point.sma3 })));
    const sma6Score = computeSmape(comparable.map(point => ({ actual: point.actual, forecast: point.sma6 })));
    if (!sma3Score || !sma6Score) return null;
    const model = sma3Score.smape <= sma6Score.smape ? ("SMA-3" as const) : ("SMA-6" as const);
    const selected = model === "SMA-3" ? sma3Score : sma6Score;
    return {
      model,
      smape: selected.smape,
      points: selected.points,
      comparison: {
        sma3: sma3Score.smape,
        sma6: sma6Score.smape,
      },
    };
  }, [smaChartData]);

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
      recent6Periods: { label: string; qty: number }[];
      confidenceTier: "high" | "short" | "intermittent" | "insufficient";
      confidenceLabel: string;
      trendDirection: "rising" | "steady" | "slowing" | "none";
      trendPercent: number;
      incomingQty: number;
      daysOfSupply: number | null;
      projectedShortfall: number;
    }>();

    inventory.forEach(p => {
      const pid = String(p.id);
      const prodSales = parsedSales.filter(s => s.productId === pid);
      const totalSold = prodSales.reduce((sum, s) => sum + s.qty, 0);

      // Monthly series from product's active recorded sales months
      const monthTotals = new Map<string, number>();
      const monthLabelsMap = new Map<string, string>();
      prodSales.forEach(s => {
        monthTotals.set(s.monthKey, (monthTotals.get(s.monthKey) ?? 0) + s.qty);
        monthLabelsMap.set(s.monthKey, s.monthLabel);
      });
      const activeMonthWindow = Array.from(monthTotals.keys()).sort();
      const monthlySeries = activeMonthWindow.map(mk => monthTotals.get(mk) ?? 0);
      const monthlySma3 = computeSMA(monthlySeries, 3);
      const monthlySma6 = computeSMA(monthlySeries, 6);

      // Active display period series (monthly or weekly)
      let displaySeries: { label: string; qty: number }[] = [];
      if (forecastPeriodUnit === "month") {
        displaySeries = activeMonthWindow.map(mk => ({
          label: monthLabelsMap.get(mk) ?? mk,
          qty: monthTotals.get(mk) ?? 0,
        }));
      } else {
        const weekCounts = periodKeys.map(pk => {
          const qty = prodSales
            .filter(s => pk.start && pk.end && s.date >= pk.start && s.date <= pk.end)
            .reduce((sum, s) => sum + s.qty, 0);
          return { label: pk.label, qty };
        });
        displaySeries = weekCounts.filter(w => w.qty > 0);
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
        recent6Periods: displaySeries.slice(-6),
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

  const activeForecastModel = selectedForecast?.model ?? "SMA-3";
  const activeForecastUnits = activeForecastModel === "SMA-3" ? forecastSMA3 : forecastSMA6;

  // ── EOQ & ROP Configurable Parameters + Automated Best-Fit Demand Basis ──
  const demandBasis: "auto" | "sma3" | "sma6" | "historical" = "auto";

  // Automated SmartTrack recommendations calculated empirically from live delivery receipts
  const smartOperationalRecommendations = useMemo(() => {
    const suppliersWithLead = supplierPerformance.filter(s => s.avgLeadDays != null && s.avgLeadDays > 0);
    const totalReceiptsCount = suppliersWithLead.reduce((sum, s) => sum + (s.receiptCount ?? 1), 0);
    const weightedLead = suppliersWithLead.reduce((sum, s) => sum + (s.avgLeadDays! * (s.receiptCount ?? 1)), 0);
    const measuredLead = totalReceiptsCount > 0 ? Math.round(weightedLead / totalReceiptsCount) : 5;

    const totalOrdered = supplierPerformance.reduce((sum, s) => sum + s.qtyOrdered, 0);
    const totalFulfilled = supplierPerformance.reduce((sum, s) => sum + s.qtyFulfilled, 0);
    const fulfillmentPct = totalOrdered > 0 ? (totalFulfilled / totalOrdered) * 100 : 98;

    // Adaptive safety buffer: 20% standard when fulfillment >= 95%, 25% if 85-94%, 30% if < 85%
    const recommendedBuffer = fulfillmentPct >= 95 ? 20 : fulfillmentPct >= 85 ? 25 : 30;

    return {
      hasEmpiricalData: suppliersWithLead.length > 0,
      recommendedLeadDays: Math.max(1, measuredLead || 5),
      recommendedSafetyBuffer: recommendedBuffer,
      benchmarkOrderCost: 120, // Tangub courier fee + administrative processing
      benchmarkHoldingRate: 20, // 20% annual carrying rate for air-conditioned pharmacy inventory
      totalReceiptsCount,
      fulfillmentPct: Math.round(fulfillmentPct),
      supplierBreakdown: suppliersWithLead.map(s => ({
        name: s.supplier,
        leadDays: s.avgLeadDays!,
        receipts: s.receiptCount ?? 0,
        fulfillment: s.fulfillmentRate ?? 100,
      })),
    };
  }, [supplierPerformance]);

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
      return saved ? Math.min(90, Math.max(1, Math.round(parseFloat(saved) || 5))) : 5;
    } catch { return 5; }
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
    showToast?.(qty == null ? "Restored EOQ suggested order quantity" : `Custom order quantity (${Math.round(qty)} units) applied`, "info");
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
    showToast?.(`Updated EOQ & ROP parameters (₱${cost} · ${holdPercent}% · ${leadDays}d · +${safetyBuf}%)`, "success");
  };

  const handleResetEoqSettings = () => {
    const lead = smartOperationalRecommendations.recommendedLeadDays;
    const buffer = smartOperationalRecommendations.recommendedSafetyBuffer;
    setOrderCostSetting(120);
    setHoldingRateSetting(0.20);
    setLeadTimeDaysSetting(lead);
    setSafetyBufferSetting(buffer);
    try {
      localStorage.removeItem("smarttrack_eoq_order_cost");
      localStorage.removeItem("smarttrack_eoq_holding_rate");
      localStorage.removeItem("smarttrack_eoq_lead_time");
      localStorage.removeItem("smarttrack_eoq_safety_buffer");
    } catch { /* ignore */ }
    showToast?.(`Reset parameters to Smart Defaults (₱120 · 20% · ${lead}d · +${buffer}%)`, "info");
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
      const msg = `Purchase Order created for ${qtyOrdered.toLocaleString()} units of ${poDraftModal.product.name} (${supplierName}).`;
      setPoBannerMessage({ type: "success", text: msg });
      showToast?.(msg, "success");
      setPoDraftModal(null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Could not create purchase order.";
      setPoBannerMessage({ type: "error", text: errMsg });
      showToast?.(errMsg, "error");
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
      .map(p => {
        const pf = productForecastMap.get(String(p.id));
        const totalSold = pf?.totalSold ?? transactions.filter(t => t.type === "sale" && t.productId === p.id).reduce((s, t) => s + t.qty, 0);
        const monthlySma3 = pf?.monthlySma3 ?? 0;
        const monthlySma6 = pf?.monthlySma6 ?? 0;
        const histMonthly = totalSold / storeMonths;
        const minReorderUnits = getReorderUnits(p);

        let monthlyDemandUnits = 1;
        let annualProductDemand = 12;
        let isDemandFallback = false;
        let demandSourceLabel = "";
        let demandSourceShort = "";

        if (totalSold === 0) {
          isDemandFallback = true;
          monthlyDemandUnits = Math.max(1, Math.round(minReorderUnits / 2));
          annualProductDemand = monthlyDemandUnits * 12;
          demandSourceLabel = `No sales history yet — estimated from minimum stock threshold (${monthlyDemandUnits.toLocaleString()} units/month × 12 months = ${annualProductDemand.toLocaleString()} units/year)`;
          demandSourceShort = "No sales yet · Min stock baseline";
        } else {
          // SmartTrack auto-selected model per medicine
          const recModel = pf?.recommendedModel ?? "SMA-3";
          const chosenModel: "SMA-3" | "SMA-6" = recModel === "SMA-6" && monthlySma6 > 0 ? "SMA-6" : "SMA-3";
          const rawMonthly = chosenModel === "SMA-6" ? monthlySma6 : (monthlySma3 > 0 ? monthlySma3 : histMonthly);
          monthlyDemandUnits = Math.max(1, Math.round(rawMonthly));
          annualProductDemand = monthlyDemandUnits * 12;
          demandSourceLabel = `Auto-selected ${chosenModel} forecast (${monthlyDemandUnits.toLocaleString()} units/month × 12 months = ${annualProductDemand.toLocaleString()} units/year)`;
          demandSourceShort = `Auto: ${chosenModel} Forecast`;
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
        const packSize = Math.max(1, p.unitsPerPack ?? 1);
        const packsNeeded = Math.max(1, Math.ceil(productEOQ / packSize));
        const eoq = packsNeeded * packSize;
        const suggestedRop = Math.max(
          1,
          Math.round((annualProductDemand / 365) * leadTimeDaysSetting * (1 + safetyBufferSetting / 100))
        );
        const effectiveRop = isDemandFallback ? minReorderUnits : Math.max(suggestedRop, minReorderUnits);
        const shortage = Math.max(0, effectiveRop - p.stock);
        const recommendedUnits = Math.max(eoq, Math.ceil(shortage / packSize) * packSize);
        const overrideQty = eoqOverrides[p.id] ?? null;
        const effectiveOrderQty = overrideQty ?? recommendedUnits;
        const monthlyBurn = annualProductDemand / 12;
        const fifoSellThroughMonths = monthlyBurn > 0 ? effectiveOrderQty / monthlyBurn : null;

        // An item genuinely needs restocking if out of stock, stock <= dynamic ROP, or below minimum threshold
        const needsRestock =
          p.stock <= 0 ||
          p.status === "out_of_stock" ||
          p.stock <= suggestedRop ||
          (isDemandFallback && p.stock <= minReorderUnits) ||
          ((p.status === "critical" || p.status === "low") && p.stock <= effectiveRop);

        return {
          product: p,
          rawEoq: productEOQ,
          eoq,
          overrideQty,
          effectiveOrderQty,
          fifoSellThroughMonths,
          suggestedRop,
          effectiveRop,
          totalSold,
          shortage,
          annualDemand: Math.round(annualProductDemand),
          unitCost: productUnitCost,
          orderCost,
          holdingCost,
          holdingPercent,
          leadTimeDays: leadTimeDaysSetting,
          safetyBufferPercent: safetyBufferSetting,
          isDemandFallback,
          demandSourceLabel,
          demandSourceShort,
          isCostEstimated,
          costSourceLabel,
          needsRestock,
        };
      })
      .filter(rec => rec.needsRestock)
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
    showToast?.("Analytics dataset exported to CSV", "success");
  };

  const [confirmExportCsv, setConfirmExportCsv] = useState(false);

  // ── Progressive Disclosure (L0–L3) & Glass-Box Audit State ───────────────────
  const [auditMode, setAuditMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("smarttrack_analytics_audit_mode") === "true";
    } catch { return false; }
  });
  const toggleAuditMode = () => {
    setAuditMode(prev => {
      const next = !prev;
      try { localStorage.setItem("smarttrack_analytics_audit_mode", String(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const [, setGlassBoxRecord] = useState<unknown>(null);
  const [statusBucketFilter, setStatusBucketFilter] = useState<
    "actionable" | "out_of_stock" | "will_run_out" | "reorder_now" | "reorder_soon" | "expiry_risk" | "overstock" | "dead_non_moving" | "healthy"
  >("actionable");
  const [radarSearch, setRadarSearch] = useState("");
  const [radarPage, setRadarPage] = useState(1);
  const RADAR_PAGE_SIZE = 6;

  // ── Deterministic L0–L3 Executive Snapshot & Status Ladder Engine ────────────
  const executiveSnapshot = useMemo(() => {
    const L = leadTimeDaysSetting;
    const nowMs = Date.now();
    const recMap = new Map(reorderRecs.map(r => [String(r.product.id), r]));

    const skuRows = scopedInventory.map(p => {
      const pid = String(p.id);
      const pf = productForecastMap.get(pid);
      const rec = recMap.get(pid);
      const kStar = pf?.recommendedModel ?? "SMA-3";
      const sma3 = pf?.monthlySma3 ?? 0;
      const sma6 = pf?.monthlySma6 ?? 0;
      const champMonthly = kStar === "SMA-6" && sma6 > 0 ? sma6 : (sma3 > 0 ? sma3 : (pf?.monthlyEquivalentForecast ?? 0));
      const d = champMonthly / 30.4;
      const ltd = d * L;
      const minThreshold = getReorderUnits(p);
      const ss = Math.max(minThreshold * 0.25, ltd * (safetyBufferSetting / 100));
      const rop = rec?.suggestedRop ?? Math.max(minThreshold, Math.round(ltd + ss));

      const batchesWithCost = p.batches.filter(b => b.unitCost != null && b.unitCost > 0);
      const costUnits = batchesWithCost.reduce((s, b) => s + b.qty, 0);
      const unitCost = rec?.unitCost ?? (costUnits > 0
        ? batchesWithCost.reduce((s, b) => s + (b.unitCost ?? 0) * b.qty, 0) / costUnits
        : (p.price > 0 ? p.price * 0.7 : 5));

      const annualD = champMonthly > 0 ? champMonthly * 12 : Math.max(10, minThreshold * 6);
      const rawQ = estimateEOQ(Math.round(annualD), unitCost, orderCostSetting, holdingRateSetting);
      const packSize = Math.max(1, p.unitsPerPack ?? 1);
      const qStar = rec?.effectiveOrderQty ?? (Math.ceil(Math.max(rawQ, minThreshold) / packSize) * packSize);

      const onHand = p.stock;
      const onOrder = pf?.incomingQty ?? 0;
      const ip = onHand + onOrder;
      const sMax = champMonthly > 0 ? Math.round(ss + qStar) : minThreshold * 2;
      const runway = d > 0.01 ? onHand / d : (onHand > 0 ? 999 : 0);
      const dailyRevAtRisk = (d > 0.01 ? d : minThreshold / 30.4) * p.price;

      // FEFO Batch Expiry Simulation (within 180 days)
      const sortedBatches = sortBatchesByExpiry(p.batches);
      let cumSold = 0;
      let skuExpiryUnits = 0;
      let skuExpiryValue = 0;
      let skuExpiryBatchCount = 0;
      let earliestDaysToExpiry: number | null = null;
      sortedBatches.forEach(b => {
        if (!b.expiry || b.expiry === "—" || b.qty <= 0) return;
        const expDate = parseExpiry(b.expiry);
        if (Number.isNaN(expDate.getTime())) return;
        const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - nowMs) / 86400000));
        if (earliestDaysToExpiry === null || daysLeft < earliestDaysToExpiry) {
          earliestDaysToExpiry = daysLeft;
        }
        if (daysLeft <= 180) {
          const demandBeforeExp = d * daysLeft;
          const availDemand = Math.max(0, demandBeforeExp - cumSold);
          const soldFromBatch = Math.min(b.qty, availDemand);
          const atRiskQty = Math.max(0, Math.round(b.qty - soldFromBatch));
          cumSold += soldFromBatch;
          if (atRiskQty > 0) {
            skuExpiryUnits += atRiskQty;
            skuExpiryValue += atRiskQty * (b.unitCost ?? unitCost);
            skuExpiryBatchCount += 1;
          }
        } else {
          cumSold += b.qty;
        }
      });

      // Excess stock above steady-state maximum S_max = SS + Q*
      const excessUnits = onHand > Math.round(1.2 * sMax) && sMax > 0 ? Math.max(0, onHand - sMax) : 0;
      const excessValue = excessUnits * unitCost;

      // Mutually Exclusive 8-Tier Status Ladder (Evaluated Top-Down)
      let bucket:
        | "out_of_stock"
        | "will_run_out"
        | "reorder_now"
        | "reorder_soon"
        | "dead_stock"
        | "non_moving"
        | "overstock"
        | "healthy" = "healthy";
      let bucketLabel = "Healthy";
      let bucketTone = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25";
      let ownerReading = `Healthy stock cover (${runway >= 900 ? "90+" : Math.round(runway)} days)`;
      let priorityRank = 8;

      if (onHand === 0 && (champMonthly > 0 || p.status === "out_of_stock")) {
        bucket = "out_of_stock";
        bucketLabel = "Out of Stock";
        bucketTone = "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
        ownerReading = `Out of stock · ≈ ${fmt(dailyRevAtRisk)}/day lost — order ${qStar.toLocaleString()}u`;
        priorityRank = 1;
      } else if (onHand > 0 && ((d > 0.01 && runway < L && onOrder === 0) || p.status === "critical")) {
        bucket = "will_run_out";
        bucketLabel = "Will Run Out First";
        bucketTone = "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
        const daysStr = runway < 90 ? `${Math.max(1, Math.round(runway))}d` : `<${L}d`;
        ownerReading = `Empty in ~${daysStr}; supplier needs ${L}d — order ${qStar.toLocaleString()}u today`;
        priorityRank = 2;
      } else if (ip <= rop || p.status === "low") {
        bucket = "reorder_now";
        bucketLabel = "Reorder Now";
        bucketTone = "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30";
        ownerReading = `Inventory position (${ip}) ≤ ROP (${rop}) — order ${qStar.toLocaleString()}u today`;
        priorityRank = 3;
      } else if (d > 0.01 && ip > rop && ip <= rop + Math.ceil(7 * d)) {
        bucket = "reorder_soon";
        bucketLabel = "Reorder Soon";
        bucketTone = "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/30";
        ownerReading = `Order this week (~${Math.round(runway)}d cover left vs ${L}d lead time)`;
        priorityRank = 4;
      } else if (onHand > 0 && sma6 === 0 && (pf?.totalSold ?? 0) === 0) {
        bucket = "dead_stock";
        bucketLabel = "Dead Stock";
        bucketTone = "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
        ownerReading = `No recorded sales in 6 months (${fmt(onHand * unitCost)} tied up)`;
        priorityRank = 5;
      } else if (onHand > 0 && sma3 === 0) {
        bucket = "non_moving";
        bucketLabel = "Non-Moving";
        bucketTone = "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
        ownerReading = `No sales in latest 3 months (${onHand.toLocaleString()}u sitting idle)`;
        priorityRank = 6;
      } else if (excessUnits > 0) {
        bucket = "overstock";
        bucketLabel = "Overstock";
        bucketTone = "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
        ownerReading = `${fmt(excessValue)} above model ceiling (${excessUnits.toLocaleString()} excess units)`;
        priorityRank = 7;
      }

      // Trend crossover signal (SMA-3 ÷ SMA-6)
      const crossoverRatio = sma6 > 0 ? sma3 / sma6 : 1;
      const trendSignal: "up" | "down" | "flat" =
        crossoverRatio >= 1.15 ? "up" : crossoverRatio <= 0.85 ? "down" : "flat";
      const trendPct = sma6 > 0 ? Math.round((crossoverRatio - 1) * 100) : (pf?.trendPercent ?? 0);

      return {
        product: p,
        rec,
        kStar,
        sma3,
        sma6,
        champMonthly,
        d,
        L,
        ltd,
        ss,
        rop,
        annualD,
        unitCost,
        qStar,
        onHand,
        onOrder,
        ip,
        sMax,
        runway,
        dailyRevAtRisk,
        skuExpiryUnits,
        skuExpiryValue,
        skuExpiryBatchCount,
        earliestDaysToExpiry,
        excessUnits,
        excessValue,
        bucket,
        bucketLabel,
        bucketTone,
        ownerReading,
        priorityRank,
        trendSignal,
        trendPct,
        confidenceTier: pf?.confidenceTier ?? "insufficient",
        confidenceLabel: pf?.confidenceLabel ?? "No Sales History",
        totalSold: pf?.totalSold ?? 0,
      };
    });

    // 1. Stockout Risk Card
    const stockoutRiskSkus = skuRows.filter(r => r.bucket === "out_of_stock" || r.bucket === "will_run_out");
    const salesAtRiskPerDay = stockoutRiskSkus.reduce((s, r) => s + r.dailyRevAtRisk, 0);

    // 2. Today's Order List Card
    const supplierCount = new Set(
      reorderRecs.map(r => r.product.supplier?.trim() || "Primary Pharmacy Distributor")
    ).size;

    // 3. Stock Cover Card
    const totalOnHandCost = skuRows.reduce((s, r) => s + r.onHand * r.unitCost, 0);
    const dailyCogsBurn = skuRows.reduce(
      (s, r) => s + (r.d > 0.01 ? r.d : getReorderUnits(r.product) / 45) * r.unitCost,
      0
    );
    const stockCoverDays = dailyCogsBurn > 0 ? Math.round(totalOnHandCost / dailyCogsBurn) : 0;
    const steadyStateTargetCost = skuRows.reduce((s, r) => s + (r.ss + r.qStar / 2) * r.unitCost, 0);
    const targetCoverDays = dailyCogsBurn > 0 ? Math.max(14, Math.round(steadyStateTargetCost / dailyCogsBurn)) : 30;

    // 4. Cash in Excess Stock Card
    const idleExcessSkus = skuRows.filter(r => r.excessUnits > 0 || r.bucket === "dead_stock");
    const excessCashValue = skuRows.reduce(
      (s, r) => s + (r.bucket === "dead_stock" ? r.onHand * r.unitCost : r.excessValue),
      0
    );
    const excessSharePct = totalOnHandCost > 0 ? Math.min(100, Math.round((excessCashValue / totalOnHandCost) * 100)) : 0;

    // 5. Expiry Exposure Card
    const expiryRiskSkus = skuRows.filter(r => r.skuExpiryUnits > 0);
    const expiryExposureValue = expiryRiskSkus.reduce((s, r) => s + r.skuExpiryValue, 0);
    const expiryExposureUnits = expiryRiskSkus.reduce((s, r) => s + r.skuExpiryUnits, 0);
    const expiryExposureBatches = expiryRiskSkus.reduce((s, r) => s + r.skuExpiryBatchCount, 0);

    // Forecast Reliability Share (Sales value from High + Medium/Short confidence SKUs)
    const totalSalesValue = skuRows.reduce((s, r) => s + r.totalSold * r.product.price, 0);
    const reliableSalesValue = skuRows
      .filter(r => r.confidenceTier === "high" || r.confidenceTier === "short")
      .reduce((s, r) => s + r.totalSold * r.product.price, 0);
    const reliabilityPct = totalSalesValue > 0
      ? Math.round((reliableSalesValue / totalSalesValue) * 100)
      : (skuRows.filter(r => r.totalSold > 0).length > 0 ? 75 : 0);

    return {
      skuRows,
      stockoutRiskSkus,
      salesAtRiskPerDay,
      supplierCount,
      totalOnHandCost,
      dailyCogsBurn,
      stockCoverDays,
      steadyStateTargetCost,
      targetCoverDays,
      idleExcessSkus,
      excessCashValue,
      excessSharePct,
      expiryRiskSkus,
      expiryExposureValue,
      expiryExposureUnits,
      expiryExposureBatches,
      reliabilityPct,
      totalSalesValue,
      reliableSalesValue,
    };
  }, [
    scopedInventory,
    productForecastMap,
    reorderRecs,
    leadTimeDaysSetting,
    safetyBufferSetting,
    orderCostSetting,
    holdingRateSetting,
  ]);

  const filteredRadarRows = useMemo(() => {
    const q = radarSearch.trim().toLowerCase();
    return executiveSnapshot.skuRows
      .filter(row => {
        if (statusBucketFilter === "actionable") {
          if (row.bucket === "healthy" && row.skuExpiryUnits === 0) return false;
        } else if (statusBucketFilter === "out_of_stock") {
          if (row.bucket !== "out_of_stock") return false;
        } else if (statusBucketFilter === "will_run_out") {
          if (row.bucket !== "will_run_out") return false;
        } else if (statusBucketFilter === "reorder_now") {
          if (row.bucket !== "reorder_now") return false;
        } else if (statusBucketFilter === "reorder_soon") {
          if (row.bucket !== "reorder_soon") return false;
        } else if (statusBucketFilter === "expiry_risk") {
          if (row.skuExpiryUnits <= 0) return false;
        } else if (statusBucketFilter === "overstock") {
          if (row.bucket !== "overstock" && row.excessUnits <= 0) return false;
        } else if (statusBucketFilter === "dead_non_moving") {
          if (row.bucket !== "dead_stock" && row.bucket !== "non_moving") return false;
        } else if (statusBucketFilter === "healthy") {
          if (row.bucket !== "healthy") return false;
        }
        if (!q) return true;
        return (
          row.product.name.toLowerCase().includes(q) ||
          row.product.id.toLowerCase().includes(q) ||
          row.product.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
        return b.dailyRevAtRisk - a.dailyRevAtRisk;
      });
  }, [executiveSnapshot.skuRows, statusBucketFilter, radarSearch]);

  const paginatedRadarRows = useMemo(() => {
    const start = (radarPage - 1) * RADAR_PAGE_SIZE;
    return filteredRadarRows.slice(start, start + RADAR_PAGE_SIZE);
  }, [filteredRadarRows, radarPage]);

  const openSkuGlassBox = (row: (typeof executiveSnapshot.skuRows)[number]) => {
    setGlassBoxRecord({
      metric: `sku_replenishment_trace:${row.product.id}`,
      title: `${row.product.name} — Complete Replenishment & Forecast Trace`,
      display: {
        label: row.bucketLabel,
        value: row.bucket === "reorder_now" || row.bucket === "will_run_out" || row.bucket === "out_of_stock"
          ? `${row.qStar.toLocaleString()}`
          : `${row.onHand.toLocaleString()}`,
        unit: "units",
      },
      ownerSentence: `${row.product.name}: ${row.ownerReading}`,
      formula_id: "SKU_LADDER_v1",
      formulaDisplay: "d = SMA_k* ÷ 30.4  |  ROP = (d × L) + SS  |  Q* = √(2·D·S / H)  |  Runway = OH ÷ d",
      inputs: [
        { symbol: "SMA-3", label: "3-Month Moving Avg", value: `${row.sma3.toFixed(1)} u/mo` },
        { symbol: "SMA-6", label: "6-Month Moving Avg", value: `${row.sma6.toFixed(1)} u/mo` },
        { symbol: "k*", label: "Champion Model", value: row.kStar },
        { symbol: "d", label: "Daily Demand Rate", value: `${row.d.toFixed(2)} u/day` },
        { symbol: "L", label: "Supplier Lead Time", value: `${row.L} days` },
        { symbol: "SS", label: `Safety Stock (${safetyBufferSetting}% buf)`, value: `${row.ss.toFixed(1)} units` },
        { symbol: "ROP", label: "Reorder Point", value: `${row.rop} units` },
        { symbol: "IP", label: "Inventory Position (OH+PO)", value: `${row.onHand} + ${row.onOrder} = ${row.ip} u` },
        { symbol: "Q*", label: "Pack-Rounded EOQ", value: `${row.qStar} units` },
        { symbol: "S_max", label: "Steady-State Ceiling (SS+Q*)", value: `${row.sMax} units` },
      ],
      steps: [
        {
          label: "Daily burn rate from champion moving average",
          expr: `${row.champMonthly.toFixed(1)} u/mo ÷ 30.4 days`,
          result: `${row.d.toFixed(2)} units/day`,
        },
        {
          label: "Lead-time demand (LTD) & Safety Stock (SS)",
          expr: `(${row.d.toFixed(2)} × ${row.L}d) + ${row.ss.toFixed(1)} safety buffer`,
          result: `ROP = ${row.rop} units`,
        },
        {
          label: "Economic Order Quantity (EOQ)",
          expr: `√(2 × ${Math.round(row.annualD)} × ₱${orderCostSetting} ÷ ₱${(row.unitCost * holdingRateSetting).toFixed(2)})`,
          result: `Q* = ${row.qStar} units`,
        },
        {
          label: "Stock Runway vs Supplier Lead Time",
          expr: `${row.onHand} on-hand ÷ ${Math.max(0.01, row.d).toFixed(2)}/day`,
          result: `${row.runway >= 900 ? ">90" : row.runway.toFixed(1)} days (Bucket: ${row.bucketLabel})`,
        },
      ],
      citation: "Silver, Pyke & Thomas (2017) Inventory & Production Management; Syntetos, Boylan & Croston (2005) Demand Categorization; Springer & Whittaker (2020) Progressive Disclosure.",
    });
  };

  const sectionMeta: Record<string, { title: string; desc: string }> = {
    "Overview":   { title: "At a glance", desc: "Sales outlook and the medicines that may need attention." },
    "Forecast":   { title: "Expected sales", desc: `Simple moving-average estimates for ${nextForecastMonth}.` },
    "Restocking": { title: "Restock plan", desc: "Suggested order quantities based on demand and supplier lead time." },
    "Products":   { title: "Medicine performance", desc: "Past sales and next-month estimates by medicine." },
  };
  const sectionTabs = ["Overview", "Forecast", "Restocking", "Products"] as const;
  const topCategory = categoryData.reduce<(typeof categoryData)[number] | null>(
    (top, category) => !top || category.value > top.value ? category : top,
    null
  );

  // Top 5 urgent restocking items for Overview Action Radar
  const urgentRestocks = useMemo(() => {
    return [...reorderRecs]
      .sort((a, b) => {
        const aOut = a.product.stock === 0 ? 1 : 0;
        const bOut = b.product.stock === 0 ? 1 : 0;
        if (aOut !== bOut) return bOut - aOut;
        const aRatio = a.product.stock / Math.max(1, a.suggestedRop);
        const bRatio = b.product.stock / Math.max(1, b.suggestedRop);
        return aRatio - bRatio;
      })
      .slice(0, 5);
  }, [reorderRecs]);

  // Inventory velocity: Top 4 fast movers by units sold
  const topFastMovers = useMemo(() => {
    return [...productForecastList]
      .filter(p => p.totalSold > 0)
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 4);
  }, [productForecastList]);

  // Inventory velocity: 4 slow / idle items (high stock on hand, 0 recent sales)
  const slowMovingItems = useMemo(() => {
    return scopedInventory
      .filter(p => p.stock > 0 && (productForecastMap.get(String(p.id))?.totalSold ?? 0) === 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 4);
  }, [scopedInventory, productForecastMap]);

  // Status breakdown counts
  const outOfStockCount = reorderRecs.filter(r => r.product.status === "out_of_stock" || r.product.stock === 0).length;
  const criticalCount = reorderRecs.filter(r => r.product.status === "critical" || (r.product.stock > 0 && r.product.stock <= r.suggestedRop * 0.5)).length;
  const lowCount = Math.max(0, reorderRecs.length - outOfStockCount - criticalCount);

  // Month-over-month delta for demand forecast
  const demandDeltaPct = latestSalesMonth && latestSalesMonth.demand > 0
    ? Math.round(((activeForecastUnits - latestSalesMonth.demand) / latestSalesMonth.demand) * 100)
    : null;

  // Peak sales month from historical data
  const peakSalesMonth = useMemo(() => {
    if (!smaChartData || smaChartData.length === 0) return null;
    return smaChartData.reduce((max, item) => (item.demand > (max?.demand ?? 0) ? item : max), smaChartData[0]);
  }, [smaChartData]);

  // Average monthly sales across history
  const avgMonthlyDemand = useMemo(() => {
    if (!smaChartData || smaChartData.length === 0) return 0;
    const sum = smaChartData.reduce((acc, item) => acc + item.demand, 0);
    return Math.round(sum / smaChartData.length);
  }, [smaChartData]);

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
          <div className="flex items-center gap-2 flex-wrap">
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

      {/* Short section heading and scope control */}
      {(() => {
        const meta = sectionMeta[activeSection];
        const showScopeFilter = activeSection === "Overview" || activeSection === "Forecast";
        return (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{meta.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{meta.desc}</p>
            </div>
            {showScopeFilter && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={scope}
                  onChange={event => setScope(event.target.value)}
                  aria-label="Filter analytics by product or category"
                  className="app-select w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-56"
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
                    className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {activeSection === "Overview" && (
        <section className="space-y-6">
          {/* ── Row 1: 4 Rich Executive KPI Cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Card 1: Expected Demand */}
            <div className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expected Demand</span>
                  <button
                    type="button"
                    onClick={() => setSmaInspector(activeForecastModel === "SMA-6" ? "sma6" : "sma3")}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Show Math
                  </button>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                    {Math.round(activeForecastUnits).toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">units</span>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {demandDeltaPct !== null && (
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      demandDeltaPct >= 0
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}>
                      {demandDeltaPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {demandDeltaPct >= 0 ? `+${demandDeltaPct}%` : `${demandDeltaPct}%`} vs {latestSalesMonth?.month}
                    </span>
                  )}
                  <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                    Auto: {activeForecastModel}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>Best-fit forecast for {nextForecastMonth}</span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setActiveSection("Forecast")}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Forecast →
                </button>
              </div>
            </div>

            {/* Card 2: Restock Urgency */}
            <div className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restock Urgency</span>
                  <button
                    type="button"
                    onClick={() => setActiveSection("Restocking")}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    View list →
                  </button>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                    {reorderRecs.length}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">medicines</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {outOfStockCount > 0 && (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                      ● {outOfStockCount} Out
                    </span>
                  )}
                  {criticalCount > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                      ● {criticalCount} Critical
                    </span>
                  )}
                  {lowCount > 0 && (
                    <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-bold text-yellow-800 dark:text-yellow-300">
                      ● {lowCount} Low
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>Triggered at Reorder Point (ROP)</span>
                <span>·</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">{outOfStockCount + criticalCount} urgent</span>
              </div>
            </div>

            {/* Card 3: Suggested Order Budget (EOQ) */}
            <div className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggested Order (EOQ)</span>
                  <button
                    type="button"
                    onClick={() => setSmaInspector("eoq")}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Show Math
                  </button>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                    {fmt(estimatedRestockCost)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Optimal batch sizing for <strong className="text-foreground">{totalEoqUnits.toLocaleString()} units</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>Across {executiveSnapshot.supplierCount} {executiveSnapshot.supplierCount === 1 ? "supplier" : "suppliers"}</span>
                <span>·</span>
                <span className="text-primary font-medium">Balances S &amp; H</span>
              </div>
            </div>

            {/* Card 4: Stock Runway & Inventory Value */}
            <div className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock Runway (DOH)</span>
                  <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                    ● Target: {executiveSnapshot.targetCoverDays}d
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                    {executiveSnapshot.stockCoverDays}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">days of supply</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Total stock value: <strong className="text-foreground">{fmt(executiveSnapshot.totalOnHandCost)}</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>{onHandUnits.toLocaleString()} units on shelf</span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setActiveSection("Products")}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Products →
                </button>
              </div>
            </div>
          </div>

          {/* ── Row 2: Dual Intelligence Charts ── */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            {/* Left: Forecast Trend Line Chart */}
            <section className={`${ANALYTICS_CARD_CLASS} min-w-0 p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">Sales History &amp; Demand Forecast</h3>
                      <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                        Auto-Selected: {activeForecastModel}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Recorded actual sales with SmartTrack&apos;s best-fit projection for {nextForecastMonth}.</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />Recorded Sales</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />Best-Fit Forecast ({activeForecastModel})</span>
                  </div>
                </div>

                {smaLoading ? (
                  <div className="h-[270px] w-full flex flex-col justify-end p-4 space-y-3">
                    <div className="flex items-end justify-between gap-3 h-48">
                      {[40, 75, 55, 90, 65, 80, 50, 85].map((h, i) => (
                        <div key={i} className="yt-shimmer-box flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="flex justify-between pt-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="yt-shimmer-box h-2.5 w-10 rounded-md" />
                      ))}
                    </div>
                  </div>
                ) : smaChartData.length ? (
                  <div className="h-[270px] w-full">
                    <ForecastTrendChart
                      history={smaChartData}
                      nextPeriod={nextForecastMonth}
                      sma3={forecastSMA3}
                      sma6={forecastSMA6}
                      activeModel={activeForecastModel}
                      showBothModels={false}
                      periodUnit="month"
                    />
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">No sales history available for this selection.</p>
                )}
              </div>

              {/* Chart stats strip */}
              <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Peak Sales Month</span>
                  <strong className="text-foreground font-semibold">
                    {peakSalesMonth ? `${peakSalesMonth.month} (${peakSalesMonth.demand.toLocaleString()} units)` : "—"}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Average Monthly Sales</span>
                  <strong className="text-foreground font-semibold">
                    {avgMonthlyDemand.toLocaleString()} units / month
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Next Month Estimate</span>
                  <strong className="text-primary font-semibold">
                    {Math.round(activeForecastUnits).toLocaleString()} units ({nextForecastMonth})
                  </strong>
                </div>
              </div>
            </section>

            {/* Right: Sales by Category */}
            <section className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Sales by Category</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Therapeutic category share of units sold.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection("Products")}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    View all →
                  </button>
                </div>

                {categorySalesLoading ? (
                  <div className="space-y-4 py-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between">
                          <div className="yt-shimmer-box h-3 w-28 rounded-md" />
                          <div className="yt-shimmer-box h-3 w-10 rounded-md" />
                        </div>
                        <div className="yt-shimmer-box h-2 w-full rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : categorySalesError ? (
                  <p role="status" className="py-12 text-center text-sm text-destructive">Unable to load category sales.</p>
                ) : chartCategoryData.length ? (
                  <div className="space-y-3.5">
                    {chartCategoryData.slice(0, 5).map((category, index) => (
                      <div key={category.name} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate font-medium text-foreground">{category.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-foreground">{category.value}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.max(0, category.value))}%`,
                              backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">No category sales available yet.</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground flex items-center justify-between">
                <span>Top category: <strong className="text-foreground">{topCategory?.name ?? "—"}</strong></span>
                <span>{topCategory ? `${topCategory.value}% of sales` : ""}</span>
              </div>
            </section>
          </div>

          {/* ── Row 3: Actionable Urgent Restock Table (The Action Radar) ── */}
          <section className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">Top Urgent Restock Priorities</h3>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                    Action Needed
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Highest priority medicines nearing stockout before the next supplier delivery arrives.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection("Restocking")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                <span>View all {reorderRecs.length} restocking medicines</span>
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="overflow-x-auto" data-table-scroll="fixed">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Medicine</th>
                    <th className="px-4 py-3">In Stock vs. ROP</th>
                    <th className="px-4 py-3">Urgency Status</th>
                    <th className="px-4 py-3">Suggested Order (EOQ)</th>
                    <th className="px-4 py-3 text-right">Est. Cost</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {urgentRestocks.map(rec => {
                    const isOutOfStock = rec.product.stock === 0;
                    const stockRatio = rec.product.stock / Math.max(1, rec.suggestedRop);
                    const isCritical = stockRatio <= 0.4;
                    return (
                      <tr key={rec.product.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-foreground text-xs">{rec.product.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{rec.product.category}{rec.product.supplier ? ` · ${rec.product.supplier}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <div className="text-xs font-medium text-foreground">
                            {rec.product.stock.toLocaleString()} <span className="text-muted-foreground font-normal">/ {rec.suggestedRop.toLocaleString()} units</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">ROP trigger</span>
                        </td>
                        <td className="px-4 py-3">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                              ● Out of Stock
                            </span>
                          ) : isCritical ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                              ● Critical Buffer
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border border-yellow-500/30">
                              ● Low Stock
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                          {rec.effectiveOrderQty.toLocaleString()} units
                          <span className="block text-[10px] text-muted-foreground font-normal">Pack-rounded batch</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                          {fmt(rec.effectiveOrderQty * rec.unitCost)}
                          <span className="block text-[10px] text-muted-foreground font-normal">@ ₱{rec.unitCost.toFixed(2)}/u</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedEoqProductId(rec.product.id)}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                              title="Show math computation"
                            >
                              Show Math
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openPoDraftModal(rec.product, rec.eoq, rec.shortage, rec.effectiveOrderQty)}
                                className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
                              >
                                Order
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {urgentRestocks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">
                        All medicines currently have healthy stock above their reorder points.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Row 4: Inventory Velocity (Fast Movers vs. Slow Movers) ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Fast Movers */}
            <section className={`${ANALYTICS_CARD_CLASS} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Fast-Moving Medicines (Class A)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Top-selling medicines by recorded unit volume.</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  High Turnover
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {topFastMovers.map((item, idx) => (
                  <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{item.product.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.product.category}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold tabular-nums text-foreground">{item.totalSold.toLocaleString()} sold</span>
                      <span className="block text-[10px] text-muted-foreground">~{Math.round(item.monthlyEquivalentForecast)} u/mo</span>
                    </div>
                  </div>
                ))}
                {topFastMovers.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No sales transactions recorded yet.</p>
                )}
              </div>
            </section>

            {/* Slow Movers / Capital Watch */}
            <section className={`${ANALYTICS_CARD_CLASS} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Slow-Moving &amp; Idle Stock Watch</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">In-stock medicines with low recent demand.</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Capital Watch
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {slowMovingItems.map(item => {
                  const estCost = item.batches.find(b => b.unitCost)?.unitCost ?? (item.price * 0.7);
                  const capitalValue = item.stock * estCost;
                  return (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.category} · {item.stock.toLocaleString()} units on shelf</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-medium text-foreground">{fmt(capitalValue)}</span>
                        <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-medium">Idle capital</span>
                      </div>
                    </div>
                  );
                })}
                {slowMovingItems.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No idle inventory detected.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeSection === "Forecast" && (
        <section className="space-y-5">
          {/* SmartFit Automated Model Selection Banner */}
          <section className="rounded-2xl border border-teal-500/25 bg-teal-500/[0.05] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-500" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Automated Best-Fit Model Selection</h2>
                    <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                      Auto-Selected: {activeForecastModel}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
                    You do not need to manually guess between models. SmartTrack automatically backtests both <strong className="text-foreground">SMA-3</strong> (fast 3-month average for sudden surges) and <strong className="text-foreground">SMA-6</strong> (steady 6-month baseline for stable medicines) against past sales and selects the model with the lowest historical error.
                  </p>
                  {selectedForecast?.comparison ? (
                    <div className="mt-2.5 text-xs leading-relaxed text-muted-foreground" aria-live="polite">
                      <strong className="text-foreground">Backtest accuracy result:</strong> Across {selectedForecast.points} shared months, <strong className="text-foreground">SMA-3</strong> had a {selectedForecast.comparison.sma3.toFixed(1)}% error gap and <strong className="text-foreground">SMA-6</strong> had a {selectedForecast.comparison.sma6.toFixed(1)}% error gap. SmartTrack automatically selected <strong className="text-teal-600 dark:text-teal-400">{activeForecastModel}</strong> because it tracked recorded sales more closely.
                    </div>
                  ) : (
                    <p className="mt-2.5 text-xs text-muted-foreground">
                      <strong className="text-foreground">Building comparison history:</strong> SmartTrack defaults to <strong className="text-teal-600 dark:text-teal-400">{activeForecastModel}</strong> while more monthly sales history accumulates.
                    </p>
                  )}

                  {/* Visual Data Maturity Lifecycle Pill Bar */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-teal-500/20 text-[11px]">
                    <span className="font-semibold text-foreground">Data Lifecycle:</span>
                    <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border text-muted-foreground">
                      Months 1–3: Baseline Gathering
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border text-muted-foreground">
                      Months 4–6: SMA-3 Active
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="rounded-md bg-teal-500/15 px-2 py-0.5 border border-teal-500/30 font-semibold text-teal-700 dark:text-teal-300">
                      Month 7+: Dual Model Comparison (SMA-3 vs SMA-6)
                    </span>
                  </div>
                </div>
              </div>
              {selectedForecast?.comparison && (
                <button
                  type="button"
                  onClick={() => setSmapeInspector(activeForecastModel === "SMA-6" ? "sma6" : "sma3")}
                  className="shrink-0 self-start rounded-xl border border-teal-500/30 bg-background/80 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 cursor-pointer"
                >
                  View Accuracy Proof
                </button>
              )}
            </div>
          </section>

          {/* 3 Clean Summary Cards: Best-Fit Active + SMA-3 Reference + SMA-6 Reference */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Card 1: Best-Fit Active Pick */}
            <section className={`${ANALYTICS_CARD_CLASS} border-teal-500/30 bg-teal-500/[0.03] p-4 sm:p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                    <p className="text-sm font-semibold text-foreground">Best-Fit Forecast</p>
                    <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                      Active · {activeForecastModel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSmaInspector(activeForecastModel === "SMA-6" ? "sma6" : "sma3")}
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5 cursor-pointer"
                  >
                    Show Math
                  </button>
                </div>
                <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-foreground">
                  {smaMonths.length ? Math.round(activeForecastUnits).toLocaleString() : "—"}{" "}
                  <span className="text-base font-medium text-muted-foreground">{smaMonths.length ? "units" : ""}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {smaLoading
                    ? "Loading sales history…"
                    : smaMonths.length
                      ? `Expected for ${nextForecastMonth} · drives ROP & EOQ restocking`
                      : "No recorded sales history for this selection"}
                </p>
              </div>
              <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                Automatically chosen as the best-fit estimate for this scope. Feeds directly into Reorder Point (ROP) and EOQ calculations.
              </p>
            </section>

            {/* Card 2 & 3: SMA-3 and SMA-6 Reference Benchmarks */}
            {([
              {
                model: "SMA-3" as const,
                label: "Fast-Reacting (3-Mo Avg)",
                units: forecastSMA3,
                months: last3.length,
                window: 3,
                color: "bg-orange-500",
                help: "Averages the latest 3 completed months. Best for catching sudden demand surges (e.g., flu or dengue season).",
              },
              {
                model: "SMA-6" as const,
                label: "Steady Baseline (6-Mo Avg)",
                units: forecastSMA6,
                months: last6.length,
                window: 6,
                color: "bg-violet-500",
                help: "Averages up to 6 completed months. Smooths out temporary one-month spikes for maintenance medicines.",
              },
            ]).map(option => {
              const isWinner = activeForecastModel === option.model;
              return (
                <section key={option.model} className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${option.color}`} />
                        <p className="text-sm font-semibold text-foreground">{option.model}</p>
                        <span className="text-xs text-muted-foreground">· {option.label}</span>
                        {isWinner && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            Best Fit
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSmaInspector(option.model === "SMA-3" ? "sma3" : "sma6")}
                        className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5 cursor-pointer"
                      >
                        Show Math
                      </button>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                      {smaMonths.length ? Math.round(option.units).toLocaleString() : "—"}{" "}
                      <span className="text-sm font-medium text-muted-foreground">{smaMonths.length ? "units" : ""}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {smaMonths.length
                        ? `Uses ${option.months} of ${option.window} available months`
                        : "No recorded sales history"}
                    </p>
                  </div>
                  <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    {option.help}
                  </p>
                </section>
              );
            })}
          </div>

          {/* Monthly Sales History & Trajectory Chart */}
          <section className={`${ANALYTICS_CARD_CLASS} min-w-0 p-4 sm:p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Monthly sales history &amp; demand forecast</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Solid blue line = actual recorded sales. Dashed line = {showChartModelComparison ? "SMA-3 and SMA-6 comparison" : `Best-Fit (${activeForecastModel}) trajectory into ${nextForecastMonth}`}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowChartModelComparison(prev => !prev)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  showChartModelComparison
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {showChartModelComparison ? "Showing Both Models (Click for Best-Fit Only)" : "Compare Both Models on Chart"}
              </button>
            </div>
            {smaLoading ? (
              <div className="h-[300px] w-full flex flex-col justify-end p-4 space-y-4">
                <div className="flex items-end justify-between gap-3 h-52">
                  {[35, 70, 50, 85, 60, 75, 45, 90, 65, 80].map((h, i) => (
                    <div key={i} className="yt-shimmer-box flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="flex justify-between pt-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <div key={i} className="yt-shimmer-box h-2.5 w-12 rounded-md" />
                  ))}
                </div>
              </div>
            ) : smaChartData.length ? (
              <>
                <div className="h-[300px] w-full">
                  <ForecastTrendChart
                    history={smaChartData}
                    nextPeriod={nextForecastMonth}
                    sma3={forecastSMA3}
                    sma6={forecastSMA6}
                    periodUnit="month"
                    activeModel={activeForecastModel}
                    showBothModels={showChartModelComparison}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-blue-600" /> Recorded sales</span>
                  {showChartModelComparison ? (
                    <>
                      <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-orange-500" /> SMA-3 (Fast 3-mo)</span>
                      <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-violet-500" /> SMA-6 (Steady 6-mo)</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-teal-600" /> Best-Fit forecast ({activeForecastModel})</span>
                  )}
                  <span className="ml-auto">Final point = {nextForecastMonth} forecast</span>
                </div>

                {/* Mathematical Transparency Card */}
                <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Info size={13} className="text-primary shrink-0" />
                    <span>Why does the forecast trajectory begin at Month 4 (July)?</span>
                  </div>
                  <p className="mt-1">
                    Moving averages require completed historical data. <strong className="text-foreground">SMA-3</strong> requires 3 completed prior months (April, May, June) before it can project a forecast for July. Likewise, <strong className="text-foreground">SMA-6</strong> requires 6 completed prior months, so it begins projecting at Month 7 (October). Across shared months, SmartTrack compares their accuracy to pick the optimal model.
                  </p>
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No sales history available for this selection.</p>
            )}
          </section>

          {/* Per-Medicine Automated Forecasts Table */}
          <section className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Expected sales by medicine (Auto-Selected per Medicine)</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {productForecastList.length} medicines · SmartTrack automatically picks SMA-3 or SMA-6 for each medicine based on its sales history
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={productForecastSearch}
                  onChange={event => { setProductForecastSearch(event.target.value); setProductForecastPage(1); }}
                  placeholder="Search medicines"
                  aria-label="Search forecast medicines"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="overflow-x-auto" data-table-scroll="fixed">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Medicine</th>
                    <th className="px-4 py-3 font-medium">Recent monthly sales</th>
                    <th className="px-4 py-3 font-medium">
                      <div className="inline-flex items-center gap-1.5">
                        Auto-Selected Model
                        <InfoTip title="Per-Medicine Best-Fit Model" lines={["SmartTrack tests both SMA-3 and SMA-6 on each medicine's own monthly sales history and automatically picks the model with the lower error."]} />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Expected next month</th>
                    <th className="px-4 py-3 text-right font-medium">In stock</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginatedProductForecasts.map(row => {
                    const forecast = row.monthlyEquivalentForecast;
                    const isSma6 = row.recommendedModel === "SMA-6";
                    return (
                      <tr key={row.product.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{row.product.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{row.product.category}</p>
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                          {row.recent3Periods.length
                            ? row.recent3Periods.map(period => `${period.label}: ${period.qty}`).join(" · ")
                            : "No recorded sales"}
                        </td>
                        <td className="px-4 py-3">
                          {row.totalSold > 0 ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              isSma6
                                ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                : "bg-orange-500/10 text-orange-700 dark:text-orange-300"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${isSma6 ? "bg-violet-500" : "bg-orange-500"}`} />
                              Auto: {row.recommendedModel} · {isSma6 ? "Steady" : "Fast"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                          {row.totalSold > 0 ? `${Math.round(forecast).toLocaleString()} units` : <span className="font-normal text-muted-foreground">No sales history</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.product.stock.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedSmaProductId(row.product.id)}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5 cursor-pointer"
                          >
                            Show Math
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedProductForecasts.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No medicines match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePager total={filteredProductForecasts.length} page={productForecastPage} pageSize={PRODUCT_FORECAST_PAGE_SIZE} onPage={setProductForecastPage} />
          </section>
        </section>
      )}

      {activeSection === "Restocking" && (
        <section className="space-y-5">
          {poBannerMessage && (
            <div role="status" className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              poBannerMessage.type === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
            }`}>
              <span>{poBannerMessage.text}</span>
              <button type="button" onClick={() => setPoBannerMessage(null)} aria-label="Dismiss message" className="rounded-md p-1 hover:bg-background/50"><X size={15} /></button>
            </div>
          )}

          {/* The 3-Step Golden Chain Pipeline: SMA -> ROP -> EOQ */}
          <section className={`${ANALYTICS_CARD_CLASS} space-y-4 p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Automated 3-Step Pipeline</span>
                  <h3 className="text-sm font-semibold text-foreground">How Forecast, ROP, and EOQ Work Together</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  SmartTrack connects your sales forecast directly to your restocking plan in three simple steps:
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEoqSettingsModal(true)}
                  aria-label="Open restocking settings"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <SlidersHorizontal size={15} className="text-muted-foreground" />
                  <span>Planning settings</span>
                </button>
                <button type="button" onClick={() => setSmaInspector("eoq")} className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 cursor-pointer">
                  How EOQ works
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Step 1: SMA Forecast (D) */}
              <div className="rounded-xl border border-teal-500/25 bg-teal-500/[0.04] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Step 1 · Forecast (D)</span>
                  <span className="rounded-md bg-teal-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-700 dark:text-teal-300">SMA-3 / SMA-6</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">Predicts Expected Demand</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  SmartTrack automatically picks each medicine’s best SMA model to estimate monthly sales and <strong className="text-foreground">Yearly Demand (D = Monthly × 12)</strong>.
                </p>
              </div>

              {/* Step 2: Reorder Point (ROP) */}
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Step 2 · WHEN to Order (ROP)</span>
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-300">{reorderRecs.length} flagged</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">Safety Stock Alarm</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Uses daily demand during the <strong className="text-foreground">{leadTimeDaysSetting}-day supplier lead time</strong> plus a <strong className="text-foreground">{safetyBufferSetting}% safety buffer</strong>. Alerts you before stock runs out.
                </p>
              </div>

              {/* Step 3: Economic Order Quantity (EOQ) */}
              <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Step 3 · HOW MUCH to Order (EOQ)</span>
                  <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">Budget: {fmt(estimatedRestockCost)}</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">Cost-Balanced Order Size</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Calculates <strong className="text-foreground">EOQ = √(2DS ÷ H)</strong> to balance delivery fee (<strong className="text-foreground">₱{orderCostSetting}</strong>) against storage &amp; expiry risk (<strong className="text-foreground">{Math.round(holdingRateSetting * 100)}%/yr</strong>).
                </p>
              </div>
            </div>
          </section>

          {/* Medicines to Restock Table mirroring the 3 Steps */}
          <section className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Medicines to restock ({reorderRecs.length})</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click <strong className="text-foreground">Show Math</strong> on any row to inspect its exact ROP and EOQ calculation, or <strong className="text-foreground">Create PO</strong> to place an order.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={restockSearch}
                  onChange={event => { setRestockSearch(event.target.value); setRestockPage(1); }}
                  placeholder="Search medicines"
                  aria-label="Search restock medicines"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="overflow-x-auto" data-table-scroll="fixed">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Medicine</th>
                    <th className="px-4 py-3 font-medium">Step 1: Demand (D)</th>
                    <th className="px-4 py-3 font-medium">
                      <div className="inline-flex items-center gap-1.5">
                        Step 2: Stock vs. ROP (When)
                        <InfoTip title="Stock vs. Reorder Point (ROP)" lines={["Compares current stock on hand against the Reorder Point threshold (lead-time demand + safety buffer). When stock drops at or below ROP, it is time to reorder."]} />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <div className="inline-flex items-center gap-1.5">
                        Step 3: Suggested Order (EOQ)
                        <InfoTip title="Suggested Order Size (EOQ)" lines={["The cost-optimal order quantity from EOQ = √(2DS / H). Balances supplier order fees against holding and expiry risk."]} />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Estimated cost</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginatedReorderRecs.map(rec => (
                    <tr key={rec.product.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{rec.product.name}</p>
                          <StockBadge status={rec.product.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{rec.product.category}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold tabular-nums text-foreground">
                          {Math.max(1, Math.round(rec.annualDemand / 12)).toLocaleString()} {Math.max(1, Math.round(rec.annualDemand / 12)) === 1 ? "unit" : "units"}/month{" "}
                          <span className="font-normal text-muted-foreground">({rec.annualDemand.toLocaleString()}/year)</span>
                        </p>
                        <p className="mt-1">
                          <span
                            title={rec.demandSourceLabel}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              rec.isDemandFallback
                                ? "bg-muted text-muted-foreground"
                                : rec.demandSourceShort.includes("SMA-6")
                                  ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                  : "bg-orange-500/10 text-orange-700 dark:text-orange-300"
                            }`}
                          >
                            {rec.demandSourceShort}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className="font-semibold text-foreground">{rec.product.stock.toLocaleString()}</span>
                        <span className="text-muted-foreground"> in stock / </span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">ROP {rec.suggestedRop.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold tabular-nums text-primary">{rec.effectiveOrderQty.toLocaleString()} units</span>
                        {rec.overrideQty != null && (
                          <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Custom</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{fmt(rec.effectiveOrderQty * rec.unitCost)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setSelectedEoqProductId(rec.product.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 cursor-pointer">
                            Show Math
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openPoDraftModal(rec.product, rec.eoq, rec.shortage, rec.effectiveOrderQty)}
                              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 cursor-pointer"
                            >
                              Create PO
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedReorderRecs.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No medicines need restocking or match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePager total={filteredReorderRecs.length} page={restockPage} pageSize={RESTOCK_PAGE_SIZE} onPage={setRestockPage} />
          </section>
        </section>
      )}

      {activeSection === "Products" && (
        <section className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Medicine sales and demand forecast</h2>
              <p className="mt-1 text-xs text-muted-foreground">Recorded sales, auto-selected forecast model, expected next-month demand, and stock status.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={productForecastSearch}
                onChange={event => { setProductForecastSearch(event.target.value); setProductForecastPage(1); }}
                placeholder="Search medicines"
                aria-label="Search products"
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="overflow-x-auto" data-table-scroll="fixed">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Medicine</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Units sold</th>
                  <th className="px-4 py-3 font-medium">Auto Model</th>
                  <th className="px-4 py-3 text-right font-medium">Expected next month</th>
                  <th className="px-4 py-3 text-right font-medium">In stock</th>
                  <th className="px-4 py-3 text-right font-medium">Stock status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedProductForecasts.map(row => {
                  const forecast = row.monthlyEquivalentForecast;
                  const isSma6 = row.recommendedModel === "SMA-6";
                  return (
                    <tr key={row.product.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{row.product.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.product.category}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.totalSold.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {row.totalSold > 0 ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isSma6
                              ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                              : "bg-orange-500/10 text-orange-700 dark:text-orange-300"
                          }`}>
                            {row.recommendedModel}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{Math.round(forecast).toLocaleString()} units</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.product.stock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right"><StockBadge status={row.product.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedSmaProductId(row.product.id)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5 cursor-pointer"
                        >
                          Show Math
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {paginatedProductForecasts.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No medicines match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePager total={filteredProductForecasts.length} page={productForecastPage} pageSize={PRODUCT_FORECAST_PAGE_SIZE} onPage={setProductForecastPage} />
        </section>
      )}

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

              <div className="flex items-center justify-end pt-2 border-t border-border">
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

      {selectedSmaProductId && (() => {
        const pf = productForecastMap.get(String(selectedSmaProductId));
        if (!pf) return null;
        const isSma6 = pf.recommendedModel === "SMA-6";
        const periods = isSma6 ? pf.recent6Periods : pf.recent3Periods;
        const sumQty = periods.reduce((s, p) => s + p.qty, 0);
        const avgQty = periods.length > 0 ? sumQty / periods.length : 0;
        const roundedMonthly = Math.max(1, Math.round(pf.monthlyEquivalentForecast));
        const annualD = roundedMonthly * 12;
        return (
          <CalcInspectorModal
            title={`Show Math · ${pf.product.name} (${pf.recommendedModel})`}
            formula={<SmaFormulaVisual type={isSma6 ? "sma6" : "sma3"} />}
            explanation={`SmartTrack tested both SMA-3 (fast 3-month average) and SMA-6 (steady 6-month baseline) on ${pf.product.name}’s past sales. It automatically selected ${pf.recommendedModel} (${isSma6 ? "steady baseline" : "fast-reacting"}) as the best fit.`}
            variables={[
              ...periods.map(p => ({ label: `Recorded sales · ${p.label}`, value: `${p.qty.toLocaleString()} units` })),
              { label: "SMA-3 (3-month average)", value: `${Math.round(pf.monthlySma3).toLocaleString()} units/month${pf.smape3 != null ? ` (${pf.smape3.toFixed(1)}% error)` : ""}` },
              { label: "SMA-6 (6-month average)", value: `${Math.round(pf.monthlySma6).toLocaleString()} units/month${pf.smape6 != null ? ` (${pf.smape6.toFixed(1)}% error)` : ""}` },
              { label: "Auto-Selected Model", value: `${pf.recommendedModel} (${isSma6 ? "Steady 6-Month" : "Fast 3-Month"})` },
            ]}
            trail={
              periods.length > 0
                ? [
                    `Step 1 (Add recent sales): ${periods.map(p => p.qty.toLocaleString()).join(" + ")} = ${sumQty.toLocaleString()} units.`,
                    `Step 2 (Divide by ${periods.length} ${periods.length === 1 ? "month" : "months"}): ${sumQty.toLocaleString()} ÷ ${periods.length} = ${roundedMonthly.toLocaleString()} units/month expected next month.`,
                    `Step 3 (Connect to ROP & EOQ): ${roundedMonthly.toLocaleString()} units/month × 12 months = ${annualD.toLocaleString()} units/year (Annual Demand D).`,
                  ]
                : ["No recorded sales periods yet for this medicine."]
            }
            result={
              pf.totalSold > 0
                ? `Best-Fit Next-Month Forecast: ${roundedMonthly.toLocaleString()} units/month (${annualD.toLocaleString()} units/year)`
                : "No sales history yet — record sales to generate a forecast."
            }
            onClose={() => setSelectedSmaProductId(null)}
          />
        );
      })()}

      {smaInspector === "sma3" && (
        <CalcInspectorModal
          title="Show Math · Recent 3-month average (SMA-3)"
          formula={<SmaFormulaVisual type={last3.length === 3 ? "sma3" : "general"} />}
          explanation="Add sales from the latest 3 completed months and divide by 3. Because it only looks at recent months, SMA-3 reacts quickly to sudden surges or seasonal outbreaks."
          variables={[
            ...last3.slice().reverse().map((period, index) => ({
              label: `${index === 0 ? "Most recent month" : `${index + 1} months ago`} · ${period.month}`, value: `${period.demand.toLocaleString()} units`,
            })),
            { label: "Months included", value: `${last3.length} of 3` },
          ]}
          trail={[
            last3.length
              ? `Step 1: ${last3.slice().reverse().map(m => m.demand.toLocaleString()).join(" + ")} = ${last3.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} units.`
              : "No recorded sales periods are available for this scope.",
            ...(last3.length ? [`Step 2: ${last3.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} ÷ ${last3.length} = about ${Math.round(sma3Computed).toLocaleString()} units.`] : []),
          ]}
          result={smaMonths.length
            ? `Estimated demand for ${nextForecastMonth}: ≈ ${Math.round(sma3Computed).toLocaleString()} units`
            : "No estimate yet — record sales to generate a forecast."}
          onClose={() => setSmaInspector(null)}
        />
      )}

      {smaInspector === "sma6" && (
        <CalcInspectorModal
          title="Show Math · Steadier 6-month average (SMA-6)"
          formula={<SmaFormulaVisual type={last6.length === 6 ? "sma6" : "general"} />}
          explanation="Add sales from up to the latest 6 completed months and divide by 6. This smooths out one-month spikes and provides a steady baseline for maintenance medicines."
          variables={[
            ...last6.slice().reverse().map((period, index) => ({
              label: `${index === 0 ? "Most recent month" : `${index + 1} months ago`} · ${period.month}`, value: `${period.demand.toLocaleString()} units`,
            })),
            { label: "Months included", value: `${last6.length} of 6` },
          ]}
          trail={[
            last6.length
              ? `Step 1: ${last6.slice().reverse().map(m => m.demand.toLocaleString()).join(" + ")} = ${last6.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} units.`
              : "No recorded sales periods are available for this scope.",
            ...(last6.length ? [`Step 2: ${last6.reduce((sum, m) => sum + m.demand, 0).toLocaleString()} ÷ ${last6.length} = about ${Math.round(sma6Computed).toLocaleString()} units.`] : []),
          ]}
          result={smaMonths.length
            ? `Estimated demand for ${nextForecastMonth}: ≈ ${Math.round(sma6Computed).toLocaleString()} units`
            : "No estimate yet — record sales to generate a forecast."}
          onClose={() => setSmaInspector(null)}
        />
      )}

      {smaInspector === "eoq" && (
        <CalcInspectorModal
          title="EOQ Restocking — Store-Level Calculation"
          formula={<EoqFormulaVisual />}
          explanation={`EOQ is a suggested order size that balances order-placement fees (S) and stock-holding costs (H). SmartTrack feeds the ${activeForecastModel} demand forecast (D) directly into this formula. Cost settings: order placement ₱${globalOrderCost.toFixed(2)} and holding rate ${Math.round(holdingRateSetting * 100)}%.`}
          variables={[
            { label: `Annual Demand (D · Auto ${activeForecastModel})`, value: `${Math.round(annualDemand).toLocaleString()} units/yr` },
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
          result={`EOQ ≈ ${eoqOverall.toLocaleString()} units — suggested balanced order size`}
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
          smartRecs={smartOperationalRecommendations}
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
