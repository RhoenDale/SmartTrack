import { memo, startTransition, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, BarChart2, Users,
  Bell, Search, Shield,
  Moon, Sun, Settings, BellRing, ClipboardList, Landmark,
  X, RefreshCw, ClipboardCheck, Truck,
  ChevronDown, ChevronLeft, ChevronRight, Menu, Activity, Trash2, AlertTriangle, Bot, Info, Maximize2,
  Database, Plus, Check, PanelLeft, Type, Rows3, Sparkles, Palette, LogIn,
} from "lucide-react";
import {
  FONT_SCALE_OPTIONS,
  TABLE_DENSITY_OPTIONS,
  readFontScale,
  saveFontScale,
  readTableDensity,
  saveTableDensity,
  readReduceMotionPreference,
  saveReduceMotionPreference,
  readMutedColors,
  saveMutedColors,
  readShowAlertOrb,
  saveShowAlertOrb,
  applyUiStyle,
  applyDisplayPreferences,
  type FontScale,
  type TableDensity,
  type ReduceMotionPreference,
} from "./preferences";
import {
  sortBatchesByExpiry, normalizeProduct, groupCartTransactions,
  hasUserRole, ROLE_LABELS,
  type AuthUser, type Notification, type Page,
  type Product, type StaffMember, type Transaction, type CustomRole,
} from "./data";
import {
  Modal, DeleteConfirmModal, ConfirmDialog, useIslandConfirm,
  NotificationPanel, ProductFormModal, NewSaleModal, ReturnModal,
  InventoryAdjustmentModal, UserFormModal, InvoiceModal, UserInfoModal, ResetPasswordModal,
  initials, InfoTip, YouTubeTopLoader, YouTubeAppSkeleton, fmt,
  type SaleDraftState,
} from "./shared";
import {
  productsApi, categoriesApi, transactionsApi, returnRequestsApi, dashboardApi,
  usersApi, notificationsApi, receiptSettingsApi, rolesApi, activeRoleStore, clearApiCache,
  type CashierDashboardSummary,
  type ReceiptSettings,
} from "./api";
import DashboardView  from "./dashboard";
import InventoryPage  from "./inventory";
import TransactionsPage from "./transactions";
import AnalyticsPage  from "./analytics";
import StockAlertsPage from "./stockalerts";
import ReportsPage    from "./reports";
import ReturnsPage    from "./returns";
import UsersPage, { ActivityLogPanel, RecycleBinPanel } from "./users";
import FinancialPage  from "./financial";
import PurchaseOrdersPage from "./purchases";
import CommandAssistant from "./command-assistant";
import { DatabaseBackupModal } from "./database-backup-modal";

const SMARTTRACK_LOGO_URL = `${import.meta.env.BASE_URL}smarttrack-mark.png`;

const TRACKHUB_TILE_STYLE = {
  box: "bg-blue-500/12 border-blue-400/22 group-hover:bg-blue-500/20 group-hover:border-blue-400/35",
  activeBox: "bg-blue-500/25 border-blue-400/45 shadow-[0_0_12px_rgba(59,130,246,0.28)]",
  icon: "text-blue-400 group-hover:text-blue-300",
} as const;

const SETTINGS_ROW_ICON_BASE =
  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border";

const SETTINGS_ICON_TONES = {
  amber: "border-amber-500/15 bg-amber-500/10 text-amber-600 dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-400",
  blue: "border-blue-500/15 bg-blue-500/10 text-blue-600 dark:border-blue-400/20 dark:bg-blue-400/12 dark:text-blue-400",
  indigo: "border-indigo-500/15 bg-indigo-500/10 text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-400/12 dark:text-indigo-400",
  violet: "border-violet-500/15 bg-violet-500/10 text-violet-600 dark:border-violet-400/20 dark:bg-violet-400/12 dark:text-violet-400",
  slate: "border-slate-500/15 bg-slate-500/10 text-slate-600 dark:border-slate-400/20 dark:bg-slate-400/12 dark:text-slate-300",
  rose: "border-rose-500/15 bg-rose-500/10 text-rose-600 dark:border-rose-400/20 dark:bg-rose-400/12 dark:text-rose-400",
  emerald: "border-emerald-500/15 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-400",
} as const;

const settingsIconClass = (tone: keyof typeof SETTINGS_ICON_TONES) =>
  `${SETTINGS_ROW_ICON_BASE} ${SETTINGS_ICON_TONES[tone]}`;

function SettingsSwitch({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full shadow-inner transition-colors duration-200 ease-out active:scale-[0.98] motion-reduce:transition-none ${
        checked ? "bg-primary shadow-[0_0_10px_rgba(59,130,246,0.22)]" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

const TrackHubMiniaturePreview = memo(function TrackHubMiniaturePreview({ userInitials }: { userInitials: string }) {
  return (
    <div
      className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-sky-200/80 dark:border-sky-400/20 shadow-xs pointer-events-none select-none"
      style={{
        backgroundImage:
          "radial-gradient(at 15% 10%, rgba(147,197,253,0.45) 0px, transparent 55%), radial-gradient(at 88% 14%, rgba(165,243,252,0.4) 0px, transparent 52%), radial-gradient(at 50% 95%, rgba(199,210,254,0.35) 0px, transparent 58%), linear-gradient(180deg, #edf4fc 0%, #e4edf8 100%)",
      }}
    >
      <div className="hidden dark:block absolute inset-0" style={{
        backgroundImage:
          "radial-gradient(at 15% 10%, rgba(56,189,248,0.22) 0px, transparent 55%), radial-gradient(at 88% 14%, rgba(99,102,241,0.22) 0px, transparent 52%), linear-gradient(180deg, #070f1f 0%, #050a14 100%)",
      }} />
      {/* Frosted Modern Topbar */}
      <div className="relative h-8 border-b border-white/75 dark:border-white/12 bg-white/65 dark:bg-slate-900/65 px-2 flex items-center justify-between" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)" }}>
        <div className="flex items-center gap-1 min-w-0">
          <img src={SMARTTRACK_LOGO_URL} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-blue-500/45 bg-white/80 dark:bg-slate-900/80">
            <Search size={6.5} className="text-blue-500" />
          </span>
        </div>

        {/* Centered Obsidian TrackHub Pill + Separated Store Monitor Orb */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <div
            className="flex items-center gap-1 rounded-full bg-black/90 border border-white/25 px-1.5 py-0.5 shadow-md"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), 0 3px 10px rgba(0,0,0,0.3)" }}
          >
            <span className="flex items-center gap-0.5 rounded-full bg-white/[0.12] px-1 py-0.5 text-[6px] font-semibold text-white/90">
              <Bot size={7} className="text-blue-300" />
              <span>Assistant</span>
            </span>
            <span className="h-2.5 w-px bg-white/15" />
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-blue-500/20 border border-blue-400/35">
              <LayoutDashboard size={7} className="text-blue-400" />
            </span>
            <span className="text-[6.5px] font-semibold text-white leading-none pr-0.5">Dashboard</span>
            <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-white/10 text-white/60">
              <ChevronDown size={6} />
            </span>
          </div>

          {/* Detached Store Stock Monitor Orb */}
          <div
            className="flex items-center gap-0.5 rounded-full bg-black/90 border border-white/25 px-1.5 py-1 shadow-md"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), 0 3px 8px rgba(0,0,0,0.25)" }}
          >
            <AlertTriangle size={6.5} className="text-rose-400" />
            <span className="text-[6px] font-bold text-rose-300 leading-none">Stock · 4</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-white/70 dark:bg-slate-800/80 flex items-center justify-center">
            <Bell size={6} className="text-slate-500" />
          </span>
          <span className="w-3.5 h-3.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[5.5px] font-bold">
            {userInitials}
          </span>
        </div>
      </div>

      {/* Full-Width Frosted Glass Workspace Canvas Below */}
      <div className="relative p-2.5 space-y-2 h-[calc(100%-2rem)] flex flex-col">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-2 w-20 rounded bg-slate-800/80 dark:bg-slate-200/80" />
            <div className="h-1 w-28 rounded bg-slate-400/60 dark:bg-slate-600" />
          </div>
          <div className="h-3 w-12 rounded-full bg-blue-600/90 shadow-xs" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { accent: "bg-blue-500", w: "w-10" },
            { accent: "bg-emerald-500", w: "w-12" },
            { accent: "bg-amber-500", w: "w-9" },
          ].map((c, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/80 dark:border-white/15 bg-white/70 dark:bg-slate-900/60 p-1.5 space-y-1 shadow-xs"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)" }}
            >
              <div className="flex items-center justify-between">
                <div className="h-1 w-8 rounded bg-slate-400/60 dark:bg-slate-600" />
                <span className={`w-1.5 h-1.5 rounded-full ${c.accent}`} />
              </div>
              <div className={`h-2 ${c.w} rounded bg-slate-800/75 dark:bg-slate-200/80`} />
              <div className="h-1 w-11 rounded bg-slate-300/70 dark:bg-slate-700" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1.5fr_1fr] gap-1.5 flex-1 min-h-0">
          <div
            className="rounded-xl border border-white/80 dark:border-white/15 bg-white/70 dark:bg-slate-900/60 p-1.5 flex flex-col justify-between shadow-xs"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)" }}
          >
            <div className="h-1.5 w-16 rounded bg-slate-400/60" />
            <svg viewBox="0 0 120 32" className="w-full h-7 overflow-visible">
              <path d="M2,24 C20,22 36,12 56,14 C72,16 82,22 92,20" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
              <path d="M92,20 C102,17 110,12 118,11" fill="none" stroke="#0d9488" strokeWidth="1.8" strokeDasharray="3 2.5" strokeLinecap="round" />
            </svg>
          </div>
          <div
            className="rounded-xl border border-white/80 dark:border-white/15 bg-white/70 dark:bg-slate-900/60 p-1.5 flex flex-col justify-center gap-1.5 shadow-xs"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)" }}
          >
            <div className="h-1.5 w-full rounded-full bg-teal-500/80" />
            <div className="h-1.5 w-4/5 rounded-full bg-cyan-500/80" />
            <div className="h-1.5 w-3/5 rounded-full bg-violet-500/80" />
          </div>
        </div>
      </div>
    </div>
  );
});

const ClassicBarMiniaturePreview = memo(function ClassicBarMiniaturePreview({
  userInitials,
  roleLabel,
}: {
  userInitials: string;
  roleLabel: string;
}) {
  return (
    <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-border/80 bg-[#f2f4f7] dark:bg-[#090e18] shadow-xs flex pointer-events-none select-none">
      {/* Grouped Easy Sidebar */}
      <div
        className="w-[33%] h-full flex flex-col justify-between p-1.5 border-r border-white/[0.08]"
        style={{ background: "linear-gradient(180deg, #0b1528 0%, #060b14 100%)" }}
      >
        <div>
          <div className="flex items-center gap-1 pb-1.5 border-b border-white/[0.08]">
            <img src={SMARTTRACK_LOGO_URL} alt="" className="w-3 h-3 object-contain flex-shrink-0" />
            <span className="text-[7px] font-bold text-white truncate">SmartTrack</span>
          </div>
          <div className="mt-1 flex items-center gap-1 rounded bg-blue-500/15 border border-white/[0.06] px-1.5 py-0.5">
            <Shield size={6} className="text-blue-300 flex-shrink-0" />
            <span className="text-[5.5px] font-bold text-blue-200 truncate">{roleLabel}</span>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <p className="px-1 text-[4.5px] font-bold uppercase tracking-wider text-white/35">Daily Work</p>
            <div className="flex items-center gap-1 rounded-md bg-blue-600/25 border border-blue-400/35 px-1.5 py-0.5">
              <LayoutDashboard size={6} className="text-blue-200" />
              <span className="text-[5.8px] font-bold text-blue-200">Dashboard</span>
            </div>
            <div className="flex items-center justify-between px-1.5 py-0.5 text-white/60">
              <span className="flex items-center gap-1"><Package size={6} /><span className="text-[5.8px]">Inventory</span></span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            </div>
            <p className="px-1 pt-0.5 text-[4.5px] font-bold uppercase tracking-wider text-white/35">Orders</p>
            <div className="flex items-center gap-1 px-1.5 py-0.5 text-white/60">
              <BarChart2 size={6} /><span className="text-[5.8px]">Analytics</span>
            </div>
          </div>
        </div>

        <div className="pt-1 border-t border-white/[0.08]">
          <div className="flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-[5.5px] font-medium text-white/75 truncate">Active Station</span>
          </div>
        </div>
      </div>

      {/* Right Content Panel — Clean Solid Matte iOS 18 Cards + Labeled Topbar */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-7 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-2 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 w-20">
            <Search size={6} className="text-blue-500" />
            <span className="text-[5.5px] text-slate-400">Search…</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[5px] font-semibold text-slate-600 dark:text-slate-300">
              Alerts
            </span>
            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[5px] font-semibold text-slate-600 dark:text-slate-300">
              Settings
            </span>
            <span className="w-3.5 h-3.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[5.5px] font-bold">
              {userInitials}
            </span>
          </div>
        </div>

        <div className="p-2 space-y-1.5 flex-1 flex flex-col">
          <div className="space-y-1">
            <div className="h-1.5 w-16 rounded bg-slate-800/80 dark:bg-slate-200/80" />
            <div className="h-1 w-24 rounded bg-slate-300 dark:bg-slate-700" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { accent: "bg-blue-500" },
              { accent: "bg-emerald-500" },
              { accent: "bg-amber-500" },
            ].map((c, idx) => (
              <div key={idx} className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-1 space-y-1">
                <div className="flex justify-between items-center">
                  <div className="h-1 w-6 rounded bg-slate-300 dark:bg-slate-700" />
                  <span className={`w-1.5 h-1.5 rounded-full ${c.accent}`} />
                </div>
                <div className="h-1.5 w-7 rounded bg-slate-800/75 dark:bg-slate-200/80" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.35fr_1fr] gap-1 flex-1 min-h-0">
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-1 flex flex-col justify-between">
              <div className="h-1 w-10 rounded bg-slate-400/60" />
              <svg viewBox="0 0 100 28" className="w-full h-6 overflow-visible">
                <path d="M2,21 C18,19 32,10 48,12 C62,14 70,19 80,17" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
                <path d="M80,17 C88,14 93,10 98,9" fill="none" stroke="#0d9488" strokeWidth="1.8" strokeDasharray="3 2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-1 flex flex-col justify-center gap-1">
              <div className="h-1 w-full rounded-full bg-teal-500/80" />
              <div className="h-1 w-4/5 rounded-full bg-cyan-500/80" />
              <div className="h-1 w-3/5 rounded-full bg-violet-500/80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

function NavigationStyleChoiceModal({
  open,
  user,
  currentMode,
  askOnLogin,
  onToggleAskOnLogin,
  onPrepareTrackHub,
  onConfirm,
  onClose,
}: {
  open: boolean;
  user: AuthUser;
  currentMode: "island" | "sidebar";
  askOnLogin: boolean;
  onToggleAskOnLogin: (next: boolean) => void;
  onPrepareTrackHub?: () => void;
  onConfirm: (mode: "island" | "sidebar") => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<"island" | "sidebar">(currentMode);
  const cardRef = useRef<HTMLDivElement>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [morphShell, setMorphShell] = useState<{
    startTop: number;
    startCenterX: number;
    startWidth: number;
    startHeight: number;
    dx: number;
    dy: number;
    targetWidth: number;
    active: boolean;
    fading: boolean;
  } | null>(null);
  const [sidebarExitActive, setSidebarExitActive] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(currentMode);
      setMorphShell(null);
      setSidebarExitActive(false);
    }
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open, currentMode]);

  const isExiting = morphShell !== null || sidebarExitActive;

  const triggerConfirm = useCallback((mode: "island" | "sidebar") => {
    if (isExiting) return;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      onConfirm(mode);
      return;
    }

    if (mode === "island") {
      const rect = cardRef.current?.getBoundingClientRect();
      onPrepareTrackHub?.();
      const startTop = rect ? rect.top : Math.max(80, window.innerHeight / 2 - 260);
      const startCenterX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const startWidth = rect ? rect.width : Math.min(790, window.innerWidth - 32);
      const startHeight = rect ? rect.height : 520;

      // Wait 1 frame so TrackHub mounts at top-center, then glide the morph shell cleanly into a 42px stadium pill
      window.requestAnimationFrame(() => {
        const hubEl = document.querySelector("[data-trackhub-target]") as HTMLElement | null;
        const hubRect = hubEl?.getBoundingClientRect();
        const targetTop = hubRect ? hubRect.top : 7;
        const targetCenterX = hubRect ? hubRect.left + hubRect.width / 2 : window.innerWidth / 2;
        const targetWidth = hubRect ? Math.round(hubRect.width) : 280;

        setMorphShell({
          startTop,
          startCenterX,
          startWidth,
          startHeight,
          dx: targetCenterX - startCenterX,
          dy: targetTop - startTop,
          targetWidth,
          active: false,
          fading: false,
        });

        window.requestAnimationFrame(() => {
          setMorphShell(prev => (prev ? { ...prev, active: true } : prev));
        });

        exitTimerRef.current = setTimeout(() => {
          setMorphShell(prev => (prev ? { ...prev, fading: true } : prev));
          exitTimerRef.current = setTimeout(() => onConfirm("island"), 95);
        }, 430);
      });
    } else {
      setSidebarExitActive(true);
      exitTimerRef.current = setTimeout(() => onConfirm("sidebar"), 200);
    }
  }, [isExiting, onConfirm, onPrepareTrackHub]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (isExiting) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setSelected(e.key === "ArrowLeft" ? "island" : "sidebar");
      } else if (e.key === "Enter") {
        e.preventDefault();
        triggerConfirm(selected);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, selected, isExiting, triggerConfirm, onClose]);

  if (!open) return null;

  const firstName = user.name.split(" ")[0];
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-3 sm:p-5 bg-slate-950/50 dark:bg-black/70"
      style={{
        opacity: morphShell?.active || sidebarExitActive ? 0 : 1,
        transition: morphShell?.active ? "opacity 280ms ease" : sidebarExitActive ? "opacity 180ms ease" : "opacity 180ms ease",
        pointerEvents: isExiting ? "none" : "auto",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-style-picker-title"
    >
      {/* Isolated childless Pill Morph Shell (gradually narrows & rounds into TrackHub's exact 42px obsidian pill) */}
      {morphShell && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none"
          style={{
            zIndex: 10003,
            contain: "strict",
            backfaceVisibility: "hidden",
            top: `${morphShell.startTop}px`,
            left: `${morphShell.startCenterX}px`,
            width: `${morphShell.active ? morphShell.targetWidth : morphShell.startWidth}px`,
            height: `${morphShell.active ? 42 : morphShell.startHeight}px`,
            borderRadius: morphShell.active ? "21px" : "28px",
            backgroundColor: morphShell.active ? "#000000" : "var(--card, #ffffff)",
            border: morphShell.active
              ? "1px solid rgba(255, 255, 255, 0.28)"
              : "1px solid rgba(148, 163, 184, 0.3)",
            boxShadow: morphShell.active
              ? "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.38), 0 10px 28px rgba(0, 0, 0, 0.36)"
              : "0 20px 50px rgba(15, 23, 42, 0.25)",
            transform: morphShell.active
              ? `translate3d(calc(-50% + ${morphShell.dx}px), ${morphShell.dy}px, 0)`
              : "translate3d(-50%, 0, 0)",
            opacity: morphShell.fading ? 0 : 1,
            transition: [
              "transform 430ms cubic-bezier(0.22, 1, 0.36, 1)",
              "width 390ms cubic-bezier(0.2, 1, 0.34, 1)",
              "height 420ms cubic-bezier(0.22, 1, 0.36, 1)",
              "border-radius 360ms cubic-bezier(0.22, 1, 0.36, 1)",
              "background-color 260ms 30ms ease",
              "border-color 260ms ease",
              "box-shadow 320ms ease",
              "opacity 95ms ease",
            ].join(", "),
          }}
        />
      )}

      <div
        ref={cardRef}
        data-st-modal-panel="true"
        className="relative w-full max-w-[720px] overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-[0_24px_64px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_72px_rgba(0,0,0,0.8)]"
        style={{
          transform: sidebarExitActive
            ? "translate3d(-32px, 0, 0) scale3d(0.97, 0.97, 1)"
            : "translate3d(0, 0, 0) scale3d(1, 1, 1)",
          opacity: morphShell ? 0 : sidebarExitActive ? 0 : 1,
          transition: morphShell
            ? "opacity 60ms ease"
            : sidebarExitActive
            ? "transform 190ms cubic-bezier(0.22, 1, 0.36, 1), opacity 170ms ease"
            : undefined,
        }}
      >
        {/* Top Welcome Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40 shadow-2xs">
              <img src={SMARTTRACK_LOGO_URL} alt="SmartTrack" className="h-7 w-7 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-primary">
                Welcome back, {firstName} · {roleLabel}
              </p>
              <h2 id="nav-style-picker-title" className="mt-0.5 text-[19px] font-semibold tracking-tight text-foreground">
                Choose your SmartTrack experience
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick Simple Standard for the easiest daily workflow, or Modern View for a sleek frosted workspace.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close layout picker"
            title="Keep current style"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Two Visual Choice Cards */}
        <div className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2">
          {/* Option 1: Modern View (TrackHub) */}
          <button
            type="button"
            onClick={() => setSelected("island")}
            onDoubleClick={() => triggerConfirm("island")}
            aria-pressed={selected === "island"}
            style={{ contain: "layout style" }}
            className={`group flex flex-col rounded-2xl border-2 p-4 text-left transition-colors duration-150 cursor-pointer ${
              selected === "island"
                ? "border-primary bg-primary/[0.04]"
                : "border-border/70 bg-muted/15 hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <TrackHubMiniaturePreview userInitials={user.initials} />

            <div className="mt-3.5 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[15px] font-semibold tracking-tight text-foreground">Modern View</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                  Best Visuals
                </span>
              </div>
              <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                selected === "island"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-transparent"
              }`}>
                <Check size={11} strokeWidth={3} />
              </span>
            </div>

            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Frosted glass cards and a floating TrackHub pill — richer modern design with more screen space, best once you are familiar with the app.
            </p>

            <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3 text-[11.5px] text-foreground/80">
              <li className="flex items-center gap-2">
                <Check size={12} className="flex-shrink-0 text-primary" />
                <span>Translucent glass cards &amp; wider tables</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={12} className="flex-shrink-0 text-primary" />
                <span>Floating TrackHub &amp; Assistant (compact controls)</span>
              </li>
            </ul>
          </button>

          {/* Option 2: Simple Standard (iOS 18 Clean & Easy) */}
          <button
            type="button"
            onClick={() => setSelected("sidebar")}
            onDoubleClick={() => triggerConfirm("sidebar")}
            aria-pressed={selected === "sidebar"}
            style={{ contain: "layout style" }}
            className={`group flex flex-col rounded-2xl border-2 p-4 text-left transition-colors duration-150 cursor-pointer ${
              selected === "sidebar"
                ? "border-primary bg-primary/[0.04]"
                : "border-border/70 bg-muted/15 hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <ClassicBarMiniaturePreview userInitials={user.initials} roleLabel={roleLabel} />

            <div className="mt-3.5 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[15px] font-semibold tracking-tight text-foreground">Simple Standard</span>
                <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  Easiest to Use
                </span>
              </div>
              <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                selected === "sidebar"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-transparent"
              }`}>
                <Check size={11} strokeWidth={3} />
              </span>
            </div>

            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Clean solid cards, a grouped side menu, and clearly labeled buttons — built to be the easiest layout for everyday counter work.
            </p>

            <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3 text-[11.5px] text-foreground/80">
              <li className="flex items-center gap-2">
                <Check size={12} className="flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Clear text labels on menu &amp; topbar buttons</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={12} className="flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Solid, steady cards — quickest for new staff</span>
              </li>
            </ul>
          </button>
        </div>

        {/* Bottom Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <SettingsSwitch
              checked={askOnLogin}
              label="Show this at every sign-in"
              onToggle={() => onToggleAskOnLogin(!askOnLogin)}
            />
            <button
              type="button"
              onClick={() => onToggleAskOnLogin(!askOnLogin)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
            >
              Show this at every sign-in
            </button>
          </div>
          <button
            type="button"
            onClick={() => triggerConfirm(selected)}
            className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98] cursor-pointer"
          >
            Continue with {selected === "island" ? "Modern View" : "Simple Standard"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home({ user, onLogout, onUserUpdated, onReady, hideTrackHub = false }: {
  user: AuthUser;
  onLogout: () => void;
  onUserUpdated?: (user: AuthUser) => void;
  onReady?: () => void;
  hideTrackHub?: boolean;
}) {
  const isAdmin            = hasUserRole(user, "admin") || hasUserRole(user, "admin/owner");
  const isInventoryManager = hasUserRole(user, "inventory_manager");
  const isCashier          = hasUserRole(user, "cashier");
  const userRoles          = useMemo(() => [user.role], [user.role]);

  const defaultPage = useCallback((): Page =>
    isAdmin ? "dashboard" : isInventoryManager ? "inventory" : "transactions",
  [isAdmin, isInventoryManager]);

  const allowedPages = useMemo(() => [...new Set<Page>([
    ...(isAdmin ? ["dashboard", "inventory", "transactions", "analytics", "users", "stock-alerts", "reports", "returns", "financial", "purchases", "activity-log", "recycle-bin"] as Page[] : []),
    ...(isInventoryManager ? ["dashboard", "inventory", "stock-alerts", "analytics", "reports", "returns", "purchases", "recycle-bin", "activity-log"] as Page[] : []),
    ...(isCashier ? ["dashboard", "inventory", "stock-alerts", "transactions", "analytics", "reports", "activity-log"] as Page[] : []),
  ])], [isAdmin, isInventoryManager, isCashier]);
  const pageStorageKey = `st_last_page_${user.id}`;
  const getInitialPage = (): Page => {
    try {
      const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0] as Page;
      if (hash && allowedPages.includes(hash)) return hash;
      const savedPage = localStorage.getItem(pageStorageKey) as Page | null;
      if (savedPage && allowedPages.includes(savedPage)) return savedPage;
      const globalSaved = localStorage.getItem("smarttrack_last_page") as Page | null;
      if (globalSaved && allowedPages.includes(globalSaved)) return globalSaved;
    } catch { /* ignore */ }
    return defaultPage();
  };
  const [page, setPage] = useState<Page>(getInitialPage);
  const navigateTo = useCallback((nextPage: Page) => {
    startTransition(() => {
      setPage(nextPage);
    });
  }, []);

  useEffect(() => {
    if (!allowedPages.includes(page)) return;
    try {
      localStorage.setItem(pageStorageKey, page);
      localStorage.setItem("smarttrack_last_page", page);
      const currentHash = window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
      if (currentHash !== page) {
        window.history.replaceState(null, "", `#${page}`);
      }
    } catch { /* ignore unavailable storage */ }
  }, [page, pageStorageKey, allowedPages]);

  useEffect(() => {
    const handleHashChange = () => {
      try {
        const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0] as Page;
        if (hash && allowedPages.includes(hash)) {
          setPage(hash);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [allowedPages]);
  const [darkMode, setDarkMode]       = useState(() => {
    try { return localStorage.getItem("st_dark_mode") === "true"; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("st_dark_mode", String(darkMode)); } catch { /* ignore */ }
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);
  const [sidebarExpanded, setSidebar] = useState(true);
  const [showAboutSystem, setShowAboutSystem] = useState(false);

  // ── SmartBot Shortcut Assistant Toggle ──────────────────────────────────────
  const [smartBotEnabled, setSmartBotEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("st_smartbot_enabled") !== "false"; }
    catch { return true; }
  });
  const toggleSmartBot = (val: boolean) => {
    setSmartBotEnabled(val);
    try { localStorage.setItem("st_smartbot_enabled", String(val)); } catch { /* ignore */ }
  };

  // ── Navigation mode (TrackHub vs Sidebar) ────────────────────────────────────
  const [navMode, setNavMode] = useState<"island" | "sidebar">(() => {
    try { return (localStorage.getItem("st_nav_mode") as "island" | "sidebar") || "island"; }
    catch { return "island"; }
  });
  const [showNavStyleModal, setShowNavStyleModal] = useState(() => {
    try { return sessionStorage.getItem("st_nav_prompt_pending") === "1"; }
    catch { return false; }
  });
  const [askNavOnLogin, setAskNavOnLogin] = useState<boolean>(() => {
    try { return localStorage.getItem("st_nav_prompt_on_login") !== "false"; }
    catch { return true; }
  });
  const toggleAskNavOnLogin = useCallback((val: boolean) => {
    setAskNavOnLogin(val);
    try { localStorage.setItem("st_nav_prompt_on_login", String(val)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("st_nav_mode", navMode); } catch { /* ignore */ }
    applyUiStyle(navMode === "island" ? "glass" : "classic");
  }, [navMode]);
  const [trackHubOpen, setTrackHubOpen] = useState(false);
  const [trackHubAssistantOpen, setTrackHubAssistantOpen] = useState(false);
  const [trackHubAlertPeekOpen, setTrackHubAlertPeekOpen] = useState(false);
  const [trackHubActivitiesOpen, setTrackHubActivitiesOpen] = useState(false);
  const [quietedAlertSignature, setQuietedAlertSignature] = useState<string | null>(null);
  const [fontScale, setFontScaleState] = useState<FontScale>(() => readFontScale());
  const [tableDensity, setTableDensityState] = useState<TableDensity>(() => readTableDensity());
  const [reduceMotionPref, setReduceMotionPrefState] = useState<ReduceMotionPreference>(() => readReduceMotionPreference());
  const [mutedColors, setMutedColorsState] = useState<boolean>(() => readMutedColors());
  const [showAlertOrb, setShowAlertOrbState] = useState<boolean>(() => readShowAlertOrb());
  const [osReduceMotion, setOsReduceMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const reduceTrackHubMotion = reduceMotionPref === "reduced" || osReduceMotion;
  const [showTrackHubSettings, setShowTrackHubSettings] = useState(false);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const trackHubSettingsRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    applyDisplayPreferences({
      fontScale,
      tableDensity,
      reduceMotion: reduceMotionPref,
      mutedColors,
      uiStyle: navMode === "island" ? "glass" : "classic",
    });
  }, [fontScale, tableDensity, reduceMotionPref, mutedColors, navMode]);

  const updateFontScale = useCallback((nextScale: FontScale) => {
    setFontScaleState(nextScale);
    saveFontScale(nextScale);
  }, []);

  const updateTableDensity = useCallback((nextDensity: TableDensity) => {
    setTableDensityState(nextDensity);
    saveTableDensity(nextDensity);
  }, []);

  const updateReduceMotionPref = useCallback((nextPref: ReduceMotionPreference) => {
    setReduceMotionPrefState(nextPref);
    saveReduceMotionPreference(nextPref);
  }, []);

  const updateMutedColors = useCallback((val: boolean) => {
    setMutedColorsState(val);
    saveMutedColors(val);
  }, []);

  const updateShowAlertOrb = useCallback((val: boolean) => {
    setShowAlertOrbState(val);
    saveShowAlertOrb(val);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setOsReduceMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  // ── Dynamic Island Toast Notification ───────────────────────────────────────
  type HubToastAction = { label: string; onClick: () => void };
  const [hubToast, setHubToast] = useState<{ msg: string; type: "success" | "error" | "info"; action?: HubToastAction } | null>(null);
  const hubToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHubToast = useCallback((msg: string, type: "success" | "error" | "info" = "success", action?: HubToastAction) => {
    if (hubToastTimer.current) clearTimeout(hubToastTimer.current);
    setTrackHubOpen(false);
    setTrackHubAssistantOpen(false);
    setTrackHubAlertPeekOpen(false);
    setTrackHubActivitiesOpen(false);
    setHubToast({ msg, type, action });
    hubToastTimer.current = setTimeout(() => setHubToast(null), action ? 5500 : 3600);
  }, []);

  useEffect(() => {
    if (!showTrackHubSettings) return;
    const handler = (e: MouseEvent) => {
      if (trackHubSettingsRef.current && !trackHubSettingsRef.current.contains(e.target as Node)) {
        setShowTrackHubSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTrackHubSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTrackHubOpen(false);
        setTrackHubAlertPeekOpen(false);
        setTrackHubActivitiesOpen(false);
        setShowTrackHubSettings(false);
        if (navMode === "island") setSystemAlert(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navMode]);

  // ── Data state (loaded from API) ────────────────────────────────────────────
  const [inventory,     setInventory]     = useState<Product[]>([]);
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [staff,         setStaff]         = useState<StaffMember[]>([]);
  const [roles,         setRoles]         = useState<CustomRole[]>([]);
  const [notifs,        setNotifs]        = useState<Notification[]>([]);
  const [categories,    setCategories]    = useState<string[]>([]);
  const [cashierDashboard, setCashierDashboard] = useState<CashierDashboardSummary | null>(null);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [syncJustCompleted, setSyncJustCompleted] = useState(false);
  const syncDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current);
  }, []);

  useEffect(() => {
    if (!loading) onReady?.();
  }, [loading, onReady]);

  // Modern View only: sync overlaid page header height & Apple scroll-edge progressive blur state
  useLayoutEffect(() => {
    if (loading) return;
    const mainEl = mainContentRef.current;
    if (!mainEl) return;

    if (navMode !== "island") {
      mainEl.querySelectorAll<HTMLElement>(".st-page-shell").forEach(el => {
        el.style.removeProperty("--st-page-header-h");
      });
      mainEl.querySelectorAll<HTMLElement>(".st-page-header").forEach(el => {
        delete el.dataset.scrolled;
      });
      return;
    }

    let observedHeader: HTMLElement | null = null;
    let resizeObs: ResizeObserver | null = null;
    let rafId = 0;

    const measureHeader = () => {
      const shell = mainEl.querySelector<HTMLElement>(".st-page-shell");
      const header = shell?.querySelector<HTMLElement>(".st-page-header");
      if (!shell || !header) return;
      const h = Math.ceil(header.getBoundingClientRect().height);
      if (h > 0) {
        shell.style.setProperty("--st-page-header-h", `${h}px`);
      }
      if (header !== observedHeader) {
        resizeObs?.disconnect();
        observedHeader = header;
        if (typeof ResizeObserver !== "undefined") {
          resizeObs = new ResizeObserver(() => {
            const nextH = Math.ceil(header.getBoundingClientRect().height);
            if (nextH > 0) {
              shell.style.setProperty("--st-page-header-h", `${nextH}px`);
            }
          });
          resizeObs.observe(header);
        }
      }
    };

    const syncScrollState = () => {
      const shell = mainEl.querySelector<HTMLElement>(".st-page-shell");
      const header = shell?.querySelector<HTMLElement>(".st-page-header");
      if (!shell || !header) return;
      const scrollers = shell.querySelectorAll<HTMLElement>(".st-page-scroll-body");
      let anyScrolled = false;
      scrollers.forEach(s => {
        if (s.scrollTop > 2) anyScrolled = true;
      });
      const nextVal = anyScrolled ? "true" : "false";
      if (header.dataset.scrolled !== nextVal) {
        header.dataset.scrolled = nextVal;
      }
    };

    const scheduleSync = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        measureHeader();
        syncScrollState();
      });
    };

    measureHeader();
    syncScrollState();

    const onCaptureScroll = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("st-page-scroll-body")) return;
      const shell = target.closest<HTMLElement>(".st-page-shell");
      const header = shell?.querySelector<HTMLElement>(".st-page-header");
      if (!header) return;
      const nextVal = target.scrollTop > 2 ? "true" : "false";
      if (header.dataset.scrolled !== nextVal) {
        header.dataset.scrolled = nextVal;
      }
    };

    mainEl.addEventListener("scroll", onCaptureScroll, { capture: true, passive: true });

    const mutObs = typeof MutationObserver !== "undefined"
      ? new MutationObserver(scheduleSync)
      : null;
    mutObs?.observe(mainEl, { childList: true, subtree: true });

    return () => {
      mainEl.removeEventListener("scroll", onCaptureScroll, { capture: true });
      if (rafId) window.cancelAnimationFrame(rafId);
      resizeObs?.disconnect();
      mutObs?.disconnect();
    };
  }, [loading, page, navMode]);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [showAddProduct,    setShowAddProduct]    = useState(false);
  const [editingProduct,    setEditingProduct]    = useState<Product | null>(null);
  const [suggestedBatchQty, setSuggestedBatchQty] = useState(0);
  const [deletingProduct,   setDeletingProduct]   = useState<Product | null>(null);
  const [showAddSale,       setShowAddSale]       = useState(false);
  const [pausedSaleDraft,   setPausedSaleDraft]   = useState<SaleDraftState | null>(null);
  const [alertPeekIdx,      setAlertPeekIdx]      = useState(0);
  const [returningTx,       setReturningTx]       = useState<Transaction | null>(null);
  const [showAddUser,       setShowAddUser]        = useState(false);
  const [editingUser,       setEditingUser]        = useState<StaffMember | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [viewingInvoice,    setViewingInvoice]    = useState<Transaction | null>(null);
  const [systemAlert,       setSystemAlert]       = useState<Notification | null>(null);
  const seenOutOfStockAlerts = useRef(new Set<number>());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [hoveredNotifPid,   setHoveredNotifPid]   = useState<string | null>(null);
  const [showUserProfile,   setShowUserProfile]   = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [confirmDiscardCart, setConfirmDiscardCart] = useState(false);
  const [roleToRemove, setRoleToRemove] = useState<string | null>(null);
  const [roleActionBusy, setRoleActionBusy] = useState(false);

  // ── Universal search ────────────────────────────────────────────────────────
  const [searchQuery,      setSearchQuery]      = useState("");
  const [searchOpen,       setSearchOpen]       = useState(false);
  const [searchHighlight,  setSearchHighlight]  = useState(0);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Initial data load ───────────────────────────────────────────────────────
  const loadAll = useCallback(async (showLoading = true) => {
    clearApiCache();
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const [prods, txns, staffList, rolesList, notifList, cats, cashierSummary, settings] = await Promise.all([
        productsApi.list(),
        transactionsApi.list(),
        isAdmin ? usersApi.list() : Promise.resolve([]),
        isAdmin ? rolesApi.list().catch(() => [] as CustomRole[]) : Promise.resolve([]),
        notificationsApi.list(),
        categoriesApi.list(),
        isCashier ? dashboardApi.cashier().catch(error => {
          console.error("Cashier dashboard load failed:", error);
          return null;
        }) : Promise.resolve(null),
        receiptSettingsApi.get().catch(error => {
          console.error("Receipt settings load failed:", error);
          return null;
        }),
      ]);
      setInventory(prods.map(normalizeProduct));
      setTransactions(txns);
      setStaff(staffList);
      setRoles(rolesList);
      setNotifs(notifList);
      setCategories(cats);
      setCashierDashboard(cashierSummary);
      setReceiptSettings(settings);
      if (!showLoading) {
        if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current);
        setSyncJustCompleted(true);
        syncDoneTimerRef.current = setTimeout(() => setSyncJustCompleted(false), 1400);
      }
    } catch (e) {
      console.error("Load failed:", e);
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [isAdmin, isCashier]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    let active = true;
    const pollNotifications = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const latest = await notificationsApi.list();
        if (active) {
          setNotifs(previous => {
            const unchanged = previous.length === latest.length && latest.every((notification, index) => {
              const current = previous[index];
              return current.id === notification.id &&
                current.type === notification.type &&
                current.title === notification.title &&
                current.body === notification.body &&
                current.time === notification.time &&
                current.read === notification.read &&
                current.productId === notification.productId;
            });
            return unchanged ? previous : latest;
          });
        }
      } catch (error) {
        console.error("Notification refresh failed:", error);
      }
    };
    const timer = window.setInterval(pollNotifications, 12000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (systemAlert && !notifs.some(notification => notification.id === systemAlert.id)) {
      setSystemAlert(null);
      return;
    }
    if (systemAlert) return;
    const nextAlert = notifs.find(notification =>
      notification.type === "alert" &&
      notification.productId != null &&
      inventory.some(product =>
        String(product.id) === String(notification.productId) &&
        product.status === "out_of_stock"
      ) &&
      !seenOutOfStockAlerts.current.has(notification.id)
    );
    if (!nextAlert) return;
    seenOutOfStockAlerts.current.add(nextAlert.id);
    setSystemAlert(nextAlert);
  }, [inventory, notifs, systemAlert]);

  // Listen for global navigation events (used by dashboard widgets)
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (next) navigateTo(next as Page);
    };
    window.addEventListener("smarttrack:navigate", handler);
    return () => window.removeEventListener("smarttrack:navigate", handler);
  }, [navigateTo]);

  // ── Universal search: close on outside click (attached only when open) ──────
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  // Ctrl+K / Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Guard: redirect away from any page not allowed for the active role
  useEffect(() => {
    if (!allowedPages.includes(page)) setPage(defaultPage());
  }, [allowedPages, defaultPage, page]);

  // ── Computed alert counts ────────────────────────────────────────────────────
  const { lowStockCount, outOfStockCount, criticalStockCount, lowStockOnlyCount } = useMemo(() => {
    const counts = { lowStockCount: 0, outOfStockCount: 0, criticalStockCount: 0, lowStockOnlyCount: 0 };
    inventory.forEach(product => {
      if (product.status === "out_of_stock") {
        counts.lowStockCount++;
        counts.outOfStockCount++;
      } else if (product.status === "critical") {
        counts.lowStockCount++;
        counts.criticalStockCount++;
      } else if (product.status === "low") {
        counts.lowStockCount++;
        counts.lowStockOnlyCount++;
      }
    });
    return counts;
  }, [inventory]);
  const expiryAlerts  = useMemo(() => {
    const now = Date.now();
    const expired: Product[] = [], within30: Product[] = [], within90: Product[] = [];
    inventory.forEach(p => {
      const batches = sortBatchesByExpiry(p.batches);
      if (!batches.length || !batches[0].expiryDate) return;
      const days = (new Date(batches[0].expiryDate).getTime() - now) / 86400000;
      if (days <= 0)   expired.push(p);
      else if (days <= 30)  within30.push(p);
      else if (days <= 90)  within90.push(p);
    });
    return { expired, within30, within90 };
  }, [inventory]);
  const totalExpiryAlerts = expiryAlerts.expired.length + expiryAlerts.within30.length + expiryAlerts.within90.length;
  const hasUrgentPharmacyAlerts = outOfStockCount > 0 || expiryAlerts.expired.length > 0;
  const hasPharmacyWarnings = criticalStockCount > 0 || lowStockOnlyCount > 0 ||
    expiryAlerts.within30.length > 0 || expiryAlerts.within90.length > 0;
  const pharmacyHealth = hasUrgentPharmacyAlerts
    ? {
        label: "Urgent pharmacy alerts",
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]",
        textClass: "text-rose-300",
        pulse: false,
      }
    : hasPharmacyWarnings
    ? {
        label: "Pharmacy stock needs review",
        dotClass: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.75)]",
        textClass: "text-amber-300",
        pulse: false,
      }
    : {
        label: "All stock healthy",
        dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]",
        textClass: "text-emerald-300",
        pulse: false,
      };
  const productMap = useMemo(
    () => Object.fromEntries(inventory.map(p => [p.id, p.name])),
    [inventory]
  );
  const pharmacyAlertPeek = [
    outOfStockCount > 0 ? `${outOfStockCount} Out of Stock` : null,
    criticalStockCount > 0 ? `${criticalStockCount} Critical` : null,
    expiryAlerts.expired.length > 0 ? `${expiryAlerts.expired.length} Expired` : null,
    lowStockOnlyCount > 0 ? `${lowStockOnlyCount} Low` : null,
    expiryAlerts.within30.length > 0 ? `${expiryAlerts.within30.length} Expiring ≤30d` : null,
    expiryAlerts.within90.length > 0 ? `${expiryAlerts.within90.length} Expiring ≤90d` : null,
  ].filter((item): item is string => item !== null).join(" · ") || "All stock and expiry dates are healthy";
  const totalAlertBadge   = lowStockCount + totalExpiryAlerts;
  const unreadCount = useMemo(() => notifs.filter(n => !n.read).length, [notifs]);

  const urgentAlertItems = useMemo(() => {
    const items: Array<{ product: Product; label: string; detail: string; tone: "danger" | "warning" }> = [];
    const seen = new Set<string>();
    const addItem = (product: Product, detail: string, tone: "danger" | "warning") => {
      if (seen.has(product.id)) return;
      seen.add(product.id);
      items.push({ product, label: product.name, detail, tone });
    };
    inventory.filter(p => p.status === "out_of_stock").forEach(p => addItem(p, "Out of stock", "danger"));
    expiryAlerts.expired.forEach(p => addItem(p, "Expired batch", "danger"));
    expiryAlerts.within30.forEach(p => {
      const nearest = sortBatchesByExpiry(p.batches)[0];
      const days = nearest?.expiryDate ? Math.max(1, Math.ceil((new Date(nearest.expiryDate).getTime() - Date.now()) / 86400000)) : 30;
      addItem(p, `Expires in ${days}d`, "warning");
    });
    inventory.filter(p => p.status === "critical").forEach(p => addItem(p, `Critical (${p.stock} left)`, "danger"));
    inventory.filter(p => p.status === "low").forEach(p => addItem(p, `Low (${p.stock} left)`, "warning"));
    return items.slice(0, 12);
  }, [inventory, expiryAlerts]);

  const activeAlertItem = urgentAlertItems.length > 0
    ? urgentAlertItems[((alertPeekIdx % urgentAlertItems.length) + urgentAlertItems.length) % urgentAlertItems.length]
    : null;

  const canSell = isCashier;
  const pausedCartSummary = useMemo(() => {
    if (!canSell || !pausedSaleDraft) return null;
    const calcAmount = (product: Product, saleQty: number, saleUnit: "unit" | "pack") => {
      const price = product.salePrice ?? product.price;
      const unitPrice = saleUnit === "pack" && product.packPrice != null
        ? product.packPrice
        : saleUnit === "pack"
        ? price * (product.unitsPerPack ?? 1)
        : price;
      const shelfTotal = Math.round(unitPrice * saleQty * 100) / 100;
      if (!pausedSaleDraft.applyDiscount) return shelfTotal;
      const discountBase = Math.round((shelfTotal / 1.12) * 100) / 100;
      const discountAmount = Math.round(discountBase * 0.2 * 100) / 100;
      return Math.round((discountBase - discountAmount) * 100) / 100;
    };
    if (pausedSaleDraft.cart.length > 0) {
      const total = pausedSaleDraft.cart.reduce((sum, item) => sum + calcAmount(item.product, item.saleQty, item.saleUnit), 0);
      return { count: pausedSaleDraft.cart.length, total };
    }
    const pendingQty = parseInt(pausedSaleDraft.qty, 10) || 0;
    if (pausedSaleDraft.selectedProduct && pendingQty > 0) {
      return {
        count: 1,
        total: calcAmount(pausedSaleDraft.selectedProduct, pendingQty, pausedSaleDraft.saleUnit),
      };
    }
    return null;
  }, [canSell, pausedSaleDraft]);

  // ── Universal search results ─────────────────────────────────────────────────
  type SearchResult =
    | { kind: "product";     id: string; label: string; sub: string }
    | { kind: "transaction"; id: string; label: string; sub: string };

  const searchResults = useMemo((): SearchResult[] => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const productResults: SearchResult[] = [];
    const transactionResults: SearchResult[] = [];

    // Products
    for (const p of inventory) {
      if (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.supplier?.toLowerCase().includes(q)
      ) {
        productResults.push({
          kind: "product",
          id: p.id,
          label: p.name,
          sub: `${p.barcode ? `${p.barcode} · ` : ""}${p.category} · ${p.stock} units · ID ${p.id}`,
        });
      }
      if (productResults.length >= 20) break;
    }

    // Cashiers and admins can search transactions; inventory managers search products only.
    if (isCashier || isAdmin) {
      for (const tx of groupCartTransactions(transactions)) {
        const productNames = tx.cartItems?.map(item => item.product).join(" ") ?? "";
        if (
          tx.id.toLowerCase().includes(q) ||
          tx.product.toLowerCase().includes(q) ||
          productNames.toLowerCase().includes(q) ||
          tx.staff.toLowerCase().includes(q)
        ) {
          transactionResults.push({
            kind: "transaction",
            id: tx.id,
            label: tx.id,
            sub: `${tx.cartItems?.map(item => item.product).join(", ") || tx.product} · ${tx.type} · ${tx.date}`,
          });
        }
        if (transactionResults.length >= 20) break;
      }
    }

    // Reserve space for both result types so product matches cannot hide transactions.
    return [...productResults.slice(0, 4), ...transactionResults.slice(0, 4)];
  }, [searchQuery, inventory, transactions, isCashier, isAdmin]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSearchSelect = (result: { kind: "product" | "transaction"; id: string }) => {
    setSearchQuery("");
    setSearchOpen(false);
    searchInputRef.current?.blur();
    if (result.kind === "product") {
      setSelectedProductId(result.id);
      setPage("inventory");
    } else {
      setSelectedTransactionId(result.id);
      setPage("transactions");
    }
  };

  const handleSearchKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (!searchResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchHighlight(h => Math.min(h + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = searchResults[searchHighlight];
      if (r) handleSearchSelect(r);
    }
  };

  const handleAddCategory = useCallback(async (cat: string) => {
    if (categories.includes(cat)) return;
    try {
      await categoriesApi.create(cat);
      setCategories(prev => [...prev, cat]);
    } catch (e) { console.error(e); }
  }, [categories]);

  const handleSaveProduct = async (original: Product | null, updated: Product) => {
    try {
      const payload = {
        barcode: updated.barcode ?? "", name: updated.name,
        categories: updated.categories ?? updated.category.split(",").map(category => category.trim()).filter(Boolean),
        supplier: updated.supplier, reorder: updated.reorder,
        price: updated.price,
        sale_price:    updated.salePrice    ?? updated.sale_price    ?? null,
        unit_label:    updated.unitLabel ?? "unit",
        units_per_pack: updated.unitsPerPack ?? 1,
        pack_price:    updated.packPrice ?? null,
        batches: updated.batches.map(b => ({
          batchId: b.batchId, qty: b.qty,
          expiryDate: b.expiryDate ?? b.expiry ?? null,
          receivedDate: b.receivedDate,
          batchTotalCost: b.batchTotalCost ?? null,
          unitCost:       b.unitCost       ?? null,
        })),
      };
      const saved = original
        ? await productsApi.update(original.id, payload)
        : await productsApi.create(payload);
      const norm = normalizeProduct(saved);
      setInventory(prev =>
        original
          ? prev.map(p => p.id === original.id ? norm : p)
          : [norm, ...prev]
      );
      showHubToast(original ? "Product updated" : "Product added", "success", {
        label: "View",
        onClick: () => {
          setSelectedProductId(norm.id);
          setPage("inventory");
        },
      });
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Failed to save product.", "error");
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    try {
      await productsApi.delete(p.id);
      setInventory(prev => prev.filter(x => x.id !== p.id));
      setNotifs(prev => prev.filter(notification => notification.productId !== p.id));
      setSystemAlert(current => current?.productId === p.id ? null : current);
      setDeletingProduct(null);
      let restoring = false;
      showHubToast("Product moved to recycle bin", "info", {
        label: "Undo",
        onClick: async () => {
          if (restoring) return;
          restoring = true;
          try {
            await productsApi.restore(p.id);
            const refreshed = await productsApi.list();
            setInventory(refreshed.map(normalizeProduct));
            showHubToast(`Restored "${p.name}"`, "success");
          } catch (err: unknown) {
            showHubToast(err instanceof Error ? err.message : "Could not restore product.", "error");
          }
        },
      });
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Failed to delete product.", "error");
    }
  };

  const handleAddSale = async (
    tx: Transaction,
    productId: string,
    qty: number,
    saleQty = qty,
    saleUnit = "unit",
    items?: Array<{ product_id: string; qty: number; sale_qty?: number; sale_unit?: string }>,
  ) => {
    try {
      const saleItems = items && items.length > 0 ? items : [{
        product_id: productId,
        qty,
        sale_qty: saleQty,
        sale_unit: saleUnit,
      }];

      const res = await transactionsApi.sale({
        items: saleItems,
        customer_vat_exempt: !!tx.customerVatExempt,
        customer_exemption_type: tx.customerExemptionType ?? null,
        customer_id_number: tx.customerIdNumber ?? null,
      });

      if (res.transactions && res.transactions.length > 0) {
        setTransactions(prev => [...res.transactions!, ...prev]);
        const updatedProducts = res.products ?? [];
        if (updatedProducts.length > 0) {
          setInventory(prev => {
            const map = new Map(prev.map(p => [p.id, normalizeProduct(p)]));
            for (const product of updatedProducts) {
              map.set(product.id, normalizeProduct(product));
            }
            return Array.from(map.values());
          });
        }
        const receiptTransaction = groupCartTransactions(res.transactions)[0];
        if (receiptTransaction) setViewingInvoice(receiptTransaction);
        showHubToast("Sale complete", "success", receiptTransaction ? {
          label: "Receipt",
          onClick: () => setViewingInvoice(receiptTransaction),
        } : undefined);
        return;
      }

      if (!res.transaction || !res.product) throw new Error("Sale response missing transaction data.");
      setTransactions(prev => [res.transaction!, ...prev]);
      setInventory(prev => prev.map(p => p.id === productId ? normalizeProduct(res.product!) : p));
      setViewingInvoice(res.transaction);
      const completedTx = res.transaction;
      showHubToast("Sale complete", "success", {
        label: "Receipt",
        onClick: () => setViewingInvoice(completedTx),
      });
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Sale failed.", "error");
    }
  };

  const handleReturn = async (tx: Transaction, _productId: string, qty: number) => {
    const res = await returnRequestsApi.submit({
      sale_tx_id: tx.returnedTxId!,
      qty,
      reason: tx.note ?? "",
    });
    setTransactions(prev => [res.transaction, ...prev]);
  };

  const handleReturnDispositionComplete = useCallback(async () => {
    await loadAll(false);
  }, [loadAll]);

  const handleAdjustment = async (tx: Transaction, productId: string, qty: number) => {
    try {
      const res = await transactionsApi.adjustment({
        product_id: productId, qty,
        reason: tx.note ?? "",
        adjust_type: tx.adjustmentReason?.startsWith("Damaged") ? "damage" : "correction",
      });
      setTransactions(prev => [res.transaction, ...prev]);
      setInventory(prev => prev.map(p => p.id === productId ? normalizeProduct(res.product) : p));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Adjustment failed.");
    }
  };

  const handleSaveUser = async (original: StaffMember | null, updated: StaffMember, password?: string) => {
    try {
      const payload = {
        name: updated.name, role: updated.role, roles: updated.roles ?? [updated.role],
        email: updated.email, status: updated.status,
        position: updated.position ?? "",
        ...(!original && password ? { password } : {}),
      };
      const saved = original
        ? await usersApi.update(original.id, payload)
        : await usersApi.create(payload);
      setStaff(prev =>
        original
          ? prev.map(s => s.id === original.id ? saved : s)
          : [...prev, saved]
      );
      showHubToast(original ? "Staff updated" : "Staff added", "success");
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Failed to save user.", "error");
    }
  };

  const handleDeleteUser = useCallback(async (target: StaffMember) => {
    try {
      await usersApi.delete(target.id);
      setStaff(prev => prev.filter(s => s.id !== target.id));
      showHubToast("Staff removed", "info");
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Failed to delete user.", "error");
    }
  }, [showHubToast]);

  const handleToggleStatus = useCallback(async (target: StaffMember, newStatus: "active" | "inactive") => {
    try {
      const payload = {
        name: target.name, role: target.role, roles: target.roles ?? [target.role],
        email: target.email, status: newStatus,
        position: target.position ?? "",
      };
      const saved = await usersApi.update(target.id, payload);
      setStaff(prev => prev.map(s => s.id === target.id ? saved : s));
      showHubToast(`${target.name} ${newStatus === "active" ? "activated" : "deactivated"}`, "success");
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Failed to update user status.", "error");
    }
  }, [showHubToast]);

  const handleResetPassword = async (newPassword: string) => {
    await usersApi.changePassword(user.id, newPassword);
  };

  // Admin resets another user's password (clears it)
  const handleAdminResetPassword = useCallback(async (target: StaffMember) => {
    await usersApi.resetPassword(target.id);
  }, []);

  // Admin sets a new password for another user
  const handleAdminCreatePassword = useCallback(async (userId: string, password: string) => {
    await usersApi.createPassword(userId, password);
  }, []);

  const handleUpdateProfile = async (name: string, email: string) => {
    const updated = await usersApi.update(user.id, {
      name,
      email,
      role: user.role,
      status: user.status,
      position: user.position ?? "",
    });
    onUserUpdated?.({
      ...user,
      name: updated.name,
      email: updated.email,
      initials: updated.initials,
    });
  };

  const activateRole = useCallback((role: string) => {
    clearApiCache();
    activeRoleStore.set(role);
    onUserUpdated?.({ ...user, role: role as AuthUser["role"] });
    navigateTo(role === "admin" || role === "admin/owner" ? "dashboard" : role === "inventory_manager" ? "inventory" : "transactions");
  }, [user, onUserUpdated, navigateTo]);

  const handleRemoveOwnRole = async (role: string) => {
    setRoleActionBusy(true);
    try {
      const updated = await usersApi.removeOwnRole(user.id, role);
      const remainingRoles = updated.roles ?? [updated.role];
      const activeRole = remainingRoles.includes(user.role) ? user.role : updated.role;
      activeRoleStore.set(activeRole);
      onUserUpdated?.({ ...user, role: activeRole as AuthUser["role"], roles: remainingRoles });
      setRoleToRemove(null);
      setPage(activeRole === "admin" || activeRole === "admin/owner" ? "dashboard" : activeRole === "inventory_manager" ? "inventory" : "transactions");
      showHubToast(`${ROLE_LABELS[role] ?? role} role removed from your account.`, "success");
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Could not remove role.", "error");
    } finally {
      setRoleActionBusy(false);
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAll();
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* ignore */ }
  };

  const markOneRead = async (id: number) => {
    try {
      await notificationsApi.markOne(id);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch { /* ignore */ }
  };

  const handleNotificationClick = (notif: Notification) => {
    markOneRead(notif.id);
    if (notif.productId) { setSelectedProductId(notif.productId); setPage("inventory"); }
    setShowNotifications(false);
  };

  const handleRefresh = () => {
    setShowNotifications(false);
    loadAll(false);
  };

  const handleToggleFullScreen = async () => {
    try {
      if (window.smarttrack?.isElectron) {
        const isFullScreen = await window.smarttrack.toggleFullScreen();
        if (isFullScreen === null) throw new Error("Could not change the window display mode.");
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      showHubToast(error instanceof Error ? error.message : "Could not change the window display mode.", "error");
    }
  };

  const isMac = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /mac|iphone|ipad|ipod/i.test(navigator.userAgent || navigator.platform || "");
  }, []);

  useEffect(() => {
    const handleKeyShortcut = (e: KeyboardEvent) => {
      // Toggle fullscreen on F11 (Windows) or Control+Command+F (Mac)
      if (e.key === "F11" || (e.ctrlKey && e.metaKey && e.key.toLowerCase() === "f")) {
        e.preventDefault();
        handleToggleFullScreen();
      }
    };
    window.addEventListener("keydown", handleKeyShortcut);
    return () => window.removeEventListener("keydown", handleKeyShortcut);
  }, []);

  const handleStockAlertEditProduct = useCallback((product: Product, suggestedQty = 0) => {
    navigateTo("inventory");
    setSelectedProductId(product.id);
    setSuggestedBatchQty(suggestedQty);
    setEditingProduct(product);
  }, [navigateTo]);

  const handleOpenAddProduct = useCallback(() => setShowAddProduct(true), []);
  const handleEditInventoryProduct = useCallback((product: Product) => {
    setSuggestedBatchQty(0);
    setEditingProduct(product);
  }, []);
  const handleReloadAll = useCallback(() => { void loadAll(false); }, [loadAll]);
  const handleGoToInventory = useCallback(() => navigateTo("inventory"), [navigateTo]);
  const handleOpenAddSale = useCallback(() => setShowAddSale(true), []);
  const handleRolesChanged = useCallback(() => { rolesApi.list().then(setRoles).catch(() => {}); }, []);
  const handleCommandNavigate = useCallback((p: Page) => {
    navigateTo(p);
    setTrackHubAssistantOpen(false);
  }, [navigateTo]);
  const handleCommandOpenNewSale = useCallback(() => {
    setShowAddSale(true);
    setTrackHubAssistantOpen(false);
  }, []);
  const handleCommandOpenAddProduct = useCallback(() => {
    setShowAddProduct(true);
    setTrackHubAssistantOpen(false);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const navItems = useMemo(() => {
    if (isAdmin) {
      return [
        { id: "dashboard" as Page,    icon: LayoutDashboard, label: "Dashboard" },
        { id: "inventory" as Page,    icon: Package,         label: "Inventory",    badge: lowStockCount },
        { id: "stock-alerts" as Page, icon: BellRing,        label: "Stock Alerts", badge: totalAlertBadge },
        { id: "transactions" as Page, icon: ShoppingCart,    label: "Transactions" },
        { id: "analytics" as Page,    icon: BarChart2,       label: "Analytics" },
        { id: "reports" as Page,      icon: ClipboardList,   label: "Reports" },
        { id: "returns" as Page,      icon: ClipboardCheck,  label: "Returns & Broken" },
        { id: "financial" as Page,    icon: Landmark,        label: "Financial" },
        { id: "purchases" as Page,    icon: Truck,           label: "Supplier Orders" },
        { id: "users" as Page,        icon: Users,           label: "Users" },
      ];
    }
    if (isInventoryManager) {
      return [
        { id: "inventory" as Page,    icon: Package,         label: "Inventory",    badge: lowStockCount },
        { id: "stock-alerts" as Page, icon: BellRing,        label: "Stock Alerts", badge: totalAlertBadge },
        { id: "dashboard" as Page,    icon: LayoutDashboard, label: "Dashboard" },
        { id: "analytics" as Page,    icon: BarChart2,       label: "Analytics" },
        { id: "reports" as Page,      icon: ClipboardList,   label: "Reports" },
        { id: "returns" as Page,      icon: ClipboardCheck,  label: "Returns & Broken" },
        { id: "purchases" as Page,    icon: Truck,           label: "Supplier Orders" },
      ];
    }
    return [
      { id: "dashboard" as Page,    icon: LayoutDashboard, label: "Dashboard" },
      { id: "inventory" as Page,    icon: Package,         label: "Inventory",    badge: lowStockCount },
      { id: "stock-alerts" as Page, icon: BellRing,        label: "Stock Alerts", badge: totalAlertBadge },
      { id: "transactions" as Page, icon: ShoppingCart,    label: "Transactions" },
      { id: "analytics" as Page,    icon: BarChart2,       label: "Analytics" },
      { id: "reports" as Page,      icon: ClipboardList,   label: "Reports" },
    ];
  }, [isAdmin, isInventoryManager, lowStockCount, totalAlertBadge]);

  // ── TrackHub close-on-outside-click ────────────────────────────────────
  const trackHubRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!trackHubOpen && !trackHubAssistantOpen && !trackHubAlertPeekOpen && !trackHubActivitiesOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Also ignore clicks inside the portaled assistant modal (rendered outside trackHubRef in document.body)
      const portalModal = document.querySelector("[data-assistant-portal]");
      if (
        trackHubRef.current && !trackHubRef.current.contains(target) &&
        !(portalModal && portalModal.contains(target))
      ) {
        setTrackHubOpen(false);
        setTrackHubAssistantOpen(false);
        setTrackHubAlertPeekOpen(false);
        setTrackHubActivitiesOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [trackHubOpen, trackHubAssistantOpen, trackHubAlertPeekOpen, trackHubActivitiesOpen]);

  useEffect(() => {
    if (navMode !== "island") {
      setTrackHubAssistantOpen(false);
      setTrackHubAlertPeekOpen(false);
      setTrackHubActivitiesOpen(false);
    }
  }, [navMode]);

  useEffect(() => {
    if (!smartBotEnabled) setTrackHubAssistantOpen(false);
  }, [smartBotEnabled]);

  // Active nav item for island — includes friendly labels for settings pages
  const settingsPageLabels: Partial<Record<import('./data').Page, string>> = {
    "activity-log": "Activity Log",
    "recycle-bin":  "Recycle Bin",
  };
  const activeNavItem = navItems.find(n => n.page === page) ?? navItems.find(n => n.id === page);
  const ActiveIcon  = activeNavItem?.icon ?? Settings;
  const activeLabel = settingsPageLabels[page] ?? activeNavItem?.label ?? page;

  // ── TrackHub Spring Physics ──────────────────────────────────────────────────
  // Pure CSS GPU-composited spring morph matching Apple's authentic Dynamic Island.
  // Both collapsed & expanded layers are anchored to the exact center (translateX(-50%))
  // preventing horizontal jitter and lateral drifting during open & close.
  const pillRef = useRef<HTMLDivElement>(null);

  // Tactile press state for nav item tap feedback
  const [pressedItem, setPressedItem] = useState<string | null>(null);

  // Horizontal Apple-style Launchpad paging (5x2 max 10 items per slide so standard roles stay on 1 crisp page)
  const HUB_PAGE_SIZE = 10;
  const hubPages = useMemo(() => {
    const pages: typeof navItems[] = [];
    for (let i = 0; i < navItems.length; i += HUB_PAGE_SIZE) {
      pages.push(navItems.slice(i, i + HUB_PAGE_SIZE));
    }
    return pages.length > 0 ? pages : [[]];
  }, [navItems]);
  const [hubGridPage, setHubGridPage] = useState(0);
  const safeHubGridPage = Math.min(hubGridPage, Math.max(0, hubPages.length - 1));
  const hubWheelCooldownRef = useRef(0);

  useEffect(() => {
    const idx = navItems.findIndex(item => item.id === page);
    if (idx >= 0) {
      setHubGridPage(Math.floor(idx / HUB_PAGE_SIZE));
    }
  }, [page, navItems, trackHubOpen]);

  // Pill content (icon + label) slide-in when active page changes
  const prevPageRef = useRef(page);
  const [pillSlide,  setPillSlide]  = useState(false);

  // ── TrackHub Navigation ──────────────────────────────────────────────────────
  // Collapsed pill width/height depends on whether a confirm dialog or toast is active
  const activeConfirm = useIslandConfirm();
  const confirmOpen   = activeConfirm !== null;
  const hasPausedCart = pausedCartSummary !== null && !showAddSale;
  const urgentDangerSignature = useMemo(
    () => urgentAlertItems.filter(item => item.tone === "danger").map(item => item.product.id).join(","),
    [urgentAlertItems]
  );
  const hasActiveUrgentOrb =
    showAlertOrb &&
    page !== "stock-alerts" &&
    hasUrgentPharmacyAlerts &&
    urgentAlertItems.length > 0 &&
    quietedAlertSignature !== urgentDangerSignature;

  type LiveIslandActivity = {
    id: "paused-cart" | "urgent-alert";
    tone: "emerald" | "rose";
    title: string;
    subtitle: string;
    pillText?: string;
  };

  const liveActivities = useMemo<LiveIslandActivity[]>(() => {
    const items: LiveIslandActivity[] = [];
    if (hasPausedCart && pausedCartSummary) {
      items.push({
        id: "paused-cart",
        tone: "emerald",
        title: "Paused POS Cart",
        subtitle: `${pausedCartSummary.count} item${pausedCartSummary.count === 1 ? "" : "s"} · ${fmt(pausedCartSummary.total)}`,
        pillText: `Cart · ${pausedCartSummary.count}`,
      });
    }
    if (hasActiveUrgentOrb) {
      const alertTotal = totalAlertBadge > 0 ? totalAlertBadge : urgentAlertItems.length;
      items.push({
        id: "urgent-alert",
        tone: "rose",
        title: "Store Stock Alerts",
        subtitle: pharmacyAlertPeek,
        pillText: `Stock · ${alertTotal}`,
      });
    }
    return items;
  }, [
    hasPausedCart,
    pausedCartSummary,
    hasActiveUrgentOrb,
    totalAlertBadge,
    pharmacyAlertPeek,
    urgentAlertItems.length,
  ]);

  useEffect(() => {
    if (trackHubActivitiesOpen && liveActivities.length === 0) {
      setTrackHubActivitiesOpen(false);
    }
  }, [trackHubActivitiesOpen, liveActivities.length]);

  const collapsedMeasureRef = useRef<HTMLDivElement>(null);
  const splitOrbMeasureRef = useRef<HTMLButtonElement>(null);
  const [measuredPillWidth, setMeasuredPillWidth] = useState<number>(() => (smartBotEnabled ? 236 : 164));
  const [measuredOrbWidth, setMeasuredOrbWidth] = useState<number>(102);

  const toastOpen       = !showNavStyleModal && !confirmOpen && hubToast !== null && !trackHubOpen && !trackHubAssistantOpen && !trackHubAlertPeekOpen && !trackHubActivitiesOpen;
  const systemAlertOpen = !showNavStyleModal && navMode === "island" && !confirmOpen && !trackHubOpen && !trackHubAssistantOpen && !trackHubAlertPeekOpen && !trackHubActivitiesOpen && !toastOpen && systemAlert !== null;
  const baseCollapsedWidth = measuredPillWidth;
  const collapsedPillWidth = `${baseCollapsedWidth}px`;
  const activitiesHeight = `${Math.min(312, 86 + Math.max(1, liveActivities.length) * 66)}px`;
  const pillW         = confirmOpen
    ? "430px"
    : trackHubAssistantOpen
    ? "min(570px, calc(100vw - 24px))"
    : trackHubOpen
    ? "min(580px, calc(100vw - 24px))"
    : trackHubActivitiesOpen
    ? "min(520px, calc(100vw - 24px))"
    : trackHubAlertPeekOpen
    ? "min(520px, calc(100vw - 24px))"
    : toastOpen
    ? (hubToast?.action ? "min(430px, calc(100vw - 24px))" : "min(360px, calc(100vw - 32px))")
    : systemAlertOpen
    ? "min(490px, calc(100vw - 24px))"
    : collapsedPillWidth;
  const expandedHubHeight = hasPausedCart
    ? hubPages.length > 1
      ? "min(310px, calc(100dvh - 80px))"
      : "min(290px, calc(100dvh - 80px))"
    : hubPages.length > 1
    ? "min(268px, calc(100dvh - 80px))"
    : "min(248px, calc(100dvh - 80px))";

  const assistantHubHeight = "min(410px, calc(100dvh - 80px))";

  const pillH         = confirmOpen
    ? "148px"
    : trackHubAssistantOpen
    ? assistantHubHeight
    : trackHubOpen
    ? expandedHubHeight
    : trackHubActivitiesOpen
    ? activitiesHeight
    : trackHubAlertPeekOpen
    ? "56px"
    : toastOpen
    ? "48px"
    : systemAlertOpen
    ? "76px"
    : "42px";

  type IslandState = "collapsed" | "toast" | "alert-peek" | "system-alert" | "activities" | "hub" | "assistant" | "confirm";
  const islandState: IslandState = confirmOpen
    ? "confirm"
    : trackHubAssistantOpen
    ? "assistant"
    : trackHubOpen
    ? "hub"
    : trackHubActivitiesOpen
    ? "activities"
    : trackHubAlertPeekOpen
    ? "alert-peek"
    : toastOpen
    ? "toast"
    : systemAlertOpen
    ? "system-alert"
    : "collapsed";

  const prevIslandStateRef = useRef<IslandState>(islandState);
  const islandStateRef = useRef<IslandState>(islandState);
  islandStateRef.current = islandState;
  const [islandMorph, setIslandMorph] = useState<{ kind: "expand" | "collapse" | "swap" | "nudge"; seq: number } | null>(null);

  useEffect(() => {
    const prev = prevIslandStateRef.current;
    if (prev === islandState) return;
    prevIslandStateRef.current = islandState;
    if (reduceTrackHubMotion) return;
    const kind: "expand" | "collapse" | "swap" =
      prev === "collapsed"
        ? "expand"
        : islandState === "collapsed"
        ? "collapse"
        : "swap";
    setIslandMorph(m => ({ kind, seq: (m?.seq ?? 0) + 1 }));
  }, [islandState, reduceTrackHubMotion]);

  useEffect(() => {
    if (prevPageRef.current !== page) {
      prevPageRef.current = page;
      setPillSlide(true);
      if (!reduceTrackHubMotion && islandStateRef.current === "collapsed") {
        setIslandMorph(m => ({ kind: "nudge", seq: (m?.seq ?? 0) + 1 }));
      }
      const t = setTimeout(() => setPillSlide(false), 320);
      return () => clearTimeout(t);
    }
  }, [page, reduceTrackHubMotion]);

  const isExpandedIsland = islandState !== "collapsed";
  const primaryActivity = liveActivities[0] ?? null;
  const hasSplitOrb = primaryActivity !== null && !hideTrackHub;
  const splitOrbActive = hasSplitOrb && !isExpandedIsland;

  useLayoutEffect(() => {
    const pillEl = collapsedMeasureRef.current;
    if (!pillEl) return;
    const width = Math.ceil(pillEl.offsetWidth) + 2;
    if (width > 100) {
      setMeasuredPillWidth(prev => (prev === width ? prev : width));
    }
  }, [loading, navMode, page, activeLabel, smartBotEnabled, refreshing, syncJustCompleted, fontScale]);

  useLayoutEffect(() => {
    const orbEl = splitOrbMeasureRef.current;
    if (!orbEl) return;
    const width = Math.ceil(orbEl.offsetWidth);
    if (width > 60) {
      setMeasuredOrbWidth(prev => (prev === width ? prev : width));
    }
  }, [loading, navMode, liveActivities.length, primaryActivity?.id, primaryActivity?.pillText, fontScale, showAlertOrb, hasPausedCart]);

  const splitOrbWidth = measuredOrbWidth;
  const SPLIT_GAP = 8;
  const mainSplitShiftX = splitOrbActive ? -(SPLIT_GAP + splitOrbWidth) / 2 : 0;
  const splitOrbRestX = (baseCollapsedWidth + SPLIT_GAP) / 2;
  const splitOrbHiddenX = baseCollapsedWidth / 2 - splitOrbWidth / 2 - 4;

  const handleSplitOrbClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!primaryActivity) return;
    if (liveActivities.length === 1) {
      if (primaryActivity.id === "paused-cart") {
        setShowAddSale(true);
        return;
      }
      if (primaryActivity.id === "urgent-alert") {
        setTrackHubAlertPeekOpen(true);
        return;
      }
    }
    setTrackHubOpen(false);
    setTrackHubAlertPeekOpen(false);
    setTrackHubAssistantOpen(false);
    setTrackHubActivitiesOpen(true);
  };
  const morphVariant = islandMorph ? (islandMorph.seq % 2 === 0 ? "a" : "b") : null;
  const pillShellAnimation = reduceTrackHubMotion || !islandMorph || !morphVariant
    ? "none"
    : islandMorph.kind === "expand"
    ? `th-squish-expand-${morphVariant} 380ms cubic-bezier(0.22, 1, 0.36, 1)`
    : islandMorph.kind === "collapse"
    ? `th-squish-collapse-${morphVariant} 310ms cubic-bezier(0.22, 1, 0.36, 1)`
    : islandMorph.kind === "swap"
    ? `th-squish-swap-${morphVariant} 330ms cubic-bezier(0.22, 1, 0.36, 1)`
    : `th-squish-nudge-${morphVariant} 290ms cubic-bezier(0.22, 1, 0.36, 1)`;

  useEffect(() => {
    if (confirmOpen) {
      setTrackHubOpen(false);
      setTrackHubAlertPeekOpen(false);
      setTrackHubActivitiesOpen(false);
    }
  }, [confirmOpen]);

  useEffect(() => {
    if (!activeConfirm) return;
    // Only handle Escape key — do NOT close on outside mousedown,
    // because the sale modal (portaled outside trackHubRef) would
    // trigger onCancel on every click, cancelling the confirm before
    // the user can click "Complete Sale".
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        activeConfirm.onCancel();
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
    };
  }, [activeConfirm]);

  const trackHubNavigation = (
    <div ref={trackHubRef} className="relative flex items-center justify-center" style={{ zIndex: 60, position: "relative" }}>
      {/* Anchor placeholder — keeps topbar items from shifting */}
      <div className="h-[42px] invisible pointer-events-none" style={{ width: collapsedPillWidth }} aria-hidden="true" />

      {/* ── Detached Apple Split Orb (pops out cleanly when 1+ live activities run) ── */}
      {primaryActivity && (
        <div
          className="hidden sm:block absolute top-0 left-1/2"
          style={{
            zIndex: 1,
            width: `${splitOrbWidth}px`,
            height: "42px",
            transform: splitOrbActive
              ? `translate3d(calc(-50% + ${splitOrbRestX}px), 0, 0) scale(1)`
              : `translate3d(calc(-50% + ${splitOrbHiddenX}px), 0, 0) scale(0.5)`,
            opacity: splitOrbActive ? 1 : 0,
            pointerEvents: splitOrbActive ? "auto" : "none",
            transition: reduceTrackHubMotion
              ? "none"
              : splitOrbActive
              ? "transform 340ms cubic-bezier(0.22, 1.24, 0.36, 1) 25ms, opacity 170ms 35ms ease"
              : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 110ms ease",
          }}
        >
          <button
            ref={splitOrbMeasureRef}
            type="button"
            onClick={handleSplitOrbClick}
            title={
              liveActivities.length > 1
                ? `${liveActivities.length} live activities (${liveActivities.map(a => a.title).join(", ")})`
                : `${primaryActivity.title}: ${primaryActivity.subtitle}`
            }
            aria-label={
              liveActivities.length > 1
                ? `${liveActivities.length} live activities active. Click to inspect.`
                : `${primaryActivity.title}. ${primaryActivity.subtitle}`
            }
            className="th-split-orb-face relative flex h-full w-max min-w-[88px] items-center justify-center gap-[6px] rounded-full px-[12px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{
              background: "#000000",
              border: darkMode
                ? "1px solid rgba(255, 255, 255, 0.28)"
                : "1px solid rgba(255, 255, 255, 0.14)",
              boxShadow: darkMode
                ? "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.42), 0 0 8px 0 rgba(255, 255, 255, 0.10), 0 4px 16px rgba(0,0,0,0.38)"
                : "0 4px 16px rgba(0,0,0,0.20)",
            }}
          >
            {/* Matching top obsidian rim highlight */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2 top-0 h-px rounded-full opacity-70"
              style={{
                background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 100%)",
              }}
            />

            {primaryActivity.id === "paused-cart" && (
              <>
                <ShoppingCart size={13} className="text-emerald-400 flex-shrink-0" />
                <span aria-hidden="true" className="flex items-end gap-[2px] h-2.5 flex-shrink-0">
                  <span className={`w-[2px] h-full rounded-full bg-emerald-400 ${splitOrbActive && !reduceTrackHubMotion ? "th-beat-1" : ""}`} />
                  <span className={`w-[2px] h-full rounded-full bg-emerald-300 ${splitOrbActive && !reduceTrackHubMotion ? "th-beat-2" : ""}`} />
                  <span className={`w-[2px] h-full rounded-full bg-emerald-400 ${splitOrbActive && !reduceTrackHubMotion ? "th-beat-3" : ""}`} />
                </span>
                {primaryActivity.pillText && (
                  <span className="text-[11px] font-semibold tabular-nums whitespace-nowrap text-emerald-300 leading-none">
                    {primaryActivity.pillText}
                  </span>
                )}
              </>
            )}

            {primaryActivity.id === "urgent-alert" && (
              <>
                <span aria-hidden="true" className="relative flex h-2.5 w-2.5 items-center justify-center flex-shrink-0">
                  {hasUrgentPharmacyAlerts && splitOrbActive && !reduceTrackHubMotion && (
                    <span className="th-radar-ring absolute inline-flex h-full w-full rounded-full bg-rose-400" />
                  )}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${hasUrgentPharmacyAlerts ? "bg-rose-400" : "bg-amber-400"}`} />
                </span>
                {primaryActivity.pillText && (
                  <span className={`text-[11px] font-semibold tabular-nums whitespace-nowrap leading-none ${hasUrgentPharmacyAlerts ? "text-rose-300" : "text-amber-300"}`}>
                    {primaryActivity.pillText}
                  </span>
                )}
              </>
            )}

            {liveActivities.length > 1 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-background shadow-sm leading-none">
                +{liveActivities.length - 1}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Main Pill GPU Split Shift Wrapper (avoids CSS keyframe conflict) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          transform: `translate3d(${mainSplitShiftX}px, 0, 0)`,
          transition: reduceTrackHubMotion
            ? "none"
            : "transform 300ms cubic-bezier(0.22, 1.18, 0.36, 1)",
        }}
      >
      {/* ── Physical pill shell (Apple Dynamic Island GPU Spring Morph) ── */}
      <div
        ref={pillRef}
        data-trackhub-target
        data-collapsed={islandState === "collapsed" ? "true" : "false"}
        className="th-pill-shell pointer-events-auto absolute top-0 left-1/2 overflow-hidden select-none cursor-default"
        style={{
          background: "#000000",
          border: darkMode
            ? "1px solid rgba(255, 255, 255, 0.28)"
            : "1px solid rgba(255, 255, 255, 0.14)",
          boxShadow: darkMode
            ? confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubActivitiesOpen
              ? "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.42), 0 0 10px 0 rgba(255, 255, 255, 0.10), 0 18px 44px rgba(0,0,0,0.78)"
              : toastOpen || systemAlertOpen
              ? "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.42), 0 0 8px 0 rgba(255, 255, 255, 0.10), 0 10px 30px rgba(0,0,0,0.58)"
              : "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.42), 0 0 8px 0 rgba(255, 255, 255, 0.10), 0 4px 16px rgba(0,0,0,0.38)"
            : confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubActivitiesOpen
            ? "0 18px 42px rgba(0,0,0,0.42)"
            : toastOpen || systemAlertOpen
            ? "0 10px 30px rgba(0,0,0,0.30)"
            : "0 4px 16px rgba(0,0,0,0.20)",
          width:        pillW,
          height:       pillH,
          borderRadius: confirmOpen || trackHubOpen || trackHubAssistantOpen
            ? "28px"
            : trackHubActivitiesOpen
            ? "26px"
            : systemAlertOpen || trackHubAlertPeekOpen
            ? "24px"
            : toastOpen
            ? "22px"
            : "21px",
          transition: reduceTrackHubMotion ? "none" : isExpandedIsland
            ? [
                "width 290ms cubic-bezier(0.16, 1, 0.3, 1)",
                "height 310ms cubic-bezier(0.16, 1, 0.3, 1)",
                "border-radius 290ms cubic-bezier(0.16, 1, 0.3, 1)",
                "transform 240ms cubic-bezier(0.22, 1.16, 0.36, 1)",
                "opacity 150ms ease",
              ].join(", ")
            : [
                "height 240ms cubic-bezier(0.22, 1, 0.36, 1)",
                "width 260ms cubic-bezier(0.22, 1, 0.36, 1) 10ms",
                "border-radius 250ms cubic-bezier(0.22, 1, 0.36, 1)",
                "transform 200ms cubic-bezier(0.22, 1.16, 0.36, 1)",
                "opacity 140ms ease",
              ].join(", "),
          animation: pillShellAnimation,
          willChange: reduceTrackHubMotion || (!isExpandedIsland && !pillSlide) ? "auto" : "transform, opacity",
          transformOrigin: "center top",
          opacity: hideTrackHub ? 0 : 1,
          pointerEvents: hideTrackHub ? "none" : "auto",
        }}
      >
        {/* Subtle obsidian top rim light */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-0 h-px rounded-full opacity-70"
          style={{
            background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 100%)",
          }}
        />

        {/* ── Layer -1: Dynamic Island Confirm Dialog ─────────────────────── */}
        <div
          className="absolute top-0 left-1/2 w-[430px] max-w-[calc(100vw-24px)] p-4 flex flex-col justify-between"
          style={{
            height: "148px",
            contain: "layout style paint",
            visibility: confirmOpen ? "visible" : "hidden",
            opacity: confirmOpen ? 1 : 0,
            transform: confirmOpen ? "translate3d(-50%, 0, 0) scale(1)" : "translate3d(-50%, -8px, 0) scale(0.9)",
            transition: reduceTrackHubMotion ? "none" : confirmOpen
              ? "opacity 180ms 55ms ease, transform 320ms 35ms cubic-bezier(0.22, 1.2, 0.36, 1), visibility 0s"
              : "opacity 70ms ease, transform 90ms ease, visibility 0s 90ms",
            pointerEvents: confirmOpen ? "auto" : "none",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
              activeConfirm?.variant === "danger"
                ? "bg-red-500/20 text-red-400"
                : activeConfirm?.variant === "warning"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-blue-500/20 text-blue-400"
            }`}>
              {activeConfirm?.icon ?? <AlertTriangle size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-tight">
                {activeConfirm?.title}
              </p>
              <div className="text-[11.5px] text-white/65 mt-1 leading-relaxed line-clamp-2">
                {activeConfirm?.message}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={activeConfirm?.onCancel}
              className="flex-1 py-2 rounded-xl border border-white/10 text-xs font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-all"
            >
              {activeConfirm?.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              onClick={activeConfirm?.onConfirm}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                activeConfirm?.variant === "danger"
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-red-600/30"
                  : activeConfirm?.variant === "warning"
                  ? "bg-amber-500 hover:bg-amber-400 text-white shadow-amber-500/30"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30"
              }`}
            >
              {activeConfirm?.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>

        {/* ── Layer 0: Toast / Notification state (shown when hubToast active) ── */}
        <div
          className="absolute top-0 left-1/2 flex items-center gap-2.5 px-3.5"
          style={{
            width: hubToast?.action ? "min(430px, calc(100vw - 24px))" : "min(360px, calc(100vw - 32px))",
            height: "48px",
            contain: "layout style paint",
            visibility: toastOpen ? "visible" : "hidden",
            opacity:    toastOpen ? 1 : 0,
            transform:  toastOpen ? "translate3d(-50%, 0, 0) scale(1)" : "translate3d(-50%, -4px, 0) scale(0.9)",
            transition: reduceTrackHubMotion ? "none" : toastOpen
              ? "opacity 180ms 65ms ease, transform 300ms 45ms cubic-bezier(0.22, 1.2, 0.36, 1), visibility 0s"
              : "opacity 65ms ease, transform 80ms ease, visibility 0s 80ms",
            pointerEvents: toastOpen && hubToast?.action ? "auto" : "none",
          }}
        >
          {/* Icon dot */}
          <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
            hubToast?.type === "error"
              ? "bg-rose-500/20 text-rose-300"
              : hubToast?.type === "info"
              ? hubToast?.msg.toLowerCase().includes("dark")
                ? "bg-teal-500/25 text-teal-300"
                : hubToast?.msg.toLowerCase().includes("light")
                ? "bg-amber-500/25 text-amber-300"
                : "bg-blue-500/20 text-blue-300"
              : "bg-emerald-500/20 text-emerald-300"
          }`}>
            {hubToast?.type === "error" ? "✕" : hubToast?.type === "info" ? (hubToast.msg.toLowerCase().includes("dark") ? "🌙" : hubToast.msg.toLowerCase().includes("light") ? "☀️" : "ℹ") : "✓"}
          </span>
          <span className="min-w-0 flex-1 text-xs font-semibold text-white/95 leading-tight truncate">
            {hubToast?.msg}
          </span>
          {hubToast?.action && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const act = hubToast.action;
                  if (hubToastTimer.current) clearTimeout(hubToastTimer.current);
                  setHubToast(null);
                  act?.onClick();
                }}
                className="rounded-full bg-white/15 hover:bg-white/25 px-2.5 py-1 text-[10px] font-bold text-white transition-colors"
              >
                {hubToast.action.label}
              </button>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={e => {
                  e.stopPropagation();
                  if (hubToastTimer.current) clearTimeout(hubToastTimer.current);
                  setHubToast(null);
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          )}
        </div>

        {/* ── Layer 0.5: Urgent System Alert (Out-of-stock / Critical) ────── */}
        <div
          role="alert"
          aria-live="assertive"
          className="absolute top-0 left-1/2 flex items-center gap-3 px-4"
          style={{
            width: "min(490px, calc(100vw - 24px))",
            height: "76px",
            contain: "layout style paint",
            visibility: systemAlertOpen ? "visible" : "hidden",
            opacity: systemAlertOpen ? 1 : 0,
            transform: systemAlertOpen ? "translate3d(-50%, 0, 0) scale(1)" : "translate3d(-50%, -6px, 0) scale(0.9)",
            transition: reduceTrackHubMotion ? "none" : systemAlertOpen
              ? "opacity 180ms 55ms ease, transform 320ms 40ms cubic-bezier(0.22, 1.2, 0.36, 1), visibility 0s"
              : "opacity 65ms ease, transform 80ms ease, visibility 0s 80ms",
            pointerEvents: systemAlertOpen ? "auto" : "none",
          }}
          onClick={e => e.stopPropagation()}
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500/20 border border-rose-500/35 text-rose-400">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white leading-tight">
              {systemAlert?.title}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/70 leading-tight">
              {systemAlert?.body}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPage("stock-alerts");
              setSystemAlert(null);
              loadAll(false);
            }}
            className="flex-shrink-0 rounded-full bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-md shadow-blue-600/30 transition-colors"
          >
            Reorder Now
          </button>
          <button
            type="button"
            aria-label="Dismiss alert"
            onClick={() => setSystemAlert(null)}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* ── Layer 1: Collapsed pill (Concentric stadium padding: 6px all around 28px controls) ── */}
        <div
          ref={collapsedMeasureRef}
          className="absolute top-0 left-1/2 h-full inline-flex w-max items-center px-[6px] cursor-pointer hover:bg-white/[0.04] motion-reduce:transition-none"
          style={{
            contain: "layout style paint",
            visibility: (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || trackHubActivitiesOpen || toastOpen || systemAlertOpen) ? "hidden" : "visible",
            opacity:    (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || trackHubActivitiesOpen || toastOpen || systemAlertOpen) ? 0 : 1,
            transform:  (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || trackHubActivitiesOpen || toastOpen || systemAlertOpen) ? "translate3d(-50%, 0, 0) scale(0.86)" : "translate3d(-50%, 0, 0) scale(1)",
            transition: reduceTrackHubMotion ? "none" : (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || trackHubActivitiesOpen || toastOpen || systemAlertOpen)
              ? "opacity 70ms ease, transform 110ms ease, visibility 0s 110ms"
              : "opacity 160ms 55ms ease, transform 240ms 40ms cubic-bezier(0.22, 1.2, 0.36, 1), visibility 0s",
            pointerEvents: (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || trackHubActivitiesOpen || toastOpen || systemAlertOpen) ? "none" : "auto",
          }}
          onClick={() => {
            setTrackHubAlertPeekOpen(false);
            setTrackHubActivitiesOpen(false);
            setTrackHubOpen(true);
          }}
          title="Open TrackHub workspace switcher"
        >
          {smartBotEnabled && (
            <>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setTrackHubOpen(false);
                  setTrackHubAlertPeekOpen(false);
                  setTrackHubActivitiesOpen(false);
                  setTrackHubAssistantOpen(true);
                }}
                className={`flex h-[28px] flex-shrink-0 items-center gap-[6px] rounded-full px-[10px] transition-colors ${
                  trackHubAssistantOpen
                    ? "bg-blue-500/25 border border-blue-400/35 text-blue-200"
                    : "bg-white/[0.08] text-white/90 hover:bg-white/[0.14]"
                }`}
                title="Open SmartTrack Assistant"
                aria-label="Open SmartTrack Assistant"
              >
                {trackHubAssistantOpen && !reduceTrackHubMotion ? (
                  <span aria-hidden="true" className="flex items-end gap-[2px] h-[10px]">
                    <span className="w-[2px] h-full rounded-full bg-blue-300 th-beat-1" />
                    <span className="w-[2px] h-full rounded-full bg-indigo-300 th-beat-2" />
                    <span className="w-[2px] h-full rounded-full bg-cyan-300 th-beat-3" />
                  </span>
                ) : (
                  <Bot size={13} className="text-blue-300 flex-shrink-0" />
                )}
                <span className="text-[11px] font-semibold leading-none whitespace-nowrap">Assistant</span>
              </button>
              <span aria-hidden="true" className="mx-[8px] h-[16px] w-px flex-shrink-0 bg-white/[0.12]" />
            </>
          )}

          {/* Active section identity ONLY (stays static — no fake animation on page tabs) */}
          <div
            key={page}
            className="flex items-center gap-[8px] min-w-0 max-w-[164px]"
            style={{
              animation: pillSlide && !reduceTrackHubMotion ? "th-pill-content-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both" : "none",
            }}
          >
            <span className="w-[28px] h-[28px] rounded-[10px] border border-blue-400/30 bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <ActiveIcon size={14} className="text-blue-400" />
            </span>
            <span className="text-[12.5px] font-semibold text-white/95 tracking-tight leading-none whitespace-nowrap truncate">
              {activeLabel}
            </span>
          </div>

          {/* Switcher chevron / live Sync Arc -> Checkmark Draw morph */}
          <div
            className={`w-[28px] h-[28px] rounded-full flex items-center justify-center flex-shrink-0 ml-[14px] motion-reduce:transition-none ${
              syncJustCompleted ? "bg-emerald-500/20" : refreshing ? "bg-sky-500/20" : "bg-white/[0.08]"
            }`}
            style={{ transition: reduceTrackHubMotion ? "none" : "background-color 150ms ease" }}
          >
            {refreshing ? (
              <svg aria-label="Syncing" className={!reduceTrackHubMotion ? "th-arc-spin" : ""} width="13" height="13" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.22)" strokeWidth="2.8" />
                <path d="M12 3a9 9 0 0 1 9 9" stroke="#38bdf8" strokeWidth="2.8" strokeLinecap="round" />
              </svg>
            ) : syncJustCompleted ? (
              <svg aria-label="Synced" width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path className={!reduceTrackHubMotion ? "th-check-draw" : ""} d="M6 12.5l4 4 8-9" stroke="#34d399" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <ChevronDown size={12} className="text-white/60" />
            )}
          </div>
        </div>

        {/* ── Layer 1.5: Compact pharmacy alert peek carousel ────────────── */}
        <div
          role="region"
          aria-label="Pharmacy alert summary"
          className="absolute top-0 left-1/2 flex items-center gap-1.5 px-3 motion-reduce:transition-none"
          style={{
            width: "min(520px, calc(100vw - 24px))",
            height: "56px",
            contain: "layout style paint",
            visibility: !confirmOpen && trackHubAlertPeekOpen && !trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen ? "visible" : "hidden",
            opacity: !confirmOpen && trackHubAlertPeekOpen && !trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen ? 1 : 0,
            transform: !confirmOpen && trackHubAlertPeekOpen && !trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen ? "translate3d(-50%, 0, 0) scale(1)" : "translate3d(-50%, -4px, 0) scale(0.9)",
            transition: reduceTrackHubMotion
              ? "none"
              : trackHubAlertPeekOpen
              ? "opacity 160ms 45ms ease, transform 290ms 30ms cubic-bezier(0.22, 1.2, 0.36, 1), visibility 0s"
              : "opacity 65ms ease, transform 85ms ease, visibility 0s 85ms",
            pointerEvents: !confirmOpen && trackHubAlertPeekOpen && !trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen ? "auto" : "none",
          }}
        >
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${
            activeAlertItem
              ? activeAlertItem.tone === "danger"
                ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]"
                : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
              : pharmacyHealth.dotClass
          } ${pharmacyHealth.pulse && trackHubAlertPeekOpen ? "animate-pulse motion-reduce:animate-none" : ""}`} />
          {activeAlertItem ? (
            <>
              {urgentAlertItems.length > 1 && (
                <span className="flex-shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white/75">
                  {((alertPeekIdx % urgentAlertItems.length) + urgentAlertItems.length) % urgentAlertItems.length + 1}/{urgentAlertItems.length}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-white/95 leading-tight">{activeAlertItem.label}</p>
                <p className={`truncate text-[9.5px] font-medium leading-tight ${activeAlertItem.tone === "danger" ? "text-rose-300" : "text-amber-300"}`}>
                  {activeAlertItem.detail}
                </p>
              </div>
              {urgentAlertItems.length > 1 && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    aria-label="Previous alert"
                    onClick={e => {
                      e.stopPropagation();
                      setAlertPeekIdx(i => (i - 1 + urgentAlertItems.length) % urgentAlertItems.length);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next alert"
                    onClick={e => {
                      e.stopPropagation();
                      setAlertPeekIdx(i => (i + 1) % urgentAlertItems.length);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  setTrackHubAlertPeekOpen(false);
                  setTrackHubOpen(false);
                  if (isInventoryManager) {
                    handleStockAlertEditProduct(activeAlertItem.product);
                  } else {
                    setPage("stock-alerts");
                  }
                }}
                className="flex flex-shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.14] px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-white/[0.24] active:scale-95 motion-reduce:transition-none"
              >
                {isInventoryManager ? "Restock" : "Review"}
              </button>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  setTrackHubAlertPeekOpen(false);
                  setPage("stock-alerts");
                }}
                className="flex-shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-white/80 hover:bg-white/[0.16] hover:text-white transition-colors active:scale-95"
              >
                All
              </button>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/85" title={pharmacyAlertPeek}>
                {pharmacyAlertPeek}
              </span>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  setTrackHubAlertPeekOpen(false);
                  setTrackHubOpen(false);
                  setPage("stock-alerts");
                }}
                className="flex flex-shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.12] px-3 py-1.5 text-[10px] font-semibold text-white/95 transition-colors hover:bg-white/[0.22] active:scale-95 motion-reduce:transition-none"
              >
                Review Alerts
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setTrackHubAlertPeekOpen(false)}
            aria-label="Close alert summary"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition-colors hover:bg-white/[0.14] hover:text-white motion-reduce:transition-none"
          >
            <X size={12} />
          </button>
        </div>

        {/* ── Layer 1.75: Multi-Activity Live Stack (Split Orb expanded) ──── */}
        <div
          role="region"
          aria-label="Live pharmacy activities"
          className="absolute top-0 left-1/2 px-3.5 pt-3 pb-3 flex flex-col justify-between overflow-hidden"
          style={{
            width: "min(520px, calc(100vw - 24px))",
            height: activitiesHeight,
            contain: "layout style paint",
            backfaceVisibility: "hidden",
            visibility: (!confirmOpen && trackHubActivitiesOpen && !trackHubOpen && !trackHubAssistantOpen) ? "visible" : "hidden",
            opacity: (!confirmOpen && trackHubActivitiesOpen && !trackHubOpen && !trackHubAssistantOpen) ? 1 : 0,
            transform: (!confirmOpen && trackHubActivitiesOpen && !trackHubOpen && !trackHubAssistantOpen)
              ? "translate3d(-50%, 0, 0) scale(1)"
              : "translate3d(-50%, -6px, 0) scale(0.95)",
            transition: reduceTrackHubMotion ? "none" : (!confirmOpen && trackHubActivitiesOpen && !trackHubOpen && !trackHubAssistantOpen)
              ? "opacity 170ms 40ms ease, transform 270ms 20ms cubic-bezier(0.16, 1, 0.3, 1), visibility 0s"
              : "opacity 70ms ease, transform 85ms ease, visibility 0s 85ms",
            pointerEvents: (!confirmOpen && trackHubActivitiesOpen && !trackHubOpen && !trackHubAssistantOpen) ? "auto" : "none",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-400 animate-pulse motion-reduce:animate-none" />
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/85">
                Live Activities
              </span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white/75">
                {liveActivities.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setTrackHubActivitiesOpen(false);
                  setTrackHubOpen(true);
                }}
                className="rounded-full bg-white/[0.08] hover:bg-white/[0.16] px-2.5 py-0.5 text-[10px] font-medium text-white/80 hover:text-white transition-colors"
              >
                Navigation
              </button>
              <button
                type="button"
                onClick={() => setTrackHubActivitiesOpen(false)}
                aria-label="Close live activities"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          </div>

          <div className="mt-2.5 space-y-2 flex-1 overflow-y-auto">
            {liveActivities.map(act => {
              if (act.id === "urgent-alert" && activeAlertItem) {
                return (
                  <div
                    key={act.id}
                    className="flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-white/[0.05] px-3 py-2"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300">
                      <AlertTriangle size={14} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-semibold text-white/95 leading-tight">
                          {activeAlertItem.label}
                        </p>
                        {urgentAlertItems.length > 1 && (
                          <span className="flex-shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white/75 leading-none">
                            {((alertPeekIdx % urgentAlertItems.length) + urgentAlertItems.length) % urgentAlertItems.length + 1}/{urgentAlertItems.length}
                          </span>
                        )}
                      </div>
                      <p className={`mt-0.5 truncate text-[10px] font-medium leading-tight ${
                        activeAlertItem.tone === "danger" ? "text-rose-300" : "text-amber-300"
                      }`}>
                        {activeAlertItem.detail}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {urgentAlertItems.length > 1 && (
                        <>
                          <button
                            type="button"
                            aria-label="Previous alert"
                            onClick={() => setAlertPeekIdx(i => (i - 1 + urgentAlertItems.length) % urgentAlertItems.length)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                          >
                            <ChevronLeft size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label="Next alert"
                            onClick={() => setAlertPeekIdx(i => (i + 1) % urgentAlertItems.length)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTrackHubActivitiesOpen(false);
                          if (isInventoryManager) {
                            handleStockAlertEditProduct(activeAlertItem.product);
                          } else {
                            setPage("stock-alerts");
                          }
                        }}
                        className="rounded-full bg-rose-500 hover:bg-rose-400 px-2.5 py-1 text-[10px] font-bold text-white transition-colors"
                      >
                        {isInventoryManager ? "Restock" : "Review"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTrackHubActivitiesOpen(false);
                          setPage("stock-alerts");
                        }}
                        className="rounded-full bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] font-medium text-white/80 hover:text-white transition-colors"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuietedAlertSignature(urgentDangerSignature)}
                        title="Mute alert orb until urgent items change"
                        className="rounded-full bg-white/[0.07] hover:bg-white/15 px-2 py-1 text-[10px] font-medium text-white/60 hover:text-white transition-colors"
                      >
                        Quiet
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={act.id}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2"
                >
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                    act.tone === "emerald"
                      ? "bg-emerald-500/20 border border-emerald-400/30 text-emerald-300"
                      : "bg-rose-500/20 border border-rose-400/30 text-rose-300"
                  }`}>
                    {act.id === "paused-cart" && <ShoppingCart size={14} />}
                    {act.id === "urgent-alert" && <AlertTriangle size={14} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/95 leading-tight">{act.title}</p>
                    <p className="mt-0.5 truncate text-[10px] text-white/60 leading-tight">{act.subtitle}</p>
                  </div>

                  {act.id === "paused-cart" && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setTrackHubActivitiesOpen(false);
                          setShowAddSale(true);
                        }}
                        className="rounded-full bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1 text-[10px] font-bold text-black transition-colors"
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTrackHubActivitiesOpen(false);
                          setConfirmDiscardCart(true);
                        }}
                        className="rounded-full bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] font-medium text-white/75 hover:text-white transition-colors"
                      >
                        Discard
                      </button>
                    </div>
                  )}

                  {act.id === "urgent-alert" && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setTrackHubActivitiesOpen(false);
                          setPage("stock-alerts");
                        }}
                        className="rounded-full bg-rose-500 hover:bg-rose-400 px-2.5 py-1 text-[10px] font-bold text-white transition-colors"
                      >
                        View All
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuietedAlertSignature(urgentDangerSignature)}
                        title="Hide alert orb until stockouts/expiries change"
                        className="rounded-full bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] font-medium text-white/75 hover:text-white transition-colors"
                      >
                        Quiet
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* TrackHub expands into the assistant itself, embedded in the island pill. */}
        <div
          className="absolute top-0 left-1/2 flex flex-col overflow-hidden"
          style={{
            width: "min(570px, calc(100vw - 24px))",
            height: assistantHubHeight,
            contain: "strict",
            backfaceVisibility: "hidden",
            visibility: (!confirmOpen && trackHubAssistantOpen) ? "visible" : "hidden",
            opacity: (!confirmOpen && trackHubAssistantOpen) ? 1 : 0,
            transform: (!confirmOpen && trackHubAssistantOpen) ? "translate3d(-50%, 0, 0) scale(1)" : "translate3d(-50%, -6px, 0) scale(0.97)",
            willChange: (!confirmOpen && trackHubAssistantOpen) ? "transform, opacity" : "auto",
            transition: reduceTrackHubMotion ? "none" : (!confirmOpen && trackHubAssistantOpen)
              ? "opacity 180ms 45ms ease, transform 260ms 20ms cubic-bezier(0.16, 1, 0.3, 1), visibility 0s"
              : "opacity 80ms ease, transform 90ms ease, visibility 0s 90ms",
            pointerEvents: (!confirmOpen && trackHubAssistantOpen) ? "auto" : "none",
          }}
        >
          <CommandAssistant
            user={user}
            inventory={inventory}
            transactions={transactions}
            allowedPages={allowedPages}
            onNavigate={handleCommandNavigate}
            onOpenNewSale={handleCommandOpenNewSale}
            onOpenAddProduct={handleCommandOpenAddProduct}
            enabled={smartBotEnabled}
            mode="trackhub"
            open={trackHubAssistantOpen}
            onOpenChange={next => {
              setTrackHubAssistantOpen(next);
              if (next) {
                setTrackHubOpen(false);
                setTrackHubActivitiesOpen(false);
              }
            }}
          />
        </div>

        {/* ── Layer 2: Expanded hub (Compact Apple Control Center + Horizontal Pages) ── */}
        <div
          className="absolute top-0 left-1/2 px-[16px] pt-[12px] pb-[12px] flex flex-col"
          style={{
            width: "min(580px, calc(100vw - 24px))",
            height: expandedHubHeight,
            contain: "strict",
            backfaceVisibility: "hidden",
            visibility: (!confirmOpen && trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen) ? "visible" : "hidden",
            opacity:    (!confirmOpen && trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen) ? 1 : 0,
            transform:  (!confirmOpen && trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen) ? "translate3d(-50%, 0, 0) scale(1)" : "translate3d(-50%, -6px, 0) scale(0.96)",
            willChange: (!confirmOpen && trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen) ? "transform, opacity" : "auto",
            transition: reduceTrackHubMotion ? "none" : (!confirmOpen && trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen)
              ? "opacity 170ms 40ms ease, transform 260ms 20ms cubic-bezier(0.16, 1, 0.3, 1), visibility 0s"
              : "opacity 70ms ease, transform 85ms ease, visibility 0s 85ms",
            pointerEvents: (!confirmOpen && trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen) ? "auto" : "none",
          }}
        >
          {/* Compact Top Bar: Role Switcher + Unified Store Stock Pill + Close */}
          <div className="flex items-center justify-between gap-[8px] pb-[8px] border-b border-white/[0.07] px-[2px]">
            <div className="flex items-center gap-1.5 min-w-0">
              {(user.roles?.length ?? 0) > 1 ? (
                <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Quick role switch">
                  {(user.roles ?? [user.role]).map(role => {
                    const active = user.role === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        disabled={roleActionBusy}
                        onClick={e => {
                          e.stopPropagation();
                          if (!active) activateRole(role);
                          setTrackHubOpen(false);
                        }}
                        className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold transition-colors flex-shrink-0 ${
                          active
                            ? "bg-blue-500/25 border border-blue-400/40 text-blue-200"
                            : "bg-white/[0.06] border border-white/10 text-white/55 hover:bg-white/[0.12] hover:text-white"
                        }`}
                      >
                        {ROLE_LABELS[role] ?? role}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/10 text-white/80 flex-shrink-0">
                  {isAdmin ? "Admin / Owner" : isInventoryManager ? "Inventory Manager" : "Cashier"}
                </span>
              )}

              {/* Compact interactive Store Stock Monitor pill (completely distinct from nav modules) */}
              <button
                type="button"
                title={pharmacyAlertPeek}
                onClick={e => {
                  e.stopPropagation();
                  setTrackHubOpen(false);
                  if (urgentAlertItems.length > 0) {
                    setTrackHubAlertPeekOpen(true);
                  } else {
                    navigateTo("stock-alerts");
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold transition-colors flex-shrink-0 ${
                  hasUrgentPharmacyAlerts
                    ? "border-rose-400/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                    : hasPharmacyWarnings
                    ? "border-amber-400/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : "border-emerald-400/25 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/20"
                }`}
              >
                <span className="relative flex h-2 w-2 items-center justify-center flex-shrink-0">
                  {hasUrgentPharmacyAlerts && trackHubOpen && !reduceTrackHubMotion && (
                    <span className="th-radar-ring absolute inline-flex h-full w-full rounded-full bg-rose-400" />
                  )}
                  <span className={`relative h-1.5 w-1.5 rounded-full ${pharmacyHealth.dotClass}`} />
                </span>
                <span>
                  {totalAlertBadge > 0 ? `Stock · ${totalAlertBadge} alerts` : "Stock · Healthy"}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {hubPages.length > 1 && (
                <div className="flex items-center gap-0.5 mr-0.5">
                  <button
                    type="button"
                    aria-label="Previous modules page"
                    disabled={safeHubGridPage === 0}
                    onClick={e => {
                      e.stopPropagation();
                      setHubGridPage(p => Math.max(0, p - 1));
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next modules page"
                    disabled={safeHubGridPage >= hubPages.length - 1}
                    onClick={e => {
                      e.stopPropagation();
                      setHubGridPage(p => Math.min(hubPages.length - 1, p + 1));
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={11} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setTrackHubOpen(false); }}
                className="w-5 h-5 flex-shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center motion-reduce:transition-none"
                style={{ transition: reduceTrackHubMotion ? "none" : "background-color 150ms ease, color 150ms ease" }}
                title="Close (Esc)"
              >
                <X size={10} />
              </button>
            </div>
          </div>

          {/* Horizontal Paged 4x2 Module Deck (fixed height regardless of total module count) */}
          <div
            className="mt-[8px] overflow-hidden flex-shrink-0"
            onWheel={e => {
              if (hubPages.length <= 1) return;
              const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
              if (Math.abs(delta) < 16) return;
              const now = Date.now();
              if (now - hubWheelCooldownRef.current < 260) return;
              hubWheelCooldownRef.current = now;
              setHubGridPage(p =>
                delta > 0 ? Math.min(hubPages.length - 1, p + 1) : Math.max(0, p - 1)
              );
            }}
          >
            <div
              className="flex"
              style={{
                transform: `translate3d(-${safeHubGridPage * 100}%, 0, 0)`,
                transition: reduceTrackHubMotion ? "none" : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {hubPages.map((pageSlice, sliceIdx) => (
                <div
                  key={sliceIdx}
                  className={`w-full flex-shrink-0 grid gap-[6px] ${
                    navItems.length > 8 ? "grid-cols-5" : navItems.length <= 6 ? "grid-cols-3" : "grid-cols-4"
                  }`}
                >
                  {pageSlice.map((item, idx) => {
                    const isActive  = item.id === page;
                    const isPressed = pressedItem === item.id;
                    const showBadge = item.id === "stock-alerts" && (item.badge ?? 0) > 0;
                    return (
                      <div
                        key={item.id}
                        className={!confirmOpen && trackHubOpen && !trackHubAssistantOpen && !trackHubActivitiesOpen && !reduceTrackHubMotion && sliceIdx === safeHubGridPage ? "th-hub-tile-open" : ""}
                        style={{ "--th-delay": `${25 + Math.min(idx, 7) * 12}ms` } as React.CSSProperties}
                      >
                        <button
                          type="button"
                          onPointerDown={() => setPressedItem(item.id)}
                          onPointerUp={()   => setPressedItem(null)}
                          onPointerLeave={() => setPressedItem(null)}
                          onClick={() => {
                            setPressedItem(null);
                            setTrackHubOpen(false);
                            setTrackHubAlertPeekOpen(false);
                            setTrackHubActivitiesOpen(false);
                            navigateTo(item.id);
                          }}
                          className={`w-full group relative flex flex-col items-center justify-center py-[6px] px-[4px] rounded-2xl focus:outline-none select-none ${
                            isActive
                              ? "bg-white/[0.11] border border-white/[0.20]"
                              : "border border-transparent hover:bg-white/[0.06]"
                          } motion-reduce:transition-none`}
                          style={{
                            transform:  isPressed ? "scale(0.92)" : "scale(1)",
                            transition: reduceTrackHubMotion ? "none" : isPressed
                              ? "transform 70ms cubic-bezier(0.32, 0.72, 0, 1), background-color 70ms ease"
                              : "transform 220ms cubic-bezier(0.22, 1.2, 0.36, 1), background-color 150ms ease, border-color 150ms ease",
                          }}
                        >
                          <div className="relative mb-[4px]">
                            <div
                              className={`w-[32px] h-[32px] rounded-xl border flex items-center justify-center ${
                                isPressed
                                  ? "bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                                  : isActive
                                  ? TRACKHUB_TILE_STYLE.activeBox
                                  : TRACKHUB_TILE_STYLE.box
                              }`}
                              style={{
                                transform: isPressed ? "scale(0.88)" : "scale(1)",
                                transition: reduceTrackHubMotion ? "none" : isPressed
                                  ? "transform 70ms cubic-bezier(0.32, 0.72, 0, 1)"
                                  : "transform 240ms cubic-bezier(0.22, 1.2, 0.36, 1), background-color 150ms ease",
                              }}
                            >
                              <item.icon size={15} className={isPressed ? "text-white" : TRACKHUB_TILE_STYLE.icon} />
                            </div>
                            {showBadge && (
                              <span className="absolute -top-1 -right-1.5 min-w-[15px] h-3.5 px-1 bg-amber-400 rounded-full text-[8px] text-black flex items-center justify-center font-bold shadow-xs leading-none tabular-nums">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] leading-tight text-center line-clamp-1 w-full px-0.5 ${
                              isActive ? "text-white font-semibold" : "text-white/65 group-hover:text-white font-medium"
                            }`}
                            style={{ transition: reduceTrackHubMotion ? "none" : "color 150ms ease" }}
                          >
                            {item.label}
                          </span>
                          {isActive && (
                            <span className="w-1 h-1 rounded-full bg-white/90 mt-0.5 shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Apple Page Dots (when modules span >1 slide) */}
          {hubPages.length > 1 && (
            <div className="mt-[4px] flex items-center justify-center gap-[6px]">
              {hubPages.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  type="button"
                  aria-label={`Go to modules page ${dotIdx + 1}`}
                  onClick={e => {
                    e.stopPropagation();
                    setHubGridPage(dotIdx);
                  }}
                  className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${
                    safeHubGridPage === dotIdx
                      ? "w-4 bg-white/90"
                      : "w-1.5 bg-white/25 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}

          {hasPausedCart && pausedCartSummary && (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <ShoppingCart size={12} className="text-emerald-300 flex-shrink-0" />
                <span className="truncate text-[10.5px] font-semibold text-emerald-100">
                  Paused POS Cart · {pausedCartSummary.count} item{pausedCartSummary.count === 1 ? "" : "s"} ({fmt(pausedCartSummary.total)})
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setTrackHubOpen(false);
                    setShowAddSale(true);
                  }}
                  className="rounded-full bg-emerald-500 hover:bg-emerald-400 px-2.5 py-0.5 text-[10px] font-bold text-black transition-colors"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setTrackHubOpen(false);
                    setConfirmDiscardCart(true);
                  }}
                  className="rounded-full bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white/75 hover:text-white transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* Compact Utilities & Quick Actions Dock */}
          <div className="mt-1.5 pt-2 border-t border-white/[0.07] flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTrackHubOpen(false);
                  navigateTo("activity-log");
                }}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  page === "activity-log"
                    ? "bg-white/15 border-white/25 text-white"
                    : "bg-white/[0.06] border-white/10 text-white/70 hover:bg-white/[0.12] hover:text-white"
                }`}
              >
                <Activity size={10} /> Activity
              </button>
              {(isAdmin || isInventoryManager) && (
                <button
                  type="button"
                  onClick={() => {
                    setTrackHubOpen(false);
                    navigateTo("recycle-bin");
                  }}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    page === "recycle-bin"
                      ? "bg-rose-500/20 border-rose-400/35 text-rose-200"
                      : "bg-white/[0.06] border-white/10 text-white/70 hover:bg-white/[0.12] hover:text-white"
                  }`}
                >
                  <Trash2 size={10} /> Recycle Bin
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {canSell && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setTrackHubOpen(false);
                    setShowAddSale(true);
                  }}
                  className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/25 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors flex-shrink-0"
                >
                  <Plus size={11} /> New Sale
                </button>
              )}
              {isInventoryManager && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setTrackHubOpen(false);
                    setShowAddProduct(true);
                  }}
                  className="flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-400/25 px-2.5 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors flex-shrink-0"
                >
                  <Plus size={11} /> Add Product
                </button>
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setTrackHubOpen(false);
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 60);
                }}
                className="flex items-center gap-1 rounded-full bg-white/[0.08] border border-white/10 px-2.5 py-1 text-[10px] font-medium text-white/80 hover:bg-white/[0.15] hover:text-white transition-colors flex-shrink-0"
              >
                <Search size={10} /> Find
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  // Shared settings panel content (used in both TrackHub and sidebar topbars)
  const settingsPanelContent = useMemo(() => (
    <div className="space-y-4">
      {/* ── Account & Active Role (Apple ID Banner Style) ── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between px-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Account</p>
          <InfoTip
            title="Account Roles"
            lines={[
              "Switch active roles to adjust available navigation and permissions without signing out.",
              { label: "Minimum role", value: "At least one role must remain assigned to your account" },
            ]}
          />
        </div>
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/12 text-xs font-semibold text-primary">
              {user.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground leading-tight">{user.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
          </div>
          <div role="group" aria-label="Available account roles" className="px-2 py-2">
            {(user.roles?.length ? user.roles : [user.role]).map(role => (
              <div key={role} className="flex items-center gap-2 rounded-xl px-1.5 py-0.5 transition-colors hover:bg-muted/50">
                <button
                  type="button"
                  aria-pressed={user.role === role}
                  disabled={roleActionBusy}
                  onClick={() => activateRole(role)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-transform active:scale-[0.98] disabled:cursor-wait"
                >
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                    user.role === role ? "border-primary" : "border-muted-foreground/50"
                  }`}>
                    {user.role === role && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{ROLE_LABELS[role] ?? role}</span>
                  {user.role === role && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">Active</span>}
                </button>
                <button
                  type="button"
                  disabled={roleActionBusy || (user.roles?.length ?? 1) <= 1}
                  onClick={() => setRoleToRemove(role)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-rose-400"
                  title={(user.roles?.length ?? 1) <= 1 ? "Your account must keep at least one role" : `Remove ${ROLE_LABELS[role] ?? role}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Appearance & Accessibility ── */}
      <div>
        <p className="mb-1.5 px-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Appearance</p>
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={settingsIconClass(darkMode ? "indigo" : "amber")}>
                {darkMode ? <Moon size={14} /> : <Sun size={14} />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Dark Mode</p>
                <p className="text-[10px] text-muted-foreground">Use a darker surface palette.</p>
              </div>
            </div>
            <SettingsSwitch
              checked={darkMode}
              label="Dark Mode"
              onToggle={() => {
                const nextMode = !darkMode;
                setDarkMode(nextMode);
                showHubToast(nextMode ? "Dark mode enabled" : "Light mode enabled", "info");
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={settingsIconClass("violet")}>
                <Palette size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Muted Colors</p>
                <p className="text-[10px] text-muted-foreground">Soften bright accents app-wide.</p>
              </div>
            </div>
            <SettingsSwitch
              checked={mutedColors}
              label="Muted Colors"
              onToggle={() => {
                const nextVal = !mutedColors;
                updateMutedColors(nextVal);
                showHubToast(nextVal ? "Muted colors enabled" : "Standard colors restored", "info");
              }}
            />
          </div>

          <div className="px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={settingsIconClass("blue")}>
                  <Type size={14} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Text Size</p>
                  <p className="text-[10px] text-muted-foreground">Scale interface typography.</p>
                </div>
              </div>
              <span className="flex-shrink-0 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                {(FONT_SCALE_OPTIONS.find(opt => opt.id === fontScale) ?? FONT_SCALE_OPTIONS[1]).sizePx}
              </span>
            </div>
            <div className="relative grid grid-cols-4 rounded-xl bg-muted/80 p-1">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-1 left-1 rounded-lg border border-border/50 bg-card shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
                style={{
                  width: "calc(25% - 0.125rem)",
                  transform: `translateX(${Math.max(0, FONT_SCALE_OPTIONS.findIndex(opt => opt.id === fontScale)) * 100}%)`,
                }}
              />
              {FONT_SCALE_OPTIONS.map(opt => {
                const active = fontScale === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateFontScale(opt.id)}
                    className={`relative z-10 flex flex-col items-center justify-center rounded-lg px-1.5 py-1.5 transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`leading-none ${active ? "font-semibold" : "font-medium"}`}
                      style={{ fontSize: `${opt.samplePx}px` }}
                    >
                      Aa
                    </span>
                    <span className={`mt-1 text-[9px] leading-none ${active ? "font-semibold" : "font-medium"}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={settingsIconClass("slate")}>
                <Rows3 size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Row Density</p>
                <p className="text-[10px] text-muted-foreground">Adjust table spacing.</p>
              </div>
            </div>
            <div className="relative grid w-[134px] flex-shrink-0 grid-cols-2 rounded-xl bg-muted/80 p-0.5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[9px] border border-border/50 bg-card shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
                style={{ width: "calc(50% - 0.125rem)", transform: `translateX(${tableDensity === "default" ? 0 : 100}%)` }}
              />
              {TABLE_DENSITY_OPTIONS.map(opt => {
                const active = tableDensity === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateTableDensity(opt.id)}
                    className={`relative z-10 rounded-[9px] px-2 py-1.5 text-[11px] transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                      active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={settingsIconClass("indigo")}>
                <Sparkles size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Reduce Motion</p>
                <p className="text-[10px] text-muted-foreground">
                  {osReduceMotion && reduceMotionPref === "system"
                    ? "Following system preference."
                    : "Minimize animations across UI."}
                </p>
              </div>
            </div>
            <SettingsSwitch
              checked={reduceMotionPref === "reduced"}
              label="Reduce Motion"
              onToggle={() => updateReduceMotionPref(reduceMotionPref === "reduced" ? "system" : "reduced")}
            />
          </div>
        </section>
      </div>

      {/* ── Interface Style & Navigation ── */}
      <div>
        <p className="mb-1.5 px-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Interface Style</p>
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
          <div className="px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={settingsIconClass("blue")}>
                  <PanelLeft size={14} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">App Look &amp; Layout</p>
                  <p className="text-[10px] text-muted-foreground">Pick easiest workflow or frosted glass UI.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTrackHubSettings(false);
                  setShowNavStyleModal(true);
                }}
                className="flex-shrink-0 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              >
                Compare
              </button>
            </div>
            <div className="relative grid grid-cols-2 rounded-xl bg-muted/80 p-1">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-1 left-1 rounded-lg border border-border/50 bg-card shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
                style={{ width: "calc(50% - 0.25rem)", transform: `translateX(${navMode === "island" ? 0 : 100}%)` }}
              />
              <button
                type="button"
                aria-pressed={navMode === "island"}
                onClick={() => {
                  setNavMode("island");
                  setShowTrackHubSettings(false);
                  showHubToast("Switched to Modern View (TrackHub)", "info");
                }}
                className={`relative z-10 rounded-lg px-2 py-1.5 text-xs transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                  navMode === "island" ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                Modern View
              </button>
              <button
                type="button"
                aria-pressed={navMode === "sidebar"}
                onClick={() => {
                  setNavMode("sidebar");
                  setShowTrackHubSettings(false);
                  showHubToast("Switched to Simple Standard (Easy View)", "info");
                }}
                className={`relative z-10 rounded-lg px-2 py-1.5 text-xs transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                  navMode === "sidebar" ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                Simple Standard
              </button>
            </div>
            <p className="mt-2 px-0.5 text-[10px] leading-snug text-muted-foreground">
              {navMode === "island"
                ? "Best Visuals · Frosted glass cards & floating TrackHub pill (compact controls)."
                : "Easiest to Use · Clean solid cards, grouped sidebar & clear button labels."}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={settingsIconClass("slate")}>
                <LogIn size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Ask After Logout</p>
                <p className="text-[10px] text-muted-foreground">Show style picker at each sign-in.</p>
              </div>
            </div>
            <SettingsSwitch
              checked={askNavOnLogin}
              label="Ask style after logout"
              onToggle={() => toggleAskNavOnLogin(!askNavOnLogin)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={settingsIconClass("blue")}>
                <Bot size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">SmartTrack Assistant</p>
                <p className="text-[10px] text-muted-foreground">Show assistant shortcut in nav.</p>
              </div>
            </div>
            <SettingsSwitch
              checked={smartBotEnabled}
              label="SmartTrack Assistant"
              onToggle={() => toggleSmartBot(!smartBotEnabled)}
            />
          </div>

          <div className={`flex items-center justify-between gap-3 px-3.5 py-2.5 transition-opacity ${navMode === "sidebar" ? "opacity-55" : ""}`}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={settingsIconClass("amber")}>
                <BellRing size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Stock Alert Orb</p>
                <p className="text-[10px] text-muted-foreground">
                  {navMode === "island" ? "Show stock badge beside TrackHub." : "Available in Modern View mode."}
                </p>
              </div>
            </div>
            <SettingsSwitch
              checked={showAlertOrb}
              label="Stock Alert Orb"
              onToggle={() => updateShowAlertOrb(!showAlertOrb)}
            />
          </div>
        </section>
      </div>

      {/* ── Workspace & System Data ── */}
      <div>
        <p className="mb-1.5 px-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Workspace &amp; System</p>
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
          <button
            type="button"
            onClick={handleToggleFullScreen}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
          >
            <span className={settingsIconClass("slate")}>
              <Maximize2 size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-foreground">Full Screen</span>
              <span className="block text-[10px] text-muted-foreground">Expand SmartTrack to fill display.</span>
            </span>
            <span className="rounded-md border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
              {isMac ? "⌃⌘F" : "F11"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setPage("activity-log"); setShowTrackHubSettings(false); }}
            className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
          >
            <span className={settingsIconClass("indigo")}>
              <ClipboardList size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground">{isAdmin ? "Activity Log" : "My Activity Log"}</span>
              <span className="block truncate text-[10px] text-muted-foreground">Audit trail of system actions</span>
            </span>
            <ChevronRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>

          {(isAdmin || isInventoryManager) && (
            <button
              type="button"
              onClick={() => { setPage("recycle-bin"); setShowTrackHubSettings(false); }}
              className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
            >
              <span className={settingsIconClass("rose")}>
                <Trash2 size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">Recycle Bin</span>
                <span className="block text-[10px] text-muted-foreground">Restore or purge deleted items</span>
              </span>
              <ChevronRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => { setShowDatabaseModal(true); setShowTrackHubSettings(false); }}
              className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
            >
              <span className={settingsIconClass("emerald")}>
                <Database size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">Offline Database &amp; Recovery</span>
                <span className="block text-[10px] text-muted-foreground">Migrations, backups &amp; data safety</span>
              </span>
              <ChevronRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </section>
      </div>
    </div>
  ), [
    user.initials,
    user.name,
    user.role,
    user.roles,
    roleActionBusy,
    activateRole,
    setRoleToRemove,
    darkMode,
    setDarkMode,
    mutedColors,
    updateMutedColors,
    fontScale,
    updateFontScale,
    tableDensity,
    updateTableDensity,
    reduceMotionPref,
    osReduceMotion,
    updateReduceMotionPref,
    showHubToast,
    navMode,
    setNavMode,
    askNavOnLogin,
    toggleAskNavOnLogin,
    setShowTrackHubSettings,
    setShowDatabaseModal,
    smartBotEnabled,
    toggleSmartBot,
    showAlertOrb,
    updateShowAlertOrb,
    handleToggleFullScreen,
    isMac,
    isAdmin,
    isInventoryManager,
    setPage,
  ]);

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: "linear-gradient(180deg, #0b1528 0%, #060b14 100%)" }}>
      <button type="button" onClick={() => setSidebar(v => !v)}
        className={`flex items-center gap-3 px-4 py-[18px] border-b border-white/[0.07] w-full hover:bg-white/[0.04] transition-colors group ${sidebarExpanded ? "text-left" : "justify-center"}`}>
        <img
          data-home-logo
          src={SMARTTRACK_LOGO_URL}
          alt="SmartTrack"
          className="w-7 h-7 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] flex-shrink-0 group-hover:scale-105 transition-transform"
        />
        {sidebarExpanded && <div className="flex-1 overflow-hidden">
          <p className="text-sm font-bold text-white leading-tight">SmartTrack</p>
          {receiptSettings?.businessName && <p className="text-[9px] text-blue-300/70 leading-tight mt-0.5">{receiptSettings.businessName}</p>}
        </div>}
      </button>

      {sidebarExpanded && (
        <div className="px-3 py-2.5 border-b border-white/[0.07]">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.05] ${isAdmin ? "bg-blue-500/15" : isInventoryManager ? "bg-amber-400/15" : "bg-violet-400/15"}`}>
            <Shield size={10} className={isAdmin ? "text-blue-300" : isInventoryManager ? "text-amber-300" : "text-violet-300"} />
            <span className={`text-[10px] font-bold ${isAdmin ? "text-blue-300" : isInventoryManager ? "text-amber-300" : "text-violet-300"}`}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 space-y-2.5 overflow-y-auto">
        {sidebarExpanded ? (
          ([
            { label: "Daily Work", ids: ["dashboard", "transactions", "inventory", "stock-alerts"] as Page[] },
            { label: "Orders & Analytics", ids: ["analytics", "purchases", "returns", "reports"] as Page[] },
            { label: "Management", ids: ["financial", "users"] as Page[] },
          ]).map(group => {
            const groupItems = navItems.filter(item => group.ids.includes(item.id));
            if (groupItems.length === 0) return null;
            return (
              <div key={group.label} className="space-y-0.5">
                <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/35">
                  {group.label}
                </p>
                {groupItems.map(item => (
                  <button type="button" key={item.id} onClick={() => navigateTo(item.id)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl st-nav-item ${page === item.id ? "bg-blue-600/25 text-blue-200 border border-blue-400/30 shadow-2xs font-bold" : "text-white/65 hover:bg-white/[0.06] hover:text-white/95 border border-transparent"}`}>
                    <item.icon size={15} className="flex-shrink-0" />
                    <span className="flex-1 text-left text-xs font-semibold">{item.label}</span>
                    {(item.badge ?? 0) > 0 && <span className="w-4 h-4 bg-amber-400 rounded-full text-[9px] text-black flex items-center justify-center font-bold">{item.badge}</span>}
                  </button>
                ))}
              </div>
            );
          })
        ) : (
          <div className="space-y-0.5">
            {navItems.map(item => (
              <button type="button" key={item.id} onClick={() => navigateTo(item.id)} title={item.label}
                className={`w-full flex items-center justify-center px-2.5 py-2.5 rounded-xl st-nav-item ${page === item.id ? "bg-blue-600/25 text-blue-200 border border-blue-400/30 shadow-2xs font-bold" : "text-white/55 hover:bg-white/[0.06] hover:text-white/95 border border-transparent"}`}>
                <item.icon size={15} className="flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </nav>

      {smartBotEnabled && (
        <CommandAssistant
          user={user}
          inventory={inventory}
          transactions={transactions}
          allowedPages={allowedPages}
          onNavigate={navigateTo}
          onOpenNewSale={handleOpenAddSale}
          onOpenAddProduct={handleOpenAddProduct}
          enabled={smartBotEnabled}
          mode="sidebar"
          sidebarExpanded={sidebarExpanded}
          onOpen={() => setSidebar(true)}
        />
      )}

      <div className={`border-t border-white/[0.07] ${sidebarExpanded ? "px-3.5 py-3" : "p-3 flex justify-center"}`}>
        {sidebarExpanded ? (
          <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 bg-white/[0.04] border border-white/[0.06]">
            <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[11px] font-semibold text-white/90 truncate tracking-tight">Active Station</p>
              <p className="text-[10px] text-emerald-400/80 font-medium truncate">Online · Tangub Pharmacy</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center" title="Active Station · Online">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 ring-4 ring-emerald-500/20" />
          </div>
        )}
      </div>
    </div>
  );

  // ── Loading state (YouTube-style Shimmer Skeleton + Glowing Top Bar) ─────────
  if (loading) {
    return <YouTubeAppSkeleton message="Synchronizing pharmacy operations…" />;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={darkMode ? "dark" : ""}>
      <YouTubeTopLoader active={refreshing} />
      {/* Floating Top Notification for Classic Sidebar Mode */}
      {navMode === "sidebar" && hubToast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200 ${hubToast.action ? "pointer-events-auto" : "pointer-events-none"}`}>
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-card border border-border shadow-md">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
              hubToast.type === "error"
                ? "bg-red-500/20 text-red-500"
                : hubToast.type === "info"
                ? hubToast.msg.toLowerCase().includes("dark")
                  ? "bg-teal-500/20 text-teal-400"
                  : hubToast.msg.toLowerCase().includes("light")
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-primary/20 text-primary"
                : "bg-emerald-500/20 text-emerald-500"
            }`}>
              {hubToast.type === "error" ? "✕" : hubToast.type === "info" ? (hubToast.msg.toLowerCase().includes("dark") ? "🌙" : hubToast.msg.toLowerCase().includes("light") ? "☀️" : "ℹ") : "✓"}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {hubToast.msg}
            </span>
            {hubToast.action && (
              <button
                type="button"
                onClick={() => {
                  const act = hubToast.action;
                  if (hubToastTimer.current) clearTimeout(hubToastTimer.current);
                  setHubToast(null);
                  act?.onClick();
                }}
                className="ml-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/25 transition-colors"
              >
                {hubToast.action.label}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="st-home-enter st-workspace-shell flex h-screen bg-background overflow-hidden">
        {/* Sidebar — only in Simple Standard mode (snaps cleanly without multi-frame full-page reflow) */}
        {navMode === "sidebar" && (
          <aside className="flex-shrink-0 overflow-hidden"
            style={{ width: sidebarExpanded ? "228px" : "52px" }}>
            {sidebarContent}
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="st-topbar flex-shrink-0 h-[56px] border-b border-border/80 flex items-center gap-3 st-shell-px bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)]" style={{ zIndex: confirmOpen ? 10005 : (toastOpen || systemAlertOpen) ? 65 : 40, position: "relative" }}>

            {navMode === "island" ? (
              /* ── TrackHub mode topbar layout ── */
              <>
                {/* Transparent SmartTrack mark */}
                <div
                  className="flex items-center gap-2.5 flex-shrink-0 cursor-pointer select-none group pr-1"
                  onClick={() => window.dispatchEvent(new CustomEvent("smarttrack:navigate", { detail: "dashboard" }))}
                  title="SmartTrack Dashboard"
                >
                  <img
                    src={SMARTTRACK_LOGO_URL}
                    alt="SmartTrack"
                    className="w-8 h-8 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.22)] transition-transform group-hover:scale-105"
                  />
                  <div className="hidden xl:flex flex-col">
                    <span className="text-[13px] font-black tracking-tight text-foreground leading-tight">
                      Smart<span className="text-blue-600 dark:text-blue-400">Track</span>
                    </span>
                    {receiptSettings?.businessName && (
                      <span className="text-[9px] text-muted-foreground/80 leading-none mt-0.5 truncate max-w-[120px]">
                        {receiptSettings.businessName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Search bar — constrained so it never overlaps centered TrackHub */}
                <div ref={searchRef} className="relative w-48 sm:w-56 md:w-64 lg:w-72 max-w-[calc(50vw-220px)] hidden sm:block flex-shrink-0" style={{ zIndex: searchOpen ? 20 : 5 }}>
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-600 dark:text-blue-400 pointer-events-none z-10" />
                  <input
                    id="smarttrack-global-search"
                    name="global_search"
                    ref={searchInputRef}
                    placeholder={isInventoryManager ? "Search products…" : "Search products, transactions…"}
                    value={searchQuery}
                    aria-label="Search products or transactions"
                    autoComplete="off"
                    onChange={e => { setSearchQuery(e.target.value); setSearchHighlight(0); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full bg-background/95 dark:bg-card/95 border-[1.5px] border-blue-500/50 hover:border-blue-500/80 rounded-full pl-10 pr-10 py-2 text-xs sm:text-[13px] text-foreground font-medium placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-xs transition-all"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => { setSearchQuery(""); setSearchOpen(false); searchInputRef.current?.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                      <X size={13} />
                    </button>
                  )}
                  {!searchQuery && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-blue-700/70 dark:text-blue-300/70 font-mono hidden lg:block pointer-events-none font-semibold">⌘K</span>
                  )}
                  {/* Search Dropdown */}
                  {searchOpen && searchQuery.length >= 2 && (
                    <div className="st-glass-popover st-dropdown-in absolute top-full left-0 right-0 mt-1.5 bg-card border border-border/80 rounded-xl shadow-[0_12px_32px_-4px_rgba(37,99,235,0.15),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden z-50">
                      {searchResults.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-muted-foreground">No results for "{searchQuery}"</div>
                      ) : (
                        <>
                          {(() => {
                            const products = searchResults.filter(r => r.kind === "product");
                            const txns     = searchResults.filter(r => r.kind === "transaction");
                            return (
                              <>
                                {products.length > 0 && (
                                  <>
                                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Products</div>
                                    {products.map((r) => {
                                      const idx = searchResults.indexOf(r);
                                      return (
                                        <button type="button" key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                          onMouseEnter={() => setSearchHighlight(idx)}
                                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                          <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                                            <Package size={11} className="text-violet-600 dark:text-violet-400" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                          </div>
                                          <ChevronRight size={13} className="text-muted-foreground/60 flex-shrink-0" />
                                        </button>
                                      );
                                    })}
                                  </>
                                )}
                                {txns.length > 0 && (
                                  <>
                                    <div className={`px-3 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest ${products.length > 0 ? "pt-2 border-t border-border mt-1" : "pt-2.5"}`}>Transactions</div>
                                    {txns.map(r => {
                                      const idx = searchResults.indexOf(r);
                                      return (
                                        <button type="button" key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                          onMouseEnter={() => setSearchHighlight(idx)}
                                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                          <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                            <ShoppingCart size={11} className="text-emerald-600 dark:text-emerald-400" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                          </div>
                                          <ChevronRight size={13} className="text-muted-foreground/60 flex-shrink-0" />
                                        </button>
                                      );
                                    })}
                                  </>
                                )}
                              </>
                            );
                          })()}
                          <div className="px-3 py-2 border-t border-border bg-muted/20 flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span><kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">↑↓</kbd> navigate</span>
                            <span><kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">↵</kbd> select</span>
                            <span><kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">Esc</kbd> close</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* TrackHub — centered between the flexible header regions */}
                <div className="flex-1" aria-hidden="true" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto" style={{ zIndex: 50 }}>
                  {trackHubNavigation}
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    aria-label="Refresh data"
                    title="Refresh data"
                    className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all disabled:opacity-60"
                  >
                    <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                  </button>
                  <div className="relative">
                    <button type="button" onClick={() => setShowNotifications(v => !v)}
                      className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all">
                      <Bell size={16} />
                      {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">{unreadCount}</span>}
                    </button>
                    {showNotifications && (
                      <NotificationPanel notifs={notifs} onMarkAll={markAllRead} onMarkOne={markOneRead}
                        onNotificationClick={handleNotificationClick}
                        onNotificationHover={setHoveredNotifPid}
                        productMap={productMap}
                        onClose={() => setShowNotifications(false)} />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAboutSystem(true)}
                    aria-label="About SmartTrack"
                    title="About SmartTrack"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <Info size={15} />
                    <span>About</span>
                  </button>
                  <div ref={trackHubSettingsRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTrackHubSettings(v => !v)}
                      aria-label="Preferences"
                      title="Preferences & Navigation Layout"
                      className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                        showTrackHubSettings ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Settings size={16} />
                    </button>
                    {showTrackHubSettings && (
                      <div className="st-glass-popover absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw_-_1.5rem))] max-h-[calc(100dvh_-_5rem)] flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_20px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_50px_rgba(0,0,0,0.6)] z-50 st-dropdown-in">
                        <div className="st-glass-popover-header flex flex-shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
                          <span className="text-[13px] font-semibold tracking-tight text-foreground">Settings</span>
                          <button type="button" onClick={() => setShowTrackHubSettings(false)} aria-label="Close settings" className="rounded-full bg-muted/60 p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={13} /></button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3.5">
                          {settingsPanelContent}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pl-2 border-l border-border">
                    <button
                      type="button"
                      onClick={() => setShowUserProfile(true)}
                      className="flex items-center gap-2 rounded-full py-0.5 px-1.5 hover:bg-muted/70 border border-transparent hover:border-border transition-all cursor-pointer group"
                      title="Manage Account Profile"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary group-hover:scale-105 group-hover:bg-primary/20 transition-all">
                        {user.initials}
                      </div>
                      <span className="hidden sm:inline text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {user.name.split(" ")[0]}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLogoutConfirm(true)}
                      className="inline-flex items-center justify-center rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] font-semibold text-foreground hover:bg-background hover:border-primary hover:text-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* ── Sidebar mode topbar layout (original) ── */
              <>
                <div className="flex-1 flex items-center justify-center px-4">
                  <div ref={searchRef} className="relative max-w-lg w-full hidden sm:block">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-600 dark:text-blue-400 pointer-events-none z-10" />
                    <input
                        id="smarttrack-global-search"
                        name="global_search"
                      ref={searchInputRef}
                      placeholder={isInventoryManager ? "Search products…" : "Search products, transactions…"}
                      value={searchQuery}
                        aria-label="Search products or transactions"
                        autoComplete="off"
                      onChange={e => { setSearchQuery(e.target.value); setSearchHighlight(0); setSearchOpen(true); }}
                      onFocus={() => setSearchOpen(true)}
                      onKeyDown={handleSearchKeyDown}
                      className="w-full bg-background/95 dark:bg-card/95 border-[1.5px] border-blue-500/50 hover:border-blue-500/80 rounded-full pl-10 pr-10 py-2 text-xs sm:text-[13px] text-foreground font-medium placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-xs transition-all"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => { setSearchQuery(""); setSearchOpen(false); searchInputRef.current?.focus(); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                        <X size={13} />
                      </button>
                    )}
                    {!searchQuery && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-blue-700/70 dark:text-blue-300/70 font-mono hidden lg:block pointer-events-none font-semibold">⌘K</span>
                    )}

                    {/* Dropdown */}
                    {searchOpen && searchQuery.length >= 2 && (
                      <div className="st-dropdown-in absolute top-full left-0 right-0 mt-1.5 bg-card border border-border/80 rounded-xl shadow-[0_12px_32px_-4px_rgba(37,99,235,0.15),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden z-50">
                        {searchResults.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-muted-foreground">No results for "{searchQuery}"</div>
                        ) : (
                          <>
                            {/* Group headers */}
                            {(() => {
                              const products = searchResults.filter(r => r.kind === "product");
                              const txns     = searchResults.filter(r => r.kind === "transaction");
                              return (
                                <>
                                  {products.length > 0 && (
                                    <>
                                      <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                        Products
                                      </div>
                                      {products.map((r) => {
                                        const idx = searchResults.indexOf(r);
                                        return (
                                          <button type="button" key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                            onMouseEnter={() => setSearchHighlight(idx)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                            <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                                              <Package size={11} className="text-violet-600 dark:text-violet-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                              <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                            </div>
                                            <ChevronRight size={13} className="text-muted-foreground/60 flex-shrink-0" />
                                          </button>
                                        );
                                      })}
                                    </>
                                  )}
                                  {txns.length > 0 && (
                                    <>
                                      <div className={`px-3 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest ${products.length > 0 ? "pt-2 border-t border-border mt-1" : "pt-2.5"}`}>
                                        Transactions
                                      </div>
                                      {txns.map(r => {
                                        const idx = searchResults.indexOf(r);
                                        return (
                                          <button type="button" key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                            onMouseEnter={() => setSearchHighlight(idx)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                            <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                              <ShoppingCart size={11} className="text-emerald-600 dark:text-emerald-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                              <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                            </div>
                                            <ChevronRight size={13} className="text-muted-foreground/60 flex-shrink-0" />
                                          </button>
                                        );
                                      })}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                            <div className="px-3 py-2 border-t border-border bg-muted/20 flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span><kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">↑↓</kbd> navigate</span>
                              <span><kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">↵</kbd> select</span>
                              <span><kbd className="px-1 py-0.5 rounded border border-border bg-background font-mono">Esc</kbd> close</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    aria-label="Refresh data"
                    title="Refresh data"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-60"
                  >
                    <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
                    <span className="hidden xl:inline">Refresh</span>
                  </button>
                  <div className="relative">
                    <button type="button" onClick={() => setShowNotifications(v => !v)}
                      aria-label="Alerts and Notifications"
                      title="Alerts and Notifications"
                      className="relative inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                      <Bell size={15} />
                      <span className="hidden lg:inline">Alerts</span>
                      {unreadCount > 0 && <span className="inline-flex min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[9px] text-white items-center justify-center font-bold leading-none">{unreadCount}</span>}
                    </button>
                    {showNotifications && (
                      <NotificationPanel notifs={notifs} onMarkAll={markAllRead} onMarkOne={markOneRead}
                        onNotificationClick={handleNotificationClick}
                        onNotificationHover={setHoveredNotifPid}
                        productMap={productMap}
                        onClose={() => setShowNotifications(false)} />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAboutSystem(true)}
                    aria-label="About SmartTrack"
                    title="About SmartTrack"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <Info size={15} />
                    <span className="hidden lg:inline">About</span>
                  </button>
                  <div ref={trackHubSettingsRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTrackHubSettings(v => !v)}
                      aria-label="Settings and Interface Style"
                      title="Settings & Interface Style"
                      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors ${
                        showTrackHubSettings ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Settings size={15} />
                      <span className="hidden lg:inline">Settings</span>
                    </button>
                    {showTrackHubSettings && (
                      <div className="st-glass-popover absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw_-_1.5rem))] max-h-[calc(100dvh_-_5rem)] flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_20px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_50px_rgba(0,0,0,0.6)] z-50 st-dropdown-in">
                        <div className="st-glass-popover-header flex flex-shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
                          <span className="text-[13px] font-semibold tracking-tight text-foreground">Settings</span>
                          <button type="button" onClick={() => setShowTrackHubSettings(false)} aria-label="Close settings" className="rounded-full bg-muted/60 p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={13} /></button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3.5">
                          {settingsPanelContent}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pl-2 border-l border-border">
                    <button
                      type="button"
                      onClick={() => setShowUserProfile(true)}
                      className="flex items-center gap-2 rounded-full py-0.5 px-1.5 hover:bg-muted/70 border border-transparent hover:border-border transition-all cursor-pointer group"
                      title="Manage Account Profile"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary group-hover:scale-105 group-hover:bg-primary/20 transition-all">
                        {user.initials}
                      </div>
                      <span className="hidden sm:inline text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {user.name.split(" ")[0]}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLogoutConfirm(true)}
                      className="inline-flex items-center justify-center rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] font-semibold text-foreground hover:bg-background hover:border-primary hover:text-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </header>

          {/* Pages */}
          <main ref={mainContentRef} className="flex-1 overflow-y-auto w-full">
            <div key={page} className="st-page-in min-h-full w-full">
            {page === "dashboard"    && <DashboardView user={user} inventory={inventory} transactions={transactions} cashierDashboard={cashierDashboard} />}
            {page === "inventory"    && <InventoryPage inventory={inventory} transactions={transactions} categories={categories}
              onAddProduct={handleOpenAddProduct} onEditProduct={handleEditInventoryProduct}
              onDeleteProduct={setDeletingProduct} onAddCategory={handleAddCategory}
              onReload={handleReloadAll} showToast={showHubToast}
              selectedProductId={selectedProductId} hoveredProductId={hoveredNotifPid}
              userRoles={userRoles} />}
            {page === "transactions" && <TransactionsPage user={user} transactions={transactions} inventory={inventory}
              selectedTransactionId={selectedTransactionId}
              showToast={showHubToast}
              onAddSale={handleOpenAddSale} onAddReturn={setReturningTx} onViewInvoice={setViewingInvoice} />}
            {page === "analytics"    && <AnalyticsPage inventory={inventory} transactions={transactions} userRoles={userRoles} onEditProduct={handleStockAlertEditProduct} showToast={showHubToast} />}
            {page === "stock-alerts" && <StockAlertsPage inventory={inventory} transactions={transactions} onGoToInventory={handleGoToInventory} onEditProduct={handleStockAlertEditProduct} userRoles={userRoles} />}
            {page === "reports"      && <ReportsPage inventory={inventory} transactions={transactions} user={user} />}
            {page === "returns" && (isAdmin || isInventoryManager) && (
              <ReturnsPage user={user} inventory={inventory} onDispositionComplete={handleReturnDispositionComplete} />
            )}
            {page === "financial"    && isAdmin && <FinancialPage user={user} showToast={showHubToast} />}
            {page === "purchases" && (isAdmin || isInventoryManager) && <PurchaseOrdersPage inventory={inventory} onInventoryChanged={handleReloadAll} userRoles={userRoles} />}
            {page === "users"        && isAdmin && <UsersPage staff={staff} currentUserId={user.id} currentUserRoles={userRoles} currentUserName={user.name} roles={roles} onAddUser={() => setShowAddUser(true)} onEditUser={setEditingUser} onDeleteUser={handleDeleteUser} onToggleStatus={handleToggleStatus} onResetPassword={handleAdminResetPassword} onCreatePassword={handleAdminCreatePassword} onRolesChanged={handleRolesChanged} />}
            {page === "activity-log" && <ActivityLogPanel isAdmin={isAdmin} />}
            {page === "recycle-bin"  && (isAdmin || isInventoryManager) && <RecycleBinPanel currentUserRoles={userRoles} currentUserName={user.name} onRestored={handleReloadAll} showToast={showHubToast} />}
            </div>
          </main>
        </div>

        {/* Modals */}
        {showAddProduct && <ProductFormModal inventory={inventory} categories={categories}
          onClose={() => setShowAddProduct(false)} onSave={handleSaveProduct} onAddCategory={handleAddCategory} />}
        {editingProduct && <ProductFormModal initial={editingProduct} inventory={inventory} categories={categories}
          suggestedBatchQty={suggestedBatchQty}
          onClose={() => { setEditingProduct(null); setSuggestedBatchQty(0); }} onSave={handleSaveProduct} onAddCategory={handleAddCategory} />}
        {deletingProduct && <DeleteConfirmModal product={deletingProduct}
          onClose={() => setDeletingProduct(null)} onConfirm={() => handleDeleteProduct(deletingProduct)} />}
        {showAddSale && (
          <NewSaleModal
            onClose={() => setShowAddSale(false)}
            onAdd={handleAddSale}
            inventory={inventory}
            currentUser={user}
            onGoToInventory={() => { setShowAddSale(false); setPage("inventory"); }}
            initialDraft={pausedSaleDraft}
            onMinimize={draft => setPausedSaleDraft(draft)}
            onDiscardDraft={() => setPausedSaleDraft(null)}
          />
        )}
        {returningTx  && <ReturnModal saleTx={returningTx} onClose={() => setReturningTx(null)} onAdd={handleReturn} inventory={inventory} currentUser={user} />}
        {showAddUser  && <UserFormModal onClose={() => setShowAddUser(false)} onSave={handleSaveUser} currentUserRoles={[user.role]} roles={roles} />}
        {editingUser  && <UserFormModal initial={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} currentUserRoles={[user.role]} roles={roles} />}
        {viewingInvoice && <InvoiceModal tx={viewingInvoice} settings={receiptSettings} inventory={inventory} onClose={() => setViewingInvoice(null)} />}
        {showAboutSystem && (
          <Modal title="About SmartTrack" onClose={() => setShowAboutSystem(false)} maxWidthClass="max-w-lg">
            <div className="space-y-5 font-sans antialiased">
              {/* Apple App Identity Hero */}
              <div className="flex flex-col items-center text-center pt-1 pb-1">
                <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-border/70 bg-gradient-to-b from-muted/50 to-card p-2.5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.14)] dark:shadow-[0_10px_28px_-6px_rgba(0,0,0,0.55)]">
                  <img src={SMARTTRACK_LOGO_URL} alt="SmartTrack" className="h-full w-full object-contain" />
                </div>
                <h3 className="mt-3.5 text-[18px] font-semibold tracking-tight text-foreground">SmartTrack</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pharmacy Operations &amp; Inventory Workspace
                </p>
                <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <span>Version 1.0.0</span>
                  <span aria-hidden="true">·</span>
                  <span>{window.smarttrack?.isElectron ? "Desktop App" : "Local Workspace"}</span>
                </span>
              </div>

              {/* Apple Settings Grouped Inset List — Core Modules */}
              <div className="space-y-1.5">
                <p className="px-1 text-[11px] font-semibold text-muted-foreground">Core Modules</p>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/25 dark:bg-white/[0.03] divide-y divide-border/50">
                  {[
                    { icon: Package, tint: "bg-sky-500/15 text-sky-600 dark:text-sky-400", title: "Inventory & Batches", desc: "Stock counts, pack sizes, earliest-expiry alerts, and batch tracking" },
                    { icon: ShoppingCart, tint: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", title: "POS & Receipts", desc: "Sales checkout, SC/PWD discounts, and automatic FIFO deduction" },
                    { icon: Truck, tint: "bg-amber-500/15 text-amber-600 dark:text-amber-400", title: "Supplier Orders & Returns", desc: "Purchase orders, deliveries, restocking, and broken write-offs" },
                    { icon: BarChart2, tint: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", title: "Analytics & Financials", desc: "SMA demand forecasts, EOQ restocking, 12% VAT, and batch COGS" },
                    { icon: Shield, tint: "bg-violet-500/15 text-violet-600 dark:text-violet-400", title: "Roles & Accountability", desc: "Role permissions, activity audit logs, and recycle bin recovery" },
                  ].map(({ icon: Icon, tint, title, desc }) => (
                    <div key={title} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tint}`}>
                        <Icon size={15} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground leading-snug">{title}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Apple About System Specs Table */}
              <div className="space-y-1.5">
                <p className="px-1 text-[11px] font-semibold text-muted-foreground">Workspace Details</p>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/25 dark:bg-white/[0.03] divide-y divide-border/50 text-xs">
                  {[
                    { label: "Active Role", value: ROLE_LABELS[user.role] ?? user.role },
                    { label: "Database", value: "Local MariaDB (Offline-first)" },
                    { label: "Tax & Discount", value: "12% VAT · 20% SC/PWD exempt" },
                    { label: "Stock Method", value: "FIFO deduction · Earliest-expiry alerts" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                      <span className="font-medium text-muted-foreground">{row.label}</span>
                      <span className="font-semibold text-foreground text-right tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="px-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                Sales, deliveries, returns, and permissions stay synchronized automatically across your permitted workspace.
              </p>
            </div>
          </Modal>
        )}
        <DatabaseBackupModal
          isOpen={showDatabaseModal}
          onClose={() => setShowDatabaseModal(false)}
          showToast={showHubToast}
        />
        {showUserProfile && <UserInfoModal 
          user={{
            ...user,
            lastLogin: "Current session"
          } as import("./data").StaffMember} 
          onClose={() => setShowUserProfile(false)} 
          onResetPassword={handleResetPassword}
          onUpdateProfile={handleUpdateProfile}
        />}
        {navMode === "sidebar" && !showNavStyleModal && systemAlert && (
          <Modal title={systemAlert.title} onClose={() => setSystemAlert(null)} wide closeOnOverlay={false}>
            <div className="space-y-4">
              <p className="text-sm text-foreground">{systemAlert.body}</p>
              <div className="flex justify-end">
                <button type="button" onClick={() => { setPage("stock-alerts"); setSystemAlert(null); loadAll(false); }}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity st-btn">
                  Reorder Now
                </button>
              </div>
            </div>
          </Modal>
        )}
        {showLogoutConfirm && (
          <ConfirmDialog
            title="Log out?"
            message="You'll need to sign in again to access SmartTrack."
            confirmLabel="Yes, Log Out"
            cancelLabel="Stay"
            variant="warning"
            onConfirm={onLogout}
            onCancel={() => setShowLogoutConfirm(false)}
          />
        )}
        {roleToRemove && (
          <ConfirmDialog
            title="Remove this role?"
            message={`Remove ${ROLE_LABELS[roleToRemove] ?? roleToRemove} from your account? You can’t add roles back from Preferences.`}
            confirmLabel="Remove Role"
            cancelLabel="Keep Role"
            variant="warning"
            onConfirm={() => { void handleRemoveOwnRole(roleToRemove); }}
            onCancel={() => setRoleToRemove(null)}
          />
        )}
        {confirmDiscardCart && (
          <ConfirmDialog
            title="Discard Paused POS Cart?"
            message="Remove all saved draft items from the paused POS cart? This cannot be undone."
            confirmLabel="Discard Cart"
            cancelLabel="Keep Draft"
            variant="warning"
            onConfirm={() => { setPausedSaleDraft(null); setConfirmDiscardCart(false); }}
            onCancel={() => setConfirmDiscardCart(false)}
          />
        )}
        <NavigationStyleChoiceModal
          open={showNavStyleModal}
          user={user}
          currentMode={navMode}
          askOnLogin={askNavOnLogin}
          onToggleAskOnLogin={toggleAskNavOnLogin}
          onPrepareTrackHub={() => {
            setNavMode("island");
            setTimeout(() => {
              if (!reduceTrackHubMotion) {
                setIslandMorph(m => ({ kind: "collapse", seq: (m?.seq ?? 0) + 1 }));
              }
            }, 390);
          }}
          onConfirm={mode => {
            setNavMode(mode);
            try { sessionStorage.removeItem("st_nav_prompt_pending"); } catch { /* ignore */ }
            setShowNavStyleModal(false);
            showHubToast(mode === "island" ? "Using Modern View (TrackHub) mode" : "Using Simple Standard (Easy View) mode", "info");
          }}
          onClose={() => {
            try { sessionStorage.removeItem("st_nav_prompt_pending"); } catch { /* ignore */ }
            setShowNavStyleModal(false);
          }}
        />

      </div>
    </div>
  );
}
