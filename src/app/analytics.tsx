import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  Minus,
  Pencil,
  Check,
} from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import {
  getReorderUnits, hasUserRole,
  getMonthlyDemand, computeSMA, estimateEOQ,
  type Product, type Transaction,
} from "./data";
import { fmt, StockBadge, InfoTip, ConfirmDialog, SegmentedTabs } from "./shared";
import { analyticsApi, purchaseOrdersApi, type PurchaseOrder, type SupplierPerformance } from "./api";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAYS_PER_MONTH = 30.4;
const WEEKS_PER_MONTH = 4.33;
const EMPTY_WEEKLY_SCOPE = {
  chartData: [] as { month: string; demand: number; supply: number; sma3: number | null; sma6: number | null }[],
  sma3: 0,
  sma6: 0,
  nextLabel: "Next week",
};

function computeSmapeSeries(points: { actual: number; forecast: number }[]) {
  if (points.length === 0) return null;
  let sumSmape = 0;
  let validCount = 0;
  for (const { actual, forecast } of points) {
    const denom = (Math.abs(actual) + Math.abs(forecast)) / 2;
    if (denom <= 0) continue;
    sumSmape += Math.abs(actual - forecast) / denom;
    validCount++;
  }
  if (validCount === 0) return null;
  return {
    smape: Math.round((sumSmape / validCount) * 1000) / 10,
    points: validCount,
  };
}

function selectBestForecastModel(
  rows: { demand: number; sma3: number | null; sma6: number | null }[]
) {
  const comparable = rows
    .filter(point => point.sma3 != null && point.sma6 != null)
    .map(point => ({ actual: point.demand, sma3: point.sma3 ?? 0, sma6: point.sma6 ?? 0 }));
  if (comparable.length < 1) return null;
  const sma3Score = computeSmapeSeries(comparable.map(point => ({ actual: point.actual, forecast: point.sma3 })));
  const sma6Score = computeSmapeSeries(comparable.map(point => ({ actual: point.actual, forecast: point.sma6 })));
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
}

function formatNextMonthLabel(rows: { month?: string }[]) {
  const latestMonth = rows[rows.length - 1]?.month;
  if (!latestMonth) return "Next month";
  const [monthLabel, yearLabel] = latestMonth.split(" ");
  const monthIndex = SHORT_MONTHS.indexOf(monthLabel as (typeof SHORT_MONTHS)[number]);
  if (monthIndex < 0 || !yearLabel) return "Next month";
  const next = new Date(Number(yearLabel), monthIndex + 1, 1);
  return `${SHORT_MONTHS[next.getMonth()]} ${next.getFullYear()}`;
}

function formatSalesPaceShort(monthlyUnits: number): string {
  if (monthlyUnits <= 0) return "No recent sales";
  const daily = monthlyUnits / DAYS_PER_MONTH;
  if (daily >= 1) {
    return `about ${Math.round(daily)}/day`;
  }
  const weekly = Math.max(1, Math.round(daily * 7));
  return `about ${weekly}/week`;
}

function formatSupplyDuration(months: number): string {
  if (months < 1) {
    const days = Math.max(1, Math.round(months * 30));
    return days >= 14 ? `About ${Math.round(days / 7)} weeks` : `About ${days} ${days === 1 ? "day" : "days"}`;
  }
  const totalMonths = Math.max(1, Math.round(months));
  if (totalMonths < 12) {
    return `About ${totalMonths} ${totalMonths === 1 ? "month" : "months"}`;
  }
  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  const yearLabel = `${years} ${years === 1 ? "year" : "years"}`;
  if (remMonths === 0) return `About ${yearLabel}`;
  return `About ${yearLabel}, ${remMonths} ${remMonths === 1 ? "month" : "months"}`;
}

function formatDaysRemaining(days: number): string {
  if (days < 60) {
    return `About ${days} ${days === 1 ? "day" : "days"} left`;
  }
  if (days < 365) {
    const months = Math.max(2, Math.round(days / 30));
    return `About ${months} months left`;
  }
  const years = Math.floor(days / 365);
  return `Over ${years} ${years === 1 ? "year" : "years"} left`;
}

function computeReadinessStats<T extends {
  confidenceTier: "high" | "short" | "intermittent" | "insufficient";
  projectedShortfall: number;
  trendDirection: "rising" | "steady" | "slowing" | "none";
}>(rows: T[]) {
  let trusted = 0;
  let early = 0;
  let sporadic = 0;
  let noSales = 0;
  let shortfall = 0;
  let rising = 0;
  for (const row of rows) {
    if (row.confidenceTier === "high") trusted++;
    else if (row.confidenceTier === "short") early++;
    else if (row.confidenceTier === "intermittent") sporadic++;
    else noSales++;
    if (row.projectedShortfall > 0) shortfall++;
    if (row.trendDirection === "rising") rising++;
  }
  return {
    total: rows.length,
    trusted,
    early,
    sporadic,
    noSales,
    needsData: sporadic + noSales,
    shortfall,
    rising,
  };
}

const ANALYTICS_CARD_CLASS = "rounded-2xl border border-border/70 bg-card shadow-sm";
const CATEGORY_COLORS = ["#2563eb", "#3b82f6", "#60a5fa", "#64748b", "#94a3b8", "#cbd5e1", "#475569"];

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

function niceStepSize(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / Math.pow(10, exponent);
  let niceFraction = 1;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 4) niceFraction = 4;
  else if (fraction <= 5) niceFraction = 5;
  else if (fraction <= 8) niceFraction = 8;
  else niceFraction = 10;
  const result = niceFraction * Math.pow(10, exponent);
  return Number.isInteger(result) ? result : Math.ceil(result);
}

function computeChartYAxis(values: number[], forceZeroBase: boolean): {
  domain: [number, number];
  ticks: number[];
  isZoomed: boolean;
} {
  const valid = values.filter(v => Number.isFinite(v) && v >= 0);
  if (valid.length === 0) {
    return { domain: [0, 10], ticks: [0, 2, 4, 6, 8, 10], isZoomed: false };
  }
  const rawMax = Math.max(...valid);
  const rawMin = Math.min(...valid);
  if (rawMax === 0) {
    return { domain: [0, 10], ticks: [0, 2, 4, 6, 8, 10], isZoomed: false };
  }

  const shouldZoom = !forceZeroBase && rawMin > rawMax * 0.35 && rawMin > 10;
  const span = Math.max(rawMax - rawMin, Math.max(8, Math.round(rawMax * 0.14)));
  const minBase = shouldZoom ? Math.max(0, rawMin - span * 0.25) : 0;
  const maxTop = rawMax + (shouldZoom ? span * 0.24 : Math.max(rawMax * 0.16, 1));

  const step = niceStepSize((maxTop - minBase) / 4);
  const domainMin = shouldZoom ? Math.max(0, Math.floor(minBase / step) * step) : 0;
  const domainMax = Math.ceil(maxTop / step) * step;

  const ticks: number[] = [];
  for (let t = domainMin, count = 0; t <= domainMax + step * 0.001 && count < 10; t += step, count += 1) {
    ticks.push(Math.round(t));
  }
  if (ticks.length < 2) {
    ticks.push(Math.round(domainMax));
  }
  return {
    domain: [ticks[0], ticks[ticks.length - 1]],
    ticks,
    isZoomed: ticks[0] > 0,
  };
}

interface ForecastChartDatum {
  month: string;
  actual: number | null;
  smartFit: number | null;
  sma3Forecast: number | null;
  sma6Forecast: number | null;
  barValue: number;
  isForecast: boolean;
}

function ForecastChartTooltip({
  active,
  payload,
  label,
  nextPeriod,
  periodUnit,
  activeModel,
  showBothModels,
  lastActualValue,
  lastActualPeriod,
}: {
  active?: boolean;
  payload?: readonly { payload?: ForecastChartDatum }[];
  label?: string;
  nextPeriod: string;
  periodUnit: "month" | "week";
  activeModel: "SMA-3" | "SMA-6";
  showBothModels: boolean;
  lastActualValue: number | null;
  lastActualPeriod: string | null;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const isForecastPeriod = row.isForecast || label === nextPeriod;
  const primaryEstimate = showBothModels
    ? (activeModel === "SMA-6" ? row.sma6Forecast : row.sma3Forecast)
    : row.smartFit;

  const variancePct = !isForecastPeriod && row.actual != null && row.actual > 0 && primaryEstimate != null
    ? Math.round(((primaryEstimate - row.actual) / row.actual) * 100)
    : null;
  const deltaVsLastPct = isForecastPeriod && lastActualValue != null && lastActualValue > 0 && primaryEstimate != null
    ? Math.round(((primaryEstimate - lastActualValue) / lastActualValue) * 100)
    : null;

  return (
    <div className="min-w-[198px] rounded-xl border border-border/80 bg-card px-3.5 py-2.5 text-xs shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-border/50 pb-1.5">
        <span className="font-semibold text-foreground">{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isForecastPeriod
            ? "bg-teal-500/12 text-teal-700 dark:text-teal-300"
            : "bg-muted text-muted-foreground"
        }`}>
          {isForecastPeriod ? `Projected ${periodUnit}` : "Recorded"}
        </span>
      </div>
      <div className="space-y-1.5">
        {row.actual != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              Actual sold
            </span>
            <strong className="font-semibold tabular-nums text-foreground">
              {row.actual.toLocaleString()} units
            </strong>
          </div>
        )}
        {!showBothModels && row.smartFit != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-teal-600" />
              {activeModel} estimate
            </span>
            <strong className="font-semibold tabular-nums text-teal-700 dark:text-teal-300">
              {row.smartFit.toLocaleString()} units
            </strong>
          </div>
        )}
        {showBothModels && row.sma3Forecast != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              SMA-3
            </span>
            <strong className="font-semibold tabular-nums text-foreground">
              {row.sma3Forecast.toLocaleString()} units
            </strong>
          </div>
        )}
        {showBothModels && row.sma6Forecast != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              SMA-6
            </span>
            <strong className="font-semibold tabular-nums text-foreground">
              {row.sma6Forecast.toLocaleString()} units
            </strong>
          </div>
        )}
      </div>
      {variancePct !== null && (
        <p className="mt-2 border-t border-border/50 pt-1.5 text-[10px] text-muted-foreground">
          {activeModel} vs actual:{" "}
          <strong className="font-semibold text-foreground tabular-nums">
            {variancePct >= 0 ? `+${variancePct}%` : `${variancePct}%`}
          </strong>
        </p>
      )}
      {deltaVsLastPct !== null && lastActualPeriod && (
        <p className="mt-2 border-t border-border/50 pt-1.5 text-[10px] text-muted-foreground">
          vs {lastActualPeriod}:{" "}
          <strong className={`font-semibold tabular-nums ${deltaVsLastPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {deltaVsLastPct >= 0 ? `+${deltaVsLastPct}%` : `${deltaVsLastPct}%`}
          </strong>
        </p>
      )}
    </div>
  );
}

const ForecastTrendChart = memo(function ForecastTrendChart({
  history,
  nextPeriod,
  sma3,
  sma6,
  activeModel = "SMA-3",
  showBothModels = false,
  periodUnit = "month",
  chartStyle = "area",
  zeroBaseline = false,
}: {
  history: { month: string; demand: number; sma3?: number | null; sma6?: number | null }[];
  nextPeriod: string;
  sma3: number;
  sma6: number;
  activeModel?: "SMA-3" | "SMA-6";
  showBothModels?: boolean;
  periodUnit?: "month" | "week";
  chartStyle?: "area" | "bars";
  zeroBaseline?: boolean;
}) {
  const rawUid = useId();
  const gradId = useMemo(() => `stForecast-${rawUid.replace(/[^a-zA-Z0-9_-]/g, "")}`, [rawUid]);
  const isBars = chartStyle === "bars";
  const bestNextVal = activeModel === "SMA-6" ? Math.round(sma6) : Math.round(sma3);

  const data: ForecastChartDatum[] = useMemo(() => [
    ...history.map((point, idx) => {
      const s3 = point.sma3 != null ? Math.round(point.sma3) : null;
      const s6 = point.sma6 != null ? Math.round(point.sma6) : null;
      const bestPast = activeModel === "SMA-6" ? (s6 ?? s3) : (s3 ?? s6);
      const isLast = idx === history.length - 1;
      return {
        month: point.month,
        actual: point.demand,
        smartFit: bestPast ?? (isLast ? point.demand : null),
        sma3Forecast: s3,
        sma6Forecast: s6,
        barValue: point.demand,
        isForecast: false,
      };
    }),
    {
      month: nextPeriod,
      actual: null,
      smartFit: bestNextVal,
      sma3Forecast: Math.round(sma3),
      sma6Forecast: Math.round(sma6),
      barValue: bestNextVal,
      isForecast: true,
    },
  ], [history, nextPeriod, bestNextVal, sma3, sma6, activeModel]);

  const yAxis = useMemo(() => {
    const vals: number[] = [];
    for (const row of data) {
      if (row.actual != null) vals.push(row.actual);
      if (!showBothModels && row.smartFit != null) vals.push(row.smartFit);
      if (showBothModels) {
        if (row.sma3Forecast != null) vals.push(row.sma3Forecast);
        if (row.sma6Forecast != null) vals.push(row.sma6Forecast);
      }
      if (isBars) vals.push(row.barValue);
    }
    return computeChartYAxis(vals, isBars || zeroBaseline);
  }, [data, showBothModels, isBars, zeroBaseline]);

  const lastActualPoint = history[history.length - 1] ?? null;
  const lastActualPeriod = lastActualPoint?.month ?? null;
  const lastActualValue = lastActualPoint?.demand ?? null;

  const renderTooltip = useCallback((tooltipProps: { active?: boolean; payload?: readonly unknown[]; label?: unknown }) => (
    <ForecastChartTooltip
      active={tooltipProps.active}
      payload={tooltipProps.payload as unknown as readonly { payload?: ForecastChartDatum }[]}
      label={tooltipProps.label != null ? String(tooltipProps.label) : undefined}
      nextPeriod={nextPeriod}
      periodUnit={periodUnit}
      activeModel={activeModel}
      showBothModels={showBothModels}
      lastActualValue={lastActualValue}
      lastActualPeriod={lastActualPeriod}
    />
  ), [nextPeriod, periodUnit, activeModel, showBothModels, lastActualValue, lastActualPeriod]);

  const renderBarLabel = useCallback((lblProps: { index?: number; x?: number | string; y?: number | string; width?: number | string }) => {
    const idx = typeof lblProps.index === "number" ? lblProps.index : -1;
    const entry = idx >= 0 ? data[idx] : undefined;
    if (!entry?.isForecast || lblProps.x == null || lblProps.y == null || lblProps.width == null) return null;
    const cx = Number(lblProps.x) + Number(lblProps.width) / 2;
    const topY = Number(lblProps.y);
    const txt = Number(entry.barValue).toLocaleString();
    const pillW = Math.max(44, txt.length * 6.8 + 14);
    const pillY = Math.max(2, topY - 25);
    return (
      <g>
        <rect x={cx - pillW / 2} y={pillY} width={pillW} height={19} rx={9.5} fill="#0f766e" />
        <text x={cx} y={pillY + 13} textAnchor="middle" fill="#ffffff" fontSize={10.5} fontWeight={700}>
          {txt}
        </text>
      </g>
    );
  }, [data]);

  const renderSmartFitDot = useCallback((props: { cx?: number; cy?: number; payload?: { month?: string } }) => {
    if (props.cx == null || props.cy == null) {
      return <g key={`smartfit-empty-${props.payload?.month}`} />;
    }
    const isTarget = props.payload?.month === nextPeriod;
    if (!isTarget) {
      return (
        <circle
          key={`smartfit-dot-${props.payload?.month}`}
          cx={props.cx}
          cy={props.cy}
          r={2.75}
          fill="#0d9488"
          opacity={0.85}
        />
      );
    }
    if (isBars) {
      return (
        <circle
          key={`smartfit-bar-end-${props.payload?.month}`}
          cx={props.cx}
          cy={props.cy}
          r={4}
          fill="#0d9488"
          stroke="var(--card)"
          strokeWidth={2}
        />
      );
    }
    const txt = bestNextVal.toLocaleString();
    const pillW = Math.max(44, txt.length * 6.8 + 14);
    const pillY = props.cy < 30 ? props.cy + 12 : props.cy - 28;
    return (
      <g key={`smartfit-target-${props.payload?.month}`}>
        <circle cx={props.cx} cy={props.cy} r={10} fill="#0d9488" fillOpacity={0.14} />
        <circle cx={props.cx} cy={props.cy} r={5} fill="#0d9488" stroke="var(--card)" strokeWidth={2} />
        <rect x={props.cx - pillW / 2} y={pillY} width={pillW} height={19} rx={9.5} fill="#0f766e" />
        <text x={props.cx} y={pillY + 13} textAnchor="middle" fill="#ffffff" fontSize={10.5} fontWeight={700}>
          {txt}
        </text>
      </g>
    );
  }, [nextPeriod, isBars, bestNextVal]);

  const renderSma3Dot = useCallback((props: { cx?: number; cy?: number; payload?: { month?: string } }) =>
    props.cx != null && props.cy != null ? (
      <circle
        key={`sma3-dot-${props.payload?.month}`}
        cx={props.cx}
        cy={props.cy}
        r={props.payload?.month === nextPeriod ? 5 : 2.5}
        fill="#f97316"
        stroke="var(--card)"
        strokeWidth={props.payload?.month === nextPeriod ? 2 : 0}
      />
    ) : <g key={`sma3-empty-${props.payload?.month}`} />
  , [nextPeriod]);

  const renderSma6Dot = useCallback((props: { cx?: number; cy?: number; payload?: { month?: string } }) =>
    props.cx != null && props.cy != null ? (
      <circle
        key={`sma6-dot-${props.payload?.month}`}
        cx={props.cx}
        cy={props.cy}
        r={props.payload?.month === nextPeriod ? 5 : 2.5}
        fill="#8b5cf6"
        stroke="var(--card)"
        strokeWidth={props.payload?.month === nextPeriod ? 2 : 0}
      />
    ) : <g key={`sma6-empty-${props.payload?.month}`} />
  , [nextPeriod]);

  return (
    <div className="h-full min-h-[250px] w-full select-none" aria-label={`Historical ${periodUnit}ly sales and next-${periodUnit} SMA forecasts`}>
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        <ComposedChart
          data={data}
          margin={{ top: 28, right: isBars ? 16 : 28, bottom: 6, left: 4 }}
        >
          <defs>
            <linearGradient id={`${gradId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
              <stop offset="75%" stopColor="#2563eb" stopOpacity={0.04} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gradId}-barActual`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.72} />
            </linearGradient>
            <linearGradient id={`${gradId}-barForecast`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0.1} />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="var(--border)"
            strokeOpacity={0.5}
            vertical={false}
          />

          {lastActualPeriod && lastActualPeriod !== nextPeriod && !isBars && (
            <ReferenceArea
              x1={lastActualPeriod}
              x2={nextPeriod}
              fill="#0d9488"
              fillOpacity={0.055}
              ifOverflow="extendDomain"
            />
          )}

          <ReferenceLine
            x={nextPeriod}
            stroke="#0d9488"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey="month"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 500 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)", strokeOpacity: 0.7 }}
            tickMargin={10}
            padding={isBars ? { left: 8, right: 8 } : { left: 16, right: 26 }}
            interval="preserveStartEnd"
            minTickGap={20}
          />

          <YAxis
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={52}
            allowDecimals={false}
            tickFormatter={(val: number) =>
              val >= 100000 ? `${(val / 1000).toFixed(0)}k` : val.toLocaleString()
            }
          />

          <Tooltip
            cursor={
              isBars
                ? { fill: "var(--muted)", opacity: 0.35 }
                : { stroke: "var(--muted-foreground)", strokeOpacity: 0.3, strokeWidth: 1, strokeDasharray: "3 3" }
            }
            content={renderTooltip}
          />

          {isBars ? (
            <Bar
              dataKey="barValue"
              radius={[7, 7, 0, 0]}
              maxBarSize={42}
              isAnimationActive={false}
            >
              {data.map(entry => (
                <Cell
                  key={`bar-${entry.month}`}
                  fill={entry.isForecast ? `url(#${gradId}-barForecast)` : `url(#${gradId}-barActual)`}
                  stroke={entry.isForecast ? "#0d9488" : "none"}
                  strokeWidth={entry.isForecast ? 1.5 : 0}
                  strokeDasharray={entry.isForecast ? "4 3" : undefined}
                />
              ))}
              <LabelList
                dataKey="barValue"
                content={renderBarLabel}
              />
            </Bar>
          ) : (
            <Area
              type="monotone"
              dataKey="actual"
              name="actual"
              stroke="#2563eb"
              strokeWidth={2.5}
              fill={`url(#${gradId}-area)`}
              dot={{ r: 3.5, fill: "var(--card)", stroke: "#2563eb", strokeWidth: 2 }}
              activeDot={{ r: 5.5, fill: "#2563eb", stroke: "var(--card)", strokeWidth: 2.5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {!showBothModels ? (
            <Line
              type="monotone"
              dataKey="smartFit"
              name="smartFit"
              stroke="#0d9488"
              strokeWidth={2}
              strokeDasharray="5 4"
              isAnimationActive={false}
              dot={renderSmartFitDot}
              activeDot={{ r: 6, fill: "#0d9488", stroke: "var(--card)", strokeWidth: 2 }}
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
                strokeDasharray="5 4"
                isAnimationActive={false}
                dot={renderSma3Dot}
                activeDot={{ r: 5.5, fill: "#f97316", stroke: "var(--card)", strokeWidth: 2 }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="sma6Forecast"
                name="sma6Forecast"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="3 3"
                isAnimationActive={false}
                dot={renderSma6Dot}
                activeDot={{ r: 5.5, fill: "#8b5cf6", stroke: "var(--card)", strokeWidth: 2 }}
                connectNulls={true}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

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
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Past forecast check</p>
            <h2 id="smape-modal-title" className="mt-0.5 text-base font-bold text-foreground">How close was {model}?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close sMAPE details" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"><X size={17} /></button>
        </header>
        <div className="max-h-[78vh] space-y-3 overflow-y-auto p-5">
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Average past difference</p>
                {error ? (
                  <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">{error.smape.toFixed(1)}<span className="text-xl">%</span></p>
                ) : <p className="mt-1 text-sm font-semibold text-foreground">Not enough past sales yet</p>}
              </div>
              {error && <span className="pb-1 text-right text-xs leading-relaxed text-muted-foreground">{error.points} past months<br />compared</span>}
            </div>
            {error && (
              <>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {error.smape.toFixed(1)}% is the average of {error.points} monthly comparisons. Each month gets its own difference score first; those scores are then averaged.
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Average past difference ${error.smape.toFixed(1)} percent on a scale from zero to 200 percent`}>
                  <div className="h-full rounded-full bg-primary st-bar-fill transition-[width]" style={{ width: `${Math.min(100, (error.smape / 200) * 100)}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>0% · same sales</span><span>200% · furthest apart</span></div>
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
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-teal-600 dark:bg-teal-400 st-bar-fill" style={{ width: `${(example.actual / comparisonScale) * 100}%`, animationDelay: "60ms" }} /></div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-orange-700 dark:text-orange-300">Past estimate</span><strong className="tabular-nums text-foreground">{example.forecast.toLocaleString()} units</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-orange-500 st-bar-fill" style={{ width: `${(example.forecast / comparisonScale) * 100}%`, animationDelay: "120ms" }} /></div>
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
      <span className="text-xs text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of{" "}
        <span className="font-semibold text-foreground">{total}</span> results
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-border/80 bg-card/90 text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,transform] active:scale-95 cursor-pointer shadow-2xs"
        >
          <ChevronLeft size={13} />
          <span>Prev</span>
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p as number)}
              className={`w-8 h-8 rounded-full text-xs font-semibold border transition-[background-color,transform] active:scale-95 cursor-pointer ${
                p === page
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/25"
                  : "bg-card/90 border-border/80 hover:bg-muted text-foreground"
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
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-border/80 bg-card/90 text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,transform] active:scale-95 cursor-pointer shadow-2xs"
        >
          <span>Next</span>
          <ChevronRight size={13} />
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
  const [showFormulaSteps, setShowFormulaSteps] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close details" className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="calc-inspector-title" className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 id="calc-inspector-title" className="text-base font-semibold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Plain-English Result & Summary First */}
          <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm font-bold text-foreground">
            {result}
          </div>

          {explanation && (
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold text-foreground mb-1">Summary</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{explanation}</p>
            </div>
          )}

          {/* Values Used */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Numbers used</p>
            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {variables.map((v, i) => (
                <div key={i} className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                  <span className="text-muted-foreground">{v.label}</span>
                  <span className="font-semibold text-foreground tabular-nums text-right">{v.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Formula & Steps Collapsed for Senior Readability, Openable for Panelists */}
          <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/15">
            <button
              type="button"
              onClick={() => setShowFormulaSteps(prev => !prev)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <span>View formula &amp; calculation steps</span>
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <span>{showFormulaSteps ? "Hide" : "Show"}</span>
                <ChevronRight size={13} className={`transition-transform ${showFormulaSteps ? "rotate-90" : ""}`} />
              </span>
            </button>
            {showFormulaSteps && (
              <div className="space-y-3 border-t border-border/60 bg-card/60 px-4 py-3.5">
                {typeof formula === "string" ? (
                  <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 font-mono text-sm font-semibold text-foreground text-center">
                    {formula}
                  </div>
                ) : (
                  formula
                )}
                <div className="space-y-2">
                  {trail.map((step, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-muted/15 p-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                      <p className="pt-0.5 text-xs leading-relaxed text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
  const [showFormula, setShowFormula] = useState(false);
  const numerator = 2 * annualDemand * orderCost;
  const ratio = holdingCost > 0 ? numerator / holdingCost : 0;
  const effectiveQty = overrideQty != null ? overrideQty : eoq;
  const unitsPerPack = Math.max(1, product.unitsPerPack ?? 1);
  const effectivePacks = unitsPerPack > 1 ? Math.ceil(effectiveQty / unitsPerPack) : null;
  const suggestedRop = Math.max(1, Math.round((annualDemand / 365) * leadTimeDays * (1 + safetyBufferPercent / 100)));
  const monthlyPace = Math.max(1, Math.round(annualDemand / 12));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close order breakdown" onClick={onClose} className="fixed inset-0 bg-black/30" />
      <div role="dialog" aria-modal="true" aria-labelledby="restock-math-title" className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 id="restock-math-title" className="truncate text-base font-semibold text-foreground">Order breakdown · {product.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{product.category}{product.supplier ? ` · ${product.supplier}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"><X size={16} /></button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5 text-sm">
          {/* Plain-English Decision Summary First */}
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Suggested order size</p>
                <p className="text-xl font-bold tabular-nums text-foreground">{eoq.toLocaleString()} units</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-muted-foreground">Estimated cost</p>
                <p className="text-base font-semibold tabular-nums text-foreground">{fmt(eoq * unitCost)}</p>
              </div>
            </div>
            {eoq > rawEoq && (
              <p className="text-xs text-muted-foreground">
                Raised to meet your configured minimum of {getReorderUnits(product).toLocaleString()} units.
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground border-t border-primary/15 pt-2.5">
              Based on <strong className="text-foreground">~{monthlyPace.toLocaleString()} units/month</strong> ({formatSalesPaceShort(annualDemand / 12)}), a{" "}
              <strong className="text-foreground">{leadTimeDays}-day delivery wait</strong>, and a{" "}
              <strong className="text-foreground">+{safetyBufferPercent}% safety cushion</strong>. Reorder reminder triggers when stock drops to{" "}
              <strong className="text-foreground">{suggestedRop.toLocaleString()} units</strong> (currently{" "}
              <strong className="text-foreground">{product.stock.toLocaleString()}</strong> on hand{shortage > 0 ? `, ${shortage.toLocaleString()} below minimum` : ""}).
            </p>
          </div>

          {onSetOverrideQty && (
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <label htmlFor="planned-order-qty" className="block text-xs font-semibold text-foreground mb-2">
                Adjust planned order quantity
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="planned-order-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={customQtyInput}
                  onChange={event => setCustomQtyInput(event.target.value)}
                  className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-semibold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsed = Math.max(1, Math.round(Number(customQtyInput) || eoq));
                    setCustomQtyInput(String(parsed));
                    onSetOverrideQty(product.id, parsed === eoq ? null : parsed);
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 cursor-pointer"
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
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
                  >
                    Round to {unitsPerPack}-unit pack
                  </button>
                )}
                {overrideQty != null && (
                  <button type="button" onClick={() => { setCustomQtyInput(String(eoq)); onSetOverrideQty(product.id, null); }} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    Reset
                  </button>
                )}
              </div>
              {effectivePacks != null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {effectivePacks} packs · estimated cost {fmt(effectiveQty * unitCost)}. Adjusting here does not place an order yet.
                </p>
              )}
            </div>
          )}

          {/* Formula & Math Steps Collapsed by Default */}
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/15">
            <button
              type="button"
              onClick={() => setShowFormula(prev => !prev)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <span>View formula &amp; math steps (EOQ &amp; ROP)</span>
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <span>{showFormula ? "Hide" : "Show"}</span>
                <ChevronRight size={13} className={`transition-transform ${showFormula ? "rotate-90" : ""}`} />
              </span>
            </button>

            {showFormula && (
              <div className="space-y-4 border-t border-border/60 bg-card/60 p-4">
                <div>
                  <p className="text-xs font-semibold text-foreground">Economic Order Quantity (EOQ)</p>
                  <p className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-center font-mono text-xs text-foreground">EOQ = √(2 × D × S ÷ H)</p>
                  <div className="mt-2.5 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
                    <p className="text-muted-foreground">D · Yearly demand <strong className="text-foreground">{annualDemand.toLocaleString()} units</strong></p>
                    <p className="text-muted-foreground">d · Daily pace <strong className="text-foreground">≈ {(annualDemand / 365).toFixed(2)} units/day</strong></p>
                    <p className="text-muted-foreground">S · Order fee <strong className="text-foreground">{fmt(orderCost)}</strong></p>
                    <p className="text-muted-foreground">H · Yearly storage/unit <strong className="text-foreground">{fmt(holdingCost)}</strong></p>
                    <p className="text-muted-foreground">Unit cost <strong className="text-foreground">{fmt(unitCost)}</strong></p>
                    <p className="text-muted-foreground sm:col-span-2">Demand source: <strong className="text-foreground">{demandSourceLabel}</strong></p>
                    <p className="text-muted-foreground sm:col-span-2">Cost source: <strong className="text-foreground">{costSourceLabel}</strong></p>
                  </div>
                  <ol className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                    <li>1. 2 × {annualDemand.toLocaleString()} × {fmt(orderCost)} = <strong className="text-foreground">{numerator.toLocaleString()}</strong></li>
                    <li>2. {numerator.toLocaleString()} ÷ {fmt(holdingCost)} = <strong className="text-foreground">{Math.round(ratio).toLocaleString()}</strong></li>
                    <li>3. √{Math.round(ratio).toLocaleString()} = <strong className="text-foreground">{rawEoq.toLocaleString()} units</strong></li>
                  </ol>
                </div>

                <div className="border-t border-border/60 pt-3">
                  <p className="text-xs font-semibold text-foreground">Restock point (ROP)</p>
                  <p className="mt-1.5 rounded-lg bg-muted/50 px-3 py-2 text-center font-mono text-xs text-foreground">ROP = (D ÷ 365 × {leadTimeDays} days) × (1 + {safetyBufferPercent}% buffer)</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Calculation: ({annualDemand.toLocaleString()} ÷ 365 × {leadTimeDays}) × (1 + {safetyBufferPercent}%) = <strong className="text-foreground">{suggestedRop.toLocaleString()} units</strong>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {onReorder && (
          <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" onClick={() => { onClose(); onReorder(product); }} className="rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer">
              Edit medicine
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function EoqSettingsModal({
  isAutoMode,
  orderCost,
  holdingPercent,
  leadTimeDays,
  safetyBufferPercent,
  smartRecs,
  onSave,
  onReset,
  onClose,
}: {
  isAutoMode: boolean;
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
  const [autoEnabled, setAutoEnabled] = useState(isAutoMode);
  const [formOrderCost, setFormOrderCost] = useState(String(orderCost));
  const [formHoldingPercent, setFormHoldingPercent] = useState(String(holdingPercent));
  const [formLeadTimeDays, setFormLeadTimeDays] = useState(String(leadTimeDays));
  const [formSafetyBuffer, setFormSafetyBuffer] = useState(String(safetyBufferPercent));
  const [useCustomBuffer, setUseCustomBuffer] = useState(() => ![15, 20, 30].includes(safetyBufferPercent));
  const [showAdvanced, setShowAdvanced] = useState(false);

  const safetyLevelLabel = (pct: number) => {
    if (pct <= 15) return "Light";
    if (pct <= 22) return "Normal";
    if (pct <= 27) return "Moderate";
    return "High";
  };

  const handleToggleAuto = () => {
    setAutoEnabled(prev => {
      const next = !prev;
      if (next) {
        setFormOrderCost(String(smartRecs.benchmarkOrderCost));
        setFormHoldingPercent(String(smartRecs.benchmarkHoldingRate));
        setFormLeadTimeDays(String(smartRecs.recommendedLeadDays));
        setFormSafetyBuffer(String(smartRecs.recommendedSafetyBuffer));
        setUseCustomBuffer(![15, 20, 30].includes(smartRecs.recommendedSafetyBuffer));
        setShowAdvanced(false);
      }
      return next;
    });
  };

  const previewCost = Math.max(1, parseFloat(formOrderCost) || 120);
  const previewHold = Math.min(100, Math.max(1, parseFloat(formHoldingPercent) || 20));
  const previewLead = Math.min(90, Math.max(1, Math.round(parseFloat(formLeadTimeDays) || smartRecs.recommendedLeadDays)));
  const previewBuffer = Math.min(200, Math.max(0, Math.round(parseFloat(formSafetyBuffer) || 0)));
  const sampleRop = Math.max(1, Math.round(10 * previewLead * (1 + previewBuffer / 100)));
  const sampleEoq = Math.max(1, Math.round(Math.sqrt((2 * 3650 * previewCost) / Math.max(0.01, 50 * (previewHold / 100)))));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (autoEnabled) {
      onReset();
      onClose();
      return;
    }
    const cost = Math.max(1, parseFloat(formOrderCost) || 120);
    const hold = Math.min(100, Math.max(1, parseFloat(formHoldingPercent) || 20));
    const lead = Math.min(90, Math.max(1, Math.round(parseFloat(formLeadTimeDays) || smartRecs.recommendedLeadDays)));
    const parsedBuf = parseFloat(formSafetyBuffer);
    const buffer = Math.min(200, Math.max(0, Number.isFinite(parsedBuf) ? Math.round(parsedBuf) : smartRecs.recommendedSafetyBuffer));
    onSave(cost, hold, lead, buffer);
    onClose();
  };

  const showDoneOnly = autoEnabled && isAutoMode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restock-settings-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 id="restock-settings-title" className="text-base font-semibold text-foreground">
              Restocking settings
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Automatic mode calculates reorder timing from your sales and deliveries.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close restocking settings"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Master Apple-Style Switch */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/15 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Calculate automatically</p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Recommended · Uses your live sales pace &amp; supplier deliveries
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoEnabled}
              aria-label="Calculate restocking automatically"
              onClick={handleToggleAuto}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                autoEnabled ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  autoEnabled ? "translate-x-[22px]" : "translate-x-[2px]"
                }`}
              />
            </button>
          </div>

          {autoEnabled ? (
            /* Calm Read-Only Summary When Automatic is ON */
            <section className="overflow-hidden rounded-2xl border border-border/70 bg-muted/15 divide-y divide-border/50">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Delivery wait time</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {smartRecs.hasEmpiricalData
                      ? `Average from ${smartRecs.totalReceiptsCount} recorded deliveries`
                      : "Standard pharmacy delivery estimate"}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                  {smartRecs.recommendedLeadDays} days
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Safety cushion</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {smartRecs.hasEmpiricalData
                      ? `Sized for ${smartRecs.fulfillmentPct}% supplier fulfillment`
                      : "Extra backup against late deliveries"}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                  {safetyLevelLabel(smartRecs.recommendedSafetyBuffer)} (+{smartRecs.recommendedSafetyBuffer}%)
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Order sizing</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    ₱{smartRecs.benchmarkOrderCost} shipping/order · {smartRecs.benchmarkHoldingRate}% yearly storage
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-primary">
                  Balanced
                </span>
              </div>
            </section>
          ) : (
            /* Clean Manual Controls Only When Automatic is Turned OFF */
            <>
              <section className="overflow-hidden rounded-2xl border border-border/70 bg-muted/15 divide-y divide-border/50">
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <label htmlFor="restock-lead-time" className="block text-xs font-semibold text-foreground">
                      Delivery wait time
                    </label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Days from ordering to store delivery
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                    <input
                      id="restock-lead-time"
                      type="number"
                      step="1"
                      min="1"
                      max="90"
                      value={formLeadTimeDays}
                      onChange={e => setFormLeadTimeDays(e.target.value)}
                      className="w-12 bg-transparent text-right text-sm font-semibold tabular-nums text-foreground focus:outline-none"
                      required
                    />
                    <span className="ml-1.5 shrink-0 whitespace-nowrap text-xs text-muted-foreground">days</span>
                  </div>
                </div>

                <div className="space-y-2.5 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">Safety cushion</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Extra backup stock in case of delays
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                      +{previewBuffer}%
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/70 p-1">
                    {[
                      { label: "Light", sub: "15%", value: 15 },
                      { label: "Normal", sub: "20%", value: 20 },
                      { label: "High", sub: "30%", value: 30 },
                    ].map(opt => {
                      const active = !useCustomBuffer && Number(formSafetyBuffer) === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setUseCustomBuffer(false);
                            setFormSafetyBuffer(String(opt.value));
                          }}
                          className={`rounded-lg py-1.5 text-center transition-all cursor-pointer ${
                            active
                              ? "bg-background text-foreground shadow-sm font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span className="block text-[11px]">{opt.label}</span>
                          <span className="block text-[10px] tabular-nums opacity-75">{opt.sub}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setUseCustomBuffer(true)}
                      className={`rounded-lg py-1.5 text-center transition-all cursor-pointer ${
                        useCustomBuffer
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="block text-[11px]">Custom</span>
                      <span className="block text-[10px] tabular-nums opacity-75">%</span>
                    </button>
                  </div>

                  {useCustomBuffer && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                      <label htmlFor="restock-safety-buffer" className="text-xs text-muted-foreground">
                        Custom cushion percentage
                      </label>
                      <div className="flex shrink-0 items-center rounded-lg border border-border bg-background px-2.5 py-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                        <input
                          id="restock-safety-buffer"
                          type="number"
                          step="1"
                          min="0"
                          max="200"
                          value={formSafetyBuffer}
                          onChange={e => setFormSafetyBuffer(e.target.value)}
                          className="w-12 bg-transparent text-right text-sm font-semibold tabular-nums text-foreground focus:outline-none"
                          required
                        />
                        <span className="ml-1 shrink-0 whitespace-nowrap text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Collapsed Disclosure for Accounting / Thesis Defense (EOQ S & I) */}
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/15">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Advanced cost settings</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      ₱{previewCost} order fee · {previewHold}% yearly storage
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-primary">
                    <span>{showAdvanced ? "Hide" : "Adjust"}</span>
                    <ChevronRight size={13} className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
                  </span>
                </button>

                {showAdvanced && (
                  <div className="space-y-3 border-t border-border/60 bg-card/60 px-4 py-3.5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="restock-order-cost" className="mb-1 block text-xs font-medium text-foreground">
                          Order fee (EOQ S)
                        </label>
                        <div className="flex items-center rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                          <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">₱</span>
                          <input
                            id="restock-order-cost"
                            type="number"
                            step="any"
                            min="1"
                            value={formOrderCost}
                            onChange={e => setFormOrderCost(e.target.value)}
                            className="w-full min-w-0 bg-transparent text-sm font-medium tabular-nums text-foreground focus:outline-none"
                            required
                          />
                          <span className="ml-1.5 shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">/ order</span>
                        </div>
                        <p className="mt-1 text-[10.5px] text-muted-foreground">
                          Courier &amp; processing fee per PO.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="restock-holding-rate" className="mb-1 block text-xs font-medium text-foreground">
                          Storage cost (EOQ I)
                        </label>
                        <div className="flex items-center rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                          <input
                            id="restock-holding-rate"
                            type="number"
                            step="any"
                            min="1"
                            max="100"
                            value={formHoldingPercent}
                            onChange={e => setFormHoldingPercent(e.target.value)}
                            className="w-full min-w-0 bg-transparent text-sm font-medium tabular-nums text-foreground focus:outline-none"
                            required
                          />
                          <span className="ml-1.5 shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">% / yr</span>
                        </div>
                        <p className="mt-1 text-[10.5px] text-muted-foreground">
                          Cooling, shelving &amp; expiry risk.
                        </p>
                      </div>
                    </div>

                    {smartRecs.supplierBreakdown.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">Supplier delivery history: </span>
                        <span className="tabular-nums">
                          {smartRecs.supplierBreakdown
                            .map(s => `${s.name.replace(/ (Corporation|\(Unilab\)|Inc\.|Supplies|Distributors|Traders|Pharma)/g, "")}: ${s.leadDays.toFixed(1)}d`)
                            .join(" · ")}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-[11px]">
                      <span className="text-muted-foreground">Sample (10/day, ₱50 cost):</span>
                      <span className="font-medium tabular-nums text-foreground">
                        Reorder at <strong>{sampleRop}</strong> · Order ~<strong>{sampleEoq}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3.5">
            {showDoneOnly ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 cursor-pointer"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 cursor-pointer"
                >
                  {autoEnabled ? "Switch to Auto" : "Save settings"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function computeRollingSmape(vals: number[], window: number): number | null {
  if (vals.length <= window) return null;
  let sumWindow = 0;
  for (let k = 0; k < window; k++) sumWindow += vals[k];
  let sumSmape = 0;
  let validCount = 0;
  for (let i = window; i < vals.length; i++) {
    const actual = vals[i];
    const forecast = sumWindow / window;
    const denom = (Math.abs(actual) + Math.abs(forecast)) / 2;
    if (denom > 0) {
      sumSmape += Math.abs(actual - forecast) / denom;
      validCount++;
    }
    sumWindow += actual - vals[i - window];
  }
  if (validCount === 0) return null;
  return Math.round((sumSmape / validCount) * 1000) / 10;
}

const AnalyticsPage = memo(function AnalyticsPage({
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

  const contentScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("smarttrack_analytics_section", activeSection);
    } catch { /* ignore */ }
  }, [activeSection]);

  useLayoutEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [activeSection]);
  const [smaInspector, setSmaInspector] = useState<{ type: "sma3" | "sma6" | "eoq"; unit: "month" | "week" } | null>(null);
  const [smapeInspector, setSmapeInspector] = useState<"sma3" | "sma6" | null>(null);
  const [showChartModelComparison, setShowChartModelComparison] = useState(false);
  const [forecastChartStyle, setForecastChartStyle] = useState<"area" | "bars">("area");
  const [forecastZeroBaseline, setForecastZeroBaseline] = useState(false);
  const [selectedSmaProduct, setSelectedSmaProduct] = useState<{ id: string; unit: "month" | "week" } | null>(null);

  const [selectedEoqProductId, setSelectedEoqProductId] = useState<string | null>(null);

  const [smaData, setSmaData] = useState<Awaited<ReturnType<typeof analyticsApi.sma>> | null>(() => analyticsApi.peekSma());
  const [smaLoading, setSmaLoading] = useState(() => !analyticsApi.peekSma());
  const [categoryData, setCategoryData] = useState<Awaited<ReturnType<typeof analyticsApi.categorySales>>>(() => analyticsApi.peekCategorySales() ?? []);
  const [categorySalesLoading, setCategorySalesLoading] = useState(() => !analyticsApi.peekCategorySales());
  const [categorySalesError, setCategorySalesError] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => purchaseOrdersApi.peekList() ?? []);
  const [supplierPerformance, setSupplierPerformance] = useState<SupplierPerformance[]>(() => purchaseOrdersApi.peekPerformance() ?? []);
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
    const cached = analyticsApi.peekSma(scopeFilter);
    if (cached) {
      setSmaData(cached);
      setSmaLoading(false);
      return () => { active = false; };
    }
    setSmaLoading(true);
    analyticsApi.sma(scopeFilter)
      .then(data => { if (active) setSmaData(data); })
      .catch(error => console.error("Analytics chart load failed:", error))
      .finally(() => { if (active) setSmaLoading(false); });
    return () => { active = false; };
  }, [scopeFilter]);

  useEffect(() => {
    let active = true;
    const cachedOrders = purchaseOrdersApi.peekList();
    const cachedPerf = purchaseOrdersApi.peekPerformance();
    if (cachedOrders && cachedPerf) {
      setPurchaseOrders(cachedOrders);
      setSupplierPerformance(cachedPerf);
      return () => { active = false; };
    }
    Promise.allSettled([purchaseOrdersApi.list(), purchaseOrdersApi.performance()]).then(([ordersResult, performanceResult]) => {
      if (!active) return;
      if (ordersResult.status === "fulfilled") setPurchaseOrders(ordersResult.value);
      if (performanceResult.status === "fulfilled") setSupplierPerformance(performanceResult.value);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const cached = analyticsApi.peekCategorySales();
    if (cached) {
      setCategoryData(cached);
      setCategorySalesLoading(false);
      setCategorySalesError(false);
      return () => { active = false; };
    }
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
  const [forecastHistoryRange, setForecastHistoryRange] = useState<"3m" | "6m" | "12m" | "all">("all");
  const [productsSearch, setProductsSearch] = useState("");
  const [productsCategory, setProductsCategory] = useState("all");
  const [productsFilter, setProductsFilter] = useState<"all" | "shortfall" | "rising" | "high_confidence" | "needs_data">("all");
  const [productsPage, setProductsPage] = useState(1);
  const PRODUCT_FORECAST_PAGE_SIZE = 10;

  const monthlyDemand = useMemo(() => getMonthlyDemand(transactions), [transactions]);
  const demandValues = useMemo(() => monthlyDemand.map(d => d.demand), [monthlyDemand]);

  const scopedProductIds = useMemo(() => new Set(scopedInventory.map(product => String(product.id))), [scopedInventory]);

  // Single-pass sale transaction index for O(P + T) analytics
  const salesIndex = useMemo(() => {
    const parsed: { productId: string; time: number; qty: number; monthKey: string }[] = [];
    const byProductId = new Map<string, { time: number; qty: number; monthKey: string }[]>();
    let minKey = "";
    let maxKey = "";
    let allMinTime = Number.POSITIVE_INFINITY;
    let allMaxTime = Number.NEGATIVE_INFINITY;

    for (const tx of transactions) {
      if (tx.type !== "sale") continue;
      const d = parseTransactionDate(tx.date);
      if (!d) continue;
      const time = d.getTime();
      if (time < allMinTime) allMinTime = time;
      if (time > allMaxTime) allMaxTime = time;
      if (!tx.productId) continue;
      const pid = String(tx.productId);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!minKey || mk < minKey) minKey = mk;
      if (!maxKey || mk > maxKey) maxKey = mk;
      const entry = { time, qty: tx.qty, monthKey: mk };
      parsed.push({ productId: pid, ...entry });
      let arr = byProductId.get(pid);
      if (!arr) {
        arr = [];
        byProductId.set(pid, arr);
      }
      arr.push(entry);
    }

    const monthlyPeriodKeys: { key: string; label: string }[] = [];
    if (minKey && maxKey) {
      let curIdx = Number(minKey.slice(0, 4)) * 12 + (Number(minKey.slice(5, 7)) - 1);
      const endIdx = Number(maxKey.slice(0, 4)) * 12 + (Number(maxKey.slice(5, 7)) - 1);
      while (curIdx <= endIdx) {
        const y = Math.floor(curIdx / 12);
        const m = curIdx % 12;
        monthlyPeriodKeys.push({
          key: `${y}-${String(m + 1).padStart(2, "0")}`,
          label: `${SHORT_MONTHS[m]} ${y}`,
        });
        curIdx++;
      }
    }

    return { parsed, byProductId, monthlyPeriodKeys, allMinTime, allMaxTime };
  }, [transactions]);

  // Weekly series for the active scope — computed only when Weekly granularity is active
  const weeklyScopeData = useMemo(() => {
    if (forecastPeriodUnit !== "week" || salesIndex.parsed.length === 0 || !Number.isFinite(salesIndex.allMaxTime)) {
      return EMPTY_WEEKLY_SCOPE;
    }
    const maxTime = salesIndex.allMaxTime;
    let scopedMinTime = Number.POSITIVE_INFINITY;
    for (const sale of salesIndex.parsed) {
      if (scope !== "all" && !scopedProductIds.has(sale.productId)) continue;
      if (sale.time < scopedMinTime) scopedMinTime = sale.time;
    }
    if (!Number.isFinite(scopedMinTime)) return EMPTY_WEEKLY_SCOPE;

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const totalWeeks = Math.min(24, Math.max(1, Math.ceil((maxTime - scopedMinTime + 1) / msPerWeek)));
    const weekBuckets = new Array<number>(totalWeeks).fill(0);
    const weekLabels = new Array<string>(totalWeeks);
    const earliestStart = maxTime - totalWeeks * msPerWeek + 1;

    for (let i = 0; i < totalWeeks; i++) {
      const bucketEnd = new Date(maxTime - (totalWeeks - 1 - i) * msPerWeek);
      weekLabels[i] = `Wk ${SHORT_MONTHS[bucketEnd.getMonth()]} ${bucketEnd.getDate()}`;
    }

    for (const sale of salesIndex.parsed) {
      if (scope !== "all" && !scopedProductIds.has(sale.productId)) continue;
      if (sale.time < earliestStart || sale.time > maxTime) continue;
      const offsetFromEnd = Math.floor((maxTime - sale.time) / msPerWeek);
      const idx = totalWeeks - 1 - offsetFromEnd;
      if (idx >= 0 && idx < totalWeeks) weekBuckets[idx] += sale.qty;
    }

    const chartData = weekBuckets.map((demand, idx) => ({
      month: weekLabels[idx],
      demand,
      supply: 0,
      sma3: idx >= 3 ? (weekBuckets[idx - 3] + weekBuckets[idx - 2] + weekBuckets[idx - 1]) / 3 : null,
      sma6: idx >= 6 ? (weekBuckets[idx - 6] + weekBuckets[idx - 5] + weekBuckets[idx - 4] + weekBuckets[idx - 3] + weekBuckets[idx - 2] + weekBuckets[idx - 1]) / 6 : null,
    }));

    const nextDate = new Date(maxTime + msPerWeek);
    return {
      chartData,
      sma3: Math.round(computeSMA(weekBuckets, 3)),
      sma6: Math.round(computeSMA(weekBuckets, 6)),
      nextLabel: `Wk ${SHORT_MONTHS[nextDate.getMonth()]} ${nextDate.getDate()}`,
    };
  }, [forecastPeriodUnit, salesIndex, scope, scopedProductIds]);

  const smaChartData = forecastPeriodUnit === "week" ? weeklyScopeData.chartData : (smaData?.chartData ?? []);
  const forecastSMA3 = forecastPeriodUnit === "week" ? weeklyScopeData.sma3 : (smaData?.sma3 ?? 0);
  const forecastSMA6 = forecastPeriodUnit === "week" ? weeklyScopeData.sma6 : (smaData?.sma6 ?? 0);

  const onHandUnits = useMemo(
    () => scopedInventory.reduce((sum, product) => sum + product.stock, 0),
    [scopedInventory]
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

  const { salesMonths, latestSalesMonth } = useMemo(() => {
    const withDemand = smaChartData.filter(point => point.demand > 0);
    const latest = smaChartData.length > 0 ? smaChartData[smaChartData.length - 1] : (withDemand[withDemand.length - 1] ?? null);
    return { salesMonths: withDemand, latestSalesMonth: latest };
  }, [smaChartData]);

  const nextForecastMonth = useMemo(() => {
    if (forecastPeriodUnit === "week") return weeklyScopeData.nextLabel;
    return formatNextMonthLabel(smaChartData);
  }, [smaChartData, forecastPeriodUnit, weeklyScopeData.nextLabel]);

  // Back-test points come from the API's rolling forecasts. Each forecast uses
  // only earlier periods, never the actual sales of its own test period.
  const sma3Error = useMemo(() => {
    const valid = smaChartData
      .filter(d => d.sma3 != null && (d.demand > 0 || (d.sma3 ?? 0) > 0))
      .map(d => ({ actual: d.demand, forecast: d.sma3 ?? 0 }));
    return computeSmapeSeries(valid);
  }, [smaChartData]);

  const sma6Error = useMemo(() => {
    const valid = smaChartData
      .filter(d => d.sma6 != null && (d.demand > 0 || (d.sma6 ?? 0) > 0))
      .map(d => ({ actual: d.demand, forecast: d.sma6 ?? 0 }));
    const res = computeSmapeSeries(valid);
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

  const selectedForecast = useMemo(
    () => selectBestForecastModel(smaChartData),
    [smaChartData]
  );

  // Overview stays consistently Monthly regardless of Forecast tab's Weekly toggle
  const overviewChartData = useMemo(() => smaData?.chartData ?? [], [smaData]);
  const overviewForecastSelection = useMemo(
    () => selectBestForecastModel(overviewChartData),
    [overviewChartData]
  );
  const overviewForecastModel = overviewForecastSelection?.model ?? "SMA-3";
  const overviewSMA3 = smaData?.sma3 ?? 0;
  const overviewSMA6 = smaData?.sma6 ?? 0;
  const overviewForecastUnits = overviewForecastModel === "SMA-3" ? overviewSMA3 : overviewSMA6;
  const overviewNextMonth = useMemo(() => formatNextMonthLabel(overviewChartData), [overviewChartData]);
  const overviewLatestMonth = overviewChartData.length > 0 ? overviewChartData[overviewChartData.length - 1] : null;

  // ── Product-Level Monthly SMA Forecast Engine (independent of Weekly toggle) ──
  const monthlyProductForecastMap = useMemo(() => {
    const { byProductId, monthlyPeriodKeys } = salesIndex;
    type ProductForecastEntry = {
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
    };
    const byProduct = new Map<string, ProductForecastEntry>();

    for (const p of inventory) {
      const pid = String(p.id);
      const prodSales = byProductId.get(pid);
      let totalSold = 0;
      const monthTotals = new Map<string, number>();
      if (prodSales) {
        for (const s of prodSales) {
          totalSold += s.qty;
          monthTotals.set(s.monthKey, (monthTotals.get(s.monthKey) ?? 0) + s.qty);
        }
      }

      let firstMonthKey = "";
      for (const mk of monthTotals.keys()) {
        if (!firstMonthKey || mk < firstMonthKey) firstMonthKey = mk;
      }

      const continuousMonths: { label: string; qty: number }[] = [];
      const monthlySeries: number[] = [];
      if (firstMonthKey) {
        for (const mp of monthlyPeriodKeys) {
          if (mp.key < firstMonthKey) continue;
          const qty = monthTotals.get(mp.key) ?? 0;
          continuousMonths.push({ label: mp.label, qty });
          monthlySeries.push(qty);
        }
      }

      const totalPeriods = monthlySeries.length;
      let activePeriods = 0;
      for (const v of monthlySeries) if (v > 0) activePeriods++;
      let recent6Active = 0;
      const r6Start = Math.max(0, totalPeriods - 6);
      for (let i = r6Start; i < totalPeriods; i++) if (monthlySeries[i] > 0) recent6Active++;

      const monthlySma3 = computeSMA(monthlySeries, 3);
      const monthlySma6 = computeSMA(monthlySeries, 6);
      const err3 = computeRollingSmape(monthlySeries, 3);
      const err6 = computeRollingSmape(monthlySeries, 6);
      const recommendedModel: "SMA-3" | "SMA-6" =
        err3 != null && err6 != null ? (err3 <= err6 ? "SMA-3" : "SMA-6") : "SMA-3";
      const recommendedForecast = recommendedModel === "SMA-3" ? monthlySma3 : monthlySma6;

      let confidenceTier: "high" | "short" | "intermittent" | "insufficient" = "insufficient";
      let confidenceLabel = "No Sales History";
      if (totalSold === 0 || totalPeriods === 0) {
        confidenceTier = "insufficient";
        confidenceLabel = "No Sales History";
      } else if (totalPeriods >= 6 && recent6Active >= 4) {
        confidenceTier = "high";
        confidenceLabel = `High Confidence (${totalPeriods} months)`;
      } else if (totalPeriods >= 3 && activePeriods >= 2 && recent6Active >= 2) {
        confidenceTier = "short";
        confidenceLabel = `Short History (${totalPeriods} months · SMA-3)`;
      } else {
        confidenceTier = "intermittent";
        confidenceLabel = `Sporadic Sales (${activePeriods}/${Math.max(totalPeriods, 1)} active)`;
      }

      let trendDirection: "rising" | "steady" | "slowing" | "none" = "none";
      let trendPercent = 0;
      if (totalSold > 0 && monthlySma6 > 0 && totalPeriods >= 2) {
        trendPercent = Math.round(((monthlySma3 - monthlySma6) / monthlySma6) * 100);
        if (trendPercent === 0 && monthlySeries.length >= 2) {
          const prevLen = monthlySeries.length - 1;
          const prevStart = Math.max(0, prevLen - 3);
          let prevSum = 0;
          for (let i = prevStart; i < prevLen; i++) prevSum += monthlySeries[i];
          const prevAvg = prevLen - prevStart > 0 ? prevSum / (prevLen - prevStart) : 0;
          if (prevAvg > 0) {
            trendPercent = Math.round(((monthlySeries[monthlySeries.length - 1] - prevAvg) / prevAvg) * 100);
          }
        }
        if (trendPercent >= 10) trendDirection = "rising";
        else if (trendPercent <= -10) trendDirection = "slowing";
        else trendDirection = "steady";
      }

      const incomingQty = incomingByProductMap.get(pid) ?? 0;
      const dailyBurn = recommendedForecast / DAYS_PER_MONTH;
      const daysOfSupply = dailyBurn > 0.05 ? Math.round(p.stock / dailyBurn) : null;
      const projectedShortfall = totalSold > 0
        ? Math.max(0, Math.round(recommendedForecast) - (p.stock + incomingQty))
        : Math.max(0, getReorderUnits(p) - (p.stock + incomingQty));

      byProduct.set(pid, {
        product: p,
        totalSold,
        sma3: monthlySma3,
        sma6: monthlySma6,
        monthlySma3,
        monthlySma6,
        recommendedModel,
        recommendedForecast,
        monthlyEquivalentForecast: recommendedForecast,
        smape3: err3,
        smape6: err6,
        activePeriods,
        totalPeriods,
        recent3Periods: continuousMonths.slice(-3),
        recent6Periods: continuousMonths.slice(-6),
        confidenceTier,
        confidenceLabel,
        trendDirection,
        trendPercent,
        incomingQty,
        daysOfSupply,
        projectedShortfall,
      });
    }

    return byProduct;
  }, [inventory, salesIndex, incomingByProductMap]);

  const productForecastMap = useMemo(() => {
    if (forecastPeriodUnit === "month" || !Number.isFinite(salesIndex.allMaxTime) || salesIndex.parsed.length === 0) {
      return monthlyProductForecastMap;
    }

    const { byProductId, allMaxTime, allMinTime } = salesIndex;
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const totalWeeks = Math.min(24, Math.max(1, Math.ceil((allMaxTime - allMinTime + 1) / msPerWeek)));
    const earliestWeekStart = allMaxTime - totalWeeks * msPerWeek + 1;
    const weekLabels = new Array<string>(totalWeeks);
    for (let i = 0; i < totalWeeks; i++) {
      const bucketEnd = new Date(allMaxTime - (totalWeeks - 1 - i) * msPerWeek);
      weekLabels[i] = `Wk ${SHORT_MONTHS[bucketEnd.getMonth()]} ${bucketEnd.getDate()}`;
    }

    const weeklyMap = new Map<string, ReturnType<typeof monthlyProductForecastMap.get> extends infer V ? Exclude<V, undefined> : never>();
    for (const [pid, base] of monthlyProductForecastMap) {
      if (base.totalSold === 0) {
        weeklyMap.set(pid, base);
        continue;
      }
      const prodSales = byProductId.get(pid);
      const counts = new Array<number>(totalWeeks).fill(0);
      if (prodSales) {
        for (const s of prodSales) {
          if (s.time < earliestWeekStart || s.time > allMaxTime) continue;
          const idx = totalWeeks - 1 - Math.floor((allMaxTime - s.time) / msPerWeek);
          if (idx >= 0 && idx < totalWeeks) counts[idx] += s.qty;
        }
      }
      const firstIdx = counts.findIndex(v => v > 0);
      const displaySeries = firstIdx >= 0
        ? counts.slice(firstIdx).map((qty, idx) => ({ label: weekLabels[firstIdx + idx], qty }))
        : [];
      const vals = displaySeries.map(d => d.qty);
      const totalPeriods = vals.length;
      const activePeriods = vals.filter(v => v > 0).length;
      const recent6Active = vals.slice(-6).filter(v => v > 0).length;
      const sma3 = computeSMA(vals, 3);
      const sma6 = computeSMA(vals, 6);
      const err3 = computeRollingSmape(vals, 3);
      const err6 = computeRollingSmape(vals, 6);
      const recommendedModel: "SMA-3" | "SMA-6" =
        err3 != null && err6 != null ? (err3 <= err6 ? "SMA-3" : "SMA-6") : "SMA-3";
      const recommendedForecast = recommendedModel === "SMA-3" ? sma3 : sma6;
      const monthlyEquivalentForecast = recommendedForecast * WEEKS_PER_MONTH;

      let confidenceTier: "high" | "short" | "intermittent" | "insufficient" = "insufficient";
      let confidenceLabel = "No Sales History";
      if (totalPeriods > 0) {
        if (totalPeriods >= 6 && recent6Active >= 4) {
          confidenceTier = "high";
          confidenceLabel = `High Confidence (${totalPeriods} weeks)`;
        } else if (totalPeriods >= 3 && activePeriods >= 2 && recent6Active >= 2) {
          confidenceTier = "short";
          confidenceLabel = `Short History (${totalPeriods} weeks · SMA-3)`;
        } else {
          confidenceTier = "intermittent";
          confidenceLabel = `Sporadic Sales (${activePeriods}/${Math.max(totalPeriods, 1)} active)`;
        }
      }

      let trendDirection: "rising" | "steady" | "slowing" | "none" = "none";
      let trendPercent = 0;
      if (sma6 > 0 && totalPeriods >= 2) {
        trendPercent = Math.round(((sma3 - sma6) / sma6) * 100);
        if (trendPercent === 0 && vals.length >= 2) {
          const prevAvg = computeSMA(vals.slice(0, -1), 3);
          if (prevAvg > 0) trendPercent = Math.round(((vals[vals.length - 1] - prevAvg) / prevAvg) * 100);
        }
        if (trendPercent >= 10) trendDirection = "rising";
        else if (trendPercent <= -10) trendDirection = "slowing";
        else trendDirection = "steady";
      }

      const dailyBurn = monthlyEquivalentForecast / DAYS_PER_MONTH;
      const daysOfSupply = dailyBurn > 0.05 ? Math.round(base.product.stock / dailyBurn) : null;
      const projectedShortfall = Math.max(0, Math.round(monthlyEquivalentForecast) - (base.product.stock + base.incomingQty));

      weeklyMap.set(pid, {
        ...base,
        sma3,
        sma6,
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
        daysOfSupply,
        projectedShortfall,
      });
    }
    return weeklyMap;
  }, [forecastPeriodUnit, monthlyProductForecastMap, salesIndex]);

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

  const forecastReadinessStats = useMemo(
    () => computeReadinessStats(productForecastList),
    [productForecastList]
  );

  const monthlyProductList = useMemo(() => {
    const rows = inventory
      .map(p => monthlyProductForecastMap.get(String(p.id)))
      .filter((r): r is NonNullable<typeof r> => r != null);
    return rows.sort((a, b) => {
      if (b.monthlyEquivalentForecast !== a.monthlyEquivalentForecast) {
        return b.monthlyEquivalentForecast - a.monthlyEquivalentForecast;
      }
      return b.projectedShortfall - a.projectedShortfall;
    });
  }, [inventory, monthlyProductForecastMap]);

  const productsByCategory = useMemo(() => {
    if (productsCategory === "all") return monthlyProductList;
    return monthlyProductList.filter(row => {
      const productCats = row.product.categories?.length
        ? row.product.categories
        : row.product.category.split(",").map(item => item.trim()).filter(Boolean);
      return productCats.includes(productsCategory);
    });
  }, [monthlyProductList, productsCategory]);

  const productsReadinessStats = useMemo(
    () => computeReadinessStats(productsByCategory),
    [productsByCategory]
  );

  const filteredProductsTab = useMemo(() => {
    const q = productsSearch.trim().toLowerCase();
    return productsByCategory.filter(row => {
      if (productsFilter === "shortfall" && row.projectedShortfall <= 0) return false;
      if (productsFilter === "rising" && row.trendDirection !== "rising") return false;
      if (productsFilter === "high_confidence" && row.confidenceTier !== "high") return false;
      if (productsFilter === "needs_data" && row.confidenceTier !== "intermittent" && row.confidenceTier !== "insufficient") return false;
      if (!q) return true;
      return (
        row.product.name.toLowerCase().includes(q) ||
        row.product.id.toLowerCase().includes(q) ||
        row.product.category.toLowerCase().includes(q)
      );
    });
  }, [productsByCategory, productsSearch, productsFilter]);

  const paginatedProductsTab = useMemo(() => {
    const start = (productsPage - 1) * PRODUCT_FORECAST_PAGE_SIZE;
    return filteredProductsTab.slice(start, start + PRODUCT_FORECAST_PAGE_SIZE);
  }, [filteredProductsTab, productsPage]);

  const avgUnitCost = useMemo(() => {
    let unitsWithCost = 0;
    let inventoryCost = 0;
    for (const product of scopedInventory) {
      for (const batch of product.batches) {
        if (batch.unitCost != null && batch.unitCost > 0 && batch.qty > 0) {
          unitsWithCost += batch.qty;
          inventoryCost += batch.unitCost * batch.qty;
        }
      }
    }
    if (unitsWithCost > 0) return inventoryCost / unitsWithCost;
    if (scopedInventory.length === 0) return 0;
    const estSum = scopedInventory.reduce((sum, p) => sum + (p.price > 0 ? p.price * 0.7 : 5), 0);
    return estSum / scopedInventory.length;
  }, [scopedInventory]);

  const activeForecastModel = selectedForecast?.model ?? "SMA-3";
  const activeForecastUnits = activeForecastModel === "SMA-3" ? forecastSMA3 : forecastSMA6;

  // Displayed slice respects the selected time window, while rolling SMA values stay computed on full history
  const displayedSmaChartData = useMemo(() => {
    if (forecastHistoryRange === "all") return smaChartData;
    const limit = forecastHistoryRange === "3m" ? 3 : forecastHistoryRange === "6m" ? 6 : 12;
    return smaChartData.slice(-limit);
  }, [smaChartData, forecastHistoryRange]);

  // Past Forecast vs. Actual check rows (newest first) comparing both SMA-3 & SMA-6
  const pastCheckRows = useMemo(() => {
    const calcGapPct = (actual: number, forecast: number | null) => {
      if (forecast == null) return null;
      const denom = (Math.abs(actual) + Math.abs(forecast)) / 2;
      return denom > 0 ? Math.round((Math.abs(actual - forecast) / denom) * 100) : 0;
    };
    return [...displayedSmaChartData].reverse().map(pt => {
      const gap3Pct = calcGapPct(pt.demand, pt.sma3);
      const gap6Pct = calcGapPct(pt.demand, pt.sma6);
      let closerModel: "SMA-3" | "SMA-6" | null = null;
      let gapPct: number | null = null;
      if (gap3Pct != null && gap6Pct != null) {
        closerModel = gap3Pct <= gap6Pct ? "SMA-3" : "SMA-6";
        gapPct = Math.min(gap3Pct, gap6Pct);
      } else if (gap3Pct != null) {
        closerModel = "SMA-3";
        gapPct = gap3Pct;
      } else if (gap6Pct != null) {
        closerModel = "SMA-6";
        gapPct = gap6Pct;
      }
      let closeness: "spot_on" | "close" | "swung" | "building" = "building";
      if (gapPct != null) {
        if (gapPct <= 12) closeness = "spot_on";
        else if (gapPct <= 28) closeness = "close";
        else closeness = "swung";
      }
      return {
        period: pt.month,
        actual: pt.demand,
        sma3: pt.sma3,
        sma6: pt.sma6,
        gap3Pct,
        gap6Pct,
        closerModel,
        hasBothModels: gap3Pct != null && gap6Pct != null,
        gapPct,
        closeness,
      };
    });
  }, [displayedSmaChartData]);

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

  const [restockAutoMode, setRestockAutoMode] = useState<boolean>(() => {
    try {
      const explicit = localStorage.getItem("smarttrack_eoq_custom_mode");
      if (explicit === "1") return false;
      if (explicit === "0") return true;
      return (
        localStorage.getItem("smarttrack_eoq_order_cost") == null &&
        localStorage.getItem("smarttrack_eoq_holding_rate") == null &&
        localStorage.getItem("smarttrack_eoq_lead_time") == null &&
        localStorage.getItem("smarttrack_eoq_safety_buffer") == null
      );
    } catch { return true; }
  });
  const [customOrderCost, setCustomOrderCost] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_order_cost");
      return saved ? Math.max(1, parseFloat(saved) || 120) : 120;
    } catch { return 120; }
  });
  const [customHoldingRate, setCustomHoldingRate] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_holding_rate");
      return saved ? Math.max(0.01, parseFloat(saved) || 0.20) : 0.20;
    } catch { return 0.20; }
  });
  const [customLeadTimeDays, setCustomLeadTimeDays] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_lead_time");
      return saved ? Math.min(90, Math.max(1, Math.round(parseFloat(saved) || 5))) : 5;
    } catch { return 5; }
  });
  const [customSafetyBuffer, setCustomSafetyBuffer] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_safety_buffer");
      return saved != null ? Math.min(200, Math.max(0, Math.round(parseFloat(saved)))) : 20;
    } catch { return 20; }
  });

  const orderCostSetting = restockAutoMode ? smartOperationalRecommendations.benchmarkOrderCost : customOrderCost;
  const holdingRateSetting = restockAutoMode ? smartOperationalRecommendations.benchmarkHoldingRate / 100 : customHoldingRate;
  const leadTimeDaysSetting = restockAutoMode ? smartOperationalRecommendations.recommendedLeadDays : customLeadTimeDays;
  const safetyBufferSetting = restockAutoMode ? smartOperationalRecommendations.recommendedSafetyBuffer : customSafetyBuffer;

  const [eoqOverrides, setEoqOverrides] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("smarttrack_eoq_overrides");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [showEoqSettingsModal, setShowEoqSettingsModal] = useState(false);
  const [inlineEditProductId, setInlineEditProductId] = useState<string | null>(null);
  const [inlineEditQty, setInlineEditQty] = useState("");

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

  const commitInlineOverride = (productId: string, recommendedQty: number) => {
    const parsed = Math.max(1, Math.round(Number(inlineEditQty) || recommendedQty));
    handleSetOverrideQty(productId, parsed === recommendedQty ? null : parsed);
    setInlineEditProductId(null);
  };

  const handleResetEoqSettings = (silent = false) => {
    const lead = smartOperationalRecommendations.recommendedLeadDays;
    const buffer = smartOperationalRecommendations.recommendedSafetyBuffer;
    setRestockAutoMode(true);
    setCustomOrderCost(120);
    setCustomHoldingRate(0.20);
    setCustomLeadTimeDays(lead);
    setCustomSafetyBuffer(buffer);
    try {
      localStorage.setItem("smarttrack_eoq_custom_mode", "0");
      localStorage.removeItem("smarttrack_eoq_order_cost");
      localStorage.removeItem("smarttrack_eoq_holding_rate");
      localStorage.removeItem("smarttrack_eoq_lead_time");
      localStorage.removeItem("smarttrack_eoq_safety_buffer");
    } catch { /* ignore */ }
    if (!silent) {
      showToast?.(`Auto mode restored (₱120 · 20% · ${lead}d · +${buffer}%)`, "info");
    }
  };

  const handleSaveEoqSettings = (cost: number, holdPercent: number, leadDays: number, safetyBuf: number) => {
    const matchesAuto =
      cost === smartOperationalRecommendations.benchmarkOrderCost &&
      holdPercent === smartOperationalRecommendations.benchmarkHoldingRate &&
      leadDays === smartOperationalRecommendations.recommendedLeadDays &&
      safetyBuf === smartOperationalRecommendations.recommendedSafetyBuffer;
    if (matchesAuto) {
      handleResetEoqSettings();
      return;
    }
    const rate = holdPercent / 100;
    setRestockAutoMode(false);
    setCustomOrderCost(cost);
    setCustomHoldingRate(rate);
    setCustomLeadTimeDays(leadDays);
    setCustomSafetyBuffer(safetyBuf);
    try {
      localStorage.setItem("smarttrack_eoq_custom_mode", "1");
      localStorage.setItem("smarttrack_eoq_order_cost", String(cost));
      localStorage.setItem("smarttrack_eoq_holding_rate", String(rate));
      localStorage.setItem("smarttrack_eoq_lead_time", String(leadDays));
      localStorage.setItem("smarttrack_eoq_safety_buffer", String(safetyBuf));
    } catch { /* ignore */ }
    showToast?.(`Custom rules saved — SmartTrack recalculated (₱${cost} · ${holdPercent}% · ${leadDays}d · +${safetyBuf}%)`, "success");
  };

  const handleResetAllToAuto = () => {
    handleResetEoqSettings(true);
    setEoqOverrides({});
    try {
      localStorage.removeItem("smarttrack_eoq_overrides");
    } catch { /* ignore */ }
    setInlineEditProductId(null);
    showToast?.("Restored automatic SmartTrack defaults", "info");
  };

  const annualDemand = useMemo(() => {
    const sourceSeries = scope === "all" && overviewChartData.length === 0
      ? demandValues
      : overviewChartData.map(d => d.demand);
    const histAnn = sourceSeries.reduce((sum, v) => sum + v, 0) * (12 / Math.max(sourceSeries.length, 1));
    const storeSma3 = smaData?.sma3 ?? 0;
    const storeSma6 = smaData?.sma6 ?? 0;
    if (demandBasis === "sma3" && storeSma3 > 0) return storeSma3 * 12;
    if (demandBasis === "sma6" && storeSma6 > 0) return storeSma6 * 12;
    if (demandBasis === "auto" && (storeSma3 > 0 || storeSma6 > 0)) {
      return (overviewForecastModel === "SMA-6" && storeSma6 > 0 ? storeSma6 : storeSma3) * 12;
    }
    return histAnn;
  }, [scope, overviewChartData, demandValues, demandBasis, smaData, overviewForecastModel]);

  const eoqOverall = useMemo(
    () => estimateEOQ(Math.round(annualDemand), avgUnitCost, orderCostSetting, holdingRateSetting),
    [annualDemand, avgUnitCost, orderCostSetting, holdingRateSetting]
  );

  const [restockSearch, setRestockSearch] = useState("");
  const [restockStatusFilter, setRestockStatusFilter] = useState<"all" | "out_of_stock" | "critical" | "low">("all");
  const [restockSourceFilter, setRestockSourceFilter] = useState<"all" | "sma" | "fallback" | "est_cost">("all");
  const [restockSupplierFilter, setRestockSupplierFilter] = useState<string>("all");
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

  const reorderRecs = useMemo(() => {
    const storeMonths = Math.max(monthlyDemand.length, 1);
    return inventory
      .map(p => {
        const pf = monthlyProductForecastMap.get(String(p.id));
        const totalSold = pf?.totalSold ?? 0;
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
        const incomingQty = incomingByProductMap.get(String(p.id)) ?? 0;
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
          recommendedUnits,
          overrideQty,
          effectiveOrderQty,
          incomingQty,
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
    monthlyDemand.length,
    monthlyProductForecastMap,
    incomingByProductMap,
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

  const restockSourceStats = useMemo(() => {
    let smaCount = 0;
    let fallbackCount = 0;
    let estCostCount = 0;
    reorderRecs.forEach(rec => {
      if (rec.isDemandFallback) fallbackCount++;
      else smaCount++;
      if (rec.isCostEstimated) estCostCount++;
    });
    return { total: reorderRecs.length, smaCount, fallbackCount, estCostCount };
  }, [reorderRecs]);

  const restockStatusStats = useMemo(() => {
    let out = 0;
    let critical = 0;
    let low = 0;
    reorderRecs.forEach(rec => {
      if (rec.product.status === "out_of_stock") out++;
      else if (rec.product.status === "critical") critical++;
      else if (rec.product.status === "low") low++;
    });
    return { total: reorderRecs.length, out, critical, low };
  }, [reorderRecs]);

  const scopedReorderRecs = useMemo(
    () => (scope === "all" ? reorderRecs : reorderRecs.filter(r => scopedProductIds.has(String(r.product.id)))),
    [scope, reorderRecs, scopedProductIds]
  );

  const scopedTotalEoqUnits = useMemo(
    () => scopedReorderRecs.reduce((sum, rec) => sum + rec.effectiveOrderQty, 0),
    [scopedReorderRecs]
  );
  const scopedEstimatedRestockCost = useMemo(
    () => scopedReorderRecs.reduce((sum, rec) => sum + rec.effectiveOrderQty * rec.unitCost, 0),
    [scopedReorderRecs]
  );
  const scopedSupplierCount = useMemo(
    () => new Set(scopedReorderRecs.map(r => r.product.supplier?.trim() || "Primary Pharmacy Distributor")).size,
    [scopedReorderRecs]
  );

  const restockSuppliers = useMemo(
    () =>
      Array.from(
        new Set(reorderRecs.map(r => r.product.supplier?.trim() || "Unspecified supplier"))
      ).sort((a, b) => a.localeCompare(b)),
    [reorderRecs]
  );

  useEffect(() => {
    if (restockSupplierFilter !== "all" && !restockSuppliers.includes(restockSupplierFilter)) {
      setRestockSupplierFilter("all");
    }
  }, [restockSupplierFilter, restockSuppliers]);

  const filteredReorderRecs = useMemo(() => {
    const q = restockSearch.trim().toLowerCase();
    return reorderRecs.filter(rec => {
      const matchesStatus = restockStatusFilter === "all" || rec.product.status === restockStatusFilter;
      if (!matchesStatus) return false;
      const supplierName = rec.product.supplier?.trim() || "Unspecified supplier";
      if (restockSupplierFilter !== "all" && supplierName !== restockSupplierFilter) return false;
      if (restockSourceFilter === "sma" && rec.isDemandFallback) return false;
      if (restockSourceFilter === "fallback" && !rec.isDemandFallback) return false;
      if (restockSourceFilter === "est_cost" && !rec.isCostEstimated) return false;
      if (!q) return true;
      return (
        rec.product.name.toLowerCase().includes(q) ||
        rec.product.id.toLowerCase().includes(q) ||
        rec.product.category.toLowerCase().includes(q) ||
        supplierName.toLowerCase().includes(q)
      );
    });
  }, [reorderRecs, restockSearch, restockStatusFilter, restockSupplierFilter, restockSourceFilter]);

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

  /* --- SMA inspector computed values --- */
  const smaMonths = useMemo(
    () => smaChartData.map(({ month, demand }) => ({ month, demand })),
    [smaChartData]
  );
  const last3 = useMemo(() => smaMonths.slice(-3), [smaMonths]);
  const last6 = useMemo(() => smaMonths.slice(-6), [smaMonths]);
  const globalOrderCost = orderCostSetting;
  const globalHoldingCost = Math.max(0.2, avgUnitCost * holdingRateSetting);
  const eoqNumerator = 2 * annualDemand * globalOrderCost;
  const eoqRatio = globalHoldingCost > 0 ? eoqNumerator / globalHoldingCost : 0;

  const [confirmExportCsv, setConfirmExportCsv] = useState(false);

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
    lines.push(`Auto-Selected Model,${activeForecastModel},Best historical rolling accuracy for this scope & granularity`);
    if (selectedForecast) {
      lines.push(`Winning Model sMAPE,${selectedForecast.smape}%,Back-tested across ${selectedForecast.points} comparable periods`);
    }
    lines.push(`SMA-3 Forecast,${Math.round(forecastSMA3)} units,Short-term 3-period moving average demand`);
    lines.push(`SMA-6 Forecast,${Math.round(forecastSMA6)} units,Medium-term 6-period moving average demand`);
    if (sma3Error) {
      lines.push(`SMA-3 Historical sMAPE,${sma3Error.smape}%,Used to compare forecast estimates with actual sales; lower is closer`);
      lines.push(`SMA-3 Back-test periods,${sma3Error.points},Recorded sales periods compared`);
    }
    if (sma6Error && !sma6Error.insufficientData) {
      lines.push(`SMA-6 Historical sMAPE,${sma6Error.smape}%,Used to compare forecast estimates with actual sales; lower is closer`);
      lines.push(`SMA-6 Back-test periods,${sma6Error.points},Recorded sales periods compared`);
    }
    lines.push(`Overall EOQ Guide,${eoqOverall} units,All-products planning estimate (annualized)`);
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

  // ── Lean Executive Summary (Stock Cover, Target Days, Total Cost, Supplier Count) ─
  const executiveSnapshot = useMemo(() => {
    const L = leadTimeDaysSetting;
    const recMap = new Map(reorderRecs.map(r => [String(r.product.id), r]));
    let totalOnHandCost = 0;
    let dailyCogsBurn = 0;
    let steadyStateTargetCost = 0;

    for (const p of scopedInventory) {
      const pid = String(p.id);
      const pf = monthlyProductForecastMap.get(pid);
      const rec = recMap.get(pid);
      const kStar = pf?.recommendedModel ?? "SMA-3";
      const sma3 = pf?.monthlySma3 ?? 0;
      const sma6 = pf?.monthlySma6 ?? 0;
      const champMonthly = kStar === "SMA-6" && sma6 > 0 ? sma6 : (sma3 > 0 ? sma3 : (pf?.monthlyEquivalentForecast ?? 0));
      const d = champMonthly / DAYS_PER_MONTH;
      const ltd = d * L;
      const minThreshold = getReorderUnits(p);
      const ss = Math.max(minThreshold * 0.25, ltd * (safetyBufferSetting / 100));

      let unitCost = rec?.unitCost;
      if (unitCost == null) {
        let costUnits = 0;
        let costTotal = 0;
        for (const b of p.batches) {
          if (b.unitCost != null && b.unitCost > 0) {
            costUnits += b.qty;
            costTotal += b.unitCost * b.qty;
          }
        }
        unitCost = costUnits > 0 ? costTotal / costUnits : (p.price > 0 ? p.price * 0.7 : 5);
      }

      const annualD = champMonthly > 0 ? champMonthly * 12 : Math.max(10, minThreshold * 6);
      const rawQ = estimateEOQ(Math.round(annualD), unitCost, orderCostSetting, holdingRateSetting);
      const packSize = Math.max(1, p.unitsPerPack ?? 1);
      const qStar = rec?.effectiveOrderQty ?? (Math.ceil(Math.max(rawQ, minThreshold) / packSize) * packSize);

      totalOnHandCost += p.stock * unitCost;
      dailyCogsBurn += (d > 0.01 ? d : minThreshold / 45) * unitCost;
      steadyStateTargetCost += (ss + qStar / 2) * unitCost;
    }

    const supplierCount = new Set(
      reorderRecs.map(r => r.product.supplier?.trim() || "Primary Pharmacy Distributor")
    ).size;
    const stockCoverDays = dailyCogsBurn > 0 ? Math.round(totalOnHandCost / dailyCogsBurn) : 0;
    const targetCoverDays = dailyCogsBurn > 0 ? Math.max(14, Math.round(steadyStateTargetCost / dailyCogsBurn)) : 30;

    return {
      supplierCount,
      totalOnHandCost,
      stockCoverDays,
      targetCoverDays,
    };
  }, [
    scopedInventory,
    monthlyProductForecastMap,
    reorderRecs,
    leadTimeDaysSetting,
    safetyBufferSetting,
    orderCostSetting,
    holdingRateSetting,
  ]);

  const sectionMeta: Record<string, { title: string; desc: string }> = {
    "Overview":   { title: "At a glance", desc: "Sales outlook and medicines that need attention." },
    "Forecast":   { title: "Store forecast", desc: `Expected ${forecastPeriodUnit === "week" ? "weekly" : "monthly"} sales and past accuracy for ${nextForecastMonth}.` },
    "Restocking": { title: "What to order", desc: "Suggested order quantities based on sales pace and delivery time." },
    "Products":   { title: "By medicine", desc: "Sales pace, days of stock left, and next-month outlook for each medicine." },
  };
  const sectionTabs = ["Overview", "Forecast", "Restocking", "Products"] as const;
  const topCategory = useMemo(
    () => categoryData.reduce<(typeof categoryData)[number] | null>(
      (top, category) => !top || category.value > top.value ? category : top,
      null
    ),
    [categoryData]
  );

  // Top 5 urgent restocking items for Overview Action Radar (respects active scope)
  const urgentRestocks = useMemo(() => {
    return [...scopedReorderRecs]
      .sort((a, b) => {
        const aOut = a.product.stock === 0 ? 1 : 0;
        const bOut = b.product.stock === 0 ? 1 : 0;
        if (aOut !== bOut) return bOut - aOut;
        const aRatio = a.product.stock / Math.max(1, a.suggestedRop);
        const bRatio = b.product.stock / Math.max(1, b.suggestedRop);
        return aRatio - bRatio;
      })
      .slice(0, 5);
  }, [scopedReorderRecs]);

  // Inventory velocity: Top 4 fast movers by units sold (always monthly rate on Overview)
  const topFastMovers = useMemo(() => {
    return scopedInventory
      .map(p => monthlyProductForecastMap.get(String(p.id)))
      .filter((r): r is NonNullable<typeof r> => r != null && r.totalSold > 0)
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 4);
  }, [scopedInventory, monthlyProductForecastMap]);

  // Inventory velocity: 4 slow / idle items (high stock on hand, 0 recent sales)
  const slowMovingItems = useMemo(() => {
    return scopedInventory
      .filter(p => p.stock > 0 && (monthlyProductForecastMap.get(String(p.id))?.totalSold ?? 0) === 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 4);
  }, [scopedInventory, monthlyProductForecastMap]);

  // Scoped status breakdown counts for Overview urgency card
  const { outOfStockCount, criticalCount, lowCount } = useMemo(() => {
    let out = 0;
    let crit = 0;
    for (const r of scopedReorderRecs) {
      if (r.product.status === "out_of_stock" || r.product.stock === 0) out++;
      else if (r.product.status === "critical" || (r.product.stock > 0 && r.product.stock <= r.suggestedRop * 0.5)) crit++;
    }
    return {
      outOfStockCount: out,
      criticalCount: crit,
      lowCount: Math.max(0, scopedReorderRecs.length - out - crit),
    };
  }, [scopedReorderRecs]);

  // Month-over-month delta for Overview monthly demand forecast
  const overviewDemandDeltaPct = overviewLatestMonth && overviewLatestMonth.demand > 0
    ? Math.round(((overviewForecastUnits - overviewLatestMonth.demand) / overviewLatestMonth.demand) * 100)
    : null;

  // Peak sales month & average monthly sales for Overview (always monthly)
  const overviewPeakMonth = useMemo(() => {
    if (!overviewChartData.length) return null;
    return overviewChartData.reduce((max, item) => (item.demand > (max?.demand ?? 0) ? item : max), overviewChartData[0]);
  }, [overviewChartData]);

  const overviewAvgMonthlyDemand = useMemo(() => {
    if (!overviewChartData.length) return 0;
    const sum = overviewChartData.reduce((acc, item) => acc + item.demand, 0);
    return Math.round(sum / overviewChartData.length);
  }, [overviewChartData]);

  // Period-over-period delta & chart stats for Forecast section
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
    <div className="flex w-full flex-col overflow-hidden font-sans" style={{ height: "calc(100dvh - 56px)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      {/* ── Fixed header: title + tab nav ── */}
      <div className="flex-shrink-0 st-shell-px pt-5 sm:pt-7 pb-0 bg-background border-b border-border/70 z-20">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sales performance, demand forecasts, and replenishment · Updated automatically
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(!restockAutoMode || Object.keys(eoqOverrides).length > 0) && (
              <button
                type="button"
                onClick={handleResetAllToAuto}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/14 cursor-pointer"
                title="Clear custom rules and item overrides to use automatic SmartTrack values"
              >
                <RotateCcw size={12} />
                <span>Reset to Auto</span>
              </button>
            )}
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
          <SegmentedTabs<(typeof sectionTabs)[number]>
            fullWidth
            size="md"
            ariaLabel="Analytics views"
            value={activeSection}
            onChange={setActiveSection}
            className="rounded-2xl sm:w-[min(100%,540px)]"
            buttonClassName="py-2 text-xs sm:text-sm"
            items={sectionTabs.map(section => ({
              id: section,
              label: section,
              badge: section === "Restocking" && reorderRecs.length > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    activeSection === "Restocking"
                      ? "bg-primary/15 text-primary dark:bg-blue-400/20 dark:text-blue-100"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {reorderRecs.length}
                </span>
              ) : undefined,
            }))}
          />
        </nav>
      </div>

      {/* ── Scrollable content ── */}
      <div
        ref={contentScrollRef}
        className={activeSection === "Products"
          ? "flex-1 min-h-0 flex flex-col st-shell-px py-5 gap-4 overflow-hidden"
          : "flex-1 min-h-0 overflow-y-auto st-shell-px py-6 space-y-6"}
      >

      {/* Short section heading and scope control */}
      {(() => {
        const meta = sectionMeta[activeSection];
        const showScopeFilter = activeSection === "Overview" || activeSection === "Forecast";
        return (
          <div className="flex-shrink-0 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
                  <span className="text-xs font-medium text-muted-foreground">Expected demand</span>
                  <button
                    type="button"
                    onClick={() => setSmaInspector({ type: overviewForecastModel === "SMA-6" ? "sma6" : "sma3", unit: "month" })}
                    className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    <Calculator size={12} />
                    <span>Breakdown</span>
                  </button>
                </div>
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {Math.round(overviewForecastUnits).toLocaleString()}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">units</span>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  {overviewDemandDeltaPct !== null && (
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                      overviewDemandDeltaPct >= 0
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}>
                      {overviewDemandDeltaPct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {overviewDemandDeltaPct >= 0 ? `+${overviewDemandDeltaPct}%` : `${overviewDemandDeltaPct}%`} vs {overviewLatestMonth?.month}
                    </span>
                  )}
                  <span className="rounded-full bg-muted/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {overviewForecastModel === "SMA-6" ? "6-mo avg" : "3-mo avg"}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>For {overviewNextMonth}</span>
                <button
                  type="button"
                  onClick={() => setActiveSection("Forecast")}
                  className="st-chip-btn"
                >
                  <span>Open forecast</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>

            {/* Card 2: Restock Urgency */}
            <div className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Needs restocking</span>
                  <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {outOfStockCount + criticalCount} urgent
                  </span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {scopedReorderRecs.length}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">medicines</span>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  {outOfStockCount > 0 && (
                    <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                      {outOfStockCount} out
                    </span>
                  )}
                  {criticalCount > 0 && (
                    <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      {criticalCount} critical
                    </span>
                  )}
                  {lowCount > 0 && (
                    <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {lowCount} low
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Below reorder level</span>
                <button
                  type="button"
                  onClick={() => setActiveSection("Restocking")}
                  className="st-chip-btn"
                >
                  <span>View list</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>

            {/* Card 3: Suggested Order Budget (EOQ) */}
            <div className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Suggested order</span>
                  <button
                    type="button"
                    onClick={() => setSmaInspector({ type: "eoq", unit: "month" })}
                    className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    <Calculator size={12} />
                    <span>Breakdown</span>
                  </button>
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {fmt(scopedEstimatedRestockCost)}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground">
                  Covers <strong className="font-medium text-foreground">{scopedTotalEoqUnits.toLocaleString()} units</strong> across {scopedSupplierCount} {scopedSupplierCount === 1 ? "supplier" : "suppliers"}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                <span>Balanced order budget</span>
              </div>
            </div>

            {/* Card 4: Stock Supply Left */}
            <div className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Stock supply left</span>
                    <InfoTip
                      title="Stock Supply Left (Days on Hand)"
                      lines={[
                        "Estimated days current inventory will last at your recent daily sales pace.",
                        { label: "Formula", value: "Total stock value ÷ daily cost of goods sold" },
                        { label: "Target buffer", value: `${executiveSnapshot.targetCoverDays} days cover target` },
                      ]}
                    />
                  </div>
                  <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Goal: {executiveSnapshot.targetCoverDays} days
                  </span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {executiveSnapshot.stockCoverDays}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">days</span>
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground">
                  Inventory value: <strong className="font-medium text-foreground">{fmt(executiveSnapshot.totalOnHandCost)}</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{onHandUnits.toLocaleString()} units on shelf</span>
                <button
                  type="button"
                  onClick={() => setActiveSection("Products")}
                  className="st-chip-btn"
                >
                  <span>Browse items</span>
                  <ChevronRight size={12} />
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
                      <h3 className="text-sm font-semibold text-foreground">Sales history &amp; outlook</h3>
                      <span className="rounded-full bg-muted/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {overviewForecastModel === "SMA-6" ? "6-mo avg" : "3-mo avg"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Actual monthly sales and estimated demand for {overviewNextMonth}.</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />Recorded Sales</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />{overviewForecastModel === "SMA-6" ? "6-mo forecast" : "3-mo forecast"}</span>
                    <SegmentedTabs<"area" | "bars">
                      size="sm"
                      ariaLabel="Overview forecast chart style"
                      value={forecastChartStyle}
                      onChange={setForecastChartStyle}
                      items={[
                        { id: "area", label: "Trend" },
                        { id: "bars", label: "Bars" },
                      ]}
                    />
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
                ) : overviewChartData.length ? (
                  <div className="h-[280px] w-full">
                    <ForecastTrendChart
                      history={overviewChartData}
                      nextPeriod={overviewNextMonth}
                      sma3={overviewSMA3}
                      sma6={overviewSMA6}
                      activeModel={overviewForecastModel}
                      showBothModels={false}
                      periodUnit="month"
                      chartStyle={forecastChartStyle}
                      zeroBaseline={forecastZeroBaseline}
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
                    {overviewPeakMonth ? `${overviewPeakMonth.month} (${overviewPeakMonth.demand.toLocaleString()} units)` : "—"}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Average Monthly Sales</span>
                  <strong className="text-foreground font-semibold">
                    {overviewAvgMonthlyDemand.toLocaleString()} units / month
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Next Month Estimate</span>
                  <strong className="text-primary font-semibold">
                    {Math.round(overviewForecastUnits).toLocaleString()} units ({overviewNextMonth})
                  </strong>
                </div>
              </div>
            </section>

            {/* Right: Sales by Category */}
            <section className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Sales by category</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Share of total units sold per category.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection("Products")}
                    className="st-chip-btn"
                  >
                    <span>See all</span>
                    <ChevronRight size={12} />
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
                            className="h-full rounded-full st-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, category.value))}%`,
                              backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                              animationDelay: `${Math.min(index * 45, 180)}ms`,
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
                  <h3 className="text-sm font-semibold text-foreground">Priority restocks</h3>
                  {scopedReorderRecs.length > 0 && (
                    <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {scopedReorderRecs.length} items
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Medicines closest to running out before your next delivery arrives.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection("Restocking")}
                className="st-chip-btn"
              >
                <span>See all {scopedReorderRecs.length}</span>
                <ChevronRight size={12} />
              </button>
            </div>

            <div className="max-h-[min(52dvh,420px)] overflow-x-auto overflow-y-auto" data-table-scroll="fixed">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-card shadow-sm">
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-5 py-3">Medicine</th>
                    <th className="px-4 py-3">On hand / Order at</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Suggested order</th>
                    <th className="px-4 py-3 text-right">Estimated cost</th>
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
                          <p className="font-semibold text-foreground text-sm">{rec.product.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{rec.product.category}{rec.product.supplier ? ` · ${rec.product.supplier}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <div className="text-xs font-medium text-foreground">
                            {rec.product.stock.toLocaleString()} <span className="text-muted-foreground font-normal">/ {rec.suggestedRop.toLocaleString()} units</span>
                          </div>
                          {rec.incomingQty > 0 ? (
                            <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              +{rec.incomingQty.toLocaleString()} already on order
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Order trigger</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/12 text-rose-700 dark:text-rose-300">
                              ● Out of stock
                            </span>
                          ) : isCritical ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/12 text-amber-800 dark:text-amber-300">
                              ● Critical
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/12 text-yellow-800 dark:text-yellow-300">
                              ● Low stock
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-foreground whitespace-nowrap">
                          {rec.effectiveOrderQty.toLocaleString()} units
                          <span className="block text-xs text-muted-foreground font-normal">Pack-rounded</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground whitespace-nowrap">
                          {fmt(rec.effectiveOrderQty * rec.unitCost)}
                          <span className="block text-xs text-muted-foreground font-normal">@ ₱{rec.unitCost.toFixed(2)}/unit</span>
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedEoqProductId(rec.product.id)}
                              className="st-chip-btn"
                              title="See order calculation breakdown"
                            >
                              <Calculator size={12} />
                              <span>Breakdown</span>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openPoDraftModal(rec.product, rec.eoq, rec.shortage, rec.effectiveOrderQty)}
                                className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-[opacity,transform] active:scale-95 cursor-pointer shadow-xs st-btn"
                              >
                                Order stock
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

          {/* ── Row 4: Top Sellers vs Slow-Moving Stock ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Top Sellers */}
            <section className={`${ANALYTICS_CARD_CLASS} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">Top sellers</h3>
                    <InfoTip
                      title="Top-Selling Medicines"
                      lines={[
                        "Highest-volume medicines driving store unit turnover.",
                        { label: "Ranking", value: "Sorted by total units sold and projected monthly demand" },
                      ]}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Medicines with the highest sales volume.</p>
                </div>
                <span className="rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Fast moving
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {topFastMovers.map((item, idx) => (
                  <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate text-sm">{item.product.name}</p>
                        <p className="text-xs text-muted-foreground">{item.product.category}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold tabular-nums text-foreground">{item.totalSold.toLocaleString()} sold</span>
                      <span className="block text-xs text-muted-foreground">~{Math.round(item.monthlyEquivalentForecast)} units / month</span>
                    </div>
                  </div>
                ))}
                {topFastMovers.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No sales transactions recorded yet.</p>
                )}
              </div>
            </section>

            {/* Slow Movers / Idle Stock */}
            <section className={`${ANALYTICS_CARD_CLASS} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">Slow-moving stock</h3>
                    <InfoTip
                      title="Slow-Moving & Idle Stock"
                      color="amber"
                      lines={[
                        "In-stock products with zero recent sales tying up inventory value.",
                        { label: "Stock value", value: "On-hand stock × batch cost (or 70% of selling price when uncosted)" },
                      ]}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">On-shelf medicines with little recent movement.</p>
                </div>
                <span className="rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  On hold
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {slowMovingItems.map(item => {
                  const estCost = item.batches.find(b => b.unitCost)?.unitCost ?? (item.price * 0.7);
                  const capitalValue = item.stock * estCost;
                  return (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.category} · {item.stock.toLocaleString()} units on shelf</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-medium text-foreground">{fmt(capitalValue)}</span>
                        <span className="block text-xs text-amber-600 dark:text-amber-400 font-medium">Idle capital</span>
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
        <section className="space-y-6">
          {/* ── Section 1: Model Comparison (3-Card Hero Strip) ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1 · Sales outlook ({scopeLabel})
              </h3>
              <span className="text-xs text-muted-foreground">
                Automatically picks whichever past sales average is more accurate
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {/* Primary Storewide Expected Demand Card */}
              <section className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-teal-500" />
                      <p className="text-xs font-medium text-muted-foreground">Forecast · {nextForecastMonth}</p>
                      <span className="rounded-full bg-teal-500/12 px-2 py-0.5 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                        Active: {activeForecastModel === "SMA-6" ? "6-mo avg" : "3-mo avg"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedForecast?.comparison && (
                        <button
                          type="button"
                          onClick={() => setSmapeInspector(activeForecastModel === "SMA-6" ? "sma6" : "sma3")}
                          className="rounded-lg border border-border/80 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer"
                        >
                          Accuracy
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSmaInspector({ type: activeForecastModel === "SMA-6" ? "sma6" : "sma3", unit: forecastPeriodUnit })}
                        className="rounded-lg border border-border/80 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 cursor-pointer"
                      >
                        Breakdown
                      </button>
                    </div>
                  </div>
                  <p className="mt-2.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {smaMonths.length ? Math.round(activeForecastUnits).toLocaleString() : "—"}
                    {smaMonths.length > 0 && <span className="ml-1.5 text-sm font-normal text-muted-foreground">units</span>}
                  </p>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {smaLoading
                    ? "Loading sales history…"
                    : selectedForecast?.comparison
                      ? `${scopeLabel} combined · ${activeForecastModel === "SMA-6" ? "6-month avg" : "3-month avg"} stayed closer (${selectedForecast.smape.toFixed(1)}% past gap)`
                      : smaMonths.length
                        ? `${scopeLabel} combined · using ${activeForecastModel === "SMA-6" ? "6-month avg" : "3-month avg"} while history builds`
                        : "No recorded sales yet"}
                </p>
              </section>

              {/* SMA-3 & SMA-6 Clean Reference Cards */}
              {([
                {
                  model: "SMA-3" as const,
                  label: `Recent 3-${forecastPeriodUnit === "week" ? "week" : "month"} pace (SMA-3)`,
                  units: forecastSMA3,
                  periods: last3.length,
                  window: 3,
                  dot: "bg-orange-500",
                  sub: "Follows recent sales changes faster",
                },
                {
                  model: "SMA-6" as const,
                  label: `Steady 6-${forecastPeriodUnit === "week" ? "week" : "month"} baseline (SMA-6)`,
                  units: forecastSMA6,
                  periods: last6.length,
                  window: 6,
                  dot: "bg-violet-500",
                  sub: "Smooths out sudden ups and downs",
                },
              ]).map(option => {
                const isWinner = activeForecastModel === option.model;
                const gapVal = selectedForecast?.comparison
                  ? (option.model === "SMA-3" ? selectedForecast.comparison.sma3 : selectedForecast.comparison.sma6)
                  : null;
                return (
                  <section key={option.model} className={`${ANALYTICS_CARD_CLASS} p-4 sm:p-5 flex flex-col justify-between`}>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${option.dot}`} />
                          <p className="truncate text-xs font-medium text-muted-foreground">{option.label}</p>
                          {isWinner && (
                            <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Picked
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSmaInspector({ type: option.model === "SMA-3" ? "sma3" : "sma6", unit: forecastPeriodUnit })}
                          className="shrink-0 rounded-lg border border-border/80 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 cursor-pointer"
                        >
                          Breakdown
                        </button>
                      </div>
                      <p className="mt-2.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                        {smaMonths.length ? Math.round(option.units).toLocaleString() : "—"}
                        {smaMonths.length > 0 && <span className="ml-1.5 text-sm font-normal text-muted-foreground">units</span>}
                      </p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {smaMonths.length
                        ? `Uses ${option.periods} of ${option.window} ${forecastPeriodUnit === "week" ? "weeks" : "months"}${gapVal != null ? ` · ${gapVal.toFixed(1)}% past gap` : ` · ${option.sub}`}`
                        : "No recorded sales"}
                    </p>
                  </section>
                );
              })}
            </div>
          </div>

          {/* ── Section 2: Demand Trajectory Chart ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2 · Sales trend chart
              </h3>
              <span className="text-xs text-muted-foreground">
                Switch between monthly or weekly views, or compare both averages
              </span>
            </div>
            <section className={`${ANALYTICS_CARD_CLASS} min-w-0 p-4 sm:p-5`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-semibold text-foreground">
                      {forecastPeriodUnit === "week" ? "Weekly sales & forecast" : "Monthly sales & forecast"}
                    </h4>
                    <InfoTip
                      title="When Forecast Lines Begin"
                      lines={[
                        "Moving averages appear once enough completed periods exist.",
                        { label: "SMA-3", value: `Needs 3 completed ${forecastPeriodUnit === "week" ? "weeks" : "months"} (starts period 4)` },
                        { label: "SMA-6", value: `Needs 6 completed ${forecastPeriodUnit === "week" ? "weeks" : "months"} (starts period 7)` },
                      ]}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {forecastChartStyle === "bars" ? "Solid bars" : "Shaded curve"} = actual sold · Dashed = {showChartModelComparison ? "SMA-3 & SMA-6" : `${activeForecastModel} forecast for ${nextForecastMonth}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedTabs<"month" | "week">
                    size="sm"
                    ariaLabel="Forecast period unit"
                    value={forecastPeriodUnit}
                    onChange={setForecastPeriodUnit}
                    items={[
                      { id: "month", label: "Monthly" },
                      { id: "week", label: "Weekly" },
                    ]}
                  />

                  <SegmentedTabs<"3m" | "6m" | "12m" | "all">
                    size="sm"
                    ariaLabel="Forecast history range"
                    value={forecastHistoryRange}
                    onChange={setForecastHistoryRange}
                    items={[
                      { id: "3m", label: forecastPeriodUnit === "week" ? "3 weeks" : "3 months" },
                      { id: "6m", label: forecastPeriodUnit === "week" ? "6 weeks" : "6 months" },
                      { id: "12m", label: forecastPeriodUnit === "week" ? "12 weeks" : "12 months" },
                      { id: "all", label: "All" },
                    ]}
                  />

                  <SegmentedTabs<"area" | "bars">
                    size="sm"
                    ariaLabel="Forecast chart style"
                    value={forecastChartStyle}
                    onChange={setForecastChartStyle}
                    items={[
                      { id: "area", label: "Trend" },
                      { id: "bars", label: "Bars" },
                    ]}
                  />

                  <button
                    type="button"
                    onClick={() => setShowChartModelComparison(prev => !prev)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] active:scale-95 cursor-pointer ${
                      showChartModelComparison
                        ? "border-primary/40 bg-primary/12 text-primary shadow-2xs"
                        : "border-border/80 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    {showChartModelComparison ? "Both models" : "Compare models"}
                  </button>
                </div>
              </div>
              {smaLoading ? (
                <div className="h-[310px] w-full flex flex-col justify-end p-4 space-y-4">
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
              ) : displayedSmaChartData.length ? (
                <>
                  <div className="h-[310px] w-full">
                    <ForecastTrendChart
                      history={displayedSmaChartData}
                      nextPeriod={nextForecastMonth}
                      sma3={forecastSMA3}
                      sma6={forecastSMA6}
                      periodUnit={forecastPeriodUnit}
                      activeModel={activeForecastModel}
                      showBothModels={showChartModelComparison}
                      chartStyle={forecastChartStyle}
                      zeroBaseline={forecastZeroBaseline}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className={forecastChartStyle === "bars" ? "h-2.5 w-2.5 rounded-xs bg-blue-600" : "h-0.5 w-4 rounded-full bg-blue-600"} />
                      Actual sold
                    </span>
                    {showChartModelComparison ? (
                      <>
                        <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-orange-500" /> SMA-3</span>
                        <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-violet-500" /> SMA-6</span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-teal-600" /> {activeForecastModel}</span>
                    )}
                    <span className="ml-auto flex flex-wrap items-center gap-2.5">
                      {forecastChartStyle === "area" && (
                        <button
                          type="button"
                          onClick={() => setForecastZeroBaseline(prev => !prev)}
                          className="st-chip-btn"
                          title="Toggle between focused trend scale and zero-based Y-axis"
                        >
                          {forecastZeroBaseline ? "Scale: 0 base" : "Scale: Auto fit"}
                        </button>
                      )}
                      <span>Rightmost point: <strong className="text-foreground">{nextForecastMonth}</strong></span>
                    </span>
                  </div>
                </>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">No sales history available for this selection.</p>
              )}
            </section>
          </div>

          {/* ── Section 3: Validation & Data Readiness (2-Column Grid) ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3 · Past accuracy &amp; medicine data coverage
              </h3>
              <span className="text-xs text-muted-foreground">
                See how close past predictions were to actual sales
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
              {/* Left: Past Forecast vs Actual Back-test */}
              <section className={`${ANALYTICS_CARD_CLASS} overflow-hidden flex flex-col`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Past forecast vs. actual sales</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedForecast?.comparison
                        ? `Average past gap: 3-month (${selectedForecast.comparison.sma3.toFixed(1)}%) vs. 6-month (${selectedForecast.comparison.sma6.toFixed(1)}%).`
                        : "Each month is predicted strictly from earlier months only."}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-teal-500/12 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                      Best overall: {activeForecastModel === "SMA-6" ? "6-mo avg" : "3-mo avg"}
                    </span>
                    <span className="rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {pastCheckRows.length} {forecastPeriodUnit === "week" ? "weeks" : "months"}
                    </span>
                  </div>
                </div>
                {pastCheckRows.length > 0 ? (
                  <div className="max-h-[300px] overflow-y-auto" data-table-scroll="fixed">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-card shadow-sm text-left text-xs text-muted-foreground border-b border-border/60">
                        <tr className="bg-muted/30">
                          <th className="px-5 py-2.5 font-medium">{forecastPeriodUnit === "week" ? "Week" : "Month"}</th>
                          <th className="px-4 py-2.5 text-right font-medium">Actual sold</th>
                          <th className="px-4 py-2.5 text-right font-medium">3-mo avg</th>
                          <th className="px-4 py-2.5 text-right font-medium">6-mo avg</th>
                          <th className="px-5 py-2.5 text-right font-medium">
                            <span className="inline-flex items-center justify-end gap-1">
                              <span>Closest estimate</span>
                              <InfoTip
                                title="Closest Estimate"
                                lines={[
                                  "Shows which average landed closer to actual sales on that period.",
                                  { label: "Overall pick", value: `Store forecast chooses ${activeForecastModel} based on lowest average error across all comparable periods.` },
                                ]}
                              />
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {pastCheckRows.map(row => (
                          <tr key={row.period} className="hover:bg-muted/20">
                            <td className="px-5 py-2.5 font-medium text-foreground">{row.period}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">{row.actual.toLocaleString()}</td>
                            <td className={`px-4 py-2.5 text-right tabular-nums ${
                              row.closerModel === "SMA-3" ? "font-semibold text-foreground" : "text-muted-foreground"
                            }`}>
                              {row.sma3 != null ? Math.round(row.sma3).toLocaleString() : "—"}
                            </td>
                            <td className={`px-4 py-2.5 text-right tabular-nums ${
                              row.closerModel === "SMA-6" ? "font-semibold text-foreground" : "text-muted-foreground"
                            }`}>
                              {row.sma6 != null ? Math.round(row.sma6).toLocaleString() : "—"}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              {row.closerModel && row.gapPct != null ? (
                                <span
                                  title={
                                    row.hasBothModels
                                      ? `3-mo avg error: ±${row.gap3Pct}% · 6-mo avg error: ±${row.gap6Pct}%`
                                      : "Only 3-mo avg had enough prior history here"
                                  }
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                    row.closeness === "spot_on"
                                      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                                      : row.closeness === "close"
                                        ? "bg-teal-500/12 text-teal-600 dark:text-teal-400"
                                        : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                                  }`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${row.closerModel === "SMA-6" ? "bg-violet-500" : "bg-orange-500"}`} />
                                  <span>
                                    {row.closerModel === "SMA-6" ? "6-mo" : "3-mo"} · {row.closeness === "spot_on" ? "Very close" : row.closeness === "close" ? "Close" : "Wide gap"} (±{row.gapPct}%)
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Building baseline</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-12 text-center text-xs text-muted-foreground">No historical check points available yet.</p>
                )}
              </section>

              {/* Right: Data Readiness & Methodology Link to Products */}
              <section className={`${ANALYTICS_CARD_CLASS} p-5 flex flex-col justify-between gap-4`}>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Medicine history coverage</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      How the {forecastReadinessStats.total} medicines in <strong className="text-foreground">{scopeLabel}</strong> are tracked.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      {
                        label: `Full history (6+ ${forecastPeriodUnit === "week" ? "weeks" : "months"})`,
                        count: forecastReadinessStats.trusted,
                        dot: "bg-emerald-500",
                        note: "Compares 3-month vs. 6-month averages",
                      },
                      {
                        label: `Short history (1–5 ${forecastPeriodUnit === "week" ? "weeks" : "months"})`,
                        count: forecastReadinessStats.early,
                        dot: "bg-amber-500",
                        note: "Uses 3-month average while history builds",
                      },
                      {
                        label: "No or rare sales yet",
                        count: forecastReadinessStats.needsData,
                        dot: "bg-slate-400",
                        note: "Restocking uses minimum stock limit",
                      },
                    ].map(bucket => (
                      <div key={bucket.label} className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${bucket.dot}`} />
                            <span className="truncate">{bucket.label}</span>
                          </div>
                          <p className="mt-0.5 pl-4 text-xs text-muted-foreground">{bucket.note}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {bucket.count}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Storewide totals add up sales across all items here, while each individual medicine automatically picks its more accurate 3-month or 6-month average.
                  </p>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Inspect every item’s forecast</span>
                  <button
                    type="button"
                    onClick={() => setActiveSection("Products")}
                    className="st-chip-btn"
                  >
                    <span>Open By medicine</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
              </section>
            </div>
          </div>
        </section>
      )}

      {activeSection === "Restocking" && (
        <section className="space-y-4">
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

          {/* Sleek Apple Summary Bar replacing multi-box pipeline wall */}
          <div className={`${ANALYTICS_CARD_CLASS} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Needs reorder</p>
                  <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-foreground">
                    {reorderRecs.length} <span className="text-xs font-normal text-muted-foreground">medicines · {totalEoqUnits.toLocaleString()} units</span>
                  </p>
                </div>
                <div className="hidden sm:block h-8 w-px bg-border/70" />
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Estimated total cost</p>
                  <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-foreground">
                    {fmt(estimatedRestockCost)}
                    {restockSourceStats.estCostCount > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">({restockSourceStats.estCostCount} estimated prices)</span>
                    )}
                  </p>
                </div>
                <div className="hidden sm:block h-8 w-px bg-border/70" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Calculation mode</p>
                    <span className={`rounded-full px-1.5 py-0.2 text-[9.5px] font-medium ${
                      restockAutoMode
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-primary/10 text-primary"
                    }`}>
                      {restockAutoMode ? "Auto" : "Custom"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-foreground">
                    {leadTimeDaysSetting}-day delivery · +{safetyBufferSetting}% safety cushion
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSmaInspector({ type: "eoq", unit: "month" })}
                  title="Explains how EOQ computes suggested order quantities"
                  className="rounded-xl border border-border/80 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer"
                >
                  How it calculates
                </button>
                <button
                  type="button"
                  onClick={() => setShowEoqSettingsModal(true)}
                  aria-label="Open restocking settings"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
                >
                  <SlidersHorizontal size={13} className="text-muted-foreground" />
                  <span>Settings</span>
                </button>
              </div>
            </div>
          </div>

          {/* Medicines to Restock Table */}
          <section className={`${ANALYTICS_CARD_CLASS} overflow-hidden`}>
            <div className="flex flex-col gap-3 border-b border-border/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Medicines to restock
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Showing {filteredReorderRecs.length} of {reorderRecs.length} items below reorder level
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={restockSearch}
                    onChange={event => { setRestockSearch(event.target.value); setRestockPage(1); }}
                    placeholder="Search medicine or supplier"
                    aria-label="Search restock medicines"
                    className="w-full rounded-xl border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <SegmentedTabs<typeof restockStatusFilter>
                  size="sm"
                  wrap
                  ariaLabel="Filter restocking urgency status"
                  value={restockStatusFilter}
                  onChange={stId => { setRestockStatusFilter(stId); setRestockPage(1); }}
                  items={([
                    { id: "all", label: "All", count: restockStatusStats.total },
                    { id: "out_of_stock", label: "Out of stock", count: restockStatusStats.out },
                    { id: "critical", label: "Critical", count: restockStatusStats.critical },
                    { id: "low", label: "Low", count: restockStatusStats.low },
                  ] as const).map(chip => ({
                    id: chip.id,
                    label: chip.label,
                    badge: (
                      <span className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                        restockStatusFilter === chip.id
                          ? "bg-primary/15 text-primary dark:bg-blue-400/20 dark:text-blue-100"
                          : "text-muted-foreground/80"
                      }`}>
                        {chip.count}
                      </span>
                    ),
                  }))}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filter by supplier"
                    value={restockSupplierFilter}
                    onChange={event => {
                      setRestockSupplierFilter(event.target.value);
                      setRestockPage(1);
                    }}
                    className="app-select rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="all">All suppliers</option>
                    {restockSuppliers.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    id="restock-source-filter"
                    aria-label="Filter by estimate method"
                    value={restockSourceFilter}
                    onChange={event => {
                      setRestockSourceFilter(event.target.value as typeof restockSourceFilter);
                      setRestockPage(1);
                    }}
                    className="app-select rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="all">All items ({restockSourceStats.total})</option>
                    <option value="sma">Calculated from sales ({restockSourceStats.smaCount})</option>
                    <option value="fallback">Uses minimum limit ({restockSourceStats.fallbackCount})</option>
                    <option value="est_cost">Estimated cost price ({restockSourceStats.estCostCount})</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="max-h-[min(62dvh,560px)] overflow-x-auto overflow-y-auto" data-table-scroll="fixed">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card shadow-sm">
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Medicine</th>
                    <th className="px-4 py-3 font-medium">Sales pace</th>
                    <th className="px-4 py-3 font-medium">
                      <div className="inline-flex items-center gap-1.5">
                        Stock vs. Order at
                        <InfoTip
                          title="Stock vs. Order-At (ROP)"
                          lines={[
                            "Compares current stock on hand against the Order-At threshold.",
                            { label: "Threshold", value: "Lead-time sales + safety buffer (or Min Stock if new)" },
                          ]}
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <div className="inline-flex items-center gap-1.5">
                        Suggested order
                        <InfoTip
                          title="Suggested Order (EOQ)"
                          lines={[
                            "Cost-balanced order quantity using EOQ = √(2DS / H).",
                            { label: "Balances", value: "Supplier order cost against storage and expiry risk" },
                          ]}
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Estimated cost</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginatedReorderRecs.map((rec, idx) => {
                    const barScale = Math.max(rec.effectiveRop * 1.4, rec.product.stock, 1);
                    const stockPct = Math.min(100, Math.round((rec.product.stock / barScale) * 100));
                    const ropMarkerPct = Math.min(96, Math.round((rec.effectiveRop / barScale) * 100));
                    const barColor = rec.product.stock <= 0
                      ? "bg-rose-500"
                      : rec.product.stock <= rec.effectiveRop
                        ? "bg-amber-500"
                        : "bg-emerald-500";
                    const sourceDot = rec.isDemandFallback
                      ? "bg-amber-500"
                      : rec.demandSourceShort.includes("SMA-6")
                        ? "bg-violet-500"
                        : "bg-orange-500";
                    return (
                      <tr key={rec.product.id} className="group hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{rec.product.name}</p>
                            <StockBadge status={rec.product.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {rec.product.category}{rec.product.supplier ? ` · ${rec.product.supplier}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium tabular-nums text-foreground">
                            {Math.max(1, Math.round(rec.annualDemand / 12)).toLocaleString()} {Math.max(1, Math.round(rec.annualDemand / 12)) === 1 ? "unit" : "units"} / month{" "}
                            <span className="font-normal text-muted-foreground">({formatSalesPaceShort(rec.annualDemand / 12)})</span>
                          </p>
                          <p className="mt-1">
                            <span
                              title={rec.demandSourceLabel}
                              className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground/80"
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${sourceDot}`} />
                              <span>
                                {rec.isDemandFallback
                                  ? "No sales · uses minimum limit"
                                  : rec.demandSourceShort.includes("SMA-6")
                                    ? "Based on last 6 months"
                                    : "Based on last 3 months"}
                              </span>
                            </span>
                          </p>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <div className="flex items-baseline justify-between gap-3 text-xs w-44">
                            <span>
                              <strong className="text-foreground">{rec.product.stock.toLocaleString()}</strong>
                              <span className="text-muted-foreground"> on hand</span>
                            </span>
                            <span className="font-medium text-muted-foreground">
                              Order at {rec.effectiveRop.toLocaleString()}
                            </span>
                          </div>
                          <div
                            className="relative mt-1.5 h-1.5 w-44 overflow-hidden rounded-full bg-muted"
                            title={`${rec.product.stock} on hand vs Order at ${rec.effectiveRop}`}
                          >
                            <div
                              className={`h-full rounded-full st-bar-fill ${barColor}`}
                              style={{ width: `${stockPct}%`, animationDelay: `${Math.min(idx * 30, 240)}ms` }}
                            />
                            <span
                              className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                              style={{ left: `${ropMarkerPct}%` }}
                            />
                          </div>
                          {rec.incomingQty > 0 ? (
                            <p className="mt-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              +{rec.incomingQty.toLocaleString()} already on order
                            </p>
                          ) : (
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              {rec.isDemandFallback
                                ? "Uses minimum limit (no sales yet)"
                                : rec.effectiveRop > rec.suggestedRop
                                  ? `Uses your minimum limit (${rec.effectiveRop})`
                                  : `Covers ${rec.leadTimeDays}-day delivery + ${rec.safetyBufferPercent}% cushion`}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canEdit && inlineEditProductId === rec.product.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                autoFocus
                                value={inlineEditQty}
                                onChange={e => setInlineEditQty(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitInlineOverride(rec.product.id, rec.recommendedUnits);
                                  } else if (e.key === "Escape") {
                                    setInlineEditProductId(null);
                                  }
                                }}
                                aria-label={`Edit order quantity for ${rec.product.name}`}
                                className="w-20 rounded-lg border border-primary/50 bg-background px-2 py-1 text-xs font-semibold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <button
                                type="button"
                                onClick={() => commitInlineOverride(rec.product.id, rec.recommendedUnits)}
                                className="rounded-md bg-primary p-1 text-primary-foreground hover:opacity-90 cursor-pointer"
                                title="Save quantity"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineEditProductId(null)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                                title="Cancel"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold tabular-nums text-foreground">{rec.effectiveOrderQty.toLocaleString()} units</span>
                              {rec.overrideQty != null && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Custom</span>
                              )}
                              {canEdit && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineEditProductId(rec.product.id);
                                      setInlineEditQty(String(rec.effectiveOrderQty));
                                    }}
                                    className="rounded p-1 text-muted-foreground opacity-65 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-primary/10 hover:text-primary cursor-pointer"
                                    title="Edit order quantity"
                                    aria-label={`Edit order quantity for ${rec.product.name}`}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  {rec.overrideQty != null && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetOverrideQty(rec.product.id, null)}
                                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                                      title="Reset to automatic quantity"
                                      aria-label={`Reset order quantity for ${rec.product.name}`}
                                    >
                                      <RotateCcw size={12} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          {rec.fifoSellThroughMonths != null && (
                            <div className="mt-0.5 space-y-0.5">
                              <p className="text-xs text-muted-foreground">
                                {formatSupplyDuration(rec.fifoSellThroughMonths)} supply
                              </p>
                              {rec.fifoSellThroughMonths > 6 && (
                                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                  Over 6 months supply — check expiry
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <div className="font-semibold text-foreground">{fmt(rec.effectiveOrderQty * rec.unitCost)}</div>
                          <div className="mt-0.5 text-xs" title={rec.costSourceLabel}>
                            <span className={rec.isCostEstimated ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                              {rec.isCostEstimated ? "Estimated from selling price" : "Based on purchase cost"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setSelectedEoqProductId(rec.product.id)} className="st-chip-btn">
                              <Calculator size={12} />
                              <span>Breakdown</span>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openPoDraftModal(rec.product, rec.eoq, rec.shortage, rec.effectiveOrderQty)}
                                className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-[opacity,transform] active:scale-95 cursor-pointer shadow-xs st-btn"
                              >
                                Order stock
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedReorderRecs.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No medicines need restocking or match your filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePager total={filteredReorderRecs.length} page={restockPage} pageSize={RESTOCK_PAGE_SIZE} onPage={setRestockPage} />
          </section>
        </section>
      )}

      {activeSection === "Products" && (
        <section className={`${ANALYTICS_CARD_CLASS} flex-1 min-h-0 flex flex-col overflow-hidden`}>
          <div className="flex-shrink-0 flex flex-col gap-3 border-b border-border/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Demand &amp; stock by medicine</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Showing {filteredProductsTab.length} of {monthlyProductList.length} medicines · Each medicine uses its own best 3-month or 6-month sales average.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <select
                  value={productsCategory}
                  onChange={event => { setProductsCategory(event.target.value); setProductsPage(1); }}
                  aria-label="Filter medicines by category"
                  className="app-select rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="all">All categories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <div className="relative flex-1 sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={productsSearch}
                    onChange={event => { setProductsSearch(event.target.value); setProductsPage(1); }}
                    placeholder="Search medicines"
                    aria-label="Search products"
                    className="w-full rounded-xl border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>

            <SegmentedTabs<typeof productsFilter>
              size="sm"
              wrap
              ariaLabel="Filter medicines by demand signal"
              value={productsFilter}
              onChange={chipId => { setProductsFilter(chipId); setProductsPage(1); }}
              className="self-start"
              items={([
                { id: "all", label: "All", count: productsReadinessStats.total },
                { id: "shortfall", label: "May run out", count: productsReadinessStats.shortfall },
                { id: "rising", label: "Sales rising", count: productsReadinessStats.rising },
                { id: "high_confidence", label: "6+ months data", count: productsReadinessStats.trusted },
                { id: "needs_data", label: "No or rare sales", count: productsReadinessStats.needsData },
              ] as const).map(chip => ({
                id: chip.id,
                label: chip.label,
                badge: (
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                    productsFilter === chip.id
                      ? "bg-primary/15 text-primary dark:bg-blue-400/20 dark:text-blue-100"
                      : "text-muted-foreground/80"
                  }`}>
                    {chip.count}
                  </span>
                ),
              }))}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto" data-table-scroll="fixed">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-sm">
                <tr className="border-b border-border/60 bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Medicine</th>
                  <th className="px-4 py-3 font-medium">Recent monthly sales</th>
                  <th className="px-4 py-3 font-medium">
                    <div className="inline-flex items-center gap-1.5">
                      Pace vs. 6-month avg
                      <InfoTip
                        title="How Trend is Measured"
                        lines={[
                          "Compares the last 3-month average against the 6-month baseline.",
                          { label: "Example", value: "53/month vs. 65/month baseline shows -18% lower" },
                        ]}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <div className="inline-flex items-center gap-1.5">
                      Basis &amp; accuracy
                      <InfoTip
                        title="Model Selection per Item"
                        lines={[
                          "Evaluated independently for each medicine from monthly sales history.",
                          { label: "6+ months data", value: "Selects 3-month or 6-month average based on lower past error" },
                          { label: "Under 6 months", value: "Uses 3-month average until 6 months of history exist" },
                        ]}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Expected next month</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Stock &amp; days left</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedProductsTab.map(row => {
                  const forecast = row.monthlyEquivalentForecast;
                  const isSma6 = row.recommendedModel === "SMA-6";
                  const trustUi = row.confidenceTier === "high"
                    ? { dot: "bg-emerald-500", text: `${row.totalPeriods} months of sales` }
                    : row.confidenceTier === "short"
                      ? { dot: "bg-amber-500", text: `${row.activePeriods} ${row.activePeriods === 1 ? "month" : "months"} of sales` }
                      : row.confidenceTier === "intermittent"
                        ? { dot: "bg-orange-500", text: `Uneven sales (${row.activePeriods} active)` }
                        : { dot: "bg-slate-400", text: "No sales yet" };
                  const hasDualComparison = row.smape3 != null && row.smape6 != null;
                  const winErr = isSma6 ? row.smape6 : row.smape3;
                  const loseErr = isSma6 ? row.smape3 : row.smape6;
                  return (
                    <tr key={row.product.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">{row.product.name}</p>
                          <StockBadge status={row.product.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{row.product.category}</span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                            <span className={`h-1.5 w-1.5 rounded-full ${trustUi.dot}`} />
                            <span>{trustUi.text}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                        {row.recent3Periods.length ? (
                          <div>
                            <span>{row.recent3Periods.map(period => `${period.label}: ${period.qty}`).join(" · ")}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground/80">
                              {row.totalSold.toLocaleString()} units sold total
                            </span>
                          </div>
                        ) : (
                          "No sales recorded"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.trendDirection === "rising" && (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                              <ArrowUpRight size={12} />
                              <span>+{Math.abs(row.trendPercent)}% higher</span>
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">vs. 6-month avg</span>
                          </div>
                        )}
                        {row.trendDirection === "slowing" && (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-2.5 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                              <ArrowDownRight size={12} />
                              <span>-{Math.abs(row.trendPercent)}% lower</span>
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">vs. 6-month avg</span>
                          </div>
                        )}
                        {row.trendDirection === "steady" && (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <Minus size={11} />
                              <span>Steady</span>
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">Near 6-month avg</span>
                          </div>
                        )}
                        {row.trendDirection === "none" && (
                          <span className="text-xs text-muted-foreground">Not enough data</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.totalSold > 0 ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
                              <span className={`h-1.5 w-1.5 rounded-full ${isSma6 ? "bg-violet-500" : "bg-orange-500"}`} />
                              {isSma6 ? "6-month average" : "3-month average"}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {hasDualComparison && winErr != null && loseErr != null
                                ? `Closer fit (${winErr.toFixed(0)}% vs ${loseErr.toFixed(0)}% gap)`
                                : "Under 6 months of sales"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Waiting for sales</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        {row.totalSold > 0 ? (
                          <div className="whitespace-nowrap">
                            <span>{Math.round(forecast).toLocaleString()} units / month</span>
                            <span className="block text-xs font-normal text-muted-foreground first-letter:uppercase">
                              {formatSalesPaceShort(forecast)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-normal text-muted-foreground whitespace-nowrap">No sales yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-foreground">
                          {row.product.stock.toLocaleString()} on hand
                          {row.incomingQty > 0 && (
                            <span className="ml-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              (+{row.incomingQty.toLocaleString()} on order)
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex justify-end">
                          {row.projectedShortfall > 0 ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300">
                              Short by {row.projectedShortfall.toLocaleString()} units
                            </span>
                          ) : row.product.stock === 0 ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300">
                              Out of stock
                            </span>
                          ) : row.daysOfSupply != null ? (
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              row.daysOfSupply <= 14
                                ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300"
                                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                            }`}>
                              {formatDaysRemaining(row.daysOfSupply)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-border/70 bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                              Stock covered
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedSmaProduct({ id: row.product.id, unit: "month" })}
                          className="st-chip-btn"
                        >
                          <Calculator size={12} />
                          <span>Breakdown</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {paginatedProductsTab.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No medicines match this filter or search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex-shrink-0">
            <TablePager total={filteredProductsTab.length} page={productsPage} pageSize={PRODUCT_FORECAST_PAGE_SIZE} onPage={setProductsPage} />
          </div>
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
                <p className="text-xs font-medium text-primary">Purchase Order Draft</p>
                <h3 className="text-base font-bold text-foreground mt-0.5">Order Stock — {poDraftModal.product.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => !poSubmitting && setPoDraftModal(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleConfirmCreatePo} className="p-5 space-y-4 text-xs">
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">On hand / Order trigger:</span>
                  <strong className="text-foreground">{poDraftModal.product.stock} / {getReorderUnits(poDraftModal.product)} units</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Suggested order size:</span>
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
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-foreground">Quantity to order (units)</label>
                  <span className="text-xs text-muted-foreground">Suggested: {poDraftModal.recommendedEoq.toLocaleString()} · edit if needed</span>
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
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground cursor-pointer"
                  >
                    Use suggested ({poDraftModal.recommendedEoq.toLocaleString()})
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

      {selectedSmaProduct && (() => {
        const isWeekly = selectedSmaProduct.unit === "week";
        const sourceMap = isWeekly && forecastPeriodUnit === "week"
          ? productForecastMap
          : monthlyProductForecastMap;
        const pf = sourceMap.get(String(selectedSmaProduct.id));
        if (!pf) return null;
        const isSma6 = pf.recommendedModel === "SMA-6";
        const periods = isSma6 ? pf.recent6Periods : pf.recent3Periods;
        const sumQty = periods.reduce((s, p) => s + p.qty, 0);
        const avgQty = periods.length > 0 ? sumQty / periods.length : 0;
        const periodWord = isWeekly ? "week" : "month";
        const periodLabelCap = isWeekly ? "Week" : "Month";
        const roundedPeriod = Math.max(1, Math.round(pf.recommendedForecast));
        const roundedMonthly = Math.max(1, Math.round(pf.monthlyEquivalentForecast));
        const dailyRate = roundedMonthly / DAYS_PER_MONTH;
        const weeklyRate = isWeekly ? roundedPeriod : dailyRate * 7;
        const annualD = roundedMonthly * 12;
        return (
          <CalcInspectorModal
            title={`Sales breakdown · ${pf.product.name} (${pf.recommendedModel})`}
            formula={<SmaFormulaVisual type={isSma6 ? "sma6" : "sma3"} />}
            explanation={`SmartTrack tested both SMA-3 (fast 3-${periodWord} average) and SMA-6 (steady 6-${periodWord} baseline) on ${pf.product.name}’s past sales. It automatically selected ${pf.recommendedModel} (${isSma6 ? "steady baseline" : "fast-reacting"}) as the best fit.`}
            variables={[
              ...periods.map(p => ({ label: `Recorded sales · ${p.label}`, value: `${p.qty.toLocaleString()} units` })),
              { label: `SMA-3 (3-${periodWord} average)`, value: `${Math.round(pf.sma3).toLocaleString()} units/${periodWord}${pf.smape3 != null ? ` (${pf.smape3.toFixed(1)}% error)` : ""}` },
              { label: `SMA-6 (6-${periodWord} average)`, value: `${Math.round(pf.sma6).toLocaleString()} units/${periodWord}${pf.smape6 != null ? ` (${pf.smape6.toFixed(1)}% error)` : ""}` },
              { label: "Auto-Selected Model", value: `${pf.recommendedModel} (${isSma6 ? `Steady 6-${periodLabelCap}` : `Fast 3-${periodLabelCap}`})` },
              { label: "d · Daily Demand Rate", value: `≈ ${dailyRate.toFixed(2)} units/day (${roundedMonthly.toLocaleString()} ÷ ${DAYS_PER_MONTH})` },
              { label: "Weekly Demand Rate", value: `≈ ${Math.max(1, Math.round(weeklyRate)).toLocaleString()} units/week${isWeekly ? "" : " (× 7 days)"}` },
              { label: "D · Annual Demand (for EOQ)", value: `${annualD.toLocaleString()} units/year (× 12 months)` },
            ]}
            trail={
              periods.length > 0
                ? [
                    `Step 1 (Sum recent sales): ${periods.map(p => p.qty.toLocaleString()).join(" + ")} = ${sumQty.toLocaleString()} units.`,
                    isWeekly
                      ? `Step 2 (Weekly Average & Monthly Pace): ${sumQty.toLocaleString()} ÷ ${periods.length} = ${avgQty.toFixed(1)} units/week (× ${WEEKS_PER_MONTH} weeks/mo ≈ ${roundedMonthly.toLocaleString()} units/month).`
                      : `Step 2 (Monthly Average): ${sumQty.toLocaleString()} ÷ ${periods.length} = ${roundedMonthly.toLocaleString()} units/month expected next month.`,
                    `Step 3 (Daily & Weekly Burn Rates): ${roundedMonthly.toLocaleString()} ÷ ${DAYS_PER_MONTH} = ≈ ${dailyRate.toFixed(2)} units/day (≈ ${Math.max(1, Math.round(weeklyRate)).toLocaleString()} units/week). Drives ROP safety alarms!`,
                    `Step 4 (Annual Demand for EOQ): ${roundedMonthly.toLocaleString()} units/month × 12 = ${annualD.toLocaleString()} units/year (D).`,
                  ]
                : ["No recorded sales periods yet for this medicine."]
            }
            result={
              pf.totalSold > 0
                ? isWeekly
                  ? `Forecast: ${roundedPeriod.toLocaleString()} units/wk (≈ ${roundedMonthly.toLocaleString()} units/mo) · ≈ ${dailyRate.toFixed(2)} units/day`
                  : `Forecast: ${roundedMonthly.toLocaleString()} units/mo · ≈ ${dailyRate.toFixed(2)} units/day · ≈ ${Math.max(1, Math.round(weeklyRate))} units/wk`
                : "No sales history yet — record sales to generate a forecast."
            }
            onClose={() => setSelectedSmaProduct(null)}
          />
        );
      })()}

      {smaInspector && (smaInspector.type === "sma3" || smaInspector.type === "sma6") && (() => {
        const isSma6 = smaInspector.type === "sma6";
        const isWeekly = smaInspector.unit === "week" && forecastPeriodUnit === "week";
        const windowSize = isSma6 ? 6 : 3;
        const series = isWeekly ? weeklyScopeData.chartData : overviewChartData;
        const recentPeriods = series.slice(-windowSize);
        const computedVal = isWeekly
          ? (isSma6 ? weeklyScopeData.sma6 : weeklyScopeData.sma3)
          : (isSma6 ? overviewSMA6 : overviewSMA3);
        const targetPeriodLabel = isWeekly ? weeklyScopeData.nextLabel : overviewNextMonth;
        const unitSingular = isWeekly ? "week" : "month";
        const unitPlural = isWeekly ? "weeks" : "months";
        const unitPluralCap = isWeekly ? "Weeks" : "Months";
        const periodSum = recentPeriods.reduce((sum, m) => sum + m.demand, 0);
        return (
          <CalcInspectorModal
            title={
              isSma6
                ? `Sales breakdown · Steadier 6-${unitSingular} average (SMA-6)`
                : `Sales breakdown · Recent 3-${unitSingular} average (SMA-3)`
            }
            formula={<SmaFormulaVisual type={recentPeriods.length === windowSize ? (isSma6 ? "sma6" : "sma3") : "general"} />}
            explanation={
              isSma6
                ? `Add sales from up to the latest 6 completed ${unitPlural} and divide by 6. This smooths out one-${unitSingular} spikes and provides a steady baseline for maintenance medicines.`
                : `Add sales from the latest 3 completed ${unitPlural} and divide by 3. Because it only looks at recent ${unitPlural}, SMA-3 reacts quickly to sudden surges or seasonal outbreaks.`
            }
            variables={[
              ...recentPeriods.slice().reverse().map((period, index) => ({
                label: `${index === 0 ? `Most recent ${unitSingular}` : `${index + 1} ${unitPlural} ago`} · ${period.month}`,
                value: `${period.demand.toLocaleString()} units`,
              })),
              { label: `${unitPluralCap} included`, value: `${recentPeriods.length} of ${windowSize}` },
            ]}
            trail={[
              recentPeriods.length
                ? `Step 1: ${recentPeriods.slice().reverse().map(m => m.demand.toLocaleString()).join(" + ")} = ${periodSum.toLocaleString()} units.`
                : "No recorded sales periods are available for this scope.",
              ...(recentPeriods.length
                ? [`Step 2: ${periodSum.toLocaleString()} ÷ ${recentPeriods.length} = about ${Math.round(computedVal).toLocaleString()} units / ${unitSingular}.`]
                : []),
            ]}
            result={series.length
              ? `Estimated demand for ${targetPeriodLabel}: ≈ ${Math.round(computedVal).toLocaleString()} units`
              : "No estimate yet — record sales to generate a forecast."}
            onClose={() => setSmaInspector(null)}
          />
        );
      })()}

      {smaInspector?.type === "eoq" && (
        <CalcInspectorModal
          title="How Order Sizes Work (Storewide EOQ)"
          formula={<EoqFormulaVisual />}
          explanation={`EOQ is a suggested order size that balances order-placement fees (S) and stock-holding costs (H). SmartTrack feeds the ${overviewForecastModel} monthly demand forecast annualized to D directly into this formula. Cost settings: order placement ₱${globalOrderCost.toFixed(2)} and holding rate ${Math.round(holdingRateSetting * 100)}%.`}
          variables={[
            { label: `Annual Demand (D · Auto ${overviewForecastModel})`, value: `${Math.round(annualDemand).toLocaleString()} units/yr` },
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
          isAutoMode={restockAutoMode}
          orderCost={orderCostSetting}
          holdingPercent={Math.round(holdingRateSetting * 100)}
          leadTimeDays={leadTimeDaysSetting}
          safetyBufferPercent={safetyBufferSetting}
          smartRecs={smartOperationalRecommendations}
          onSave={handleSaveEoqSettings}
          onReset={() => handleResetEoqSettings()}
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
});

export default AnalyticsPage;
