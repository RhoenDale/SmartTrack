// ─── Shared utilities, UI components and small modals used across pages ───────
import React from "react";
import { createPortal } from "react-dom";
import { X, ArrowUpRight, ArrowDownRight, Package, Trash2, Eye, EyeOff, AlertTriangle, ShieldAlert, CircleCheck, Info } from "lucide-react";
import { getReorderUnits, type Product, type StockStatus, type Transaction, type TxStatus, type TxType } from "./data";
import type { ReceiptSettings } from "./api";

// ─── Currency helpers ─────────────────────────────────────────────────────────
export const PESO = "\u20b1";
export const fmt = (n: number) =>
  `${PESO}${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Universal ConfirmDialog ──────────────────────────────────────────────────
// In TrackHub mode: directly morphs the TrackHub Dynamic Island into the confirm card.
// No background blur, no disconnected floating scrim over the island.
export interface IslandConfirmConfig {
  id: string;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

type ConfirmListener = (config: IslandConfirmConfig | null) => void;
const confirmListeners = new Set<ConfirmListener>();
let currentConfirmConfig: IslandConfirmConfig | null = null;

export function registerIslandConfirm(config: IslandConfirmConfig) {
  currentConfirmConfig = config;
  confirmListeners.forEach(l => l(config));
}

export function unregisterIslandConfirm(id: string) {
  if (currentConfirmConfig?.id === id) {
    currentConfirmConfig = null;
    confirmListeners.forEach(l => l(null));
  }
}

export function useIslandConfirm() {
  const [config, setConfig] = React.useState<IslandConfirmConfig | null>(currentConfirmConfig);
  React.useEffect(() => {
    confirmListeners.add(setConfig);
    return () => { confirmListeners.delete(setConfig); };
  }, []);
  return config;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  variant      = "danger",
  icon,
  onConfirm,
  onCancel,
  forceModal   = false,
}: {
  title:        string;
  message:      React.ReactNode;
  confirmLabel?: string;
  cancelLabel?:  string;
  variant?:     "danger" | "warning" | "info";
  icon?:        React.ReactNode;
  onConfirm:    () => void;
  onCancel:     () => void;
  /** When true, always renders as a centered modal overlay regardless of nav mode.
   *  Use this when the dialog is triggered from inside another modal. */
  forceModal?:  boolean;
}) {
  const colors = {
    danger:  { ring: "bg-red-500/15 text-red-400",    btn: "bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30",       dot: "text-red-400",   accent: "#ef4444" },
    warning: { ring: "bg-amber-500/15 text-amber-400", btn: "bg-amber-500 hover:bg-amber-400 text-white shadow-md shadow-amber-500/30",   dot: "text-amber-400", accent: "#f59e0b" },
    info:    { ring: "bg-blue-500/15 text-blue-400",   btn: "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30", dot: "text-blue-400", accent: "#2563eb" },
  }[variant];

  const isIslandMode = React.useMemo(() => {
    if (forceModal) return false;
    try { return (localStorage.getItem("st_nav_mode") ?? "island") === "island"; }
    catch { return true; }
  }, [forceModal]);

  const id = React.useId();

  // Stable refs for ALL props — prevents the registration effect from re-firing
  // when callers pass new JSX/object/function references on every render.
  const onConfirmRef   = React.useRef(onConfirm);
  const onCancelRef    = React.useRef(onCancel);
  const messageRef     = React.useRef(message);
  const titleRef       = React.useRef(title);
  const confirmLabelRef = React.useRef(confirmLabel);
  const cancelLabelRef  = React.useRef(cancelLabel);
  const variantRef     = React.useRef(variant);
  const iconRef        = React.useRef(icon);
  React.useLayoutEffect(() => {
    onConfirmRef.current    = onConfirm;
    onCancelRef.current     = onCancel;
    messageRef.current      = message;
    titleRef.current        = title;
    confirmLabelRef.current = confirmLabel;
    cancelLabelRef.current  = cancelLabel;
    variantRef.current      = variant;
    iconRef.current         = icon;
  });

  React.useEffect(() => {
    if (isIslandMode) {
      registerIslandConfirm({
        id,
        // All values proxied through refs — effect runs once on mount only
        get title()        { return titleRef.current; },
        get message()      { return messageRef.current; },
        get confirmLabel() { return confirmLabelRef.current; },
        get cancelLabel()  { return cancelLabelRef.current; },
        get variant()      { return variantRef.current; },
        get icon()         { return iconRef.current; },
        onConfirm: () => onConfirmRef.current(),
        onCancel:  () => onCancelRef.current(),
      });
      return () => unregisterIslandConfirm(id);
    }
  // All props intentionally omitted — proxied via stable refs above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isIslandMode]);

  // Close on Escape for non-island mode
  React.useEffect(() => {
    if (isIslandMode) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancelRef.current(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isIslandMode]);

  // In TrackHub mode, the dialog is natively embedded inside the TrackHub island (no blur, no detached overlay)
  if (isIslandMode) {
    return null;
  }

  // ── Sidebar mode: clean centered modal without heavy background blur ────────
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Clean backdrop without blur */}
      <div className="absolute inset-0 bg-black/40 st-overlay-in" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4 st-modal-in">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${colors.ring}`}>
          {icon ?? <AlertTriangle size={26} className={colors.dot} />}
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <div className="text-sm text-muted-foreground leading-relaxed">{message}</div>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all st-btn-ghost">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all st-btn ${colors.btn}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PesoIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return <span style={{ ...style, fontSize: size, lineHeight: 1 }}>{PESO}</span>;
}

// ─── Logic helpers ────────────────────────────────────────────────────────────
export function computeStatus(stock: number, reorderPacks: number, unitsPerPack = 1): StockStatus {
  if (stock <= 0) return "out_of_stock";
  const reorder = reorderPacks * Math.max(1, unitsPerPack);
  if (stock < reorder * 0.4) return "critical";
  if (stock < reorder) return "low";
  if (stock < reorder * 1.5) return "moderate";
  return "good";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
}

export function nowDateStr() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

export function staffAbbrev(name: string) {
  return name
    .split(" ")
    .map((w, i) => (i === 0 ? w[0] + "." : w))
    .join(" ");
}

// ─── SVG Charts ───────────────────────────────────────────────────────────────
export function SvgAreaChart({
  data,
  lines,
  yFormatter = (v: number) => String(v),
  xTickInterval = 1,
}: {
  data: Record<string, any>[];
  lines: { key: string; color: string; name: string; axis?: "left" | "right" }[];
  yFormatter?: (v: number) => string;
  xTickInterval?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  // Handle empty or single data point
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const W = 500; const H = 200;
  const hasRightAxis = lines.some(line => line.axis === "right");
  const pad = { t: 8, r: hasRightAxis ? 42 : 8, b: 24, l: 46 };
  const cw = W - pad.l - pad.r; const ch = H - pad.t - pad.b;
  const maxForAxis = (axis: "left" | "right") => Math.max(
    ...data.flatMap(d => lines
      .filter(line => (line.axis ?? "left") === axis)
      .map(line => Number(d[line.key]) || 0)),
    1
  ) * 1.08;
  const leftMax = maxForAxis("left");
  const rightMax = hasRightAxis ? maxForAxis("right") : leftMax;
  
  // Safe calculation for x position
  const xs = (i: number) => {
    if (data.length === 1) return pad.l + cw / 2; // Center single point
    return pad.l + (i / (data.length - 1)) * cw;
  };
  
  const ys = (v: number, axis: "left" | "right" = "left") =>
    pad.t + ch - (v / (axis === "right" ? rightMax : leftMax)) * ch;
  
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ overflow: "visible" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = pad.t + t * ch;
        return (
          <g key={t}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity={0.06} strokeDasharray="3 3" />
            <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.45}>{yFormatter(leftMax * (1 - t))}</text>
            {hasRightAxis && (
              <text x={W - pad.r + 5} y={y + 3} textAnchor="start" fontSize={9} fill="currentColor" opacity={0.45}>
                {yFormatter(rightMax * (1 - t))}
              </text>
            )}
          </g>
        );
      })}
      {data.map((d, i) => (i % Math.max(1, xTickInterval) === 0 || i === data.length - 1) && (
        <text key={String(d.day ?? d.month ?? i)} x={xs(i)} y={H - 5} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.55}>{d.day ?? d.month}</text>
      ))}
      {lines.map(line => {
        const axis = line.axis ?? "left";
        const pts = data.map((d, i) => [xs(i), ys(Number(d[line.key]) || 0, axis)] as [number, number]);
        const linePts = pts.map(p => p.join(",")).join(" ");
        const areaPts = [`${xs(0)},${pad.t + ch}`, ...pts.map(p => p.join(",")), `${xs(data.length - 1)},${pad.t + ch}`].join(" ");
        return (
          <g key={line.key}>
            <polygon points={areaPts} fill={line.color} fillOpacity={0.1} />
            <polyline points={linePts} fill="none" stroke={line.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
      {data.map((d, i) => {
        const tooltipWidth = 132;
        const tooltipHeight = 22 + lines.length * 15;
        const tooltipX = Math.max(2, Math.min(W - tooltipWidth - 2, xs(i) + 10));
        const tooltipAnchorY = Math.min(...lines.map(line =>
          ys(Number(d[line.key]) || 0, line.axis ?? "left")
        ));
        const tooltipY = Math.max(2, Math.min(H - tooltipHeight - 2, tooltipAnchorY - tooltipHeight / 2));
        const hoverWidth = data.length === 1 ? cw : i === 0 ? (xs(1) - xs(0)) / 2 : i === data.length - 1 ? (xs(i) - xs(i - 1)) / 2 : (xs(i + 1) - xs(i - 1)) / 2;
        return (
          <g key={`hover-${String(d.day ?? d.month ?? i)}`}>
            <rect
              x={i === 0 ? pad.l : (xs(i - 1) + xs(i)) / 2}
              y={pad.t}
              width={hoverWidth}
              height={ch}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
            {hoveredIndex === i && (
              <g pointerEvents="none">
                <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx={6} fill="var(--card)" stroke="var(--border)" />
                <text x={tooltipX + 8} y={tooltipY + 15} fontSize={10} fontWeight={700} fill="currentColor">{d.month ?? d.day ?? `Point ${i + 1}`}</text>
                {lines.map((line, lineIndex) => (
                  <text key={line.key} x={tooltipX + 8} y={tooltipY + 30 + lineIndex * 15} fontSize={9} fill={line.color}>
                    {line.name}: {yFormatter(Number(d[line.key]) || 0)}
                  </text>
                ))}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function SvgBarChart({ data }: { data: { name: string; sold: number }[] }) {
  if (data.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No sales recorded yet.</div>;
  }
  const W = 280; const H = 210;
  const pad = { t: 4, r: 12, b: 4, l: 82 };
  const cw = W - pad.l - pad.r; const ch = H - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.sold)) * 1.1;
  const rowH = ch / data.length;
  const barH = Math.min(rowH * 0.55, 18);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {data.map((d, i) => {
        const y = pad.t + i * rowH + (rowH - barH) / 2;
        const bw = (d.sold / maxV) * cw;
        return (
          <g key={d.name}>
            <text x={pad.l - 6} y={y + barH / 2 + 3.5} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.6}>
              <title>{d.name}</title>{d.name.length > 13 ? `${d.name.slice(0, 12)}…` : d.name}
            </text>
            <rect x={pad.l} y={y} width={bw} height={barH} rx={3} fill="#2563eb" fillOpacity={0.8} />
            <text x={pad.l + bw + 4} y={y + barH / 2 + 3.5} fontSize={9} fill="currentColor" opacity={0.45}>{d.sold}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Base UI components ───────────────────────────────────────────────────────
export function FieldInput({
  label, type = "text", value, onChange, placeholder, required, min, step, helperText, autoFocus, readOnly, onKeyDown, list,
}: {
  label: string; type?: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; min?: number; step?: number; helperText?: string;
  autoFocus?: boolean; readOnly?: boolean; onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void; list?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus} readOnly={readOnly} onKeyDown={onKeyDown} list={list}
        placeholder={placeholder} required={required} min={min} step={step}
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      />
      {helperText && <p className="text-[10px] text-muted-foreground mt-1">{helperText}</p>}
    </div>
  );
}

export function FieldSelect({
  label, value, onChange, options, required, roleLabels, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean;
  roleLabels?: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)} required={required}
        className="app-select w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      >
        {/* Placeholder option — visible only when nothing is selected, hidden in the open dropdown */}
        {placeholder !== undefined && (
          <option value="" disabled hidden={value !== ""}>{placeholder}</option>
        )}
        {!placeholder && <option value="">Select</option>}
        {options.map(o => <option key={o} value={o}>{roleLabels?.[o] ?? o}</option>)}
      </select>
    </div>
  );
}

// ─── Help & Guide Popover (?) ────────────────────────────────────────────────
export function InfoTip({
  title,
  lines,
  color = "default",
  trigger,
}: {
  title: string;
  lines: (string | { label: string; value: string })[];
  color?: "default" | "emerald" | "sky" | "amber";
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number; placeAbove: boolean } | null>(null);

  const updateCoords = React.useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    let left = rect.left + rect.width / 2 - width / 2;
    if (left < 16) left = 16;
    if (left + width > window.innerWidth - 16) {
      left = window.innerWidth - 16 - width;
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < 260 && rect.top > 260;
    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
    setCoords({ top, left, placeAbove });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateCoords();

    const handleScroll = () => updateCoords();
    const handleResize = () => updateCoords();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current && !ref.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, updateCoords]);

  const ringColor = {
    default: "ring-1 ring-border/80 bg-muted/60 text-muted-foreground hover:text-primary hover:bg-primary/10 hover:ring-primary/40",
    emerald: "ring-1 ring-emerald-300 dark:ring-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100",
    sky:     "ring-1 ring-sky-300 dark:ring-sky-700 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100",
    amber:   "ring-1 ring-amber-300 dark:ring-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100",
  }[color];

  return (
    <div ref={ref} className="relative inline-flex items-center">
      {trigger ? (
        <div onClick={() => setOpen(v => !v)} className="cursor-pointer inline-flex items-center">
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-all cursor-pointer shadow-2xs hover:scale-110 active:scale-95 ${ringColor}`}
          aria-label="Help and information"
          title="Click for guide and information"
        >
          <Info size={13.5} strokeWidth={2.4} className="shrink-0" />
        </button>
      )}
      {open && coords && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: coords.placeAbove ? undefined : `${coords.top}px`,
            bottom: coords.placeAbove ? `${window.innerHeight - coords.top}px` : undefined,
            left: `${coords.left}px`,
            zIndex: 99999,
          }}
          className="w-72 sm:w-80 bg-card border border-border rounded-xl shadow-2xl p-4 space-y-2.5 st-dropdown-in text-left"
        >
          <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-2">
            <p className="text-xs font-semibold text-foreground leading-snug flex items-center gap-1.5">
              <Info size={13} className="text-primary shrink-0 stroke-[2.2]" />
              {title}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground text-xs p-1 rounded hover:bg-muted cursor-pointer leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {lines.map((line, i) =>
              typeof line === "string" ? (
                <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{line}</p>
              ) : (
                <div key={i} className="flex items-start justify-between gap-2 bg-muted/30 px-2.5 py-1.5 rounded-lg text-[10px]">
                  <span className="text-muted-foreground shrink-0 font-medium">{line.label}</span>
                  <span className="font-semibold text-foreground text-right font-mono">{line.value}</span>
                </div>
              )
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function Modal({
  title, onClose, children, wide, compact = false, hideCloseButton = false, closeOnOverlay = true,
}: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; compact?: boolean; hideCloseButton?: boolean; closeOnOverlay?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:items-center sm:pt-4">
      <div className="absolute inset-0 bg-black/50 st-overlay-in" onClick={closeOnOverlay ? onClose : undefined} />
      <div className={`relative bg-card border border-border/80 rounded-2xl shadow-[0_20px_50px_-15px_rgba(13,148,136,0.15),0_10px_25px_-5px_rgba(0,0,0,0.06)] w-full ${wide ? compact ? "max-w-4xl" : "max-w-6xl" : "max-w-md"} max-h-[90vh] flex flex-col overflow-hidden st-modal-in`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 flex-shrink-0 bg-card/50">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {!hideCloseButton && <button onClick={onClose} aria-label="Close dialog" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors st-btn-ghost"><X size={15} /></button>}
        </div>
        <div className="p-6 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function DeleteConfirmModal({
  product, onClose, onConfirm,
}: {
  product: Product; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      title="Delete Product?"
      message={
        <span>
          Move <span className="font-semibold text-foreground">{product.name}</span> to the recycle bin?
          You can restore it within 30 days.
        </span>
      }
      confirmLabel="Delete Product"
      cancelLabel="Cancel"
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

export function StockBadge({ status }: { status: StockStatus }) {
  const cls: Record<StockStatus, string> = {
    out_of_stock: "bg-red-500/10 text-red-700 border-red-200/80 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30",
    good: "bg-teal-500/10 text-teal-700 border-teal-200/80 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30",
    moderate: "bg-amber-500/10 text-amber-700 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
    low: "bg-orange-500/10 text-orange-700 border-orange-200/80 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30",
    critical: "bg-rose-500/10 text-rose-700 border-rose-200/80 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30",
  };
  const label = status === "out_of_stock" ? "Out of Stock" : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border shadow-2xs ${cls[status]}`}>{label}</span>;
}

export function TxBadge({ status }: { status: TxStatus }) {
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border bg-teal-500/10 text-teal-700 border-teal-200/80 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30 shadow-2xs">Completed</span>;
}

export function TxTypeBadge({ type }: { type: TxType }) {
  const cfg: Record<TxType, { label: string; cls: string }> = {
    sale: { label: "Sale", cls: "bg-blue-500/10 text-blue-700 border-blue-200/80 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30" },
    return: { label: "Return", cls: "bg-orange-500/10 text-orange-700 border-orange-200/80 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30" },
    adjustment: { label: "Adjustment", cls: "bg-slate-500/10 text-slate-700 border-slate-200/80 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30" },
  };
  const { label, cls } = cfg[type];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border shadow-2xs ${cls}`}>{label}</span>;
}

export function StatCard({
  label, value, sub, icon: Icon, trend, trendUp, color, showTrendIcon = true, tip,
}: {
  label: string; value: string; sub: string; icon: any; trend?: React.ReactNode; trendUp?: boolean; color: string; showTrendIcon?: boolean;
  tip?: { title: string; lines: (string | { label: string; value: string })[] };
}) {
  return (
    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3 hover:shadow-[0_8px_24px_-6px_rgba(13,148,136,0.12),0_2px_6px_rgba(0,0,0,0.03)] transition-all duration-200 st-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
          {tip && <InfoTip title={tip.title} lines={tip.lines} />}
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs" style={{ backgroundColor: color + "14", border: `1px solid ${color}24` }}>
          <Icon size={17} style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
          {showTrendIcon && (trendUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />)}
          {trend}
        </div>
      )}
    </div>
  );
}

/* ---------- Shared Table Pagination Controls ---------- */
export function TablePager({
  total,
  page,
  pageSize,
  onPage,
  alwaysShow,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  alwaysShow?: boolean;
}) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1 && !alwaysShow) return null;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border/70 bg-muted/10">
      <span className="text-[11px] text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of{" "}
        <span className="font-semibold text-foreground">{total}</span> results
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border/80 bg-card/90 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
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
              className={`w-7 h-7 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                p === page
                  ? "bg-primary text-primary-foreground border-primary shadow-2xs"
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
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border/80 bg-card/90 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export function ViewReasonModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  return (
    <Modal title="Return Reason" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-muted/40 border border-border rounded-xl p-3 text-xs space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Transaction ID</span><span className="font-semibold text-foreground">{tx.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-semibold text-foreground">{tx.product}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Qty Returned</span><span className="font-semibold text-foreground">{tx.qty}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Refund Amount</span><span className="font-semibold text-foreground">{fmt(tx.amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-semibold text-foreground">{tx.date}</span></div>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reason</p>
          <p className="text-sm text-foreground bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-4 py-3 leading-relaxed">
            {tx.note || "No reason provided."}
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ─── Notification Panel ───────────────────────────────────────────────────────
import { useRef, useEffect, useState, useMemo } from "react";
import { AlertTriangle as _AlertTriangle, FileText as _FileText, Check as _Check, CheckCheck, RefreshCw, X as _X, ShoppingCart } from "lucide-react";
import { sortBatchesFIFO, sortBatchesByExpiry, deductFIFO, getTotalStock, getEarliestExpiry, parseExpiry, formatExpiryString, ROLES, ROLE_LABELS, computeTax, VAT_RATE_LABEL, type Notification, type ProductBatch } from "./data";

export function NotificationPanel({
  notifs, onMarkAll, onMarkOne, onNotificationClick, onNotificationHover, productMap, onClose,
}: {
  notifs: Notification[];
  onMarkAll: () => void;
  onMarkOne: (id: number) => void;
  onNotificationClick: (notification: Notification) => void;
  onNotificationHover: (productId: string | null) => void;
  productMap: Record<string, string>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const iconMap = {
    alert: <_AlertTriangle size={13} className="text-amber-500" />,
    order: <_FileText size={13} className="text-primary" />,
    info: <_Check size={13} className="text-emerald-500" />,
  };

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border/80 rounded-2xl shadow-[0_20px_50px_-10px_rgba(13,148,136,0.15),0_10px_20px_-5px_rgba(0,0,0,0.08)] overflow-hidden st-dropdown-in" style={{ zIndex: 200 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-card/50">
        <div>
          <p className="text-sm font-bold text-foreground">Notifications</p>
          <p className="text-[10px] text-muted-foreground">{notifs.filter(n => !n.read).length} unread</p>
        </div>
        <button onClick={onMarkAll} className="flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold">
          <CheckCheck size={12} />Mark all read
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-border/60">
        {notifs.map(n => (
          <div
            key={n.id}
            onClick={() => onNotificationClick(n)}
            onMouseEnter={() => onNotificationHover(n.productId ?? null)}
            onMouseLeave={() => onNotificationHover(null)}
            className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 ${n.read ? "opacity-60" : ""}`}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: n.type === "alert" ? "#fef3c7" : n.type === "order" ? "#ccfbf1" : "#f0fdf4" }}>
              {iconMap[n.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-xs font-semibold text-foreground leading-tight ${!n.read ? "" : "font-medium"}`}>{n.title}</p>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1" />}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
              {productMap[n.productId ?? ""] && (
                <p className="text-[10px] text-primary mt-1">View product: {productMap[n.productId ?? ""]}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">{n.time}</p>
            </div>
          </div>
        ))}
        {notifs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No notifications</p>}
      </div>
    </div>
  );
}

// ─── Product Form Modal ───────────────────────────────────────────────────────
export function ProductFormModal({
  initial, inventory, categories, onClose, onSave, onAddCategory, suggestedBatchQty = 0,
}: {
  initial?: Product;
  inventory: Product[];
  categories: string[];
  onClose: () => void;
  onSave: (original: Product | null, updated: Product) => void;
  onAddCategory: (cat: string) => void;
  suggestedBatchQty?: number;
}) {
  const isEdit = !!initial;
  const supplierListId = React.useId();
  const supplierSuggestions = React.useMemo(() => {
    const suppliers = new Map<string, string>();
    inventory.forEach(product => {
      const supplier = product.supplier.trim();
      if (supplier) suppliers.set(supplier.toLocaleLowerCase(), supplier);
    });
    return [...suppliers.values()].sort((a, b) => a.localeCompare(b));
  }, [inventory]);
  const [form, setForm] = useState({
    barcode: initial?.barcode ?? "",
    name: initial?.name ?? "",
    supplier: initial?.supplier ?? "",
    reorder: initial?.reorder != null ? String(initial.reorder) : "",
    price: initial?.price != null ? String(initial.price) : "",
    salePrice: initial?.salePrice != null ? String(initial.salePrice) : "",
    unitLabel: initial?.unitLabel ?? "unit",
    unitsPerPack: initial?.unitsPerPack != null && initial.unitsPerPack > 1 ? String(initial.unitsPerPack) : "",
    packPrice: initial?.packPrice != null ? String(initial.packPrice) : "",
  });
  const [customCategory, setCustomCategory] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initial?.categories?.length ? initial.categories : (initial?.category ? initial.category.split(",").map(c => c.trim()).filter(Boolean) : [])
  );
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const [batches, setBatches] = useState<ProductBatch[]>(initial?.batches ?? []);
  const [newBatchQty, setNewBatchQty] = useState(suggestedBatchQty > 0 ? String(suggestedBatchQty) : "");
  const [newBatchExpiry, setNewBatchExpiry] = useState("");
  const [newBatchTotalCost, setNewBatchTotalCost] = useState("");

  const toggleCategory = (category: string) => {
    setSelectedCategories(current =>
      current.includes(category) ? current.filter(item => item !== category) : [...current, category]
    );
  };

  const handleAddCustomCategory = () => {
    const newCategories = customCategory.split("/").map(category => category.trim()).filter(Boolean);
    if (newCategories.length === 0) return;
    setSelectedCategories(current => {
      const selected = new Set(current.map(category => category.toLocaleLowerCase()));
      return [...current, ...newCategories.filter(category => {
        const key = category.toLocaleLowerCase();
        if (selected.has(key)) return false;
        selected.add(key);
        return true;
      })];
    });
    newCategories.forEach(onAddCategory);
    setCustomCategory("");
  };

  const handleAddBatch = () => {
    const qty = parseInt(newBatchQty, 10);
    if (!qty || qty <= 0) return;
    const batchNum = batches.length + 1;
    const batchId = `${initial?.id ?? "NEW"}-B${Date.now()}-${batchNum}`;
    const expiryDate = newBatchExpiry.trim() ? parseExpiry(newBatchExpiry.trim()) : null;
    if (expiryDate && Number.isNaN(expiryDate.getTime())) return;
    const totalCost = newBatchTotalCost.trim() !== "" ? parseFloat(newBatchTotalCost) : null;
    const unitCost  = totalCost != null && qty > 0 ? parseFloat((totalCost / qty).toFixed(4)) : null;
    const newBatch: ProductBatch = {
      batchId, qty,
      expiry: expiryDate ? formatExpiryString(expiryDate) : null,
      expiryDate: expiryDate ? formatExpiryString(expiryDate) : null,
      receivedDate: new Date().toLocaleDateString("en-PH"),
      batchTotalCost: totalCost,
      unitCost,
    };
    setBatches(prev => sortBatchesFIFO([...prev, newBatch]));
    setNewBatchQty("");
    setNewBatchExpiry("");
    setNewBatchTotalCost("");
  };

  function handleRemoveBatch(batchId: string) {
    setBatches(prev => prev.filter(b => b.batchId !== batchId));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let currentBatches = [...batches];
    const pendingQty = parseInt(newBatchQty, 10);
    if (pendingQty > 0) {
      const batchNum = currentBatches.length + 1;
      const batchId = `${initial?.id ?? "NEW"}-B${Date.now()}-${batchNum}`;
      const expiryDate = newBatchExpiry.trim() ? parseExpiry(newBatchExpiry.trim()) : null;
      if (!expiryDate || !Number.isNaN(expiryDate.getTime())) {
        const totalCost = newBatchTotalCost.trim() !== "" ? parseFloat(newBatchTotalCost) : null;
        const unitCost  = totalCost != null && pendingQty > 0 ? parseFloat((totalCost / pendingQty).toFixed(4)) : null;
        currentBatches.push({
          batchId,
          qty: pendingQty,
          expiry: expiryDate ? formatExpiryString(expiryDate) : null,
          expiryDate: expiryDate ? formatExpiryString(expiryDate) : null,
          receivedDate: new Date().toLocaleDateString("en-PH"),
          batchTotalCost: totalCost,
          unitCost,
        });
      }
    }

    if (currentBatches.length === 0) return;
    const reorder = parseInt(form.reorder, 10) || 0;
    const price = parseFloat(form.price) || 0;
    const salePriceVal = form.salePrice.trim() !== "" ? parseFloat(form.salePrice) : undefined;
    const unitsPerPack = Math.max(1, parseInt(form.unitsPerPack, 10) || 1);
    const packPriceVal = form.packPrice.trim() !== "" ? parseFloat(form.packPrice) : undefined;
    const finalCategories = selectedCategories.map(category => category.trim()).filter(Boolean);
    if (customCategory.trim()) {
      const customCategories = customCategory.split("/").map(category => category.trim()).filter(Boolean);
      for (const custom of customCategories) {
        if (!finalCategories.some(category => category.toLocaleLowerCase() === custom.toLocaleLowerCase())) {
          finalCategories.push(custom);
        }
        onAddCategory(custom);
      }
    }
    if (finalCategories.length === 0) return;
    const sortedBatches = sortBatchesFIFO(currentBatches);
    const totalStock = getTotalStock(sortedBatches);
    const updated: Product = {
      id: initial?.id ?? "", barcode: form.barcode.trim(), name: form.name, category: finalCategories.join(", "), categories: finalCategories, supplier: form.supplier.trim(),
      stock: totalStock, reorder, price, salePrice: salePriceVal,
      unitLabel: form.unitLabel.trim() || "unit", unitsPerPack, packPrice: packPriceVal,
      expiry: getEarliestExpiry(sortedBatches), status: computeStatus(totalStock, reorder, unitsPerPack), batches: sortedBatches,
    };
    onSave(initial ?? null, updated);
    onClose();
  };

  return (
    <Modal title={isEdit ? "Edit Product" : "Add New Product"} onClose={onClose} wide compact hideCloseButton>
      <form onSubmit={handleSubmit} className="space-y-3">
        <details open className="group rounded-xl border border-border/80 bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold text-foreground">Product details</span>
              <span className="block text-[11px] text-muted-foreground">Name, barcode, supplier, and categories</span>
            </span>
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-muted/60 text-primary transition-transform group-open:rotate-180 text-base leading-none">⌄</span>
          </summary>
          <div className="space-y-3 border-t border-border/60 px-4 py-4">
        {isEdit && <FieldInput label="Product ID (auto-generated)" value={initial?.id ?? ""} onChange={() => {}} readOnly />}
        <FieldInput
          label="Barcode"
          value={form.barcode}
          onChange={set("barcode")}
          placeholder="Scan or enter barcode"
          required={!isEdit}
          autoFocus={!isEdit}
          onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
          helperText="Use a USB or Bluetooth scanner, or type the code."
        />
        <FieldInput label="Product Name" value={form.name} onChange={set("name")} placeholder="e.g. Amoxicillin 500mg" required />
        <FieldInput label="Supplier" value={form.supplier} onChange={set("supplier")} placeholder="e.g. Apex Pharma" required list={supplierListId} />
        <datalist id={supplierListId}>
          {supplierSuggestions.map(supplier => <option key={supplier} value={supplier} />)}
        </datalist>
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Categories (select all that apply)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto rounded-lg border border-border p-3">
            {categories.map(category => (
              <label key={category} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleCategory(category)} />
                {category}
              </label>
            ))}
            {categories.length === 0 && <p className="text-xs text-muted-foreground">Add a custom category below.</p>}
          </div>
          <div className="flex gap-2">
            <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); handleAddCustomCategory(); } }}
              placeholder="Add a custom category"
              className="min-w-0 flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            <button type="button" onClick={handleAddCustomCategory} disabled={!customCategory.trim()}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50">Add</button>
          </div>
          {selectedCategories.length === 0 && <p className="text-xs text-muted-foreground">Select or add at least one category.</p>}
        </div>
          </div>
        </details>

        <details className="group rounded-xl border border-border/80 bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold text-foreground">Pricing & pack sizes</span>
              <span className="block text-[11px] text-muted-foreground">Selling price, discount, unit, and pack pricing</span>
            </span>
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-muted/60 text-primary transition-transform group-open:rotate-180 text-base leading-none">⌄</span>
          </summary>
          <div className="space-y-3 border-t border-border/60 px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label={`Selling Price (${PESO}) — VAT-inclusive`} type="number" value={form.price} onChange={set("price")} placeholder="0.00" required min={0} step={0.01} />
          <FieldInput label={`Sale/Discounted Price (${PESO})`} type="number" value={form.salePrice} onChange={set("salePrice")} placeholder="Optional" min={0} step={0.01} helperText="Discounted price (optional)" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldInput label="Base Unit Label" value={form.unitLabel} onChange={set("unitLabel")} placeholder="tablet, bottle, piece" required />
          <FieldInput
            label="Units per Pack/Box (optional)"
            type="number"
            value={form.unitsPerPack}
            onChange={set("unitsPerPack")}
            placeholder="e.g. 12"
            min={1}
            step={1}
            helperText="Leave blank for single items with no pack."
          />
          <FieldInput label={`Pack/Box Price (${PESO})`} type="number" value={form.packPrice} onChange={set("packPrice")} placeholder="Optional" min={0} step={0.01} helperText="Optional whole-pack price" />
        </div>

        {/* Live VAT breakdown — always standard 12% */}
        {parseFloat(form.price) > 0 && (() => {
          const activePrice = parseFloat(form.salePrice || form.price) || parseFloat(form.price) || 0;
          const breakdown = computeTax(activePrice, false);
          return (
            <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">
                VAT Breakdown — {VAT_RATE_LABEL} Standard VAT
              </p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Selling Price (VAT-inclusive)</span>
                  <span className="font-semibold text-foreground tabular-nums">{PESO}{activePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pre-tax Amount (Net)</span>
                  <span className="font-semibold text-foreground tabular-nums">{PESO}{breakdown.preTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT ({VAT_RATE_LABEL})</span>
                  <span className="tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                    {PESO}{breakdown.tax.toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-sky-200 dark:border-sky-500/30 pt-1 flex justify-between font-bold">
                  <span className="text-foreground">Total</span>
                  <span className="tabular-nums text-sky-700 dark:text-sky-400">{PESO}{breakdown.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })()}
          </div>
        </details>

        <details open className="group rounded-xl border border-border/80 bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold text-foreground">Stock & reorder</span>
              <span className="block text-[11px] text-muted-foreground">Set the low-stock alert and manage received batches</span>
            </span>
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-muted/60 text-primary transition-transform group-open:rotate-180 text-base leading-none">⌄</span>
          </summary>
          <div className="space-y-3 border-t border-border/60 px-4 py-4">
        <FieldInput
          label={parseInt(form.unitsPerPack, 10) > 1 ? "Alert me when stock is below (packs/boxes)" : `Alert me when stock is below (${form.unitLabel.trim() || "units"})`}
          type="number"
          value={form.reorder}
          onChange={set("reorder")}
          placeholder="0"
          required
          min={0}
          helperText="This is the low-stock alert threshold, not the quantity to order."
        />
        {suggestedBatchQty > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
            <strong>Suggested reorder: {suggestedBatchQty.toLocaleString()} {form.unitLabel || "units"}.</strong>
            {" "}The quantity is prefilled below; adjust it to match your supplier pack size.
          </div>
        )}
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Current batches <span className="text-primary">(oldest received stock is used first)</span>
          </label>
          {batches.length > 0 && (
            <div className="bg-muted/30 border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-5 px-3 py-1.5 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Batch ID</span><span>Qty</span><span>Expiry</span><span>Batch Cost</span><span>Unit Cost</span>
              </div>
              {sortBatchesFIFO(batches).map((b, i) => (
                <div key={b.batchId} className={`grid grid-cols-5 px-3 py-2 text-xs items-center border-t border-border/40 ${i === 0 ? "bg-amber-50/50 dark:bg-amber-500/5" : ""}`}>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {i === 0 && <span className="text-amber-600 dark:text-amber-400 mr-1">▶</span>}{b.batchId}
                  </span>
                  <span className="font-bold text-foreground">{b.qty}</span>
                  <span className={i === 0 ? "font-semibold text-amber-700 dark:text-amber-400" : "text-foreground"}>{b.expiry ?? "No expiry"}</span>
                  <span className="text-foreground tabular-nums">
                    {b.batchTotalCost != null ? `${PESO}${b.batchTotalCost.toFixed(2)}` : <span className="text-muted-foreground/60 italic">—</span>}
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground tabular-nums">
                      {b.unitCost != null ? `${PESO}${b.unitCost.toFixed(4)}` : "—"}
                    </span>
                    <button type="button" onClick={() => handleRemoveBatch(b.batchId)} className="text-muted-foreground hover:text-red-500 transition-colors ml-2"><_X size={11} /></button>
                  </div>
                </div>
              ))}
              <div className="px-3 py-1.5 border-t border-border/40 bg-muted/20 flex justify-between text-xs">
                <span className="text-muted-foreground">Total Stock (base units)</span>
                <span className="font-bold text-foreground">{getTotalStock(batches)} {form.unitLabel || "units"}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Qty ({form.unitLabel || "base units"})</label>
              <input type="number" value={newBatchQty} onChange={e => setNewBatchQty(e.target.value)} placeholder="e.g. 100" min={1}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Expiry <span className="text-muted-foreground/60">(optional)</span></label>
              <input type="date" value={newBatchExpiry} onChange={e => setNewBatchExpiry(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">
                Batch Cost ({PESO}) <span className="text-muted-foreground/60 font-normal">optional</span>
              </label>
              <input type="number" value={newBatchTotalCost} onChange={e => setNewBatchTotalCost(e.target.value)}
                placeholder="e.g. 5000" min={0} step={0.01}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
              {newBatchTotalCost && newBatchQty && parseFloat(newBatchQty) > 0 && (
                <p className="text-[10px] text-primary mt-0.5 tabular-nums">
                  Unit cost: {PESO}{(parseFloat(newBatchTotalCost) / parseFloat(newBatchQty)).toFixed(4)}
                </p>
              )}
            </div>
            <button type="button" onClick={handleAddBatch}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 self-end mb-0 ${
                newBatchQty && parseInt(newBatchQty, 10) > 0
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/40 hover:opacity-90 animate-pulse"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}>
              + Add Batch
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Enter inventory in base units. Pack/box stock is calculated from the configured units per pack.
          </p>
          {batches.length === 0 && !newBatchQty && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-medium">
              <_AlertTriangle size={12} className="flex-shrink-0" />
              <span>Enter quantity in <strong>Qty</strong> above, then click <strong>+ Add Batch</strong> (or Save Changes) to set stock under FIFO.</span>
            </p>
          )}
          {newBatchQty && parseInt(newBatchQty, 10) > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
              <_Check size={12} className="flex-shrink-0" />
              <span><strong>{parseInt(newBatchQty, 10).toLocaleString()} {form.unitLabel || "units"}</strong> will be added as a new stock batch when saved.</span>
            </p>
          )}
        </div>
          </div>
        </details>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button
            type="submit"
            disabled={batches.length === 0 && !(newBatchQty && parseInt(newBatchQty, 10) > 0)}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isEdit ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── New Sale Modal ───────────────────────────────────────────────────────────
// Expiry helpers used in sale flow
const EXPIRY_BLOCK_DAYS = 60;

/** Returns days left until expiry — negative means already expired. */
function daysUntilExpiry(expiryStr: string): number {
  const [mm, dd, yyyy] = expiryStr.split("/");
  const expDate = new Date(`${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}T00:00:00`);
  return (expDate.getTime() - Date.now()) / 86400000;
}

/** Returns the next batch that will be consumed according to FIFO. */
function getFirstBatch(product: import("./data").Product) {
  return sortBatchesFIFO(product.batches)[0] ?? null;
}

/** Returns "blocked" | "warning" | "ok" and days left for a product. */
export function getExpiryStatus(product: import("./data").Product): { status: "blocked" | "ok"; daysLeft: number; batchId: string } | null {
  const batch = getFirstBatch(product);
  if (!batch?.expiry) return null;
  const days = daysUntilExpiry(batch.expiry);
  if (days <= EXPIRY_BLOCK_DAYS) return { status: "blocked", daysLeft: Math.ceil(days), batchId: batch.batchId };
  return null;
}

// ── Expiry block dialog (SweetAlert-style) ────────────────────────────────────
export function ExpiryBlockDialog({
  product, batchId, daysLeft, onClose, onGoToInventory, canManage,
}: {
  product: import("./data").Product;
  batchId: string;
  daysLeft: number;
  onClose: () => void;
  onGoToInventory: () => void;
  canManage: boolean;
}) {
  const expired    = daysLeft <= 0;
  const isOneBatch = product.batches.filter(b => b.qty > 0).length === 1;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 st-modal-in">
        {/* Icon */}
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${expired ? "bg-red-100 dark:bg-red-500/20" : "bg-amber-100 dark:bg-amber-500/20"}`}>
            <ShieldAlert size={28} className={expired ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"} />
          </div>
          <h2 className={`text-base font-bold text-center ${expired ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
            {expired ? "Batch Expired" : "Near-Expiry — Sale Blocked"}
          </h2>
        </div>

        {/* Body */}
        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Product</span>
            <span className="font-semibold text-foreground">{product.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Batch</span>
            <span className="font-mono text-foreground">{batchId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-bold ${expired ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
              {expired ? `Expired ${Math.abs(daysLeft)}d ago` : `Expires in ${daysLeft}d`}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          {expired
            ? "This product cannot be sold — the first batch has already expired."
            : `Products expiring within ${EXPIRY_BLOCK_DAYS} days cannot be dispensed for patient safety.`}
          {canManage
            ? isOneBatch
              ? " This is the only batch — please remove the product from inventory."
              : " Please remove this batch from inventory. The next batch will then become available for sale."
            : " Please inform your Inventory Manager to remove this batch from the system."}
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            {canManage ? "Cancel" : "Understood"}
          </button>
          {canManage && (
            <button onClick={onGoToInventory}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 ${expired ? "bg-red-500" : "bg-amber-500"}`}>
              {isOneBatch ? "Remove Product" : "Update Inventory"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CUSTOMER_EXEMPTION_TYPES = ["Senior Citizen", "PWD", "Other Qualified ID"] as const;
type CustomerExemptionType = typeof CUSTOMER_EXEMPTION_TYPES[number];
type SaleCartItem = { product: Product; qty: number; saleQty: number; saleUnit: "unit" | "pack" };
const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function NewSaleModal({
  onClose, onAdd, inventory, currentUser, onGoToInventory,
}: {
  onClose: () => void;
  onAdd: (t: Transaction, productId: string, qty: number, saleQty?: number, saleUnit?: string, items?: Array<{ product_id: string; qty: number; sale_qty?: number; sale_unit?: string }>) => void;
  inventory: Product[];
  currentUser: import("./data").AuthUser;
  onGoToInventory: () => void;
}) {
  const canManage = currentUser.role === "inventory_manager";
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("");
  const [saleUnit, setSaleUnit] = useState<"unit" | "pack">("unit");
  const [cart, setCart] = useState<SaleCartItem[]>([]);
  const [editingCartKey, setEditingCartKey] = useState<string | null>(null);
  const [editingCartQty, setEditingCartQty] = useState("");
  const [expiryBlock, setExpiryBlock] = useState<{ batchId: string; daysLeft: number } | null>(null);
  const [stockLimit, setStockLimit] = useState<{ product: Product; requested: number; available: number } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [customerExemptionType, setCustomerExemptionType] = useState<CustomerExemptionType>("Senior Citizen");
  const [customerIdNumber, setCustomerIdNumber] = useState("");

  const qtyNum = parseInt(qty) || 0;
  const quantityInputRef = React.useRef<HTMLInputElement>(null);
  const unitsPerPack = selectedProduct?.unitsPerPack ?? 1;
  const baseQty = saleUnit === "pack" ? qtyNum * unitsPerPack : qtyNum;
  const unitPrice = selectedProduct ? (selectedProduct.salePrice ?? selectedProduct.price) : 0;
  const packPrice = selectedProduct?.packPrice ?? null;
  const selectedPrice = saleUnit === "pack" && packPrice != null ? packPrice : saleUnit === "pack" ? unitPrice * unitsPerPack : unitPrice;
  const shelfTotal = roundCurrency(selectedPrice * qtyNum);
  const taxBreakdown = selectedProduct ? computeTax(shelfTotal, false) : null;
  const customerVatExempt = applyDiscount;
  const customerExemptionMissing = applyDiscount && customerIdNumber.trim() === "";

  React.useEffect(() => {
    if (selectedProduct && !expiryBlock) quantityInputRef.current?.focus();
  }, [selectedProduct, expiryBlock]);

  // Check expiry whenever a product is selected
  const handleSelect = (p: Product | null) => {
    setStockLimit(null);
    if (p && p.stock <= 0) {
      setSelectedProduct(null);
      setExpiryBlock(null);
      setStockLimit({ product: p, requested: 1, available: 0 });
      return;
    }
    setSelectedProduct(p);
    setExpiryBlock(null);
    if (p) {
      const exp = getExpiryStatus(p);
      if (exp) setExpiryBlock({ batchId: exp.batchId, daysLeft: exp.daysLeft });
    }
  };

  const fifoPreview = useMemo(() => {
    if (!selectedProduct || baseQty <= 0 || baseQty > selectedProduct.stock) return [];
    try { const { consumed } = deductFIFO(selectedProduct.batches, baseQty); return consumed; } catch { return []; }
  }, [selectedProduct, baseQty]);

  const addCurrentToCart = () => {
    if (!selectedProduct || qtyNum <= 0) return;
    if (baseQty > selectedProduct.stock) {
      setStockLimit({ product: selectedProduct, requested: baseQty, available: selectedProduct.stock });
      return;
    }
    const exp = getExpiryStatus(selectedProduct);
    if (exp) { setExpiryBlock({ batchId: exp.batchId, daysLeft: exp.daysLeft }); return; }
    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.product.id === selectedProduct.id && item.saleUnit === saleUnit);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], qty: baseQty, saleQty: qtyNum, saleUnit };
        return next;
      }
      return [...prev, { product: selectedProduct, qty: baseQty, saleQty: qtyNum, saleUnit }];
    });
    setSelectedProduct(null);
    setQty("");
    setSaleUnit("unit");
  };

  const getCartLineAmounts = (item: SaleCartItem) => {
    const price = item.product.salePrice ?? item.product.price;
    const lineUnitPrice = item.saleUnit === "pack" && item.product.packPrice != null ? item.product.packPrice : item.saleUnit === "pack" ? price * (item.product.unitsPerPack ?? 1) : price;
    const shelfTotal = roundCurrency(lineUnitPrice * item.saleQty);
    // Discount applies to ALL products in the sale when applyDiscount is on
    const discountBase = applyDiscount ? roundCurrency(shelfTotal / 1.12) : 0;
    const vatRemoved = applyDiscount ? roundCurrency(shelfTotal - discountBase) : 0;
    const discountAmount = applyDiscount ? roundCurrency(discountBase * 0.2) : 0;
    const total = applyDiscount ? roundCurrency(discountBase - discountAmount) : shelfTotal;
    return { unitPrice: lineUnitPrice, shelfTotal, vatRemoved, discountAmount, total };
  };
  const cartTotal = cart.reduce((sum, item) => sum + getCartLineAmounts(item).total, 0);

  const saveCartQuantity = (item: SaleCartItem) => {
    const editedSaleQty = parseInt(editingCartQty, 10) || 0;
    const itemUnitsPerPack = item.product.unitsPerPack ?? 1;
    const editedBaseQty = editedSaleQty * (item.saleUnit === "pack" ? itemUnitsPerPack : 1);
    if (editedSaleQty <= 0) return;
    if (editedBaseQty > item.product.stock) {
      setStockLimit({ product: item.product, requested: editedBaseQty, available: item.product.stock });
      return;
    }
    setCart(prev => prev.map(line => line === item ? { ...line, qty: editedBaseQty, saleQty: editedSaleQty } : line));
    setEditingCartKey(null);
    setEditingCartQty("");
  };

  const pendingQtyExceedsStock = !!selectedProduct && qtyNum > 0 && baseQty > selectedProduct.stock;
  const hasValidPendingItem = !!selectedProduct && qtyNum > 0 && !expiryBlock && !customerExemptionMissing;
  const canConfirmSale = !pendingQtyExceedsStock && (cart.length > 0
    ? !selectedProduct || qtyNum === 0
    : hasValidPendingItem);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProduct) {
      if (qtyNum <= 0 && cart.length === 0) {
        quantityInputRef.current?.focus();
        return;
      }
      if (qtyNum > 0 && baseQty > selectedProduct.stock) {
        setStockLimit({ product: selectedProduct, requested: baseQty, available: selectedProduct.stock });
        return;
      }
      if (qtyNum > 0 && (expiryBlock || customerExemptionMissing)) return;
    }
    const itemsToSubmit = cart.length > 0 ? cart : selectedProduct ? [{ product: selectedProduct, qty: qtyNum, saleQty: qtyNum, saleUnit }] : [];
    if (itemsToSubmit.length === 0) return;
    if (customerExemptionMissing) return;
    // Show confirmation dialog before completing the sale
    setConfirmDialog(true);
  };

  const doSubmit = () => {
    setConfirmDialog(false);
    const itemsToSubmit = cart.length > 0 ? cart : selectedProduct ? [{ product: selectedProduct, qty: qtyNum, saleQty: qtyNum, saleUnit }] : [];
    if (itemsToSubmit.length === 0) return;
    if (customerExemptionMissing) return;

    const salePayload = itemsToSubmit.map(item => ({
      product_id: item.product.id,
      qty: item.saleUnit === "pack" ? item.saleQty * (item.product.unitsPerPack ?? 1) : item.saleQty,
      sale_qty: item.saleQty,
      sale_unit: item.saleUnit,
    }));

    const first = itemsToSubmit[0];
    const firstLineAmounts = getCartLineAmounts(first);
    const firstTaxBreakdown = applyDiscount
      ? { total: firstLineAmounts.total, preTax: firstLineAmounts.total, tax: 0, rate: 0, isExempt: true }
      : computeTax(firstLineAmounts.shelfTotal, false);

    const note = applyDiscount
      ? `Customer discount: ${customerExemptionType} ID ${customerIdNumber.trim()}`
      : undefined;

    const tx: Transaction = {
      id: `TXN-${Date.now().toString().slice(-4)}`, type: "sale", product: first.product.name,
      qty: salePayload[0]?.qty ?? 0, saleQty: first.saleQty, saleUnit: first.saleUnit,
      unitsPerSale: first.saleUnit === "pack" ? (first.product.unitsPerPack ?? 1) : 1,
      amount: firstLineAmounts.total,
      discountAmount: firstLineAmounts.discountAmount,
      preTaxAmount: firstTaxBreakdown.preTax, taxAmount: firstTaxBreakdown.tax, taxRate: firstTaxBreakdown.rate,
      customerVatExempt: applyDiscount,
      customerExemptionType: applyDiscount ? customerExemptionType : null,
      customerIdNumber: applyDiscount ? customerIdNumber.trim() : null,
      staff: staffAbbrev(currentUser.name), date: nowDateStr(),
      status: "completed", productId: first.product.id, note,
    };
    onAdd(tx, first.product.id, salePayload[0]?.qty ?? 0, first.saleQty, first.saleUnit, salePayload);
    onClose();
  };

  const handleGoToInventory = () => {
    onClose();
    onGoToInventory();
  };

  return (
    <>
      {confirmDialog && (
        <ConfirmDialog
          title="Confirm Sale?"
          message={
            <span>
              {cart.length > 0 ? `${cart.length} product${cart.length !== 1 ? "s" : ""}` : "1 product"} · Total <span className="font-semibold text-foreground">{fmt(cart.length > 0 ? cartTotal : shelfTotal)}</span>. Stock will be deducted once confirmed.
            </span>
          }
          confirmLabel="Complete Sale"
          cancelLabel="Edit Sale"
          variant="info"
          onConfirm={doSubmit}
          onCancel={() => setConfirmDialog(false)}
          forceModal
        />
      )}
      {stockLimit && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/15">
              <_AlertTriangle size={26} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Insufficient Stock</h2>
              <p className="mt-1 text-sm font-semibold text-foreground">{stockLimit.product.name}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Requested {stockLimit.requested} {stockLimit.product.unitLabel ?? "units"}; only {stockLimit.available} available.
              </p>
              <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
                {stockLimit.available === 0 ? "This product is out of stock and cannot be sold." : "Reduce the quantity to continue."}
              </p>
            </div>
            <button type="button" onClick={() => { setStockLimit(null); quantityInputRef.current?.focus(); }} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">
              Adjust Quantity
            </button>
          </div>
        </div>
      )}
      {/* Expiry block dialog — shown on top of modal */}
      {expiryBlock && selectedProduct && (
        <ExpiryBlockDialog
          product={selectedProduct}
          batchId={expiryBlock.batchId}
          daysLeft={expiryBlock.daysLeft}
          onClose={() => setExpiryBlock(null)}
          onGoToInventory={handleGoToInventory}
          canManage={canManage}
        />
      )}
    <Modal title="New Sale" onClose={onClose} wide hideCloseButton>
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.9fr)] lg:items-start">
          <div className="space-y-4">
            <ProductSearchWidget inventory={inventory} onSelect={handleSelect} selectedProduct={selectedProduct} />
            {selectedProduct && (
              <div className="grid grid-cols-2 gap-2">
                {(["unit", "pack"] as const).map(mode => (
                  <button key={mode} type="button" disabled={mode === "pack" && unitsPerPack <= 1}
                    onClick={() => setSaleUnit(mode)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${saleUnit === mode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"} disabled:opacity-40`}>
                    {mode === "unit" ? `1 ${selectedProduct.unitLabel ?? "unit"}` : `1 pack/box (${unitsPerPack} units)`}
                  </button>
                ))}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quantity</label>
              <input ref={quantityInputRef} type="number" min={selectedProduct ? 1 : undefined} value={qty} onChange={e => {
                const value = e.target.value;
                setQty(value);
                const requested = (parseInt(value, 10) || 0) * (saleUnit === "pack" ? unitsPerPack : 1);
                if (selectedProduct && requested > selectedProduct.stock) {
                  setStockLimit({ product: selectedProduct, requested, available: selectedProduct.stock });
                }
              }} onKeyDown={e => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                if (selectedProduct && qtyNum > 0) {
                  addCurrentToCart();
                }
              }} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            {cart.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sale cart</p>
                  <p className="text-xs font-semibold text-foreground">{fmt(cartTotal)}</p>
                </div>
                {cart.map(item => {
                  const key = `${item.product.id}-${item.saleUnit}`;
                  const line = getCartLineAmounts(item);
                  const isEditing = editingCartKey === key;
                  return (
                    <div key={key} className="space-y-1.5 rounded-lg border border-border bg-background px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {item.product.barcode && <p className="truncate text-[10px] font-semibold text-primary">{item.product.barcode}</p>}
                          <p className="truncate text-xs font-semibold text-foreground">{item.product.name}</p>
                          <p className="text-[10px] text-muted-foreground">{fmt(line.unitPrice)} / {item.saleUnit === "pack" ? "pack" : item.product.unitLabel ?? "unit"}</p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {isEditing ? (
                            <>
                              <input type="number" min={1} value={editingCartQty} onChange={e => setEditingCartQty(e.target.value)} aria-label={`Edit quantity for ${item.product.name}`} className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs" />
                              <button type="button" onClick={() => saveCartQuantity(item)} className="text-[10px] font-semibold text-primary">Save</button>
                              <button type="button" onClick={() => { setEditingCartKey(null); setEditingCartQty(""); }} className="text-[10px] font-semibold text-muted-foreground">Cancel</button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-semibold text-foreground">{item.saleQty} {item.saleUnit === "pack" ? "pack" : item.product.unitLabel ?? "unit"}</span>
                              <button type="button" onClick={() => { setEditingCartKey(key); setEditingCartQty(String(item.saleQty)); }} className="text-[10px] font-semibold text-primary">Edit</button>
                              <button type="button" onClick={() => {
                                setCart(prev => prev.filter(entry => !(entry.product.id === item.product.id && entry.saleUnit === item.saleUnit)));
                                if (editingCartKey === key) setEditingCartKey(null);
                              }} className="text-[10px] font-semibold text-red-500 hover:text-red-600">Remove</button>
                            </>
                          )}
                        </div>
                      </div>
                      {applyDiscount && (
                        <div className="space-y-0.5 text-[10px] text-orange-700 dark:text-orange-300 border-t border-border/60 pt-1.5">
                          <p>VAT removed: −{fmt(line.vatRemoved)}</p>
                          <p>SC/PWD discount (20%): −{fmt(line.discountAmount)}</p>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-1.5 text-[11px]">
                        <span className="text-muted-foreground">Line total</span>
                        <span className="font-bold text-foreground">{fmt(line.total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {fifoPreview.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                  <RefreshCw size={10} /> FIFO — Batches to be consumed
                </p>
                {fifoPreview.map(b => (
                  <div key={b.batchId} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{b.batchId} · Expiry: <span className="font-semibold text-foreground">{b.expiry ?? "No expiry"}</span></span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">{b.qty} units</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* SC/PWD Discount Panel — always visible */}
            <div className="border border-border rounded-xl px-4 py-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">SC / PWD Discount</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Removes VAT + 20% off for all products in this sale.</p>
                </div>
                <button type="button" onClick={() => { setApplyDiscount(v => !v); if (applyDiscount) setCustomerIdNumber(""); }}
                  className={`relative rounded-full transition-colors duration-200 flex-shrink-0 ${applyDiscount ? "bg-primary" : "bg-muted"}`}
                  style={{ width: 40, height: 22 }}>
                  <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${applyDiscount ? "translate-x-[18px]" : "translate-x-0"}`} />
                </button>
              </div>
              {applyDiscount && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-1">ID Type</label>
                    <select value={customerExemptionType} onChange={e => setCustomerExemptionType(e.target.value as CustomerExemptionType)}
                      className="app-select w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                      {CUSTOMER_EXEMPTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-1">ID Number <span className="text-red-500">*</span></label>
                    <input type="text" value={customerIdNumber} onChange={e => setCustomerIdNumber(e.target.value)}
                      placeholder="Enter ID number"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                  </div>
                  {customerExemptionMissing && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <_AlertTriangle size={11} /> ID number is required to apply the discount.
                    </p>
                  )}
                </div>
              )}
            </div>

            {selectedProduct && (
              <button type="button" onClick={addCurrentToCart} className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50" disabled={qtyNum <= 0 || !!expiryBlock}>
                Add to sale cart
              </button>
            )}

            {shelfTotal > 0 && taxBreakdown && (
              <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">
                  Price Breakdown — {applyDiscount ? "SC/PWD Discount Applied" : `${VAT_RATE_LABEL} VAT Inclusive`}
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{saleUnit === "pack" ? "Pack/Box Price" : "Unit Price"} × {qtyNum}</span>
                    <span className="tabular-nums text-foreground">{fmt(selectedPrice)} × {qtyNum}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pre-tax Amount</span>
                    <span className="tabular-nums text-foreground">{fmt(taxBreakdown.preTax)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT ({applyDiscount ? "Exempt" : VAT_RATE_LABEL})</span>
                    <span className={`tabular-nums font-semibold ${applyDiscount ? "text-muted-foreground/60" : "text-sky-600 dark:text-sky-400"}`}>
                      {fmt(taxBreakdown.tax)}
                    </span>
                  </div>
                  <div className="border-t border-sky-200 dark:border-sky-500/30 pt-1.5 flex justify-between font-bold">
                    <span className="text-foreground">Total</span>
                    <span className="tabular-nums text-primary text-base">{fmt(taxBreakdown.total)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit"
            disabled={!canConfirmSale}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
            Confirm Sale
          </button>
        </div>
      </form>
    </Modal>
    </>
  );
}

// ─── Return Modal ─────────────────────────────────────────────────────────────
export function ReturnModal({
  saleTx, onClose, onAdd, inventory, currentUser,
}: {
  saleTx: Transaction;
  onClose: () => void;
  onAdd: (t: Transaction, productId: string, qty: number) => Promise<void>;
  inventory: Product[];
  currentUser: import("./data").AuthUser;
}) {
  const saleItems = saleTx.cartItems?.length ? saleTx.cartItems : [saleTx];
  const [selectedSaleItemId, setSelectedSaleItemId] = useState(saleItems[0].id);
  const selectedSaleItem = saleItems.find(item => item.id === selectedSaleItemId) ?? saleItems[0];
  const product = inventory.find(p => String(p.id) === String(selectedSaleItem.productId)) ?? null;
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const qtyNum = parseInt(qty) || 0;
  const unitPrice = selectedSaleItem.qty > 0 ? selectedSaleItem.amount / selectedSaleItem.qty : product ? (product.salePrice ?? product.price) : 0;
  const refund = qtyNum * unitPrice;
  const maxQty = selectedSaleItem.qty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleItem.productId || qtyNum <= 0 || qtyNum > maxQty || !reason.trim() || submitting) return;
    // Show confirm before recording the refund
    setConfirmReturn(true);
  };

  const doSubmitReturn = async () => {
    setConfirmReturn(false);
    if (!selectedSaleItem.productId || qtyNum <= 0) return;
    const tx: Transaction = {
      id: `RET-${Date.now().toString().slice(-4)}`, type: "return", product: selectedSaleItem.product,
      qty: qtyNum, amount: refund, staff: staffAbbrev(currentUser.name), date: nowDateStr(),
      status: "completed", productId: selectedSaleItem.productId, note: reason, returnedTxId: selectedSaleItem.id,
    };
    setSubmitting(true);
    setSubmitError("");
    try {
      await onAdd(tx, selectedSaleItem.productId, qtyNum);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Return request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <Modal title="Process Return" onClose={onClose} wide hideCloseButton>
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitted ? (
          <div className="py-3 text-center">
            <CircleCheck size={52} className="mx-auto mb-4 text-emerald-500" />
            <h3 className="text-lg font-bold text-foreground">Return submitted successfully</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              The refund has been recorded. An inventory manager will inspect the product and decide whether it can be restocked or must be marked broken.
            </p>
            <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
              Done
            </button>
          </div>
        ) : (
          <>
        <div className="bg-muted/40 border border-border rounded-xl p-3 text-xs space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Returning from Sale</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Transaction</span><span className="font-semibold text-foreground">{saleTx.id}</span></div>
          {saleItems.length > 1 ? (
            <label className="block">
              <span className="mb-1 block text-muted-foreground">Product</span>
              <select value={selectedSaleItemId} onChange={e => { setSelectedSaleItemId(e.target.value); setQty("1"); }} className="app-select w-full rounded-lg border border-border bg-background px-2 py-1.5 text-foreground">
                {saleItems.map(item => <option key={item.id} value={item.id}>{item.product} · {item.qty} units</option>)}
              </select>
            </label>
          ) : <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-semibold text-foreground">{selectedSaleItem.product}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Max Returnable</span><span className="font-semibold text-foreground">{maxQty} units</span></div>
        </div>
        <FieldInput label="Quantity to Return" type="number" value={qty} onChange={setQty} placeholder="1" required min={1} />
        {qtyNum > maxQty && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} /> Cannot exceed sold quantity ({maxQty} units)</p>}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reason for Return <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain reason for return..." required rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" />
        </div>
        {refund > 0 && (
          <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Refund Amount</span>
            <span className="text-lg font-bold text-orange-600 dark:text-orange-400">{fmt(refund)}</span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">The refund is recorded now. An inventory manager will inspect the item and decide whether to restock it or mark it broken.</p>
        {submitError && <p role="alert" className="text-xs text-destructive">{submitError}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={submitting} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!selectedSaleItem.productId || qtyNum <= 0 || qtyNum > maxQty || !reason.trim() || submitting}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">{submitting ? "Submitting…" : "Submit Return & Refund"}</button>
        </div>
          </>
        )}
      </form>
    </Modal>
    {confirmReturn && (
      <ConfirmDialog
        title="Submit Return & Refund?"
        message={<>Record a refund of <span className="font-semibold text-foreground">{fmt(refund)}</span> for <span className="font-semibold text-foreground">{qtyNum} unit{qtyNum !== 1 ? "s" : ""}</span> of <span className="font-semibold text-foreground">{selectedSaleItem.product}</span>? This cannot be undone.</>}
        confirmLabel="Yes, Submit Return"
        variant="warning"
        onConfirm={() => void doSubmitReturn()}
        onCancel={() => setConfirmReturn(false)}
        forceModal
      />
    )}
    </>
  );
}

// ─── Inventory Adjustment Modal ───────────────────────────────────────────────
export function InventoryAdjustmentModal({
  onClose, onAdd, inventory, currentUser,
}: {
  onClose: () => void;
  onAdd: (tx: Transaction, productId: string, qty: number) => void;
  inventory: Product[];
  currentUser: import("./data").AuthUser;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [adjustType, setAdjustType] = useState<"damage" | "correction">("damage");
  const qtyNum = parseInt(qty) || 0;
  const maxQty = selectedProduct?.stock ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || qtyNum > maxQty || !reason.trim()) return;
    const tx: Transaction = {
      id: `ADJ-${Date.now().toString().slice(-4)}`, type: "adjustment", product: selectedProduct.name,
      qty: qtyNum, amount: 0, staff: staffAbbrev(currentUser.name), date: nowDateStr(), status: "completed",
      productId: selectedProduct.id, note: reason,
      adjustmentReason: adjustType === "damage" ? `Damaged — ${reason}` : `Stock Correction — ${reason}`,
      damagedQty: adjustType === "damage" ? qtyNum : 0,
    };
    onAdd(tx, selectedProduct.id, qtyNum);
    onClose();
  };

  return (
    <Modal title="Record Inventory Adjustment" onClose={onClose} wide hideCloseButton>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {(["damage", "correction"] as const).map(t => (
            <button key={t} type="button" onClick={() => setAdjustType(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${adjustType === t ? t === "damage" ? "bg-red-500 text-white border-red-500" : "bg-amber-500 text-white border-amber-500" : "bg-background border-border text-muted-foreground"}`}>
              {t === "damage" ? "🗑 Damaged Stock" : "✏ Stock Correction"}
            </button>
          ))}
        </div>
        <ProductSearchWidget inventory={inventory} onSelect={setSelectedProduct} selectedProduct={selectedProduct} />
        <FieldInput label="Quantity to Deduct" type="number" value={qty} onChange={setQty} placeholder="1" required min={1} />
        {selectedProduct && qtyNum > maxQty && (
          <p className="text-xs text-red-500 flex items-center gap-1"><_AlertTriangle size={11} /> Cannot exceed available stock ({maxQty} units)</p>
        )}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            {adjustType === "damage" ? "Damage Reason" : "Correction Reason"} <span className="text-red-500">*</span>
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={3}
            placeholder={adjustType === "damage" ? "e.g. Water damage, broken packaging..." : "e.g. Physical count discrepancy found..."}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" disabled={!selectedProduct || qtyNum <= 0 || qtyNum > maxQty || !reason.trim()}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 ${adjustType === "damage" ? "bg-red-500" : "bg-amber-500"}`}>
            Record Adjustment
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── User Form Modal ──────────────────────────────────────────────────────────
export function UserFormModal({
  initial, onClose, onSave, currentUserRole, roles = [],
}: {
  initial?: import("./data").StaffMember;
  onClose: () => void;
  onSave: (original: import("./data").StaffMember | null, updated: import("./data").StaffMember, password?: string) => void;
  currentUserRole?: string;
  roles?: import("./data").CustomRole[];
}) {
  const isEdit = !!initial;
  const [form, setForm] = React.useState({
    name:     initial?.name     ?? "",
    role:     initial?.role     ?? "",
    email:    initial?.email    ?? "",
    status:   initial?.status   ?? "" as string,
    password: "",
  });
  const [showPassword, setShowPassword] = React.useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  // Dynamically map all role labels (system + custom roles from database)
  const roleLabelsMap = React.useMemo(() => {
    const map: Record<string, string> = { ...ROLE_LABELS };
    if (roles && roles.length > 0) {
      roles.forEach(r => {
        map[r.id] = r.name;
      });
    }
    return map;
  }, [roles]);

  // Filter available roles based on current user's role and database roles
  const availableRoleIds = React.useMemo(() => {
    if (roles && roles.length > 0) {
      let list = roles.filter(r => r.id !== "admin/owner"); // Never allow creating admin/owner
      if (currentUserRole === "admin") {
        // Admin can create cashier, inventory_manager, and custom roles (not admin)
        list = list.filter(r => r.id !== "admin");
      }
      return list.map(r => r.id);
    }

    const allRoles = [...ROLES].filter(r => r !== "admin/owner");
    if (currentUserRole === "admin") {
      return allRoles.filter(r => r === "cashier" || r === "inventory_manager");
    }
    return allRoles;
  }, [roles, currentUserRole]);

  const selectedRoleObj = React.useMemo(() => {
    return roles.find(r => r.id === form.role);
  }, [roles, form.role]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && form.password.trim().length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    const updated: import("./data").StaffMember = {
      id:        initial?.id ?? `U${String(Date.now()).slice(-3)}`,
      name:      form.name.trim(),
      role:      form.role,
      email:     form.email.trim(),
      status:    form.status as import("./data").StaffMember["status"],
      lastLogin: initial?.lastLogin ?? "Never",
      initials:  initials(form.name),
    };
    onSave(initial ?? null, updated, isEdit ? undefined : form.password);
    onClose();
  };

  // ── Edit mode: only status is editable ──
  if (isEdit && initial) {
    return (
      <Modal title="Edit User" onClose={onClose} hideCloseButton>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Read-only info */}
          {[
            { label: "Full Name",     value: initial.name },
            { label: "Role",          value: roleLabelsMap[initial.role] ?? initial.role },
            { label: "Email Address", value: initial.email },
          ].map(({ label, value }) => (
            <div key={label}>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
              <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground/60 select-text">
                {value}
              </div>
            </div>
          ))}

          {/* Only editable field */}
          <FieldSelect
            label="Status"
            value={form.status}
            onChange={set("status")}
            options={["active", "inactive"]}
            required
            placeholder="Select status"
          />

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  // ── Add mode: full form ──
  return (
    <Modal title="Add New User" onClose={onClose} hideCloseButton>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldInput label="Full Name" value={form.name} onChange={set("name")} placeholder="e.g. Juan Dela Cruz" required />
        
        <div>
          <FieldSelect 
            label="Role" 
            value={form.role} 
            onChange={set("role")} 
            options={availableRoleIds} 
            required 
            roleLabels={roleLabelsMap} 
            placeholder="Select role" 
          />
          {selectedRoleObj && (
            <div className="mt-2 p-2.5 rounded-xl bg-muted/50 border border-border text-xs space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {selectedRoleObj.name}
                </span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  selectedRoleObj.isSystem 
                    ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                }`}>
                  {selectedRoleObj.isSystem ? "Built-in System Role" : "Custom Role"}
                </span>
              </div>
              {selectedRoleObj.description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">{selectedRoleObj.description}</p>
              )}
              {selectedRoleObj.permissions && selectedRoleObj.permissions.length > 0 && (
                <div className="pt-0.5 flex flex-wrap gap-1">
                  {selectedRoleObj.permissions.map(p => (
                    <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-background border border-border/80 font-medium text-foreground/80">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <FieldInput label="Email Address" type="email" value={form.email} onChange={set("email")} placeholder="user@tangub.ph" required />
        <FieldSelect label="Status" value={form.status} onChange={set("status")} options={["active", "inactive"]} required placeholder="Select status" />

        {/* Password */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-foreground">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={e => set("password")(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">The user will log in with this password.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
            Add User
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Password Field Component ─────────────────────────────────────────────────
const PwdField = ({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Min. 6 characters"
        required
        minLength={6}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      />
      <button type="button" tabIndex={-1} onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  </div>
);

// ─── User Info Modal (with inline password reset) ─────────────────────────────
export function UserInfoModal({
  user, onClose, onResetPassword, onUpdateProfile,
}: {
  user: import("./data").StaffMember;
  onClose: () => void;
  onResetPassword?: (newPassword: string) => Promise<void>;
  onUpdateProfile?: (name: string, email: string) => Promise<void>;
}) {
  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [editName, setEditName] = React.useState(user.name);
  const [editEmail, setEditEmail] = React.useState(user.email);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [profileError, setProfileError] = React.useState("");
  const [profileSuccess, setProfileSuccess] = React.useState(false);

  // Password reset state
  const [showPwdForm, setShowPwdForm] = React.useState(false);
  const [newPwd,      setNewPwd]      = React.useState("");
  const [confirmPwd,  setConfirmPwd]  = React.useState("");
  const [showNew,     setShowNew]     = React.useState(false);
  const [showConf,    setShowConf]    = React.useState(false);
  const [pwdLoading,  setPwdLoading]  = React.useState(false);
  const [pwdError,    setPwdError]    = React.useState("");
  const [pwdSuccess,  setPwdSuccess]  = React.useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    if (!editName.trim()) { setProfileError("Name cannot be empty."); return; }
    if (editName.length > 120) { setProfileError("Name must be 120 characters or less."); return; }
    if (!editEmail.trim()) { setProfileError("Email cannot be empty."); return; }
    
    setProfileLoading(true);
    try {
      await onUpdateProfile?.(editName.trim(), editEmail.trim());
      setProfileSuccess(true);
      setTimeout(() => { 
        setProfileSuccess(false); 
        setIsEditingProfile(false);
      }, 1500);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");
    if (newPwd.trim().length < 6) { setPwdError("Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd)    { setPwdError("Passwords do not match."); return; }
    setPwdLoading(true);
    try {
      await onResetPassword?.(newPwd);
      setPwdSuccess(true);
      setNewPwd(""); setConfirmPwd("");
      setTimeout(() => { setPwdSuccess(false); setShowPwdForm(false); }, 1500);
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <Modal title="My Profile" onClose={onClose}>
      <div className="space-y-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2 pb-3 border-b border-border">
          <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-xl font-bold text-primary">
            {user.initials}
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{user.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{user.id}</p>
          </div>
        </div>

        {/* Profile info - editable */}
        {!isEditingProfile ? (
          <div className="space-y-0.5">
            {[
              { label: "Role",  value: ROLE_LABELS[user.role] ?? user.role },
              { label: "Name",  value: user.name },
              { label: "Email", value: user.email },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                <span className="text-xs font-semibold text-foreground text-right max-w-[60%] truncate">{value}</span>
              </div>
            ))}
            {onUpdateProfile && (
              <button
                type="button"
                onClick={() => { setIsEditingProfile(true); setProfileError(""); setProfileSuccess(false); }}
                className="w-full mt-2 py-2 text-xs font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                Edit Profile
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-3">
            {profileSuccess && (
              <div className="text-emerald-600 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-3 py-2">
                ✓ Profile updated successfully.
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Your name"
                required
                maxLength={120}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <p className="text-[10px] text-muted-foreground">{editName.length}/120 characters</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {profileError && (
              <p className="text-xs text-red-500">{profileError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setIsEditingProfile(false); setEditName(user.name); setEditEmail(user.email); setProfileError(""); }}
                className="flex-1 py-2 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={profileLoading}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                {profileLoading ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}

        {/* Change Password section */}
        {onResetPassword && (
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => { setShowPwdForm(v => !v); setPwdError(""); setPwdSuccess(false); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Eye size={13} className="text-muted-foreground" />
                Change Password
              </span>
              <span className="text-muted-foreground text-[10px]">{showPwdForm ? "▲" : "▼"}</span>
            </button>

            {showPwdForm && (
              <form onSubmit={handlePasswordSubmit} className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50 bg-muted/20">
                {pwdSuccess && (
                  <div className="text-emerald-600 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-3 py-2">
                    ✓ Password updated successfully.
                  </div>
                )}
                <PwdField label="New Password"     value={newPwd}     onChange={setNewPwd}     show={showNew}  onToggle={() => setShowNew(v => !v)} />
                <PwdField label="Confirm Password" value={confirmPwd} onChange={setConfirmPwd} show={showConf} onToggle={() => setShowConf(v => !v)} />
                
                {/* Real-time password mismatch warning */}
                {confirmPwd && newPwd && newPwd !== confirmPwd && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} />
                    Passwords do not match
                  </div>
                )}
                
                {pwdError && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} />
                    {pwdError}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => { setShowPwdForm(false); setPwdError(""); }}
                    className="flex-1 py-2 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={pwdLoading}
                    className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                    {pwdLoading ? "Saving…" : "OK"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}


      </div>
    </Modal>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────
export function ResetPasswordModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (newPassword: string) => Promise<void>;
}) {
  const [newPwd,     setNewPwd]     = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [showNew,    setShowNew]    = React.useState(false);
  const [showConf,   setShowConf]   = React.useState(false);
  const [loading,    setLoading]    = React.useState(false);
  const [error,      setError]      = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPwd.trim().length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd)    { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await onSave(newPwd);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  const PwdField = ({ label, value, onChange, show, onToggle }: {
    label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
  }) => (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Min. 6 characters"
          required
          minLength={6}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
        <button type="button" tabIndex={-1} onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );

  return (
    <Modal title="Reset Password" onClose={onClose} hideCloseButton>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PwdField label="New Password"     value={newPwd}     onChange={setNewPwd}     show={showNew}  onToggle={() => setShowNew(v => !v)} />
        <PwdField label="Confirm Password" value={confirmPwd} onChange={setConfirmPwd} show={showConf} onToggle={() => setShowConf(v => !v)} />

        {error && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
            {loading ? "Saving…" : "OK"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Invoice Modal ────────────────────────────────────────────────────────────
export function InvoiceModal({ tx, settings, inventory, onClose }: {
  tx: Transaction;
  settings: ReceiptSettings | null;
  inventory: Product[];
  onClose: () => void;
}) {
  const typeHeader: Record<import("./data").TxType, string> = {
    sale: "OFFICIAL RECEIPT", return: "RETURN RECEIPT", adjustment: "INVENTORY ADJUSTMENT",
  };
  const header = typeHeader[tx.type];
  const P = "\u20b1";

  const receiptItems = tx.cartItems?.length ? tx.cartItems : [tx];
  const getReceiptQuantity = (item: Transaction) => {
    const product = inventory.find(candidate => candidate.id === item.productId);
    const quantity = item.saleQty ?? item.qty;
    const unitLabel = product?.unitLabel?.trim();
    const baseUnit = !unitLabel || unitLabel === "unit" || unitLabel === "piece"
      ? "pcs"
      : unitLabel;
    const getUnitText = (count: number) =>
      baseUnit === "pcs" || count === 1 || baseUnit.endsWith("s") ? baseUnit : `${baseUnit}s`;

    if (item.saleUnit === "pack") {
      const unitsPerPack = Math.max(1, item.unitsPerSale ?? product?.unitsPerPack ?? 1);
      return `${quantity} pack/box${unitsPerPack > 1 ? ` (${quantity * unitsPerPack} ${getUnitText(quantity * unitsPerPack)})` : ""}`;
    }
    return `${quantity} ${getUnitText(quantity)}`;
  };
  const lineBreakdowns = receiptItems.map(item => {
    const isExempt = (item.taxRate ?? (item.taxAmount ? 0.12 : 0)) === 0;
    const storedPreTax = item.preTaxAmount;
    const preTax = storedPreTax != null && (storedPreTax > 0 || item.amount === 0)
      ? storedPreTax
      : isExempt ? item.amount : Math.round(item.amount / 1.12 * 100) / 100;
    const storedTax = item.taxAmount;
    const tax = storedTax != null && (storedTax > 0 || item.amount === 0 || isExempt)
      ? storedTax
      : isExempt ? 0 : Math.round((item.amount - preTax) * 100) / 100;
    return { item, preTax, tax, isExempt };
  });
  const getReceiptLinePrices = (line: (typeof lineBreakdowns)[number]) => {
    const discountAmount = line.item.discountAmount ?? 0;
    const beforeDiscount = line.preTax + discountAmount;
    const vatRemoved = discountAmount > 0 ? roundCurrency(beforeDiscount * 0.12) : 0;
    const listedTotal = discountAmount > 0 ? roundCurrency(beforeDiscount + vatRemoved) : line.preTax;
    return { discountAmount, vatRemoved, listedTotal };
  };
  const vatableSales = lineBreakdowns.reduce((sum, line) => sum + (line.isExempt ? 0 : line.preTax), 0);
  const discountedSales = lineBreakdowns.reduce((sum, line) => sum + (line.isExempt ? line.preTax : 0), 0);
  const taxAmt = lineBreakdowns.reduce((sum, line) => sum + line.tax, 0);
  const vatLabel = taxAmt > 0 ? "VAT (12%)" : "VAT (0.00)";
  // SC/PWD discount text shown on receipt
  // Build SC/PWD discount info — prefer dedicated DB columns, fall back to parsing the note
  const exemptionType = tx.customerVatExempt
    ? (tx.customerExemptionType ?? "Qualified ID")
    : tx.type === "sale" && (tx.note?.startsWith("Customer VAT exemption: ") || tx.note?.startsWith("Customer discount: "))
      ? tx.note.replace(/^Customer (?:VAT exemption|discount): /, "").replace(/ ID .+$/, "")
      : "";
  const exemptionIdNumber = tx.customerVatExempt
    ? (tx.customerIdNumber ?? "")
    : tx.type === "sale" && (tx.note?.startsWith("Customer VAT exemption: ") || tx.note?.startsWith("Customer discount: "))
      ? tx.note.replace(/^Customer (?:VAT exemption|discount): .+ ID /, "")
      : "";
  const hasDiscount = !!(exemptionType || exemptionIdNumber);
  const customerDiscountText = hasDiscount
    ? `${exemptionType}${exemptionType && exemptionIdNumber ? " · ID No. " : ""}${exemptionIdNumber}`.trim()
    : "";
  const customerExemptionText = customerDiscountText;
  const escapeReceiptHtml = (value: string) =>
    value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
  const businessName = settings?.businessName.trim() ?? "";
  const businessAddress = settings?.businessAddress.trim() ?? "";
  const businessPhone = settings?.businessPhone.trim() ?? "";
  const businessTin = settings?.businessTin.trim() ?? "";
  const receiptNumber = settings?.orPrefix ? `${settings.orPrefix}${tx.id}` : tx.id;
  // HTML block for printed receipt — exemption type and ID number on separate lines
  const customerExemptionHtml = hasDiscount
    ? `<div class="bold">SC/PWD Discount:</div>` +
      (exemptionType     ? `<div style="word-break:break-word">${escapeReceiptHtml(exemptionType)}</div>` : "") +
      (exemptionIdNumber ? `<div style="word-break:break-word">ID No. ${escapeReceiptHtml(exemptionIdNumber)}</div>` : "") +
      `<div class="dashes"></div>`
    : "";

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=420,height=680");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${tx.id}</title>
    <style>
      @page{size:80mm auto;margin:0;}
      body{margin:0;padding:4mm;background:#fff;font-family:'Courier New',monospace;font-size:12px;color:#000;}
      .receipt{width:72mm;margin:0 auto;}
      .center{text-align:center;} .bold{font-weight:bold;} .right{text-align:right;}
      .dashes{border-top:1px dashed #000;margin:6px 0;}
      .row{display:flex;justify-content:space-between;gap:6px;margin:2px 0;}
      .item-name{font-weight:bold;overflow-wrap:anywhere;}
      .small{font-size:10px;}
      @media print{body{margin:0;padding:0;}.receipt{width:72mm;}}
    </style></head><body>
    <div class="receipt">
      ${businessName ? `<div class="center bold" style="font-size:14px;">${escapeReceiptHtml(businessName)}</div>` : ""}
      ${businessAddress ? `<div class="center small">${escapeReceiptHtml(businessAddress)}</div>` : ""}
      ${businessPhone ? `<div class="center small">Tel: ${escapeReceiptHtml(businessPhone)}</div>` : ""}
      ${businessTin ? `<div class="center small">TIN: ${escapeReceiptHtml(businessTin)}</div>` : ""}
      <div class="dashes"></div>
      <div class="center bold">${header}</div>
      <div class="dashes"></div>
      <div class="row"><span>OR No.:</span><span>${escapeReceiptHtml(receiptNumber)}</span></div>
      <div class="row"><span>Date:</span><span>${tx.date}</span></div>
      <div class="row"><span>Cashier:</span><span>${tx.staff}</span></div>
      <div class="dashes"></div>
      <div class="row bold"><span>ITEM</span><span>AMT</span></div>
      <div class="dashes"></div>
      ${lineBreakdowns.map(({ item, preTax: linePreTax }) => {
        const quantity = item.saleQty ?? item.qty;
        const prices = getReceiptLinePrices({ item, preTax: linePreTax, tax: 0, isExempt: (item.taxRate ?? 0) === 0 });
        const unitPrice = quantity > 0 ? prices.listedTotal / quantity : 0;
        const lineHtml = `<div class="item-name">${escapeReceiptHtml(item.product)}</div><div class="row"><span>${escapeReceiptHtml(getReceiptQuantity(item))} × ${P}${unitPrice.toFixed(2)}</span><span>${P}${prices.listedTotal.toFixed(2)}</span></div>`;
        const discountHtml = prices.discountAmount
          ? `<div class="row small"><span>VAT removed</span><span>-${P}${prices.vatRemoved.toFixed(2)}</span></div><div class="row small"><span>Customer ID discount (20%)</span><span>-${P}${prices.discountAmount.toFixed(2)}</span></div>`
          : "";
        return lineHtml + discountHtml;
      }).join("")}
      <div class="dashes"></div>
      <div class="row"><span>Vatable Sales</span><span>${P}${vatableSales.toFixed(2)}</span></div>
      <div class="row"><span>SC/PWD Discounted</span><span>${P}${discountedSales.toFixed(2)}</span></div>
      <div class="row"><span>Zero-Rated Sales</span><span>${P}0.00</span></div>
      <div class="row"><span>${vatLabel}</span><span>${P}${taxAmt.toFixed(2)}</span></div>
      <div class="dashes"></div>
      <div class="row bold"><span>${tx.type === "return" ? "TOTAL REFUND" : "TOTAL AMOUNT DUE"}</span><span>${P}${tx.amount.toFixed(2)}</span></div>
      <div class="dashes"></div>
      ${customerExemptionHtml}
      ${tx.type === "return" && tx.note ? `<div class="bold">Return Reason:</div><div style="word-break:break-word">${tx.note}</div><div class="dashes"></div>` : ""}
      <div class="center small" style="margin-top:4px">This serves as your Official Receipt</div>
      <div class="center small">Thank you for your patronage!</div>
    </div></body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:items-center sm:pt-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-foreground">Official Receipt</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
              Print
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><_X size={16} /></button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex justify-center">
          {/* On-screen receipt preview */}
          <div style={{ width: 272, fontFamily: "'Courier New', monospace", fontSize: 12, background: "#fff", color: "#000", padding: "12px 8px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            {businessName && <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 14 }}>{businessName}</div>}
            {businessAddress && <div style={{ textAlign: "center", fontSize: 10 }}>{businessAddress}</div>}
            {(businessPhone || businessTin) && <div style={{ textAlign: "center", fontSize: 10 }}>{businessPhone && `Tel: ${businessPhone}`}{businessPhone && businessTin ? " · " : ""}{businessTin && `TIN: ${businessTin}`}</div>}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ textAlign: "center", fontWeight: "bold" }}>{header}</div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {[
              ["OR No.:", receiptNumber],
              ["Date:", tx.date],
              ["Cashier:", tx.staff],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginBottom: 4 }}>
              <span>ITEM</span><span>AMT</span>
            </div>
            {lineBreakdowns.map(({ item, preTax: linePreTax }) => {
              const quantity = item.saleQty ?? item.qty;
              const prices = getReceiptLinePrices({ item, preTax: linePreTax, tax: 0, isExempt: (item.taxRate ?? 0) === 0 });
              const unitPrice = quantity > 0 ? prices.listedTotal / quantity : 0;
              return <React.Fragment key={item.id}>
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontWeight: "bold", overflowWrap: "anywhere" }}>{item.product}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{getReceiptQuantity(item)} × {P}{unitPrice.toFixed(2)}</span>
                    <span>{P}{prices.listedTotal.toFixed(2)}</span>
                  </div>
                </div>
                {!!prices.discountAmount && <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2, fontSize: 10, color: "#c2410c" }}><span>VAT removed</span><span>-{P}{prices.vatRemoved.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3, fontSize: 10, color: "#c2410c" }}><span>Customer ID discount (20%)</span><span>-{P}{prices.discountAmount.toFixed(2)}</span></div>
                </>}
              </React.Fragment>;
            })}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {/* BIR-required VAT breakdown lines */}
            {[
              ["Vatable Sales",      vatableSales.toFixed(2)],
              ["SC/PWD Discounted",  discountedSales.toFixed(2)],
              ["Zero-Rated Sales",   "0.00"],
              [vatLabel,             taxAmt.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 11 }}>
                <span>{k}</span><span>{P}{v}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>{tx.type === "return" ? "TOTAL REFUND" : "TOTAL AMOUNT DUE"}</span>
              <span>{P}{tx.amount.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {customerExemptionText && (
              <>
                <div style={{ fontWeight: "bold" }}>SC/PWD Discount:</div>
                {exemptionType     && <div style={{ wordBreak: "break-word", marginBottom: 2 }}>{exemptionType}</div>}
                {exemptionIdNumber && <div style={{ wordBreak: "break-word", marginBottom: 4 }}>ID No. {exemptionIdNumber}</div>}
                <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
              </>
            )}
            {tx.type === "return" && tx.note && (
              <><div style={{ fontWeight: "bold" }}>Return Reason:</div><div style={{ wordBreak: "break-word", marginBottom: 4 }}>{tx.note}</div></>
            )}
            <div style={{ textAlign: "center", fontSize: 10, marginTop: 4 }}>This serves as your Official Receipt</div>
            <div style={{ textAlign: "center", fontSize: 10 }}>Thank you for your patronage!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product Search Widget ────────────────────────────────────────────────────
export function ProductSearchWidget({
  inventory, onSelect, selectedProduct,
}: {
  inventory: Product[];
  onSelect: (p: Product | null) => void;
  selectedProduct: Product | null;
}) {
  const [mode, setMode] = useState<"name" | "barcode">("barcode");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!selectedProduct) {
      setQuery("");
      setOpen(false);
      inputRef.current?.focus();
    }
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return inventory.filter(p =>
      mode === "name"
        ? p.name.toLowerCase().includes(q)
        : (p.barcode ?? "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, mode, inventory]);

  const selectProduct = (p: Product) => {
    onSelect(p);
    setQuery(mode === "name" ? p.name : "");
    setOpen(false);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (!value) {
      onSelect(null);
      return;
    }
    if (mode === "barcode") {
      const match = inventory.find(product => product.barcode === value.trim());
      if (match) selectProduct(match);
    }
  };

  const handleQueryKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation(); // never let Enter from the barcode input reach the form
    if (mode !== "barcode") return;
    const match = inventory.find(product => product.barcode === query.trim());
    if (match) selectProduct(match);
  };

  const clear = () => { onSelect(null); setQuery(""); setOpen(false); };

  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Product</label>
      <div className="flex gap-1 mb-2">
        {(["barcode", "name"] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setQuery(""); onSelect(null); }}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
            {m === "barcode" ? "Scan Barcode" : "By Name"}
          </button>
        ))}
      </div>
      <div className="relative">
        <input ref={inputRef} type="text" value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onKeyDown={handleQueryKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={mode === "name" ? "Search by product name" : "Scan or enter barcode"}
          autoFocus={mode === "barcode"}
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all pr-8"
        />
        {query && <button type="button" onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><_X size={13} /></button>}
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {filtered.map(p => {
              const expBlock = getExpiryStatus(p);
              const outOfStock = p.stock <= 0;
              return (
              <button key={p.id} type="button" onClick={() => selectProduct(p)}
                className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/40 last:border-b-0 ${expBlock || outOfStock ? "opacity-70" : ""}`}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0">
                      {p.barcode && <p className="text-[10px] font-semibold text-primary">{p.barcode}</p>}
                      <p className="text-xs font-bold text-foreground">{p.name}</p>
                    </div>
                    {outOfStock && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-500/20 dark:text-red-300">OUT OF STOCK</span>}
                    {expBlock && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${expBlock.daysLeft <= 0 ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"}`}>
                        {expBlock.daysLeft <= 0 ? "EXPIRED" : `${expBlock.daysLeft}d left`}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">ID {p.id} &middot; {p.stock} in stock</p>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {outOfStock || expBlock ? (
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400">Cannot sell</span>
                  ) : p.salePrice != null ? (
                    <div><span className="text-[10px] text-muted-foreground line-through">{fmt(p.price)}</span><span className="text-xs font-bold text-primary ml-1">{fmt(p.salePrice)}</span></div>
                  ) : <span className="text-xs font-bold text-foreground">{fmt(p.price)}</span>}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
      {selectedProduct && (
        <div className="mt-2 bg-muted/40 border border-border rounded-xl p-3 text-xs space-y-1">
          {selectedProduct.barcode && <div className="flex justify-between"><span className="text-muted-foreground">Barcode</span><span className="font-semibold text-foreground">{selectedProduct.barcode}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-semibold text-foreground">{selectedProduct.name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="font-semibold text-foreground">{selectedProduct.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Unit Price</span>
            <span className="font-semibold">
              {selectedProduct.salePrice != null ? (
                <><span className="line-through text-muted-foreground mr-1">{fmt(selectedProduct.price)}</span><span className="text-primary">{fmt(selectedProduct.salePrice)}</span></>
              ) : <span className="text-foreground">{fmt(selectedProduct.price)}</span>}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="font-semibold text-foreground">{selectedProduct.stock} units</span></div>
        </div>
      )}
    </div>
  );
}
