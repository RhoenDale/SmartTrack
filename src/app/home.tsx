import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, BarChart2, Users,
  Bell, Search, Shield,
  Moon, Sun, Settings, BellRing, ClipboardList, Landmark,
  X, ArrowRight, RefreshCw, Cloud, Copy, ClipboardCheck, Truck,
  ChevronDown, ChevronLeft, ChevronRight, Menu, Activity, Trash2, AlertTriangle, Bot, Info, Maximize2,
  Database,
} from "lucide-react";
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
  initials, InfoTip, YouTubeTopLoader, YouTubeAppSkeleton,
} from "./shared";
import {
  productsApi, categoriesApi, transactionsApi, returnRequestsApi, dashboardApi,
  usersApi, notificationsApi, receiptSettingsApi, rolesApi, activeRoleStore,
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

  const defaultPage = (): Page =>
    isAdmin ? "dashboard" : isInventoryManager ? "inventory" : "transactions";

  const allowedPages = [...new Set<Page>([
    ...(isAdmin ? ["dashboard", "inventory", "transactions", "analytics", "users", "stock-alerts", "reports", "returns", "financial", "purchases", "activity-log", "recycle-bin"] as Page[] : []),
    ...(isInventoryManager ? ["dashboard", "inventory", "stock-alerts", "analytics", "reports", "returns", "purchases", "recycle-bin", "activity-log"] as Page[] : []),
    ...(isCashier ? ["dashboard", "inventory", "stock-alerts", "transactions", "analytics", "reports", "activity-log"] as Page[] : []),
  ])];
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
  const [pageNavigating, setPageNavigating] = useState(false);

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
  useEffect(() => {
    try { localStorage.setItem("st_nav_mode", navMode); } catch { /* ignore */ }
  }, [navMode]);
  const [trackHubOpen, setTrackHubOpen] = useState(false);
  const [trackHubAssistantOpen, setTrackHubAssistantOpen] = useState(false);
  const [trackHubAlertPeekOpen, setTrackHubAlertPeekOpen] = useState(false);
  const [reduceTrackHubMotion, setReduceTrackHubMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [showTrackHubSettings, setShowTrackHubSettings] = useState(false);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const trackHubSettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReduceTrackHubMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  // ── Dynamic Island Toast Notification ───────────────────────────────────────
  const [hubToast, setHubToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const hubToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHubToast = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    if (hubToastTimer.current) clearTimeout(hubToastTimer.current);
    setTrackHubOpen(false);
    setTrackHubAssistantOpen(false);
    setTrackHubAlertPeekOpen(false);
    setHubToast({ msg, type });
    hubToastTimer.current = setTimeout(() => setHubToast(null), 3600);
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
        setShowTrackHubSettings(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const [shareStatus, setShareStatus] = useState<ShareStatus>({
    state: "stopped",
    url: null,
    error: null,
  });
  const [shareMessage, setShareMessage] = useState("");

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

  useEffect(() => {
    if (!loading) onReady?.();
  }, [loading, onReady]);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [showAddProduct,    setShowAddProduct]    = useState(false);
  const [editingProduct,    setEditingProduct]    = useState<Product | null>(null);
  const [suggestedBatchQty, setSuggestedBatchQty] = useState(0);
  const [deletingProduct,   setDeletingProduct]   = useState<Product | null>(null);
  const [showAddSale,       setShowAddSale]       = useState(false);
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
    } catch (e) {
      console.error("Load failed:", e);
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [isAdmin, isCashier]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!window.smarttrack?.isElectron) return;
    let active = true;
    window.smarttrack.getShareStatus().then(status => {
      if (active && status) setShareStatus(status);
    });
    const unsubscribe = window.smarttrack.onShareStatus(status => {
      if (active) {
        setShareStatus(status);
        setShareMessage("");
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const pollNotifications = async () => {
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
    const timer = window.setInterval(pollNotifications, 5000);
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
      const page = (e as CustomEvent<string>).detail;
      if (page) setPage(page as Page);
    };
    window.addEventListener("smarttrack:navigate", handler);
    return () => window.removeEventListener("smarttrack:navigate", handler);
  }, []);

  // ── Universal search: close on outside click ────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  // Guard: redirect non-admin away from admin-only pages
  useEffect(() => {
    if (!isAdmin && (page === "users" || page === "financial")) setPage(defaultPage());
    if (!isAdmin && !isInventoryManager && page === "returns") setPage(defaultPage());
    if (isInventoryManager && page === "transactions") setPage("inventory");
  }, [isAdmin, isCashier, isInventoryManager, page]);

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
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]",
        textClass: "text-rose-300",
        pulse: true,
      }
    : hasPharmacyWarnings
    ? {
        label: "Pharmacy stock needs review",
        dotClass: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]",
        textClass: "text-amber-300",
        pulse: true,
      }
    : {
        label: "All stock healthy",
        dotClass: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]",
        textClass: "text-emerald-300",
        pulse: true,
      };
  const pharmacyHealthSubtitle = hasUrgentPharmacyAlerts || hasPharmacyWarnings
    ? [
        outOfStockCount > 0 ? `${outOfStockCount} out` : null,
        criticalStockCount > 0 ? `${criticalStockCount} crit` : null,
        expiryAlerts.expired.length > 0 ? `${expiryAlerts.expired.length} expired` : null,
        lowStockOnlyCount > 0 ? `${lowStockOnlyCount} low` : null,
        expiryAlerts.within30.length > 0 ? `${expiryAlerts.within30.length} exp ≤30d` : null,
        expiryAlerts.within90.length > 0 ? `${expiryAlerts.within90.length} exp ≤90d` : null,
      ].filter((item): item is string => item !== null).slice(0, 2).join(" · ") || "Expiry alert"
    : "All stock healthy";
  const pharmacyAlertPeek = [
    outOfStockCount > 0 ? `${outOfStockCount} Out of Stock` : null,
    criticalStockCount > 0 ? `${criticalStockCount} Critical` : null,
    expiryAlerts.expired.length > 0 ? `${expiryAlerts.expired.length} Expired` : null,
    lowStockOnlyCount > 0 ? `${lowStockOnlyCount} Low` : null,
    expiryAlerts.within30.length > 0 ? `${expiryAlerts.within30.length} Expiring ≤30d` : null,
    expiryAlerts.within90.length > 0 ? `${expiryAlerts.within90.length} Expiring ≤90d` : null,
  ].filter((item): item is string => item !== null).join(" · ") || "All stock and expiry dates are healthy";
  const totalAlertBadge   = lowStockCount + totalExpiryAlerts;
  const unreadCount       = notifs.filter(n => !n.read).length;

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

  const handleAddCategory = async (cat: string) => {
    if (categories.includes(cat)) return;
    try {
      await categoriesApi.create(cat);
      setCategories(prev => [...prev, cat]);
    } catch (e) { console.error(e); }
  };

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
      showHubToast(original ? "Product updated" : "Product added", "success");
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
      showHubToast("Product moved to recycle bin", "info");
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
        showHubToast("Sale complete", "success");
        return;
      }

      if (!res.transaction || !res.product) throw new Error("Sale response missing transaction data.");
      setTransactions(prev => [res.transaction!, ...prev]);
      setInventory(prev => prev.map(p => p.id === productId ? normalizeProduct(res.product!) : p));
      setViewingInvoice(res.transaction);
      showHubToast("Sale complete", "success");
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

  const handleReturnDispositionComplete = async () => {
    await loadAll(false);
  };

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

  const handleDeleteUser = async (target: StaffMember) => {
    try {
      await usersApi.delete(target.id);
      setStaff(prev => prev.filter(s => s.id !== target.id));
      showHubToast("Staff removed", "info");
    } catch (e: unknown) {
      showHubToast(e instanceof Error ? e.message : "Failed to delete user.", "error");
    }
  };

  const handleToggleStatus = async (target: StaffMember, newStatus: "active" | "inactive") => {
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
  };

  const handleResetPassword = async (newPassword: string) => {
    await usersApi.changePassword(user.id, newPassword);
  };

  // Admin resets another user's password (clears it)
  const handleAdminResetPassword = async (target: StaffMember) => {
    await usersApi.resetPassword(target.id);
  };

  // Admin sets a new password for another user
  const handleAdminCreatePassword = async (userId: string, password: string) => {
    await usersApi.createPassword(userId, password);
  };

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

  const activateRole = (role: string) => {
    activeRoleStore.set(role);
    onUserUpdated?.({ ...user, role: role as AuthUser["role"] });
    setPage(role === "admin" || role === "admin/owner" ? "dashboard" : role === "inventory_manager" ? "inventory" : "transactions");
  };

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

  const handleStartShare = async () => {
    setShareMessage("");
    try {
      const status = await window.smarttrack?.startShare();
      if (!status) throw new Error("Unable to start the Cloudflare share link.");
      setShareStatus(status);
      if (status.error) setShareMessage(status.error);
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "Unable to start the Cloudflare share link.");
    }
  };

  const handleStopShare = async () => {
    setShareMessage("");
    try {
      const status = await window.smarttrack?.stopShare();
      if (!status) throw new Error("Unable to stop the Cloudflare share link.");
      setShareStatus(status);
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "Unable to stop the Cloudflare share link.");
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareStatus.url) return;
    try {
      const result = await window.smarttrack?.copyText(shareStatus.url);
      if (!result?.ok) throw new Error("Could not copy the share link.");
      setShareMessage("Link copied to clipboard.");
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "Could not copy the share link.");
    }
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

  const handleStockAlertEditProduct = (product: Product, suggestedQty = 0) => {
    setPage("inventory");
    setSelectedProductId(product.id);
    setSuggestedBatchQty(suggestedQty);
    setEditingProduct(product);
  };

  // ── Navigation ───────────────────────────────────────────────────────────────
  const adminNav:     { id: Page; icon: any; label: string; badge?: number }[] = [
    { id: "dashboard",    icon: LayoutDashboard, label: "Dashboard" },
    { id: "inventory",    icon: Package,         label: "Inventory",    badge: lowStockCount },
    { id: "stock-alerts", icon: BellRing,        label: "Stock Alerts", badge: totalAlertBadge },
    { id: "transactions", icon: ShoppingCart,    label: "Transactions" },
    { id: "analytics",    icon: BarChart2,       label: "Analytics" },
    { id: "reports",      icon: ClipboardList,   label: "Reports" },
    { id: "returns",      icon: ClipboardCheck,  label: "Returns & Broken" },
    { id: "financial",    icon: Landmark,        label: "Financial" },
    { id: "purchases",    icon: Truck,           label: "Supplier Orders" },
    { id: "users",        icon: Users,           label: "Users" },
  ];
  const invNav: typeof adminNav = [
    { id: "inventory",    icon: Package,         label: "Inventory",    badge: lowStockCount },
    { id: "stock-alerts", icon: BellRing,        label: "Stock Alerts", badge: totalAlertBadge },
    { id: "dashboard",    icon: LayoutDashboard, label: "Dashboard" },
    { id: "analytics",    icon: BarChart2,       label: "Analytics" },
    { id: "reports",      icon: ClipboardList,   label: "Reports" },
    { id: "returns",      icon: ClipboardCheck,  label: "Returns & Broken" },
    { id: "purchases",    icon: Truck,           label: "Supplier Orders" },
  ];
  const cashierNav: typeof adminNav = [
    { id: "dashboard",    icon: LayoutDashboard, label: "Dashboard" },
    { id: "inventory",    icon: Package,         label: "Inventory",    badge: lowStockCount },
    { id: "stock-alerts", icon: BellRing,        label: "Stock Alerts", badge: totalAlertBadge },
    { id: "transactions", icon: ShoppingCart,    label: "Transactions" },
    { id: "analytics",    icon: BarChart2,       label: "Analytics" },
    { id: "reports",      icon: ClipboardList,   label: "Reports" },
  ];
  const navItems = isAdmin ? adminNav : isInventoryManager ? invNav : cashierNav;

  // ── TrackHub close-on-outside-click ────────────────────────────────────
  const trackHubRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!trackHubOpen && !trackHubAssistantOpen && !trackHubAlertPeekOpen) return;
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
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [trackHubOpen, trackHubAssistantOpen, trackHubAlertPeekOpen]);

  useEffect(() => {
    if (navMode !== "island") setTrackHubAssistantOpen(false);
    if (navMode !== "island") setTrackHubAlertPeekOpen(false);
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

  // Pill content (icon + label) slide-in when active page changes
  const prevPageRef = useRef(page);
  const [pillSlide,  setPillSlide]  = useState(false);
  useEffect(() => {
    if (prevPageRef.current !== page) {
      prevPageRef.current = page;
      setPillSlide(true);
      setPageNavigating(true);
      const t = setTimeout(() => setPillSlide(false), 360);
      const tNav = setTimeout(() => setPageNavigating(false), 380);
      return () => {
        clearTimeout(t);
        clearTimeout(tNav);
      };
    }
  }, [page]);

  // ── TrackHub Navigation ──────────────────────────────────────────────────────
  // Collapsed pill width/height depends on whether a confirm dialog or toast is active
  const activeConfirm = useIslandConfirm();
  const confirmOpen   = activeConfirm !== null;
  const toastOpen     = !confirmOpen && hubToast !== null && !trackHubOpen && !trackHubAssistantOpen && !trackHubAlertPeekOpen;
  const collapsedPillWidth = smartBotEnabled ? "280px" : "228px";
  const pillW         = confirmOpen
    ? "430px"
    : trackHubAssistantOpen
    ? "min(570px, calc(100vw - 24px))"
    : trackHubOpen
    ? "570px"
    : trackHubAlertPeekOpen
    ? "min(440px, calc(100vw - 24px))"
    : toastOpen
    ? "min(360px, calc(100vw - 32px))"
    : collapsedPillWidth;
  const pillH         = confirmOpen
    ? "148px"
    : trackHubAssistantOpen
    ? "min(520px, calc(100dvh - 80px))"
    : trackHubOpen
    ? "226px"
    : trackHubAlertPeekOpen
    ? "56px"
    : toastOpen
    ? "48px"
    : "42px";

  useEffect(() => {
    if (confirmOpen) {
      setTrackHubOpen(false);
      setTrackHubAlertPeekOpen(false);
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

      {/* ── Physical pill shell (Pure CSS Spring Morph) ── */}
      <div
        ref={pillRef}
        data-trackhub-target
        className="absolute top-0 left-1/2 -translate-x-1/2 overflow-hidden select-none cursor-default"
        style={{
          background: "#000000",
          border: darkMode
            ? "1px solid rgba(255, 255, 255, 0.28)"
            : "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: darkMode
            ? confirmOpen || trackHubOpen || trackHubAssistantOpen
              ? "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.45), 0 0 12px 0 rgba(255, 255, 255, 0.12), 0 20px 60px rgba(0,0,0,0.85)"
              : toastOpen
              ? "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.45), 0 0 10px 0 rgba(255, 255, 255, 0.12), 0 8px 32px rgba(0,0,0,0.55)"
              : "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.45), 0 0 10px 0 rgba(255, 255, 255, 0.12), 0 4px 18px rgba(0,0,0,0.40)"
            : confirmOpen || trackHubOpen || trackHubAssistantOpen
            ? "0 20px 60px rgba(0,0,0,0.45)"
            : toastOpen
            ? "0 8px 32px rgba(0,0,0,0.30)"
            : "0 4px 18px rgba(0,0,0,0.22)",
          width:        pillW,
          height:       pillH,
          borderRadius: confirmOpen ? "24px" : (trackHubOpen || trackHubAssistantOpen) ? "24px" : "21px",
          transition: reduceTrackHubMotion ? "none" : [
            `width ${confirmOpen ? 280 : (trackHubOpen || trackHubAssistantOpen) ? 260 : toastOpen ? 280 : 200}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            `height ${confirmOpen ? 280 : (trackHubOpen || trackHubAssistantOpen) ? 260 : toastOpen ? 280 : 200}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            "box-shadow 240ms ease",
            "opacity 160ms ease",
          ].join(", "),
          willChange: "width, height, box-shadow",
          transformOrigin: "center top",
          opacity: hideTrackHub ? 0 : 1,
          pointerEvents: hideTrackHub ? "none" : "auto",
        }}
      >
        {/* ── Layer -1: Dynamic Island Confirm Dialog ─────────────────────── */}
        <div
          className="absolute top-0 left-1/2 w-[430px] p-4 flex flex-col justify-between"
          style={{
            height: "148px",
            opacity: confirmOpen ? 1 : 0,
            transform: confirmOpen ? "translateX(-50%) scale(1)" : "translateX(-50%) scale(0.95)",
            transition: reduceTrackHubMotion ? "none" : confirmOpen
              ? "opacity 160ms 40ms ease, transform 240ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "opacity 60ms ease, transform 60ms ease",
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
          className="absolute inset-0 w-full h-full flex items-center gap-2.5 px-3.5"
          style={{
            opacity:    toastOpen ? 1 : 0,
            transform:  toastOpen ? "scale(1)" : "scale(0.95)",
            transition: reduceTrackHubMotion ? "none" : toastOpen
              ? "opacity 160ms 60ms ease, transform 220ms 60ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "opacity 60ms ease, transform 60ms ease",
            pointerEvents: "none",
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
          <span className="text-xs font-semibold text-white/95 leading-tight truncate">
            {hubToast?.msg}
          </span>
        </div>

        {/* ── Layer 1: Collapsed pill (Centrally locked) ───────────────────── */}
        <div
          className="absolute top-0 left-1/2 h-[42px] flex items-center px-3 cursor-pointer hover:bg-white/[0.04] motion-reduce:transition-none"
          style={{
            width: collapsedPillWidth,
            opacity:    (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || toastOpen) ? 0 : 1,
            transform:  (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || toastOpen) ? "translateX(-50%) scale(0.94)" : "translateX(-50%) scale(1)",
            transition: reduceTrackHubMotion ? "none" : (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || toastOpen)
              ? "opacity 50ms ease, transform 60ms ease"
              : "opacity 140ms 40ms ease, transform 180ms 40ms cubic-bezier(0.16, 1, 0.3, 1)",
            pointerEvents: (confirmOpen || trackHubOpen || trackHubAssistantOpen || trackHubAlertPeekOpen || toastOpen) ? "none" : "auto",
          }}
          onClick={() => {
            setTrackHubAlertPeekOpen(false);
            setTrackHubOpen(true);
          }}
          title="Click to open navigation"
        >
          {smartBotEnabled && <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setTrackHubOpen(false);
              setTrackHubAlertPeekOpen(false);
              setTrackHubAssistantOpen(true);
            }}
            className="mr-2 flex h-7 flex-shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-2 text-white/85 transition-colors hover:bg-white/[0.12]"
            title="Open SmartTrack Assistant"
            aria-label="Open SmartTrack Assistant"
          >
            <Bot size={14} className="text-blue-300" />
            <span className="text-[10px] font-semibold leading-none">Assistant</span>
          </button>}

          <button
            type="button"
            aria-label={`${pharmacyHealth.label}. ${pharmacyHealthSubtitle}. Show alert summary`}
            aria-expanded={trackHubAlertPeekOpen}
            onClick={event => {
              event.stopPropagation();
              setTrackHubOpen(false);
              setTrackHubAlertPeekOpen(open => !open);
            }}
            title="Show pharmacy health summary"
            className="mr-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span className={`h-2 w-2 rounded-full ${pharmacyHealth.dotClass} ${pharmacyHealth.pulse ? "animate-pulse motion-reduce:animate-none" : ""}`} />
          </button>

          {/* Active page icon + label container */}
          <div
            key={page}
            className="flex items-center gap-2 flex-1 min-w-0"
            style={{
              animation: pillSlide && !reduceTrackHubMotion ? "th-pill-content-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both" : "none",
            }}
          >
            {/* Active page squircle icon (clean, no overlapping dot) */}
            <span className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-center flex-shrink-0">
              <ActiveIcon size={14} className="text-blue-400" />
            </span>

            {/* Page title + pharmacy health summary */}
            <div className="flex flex-col min-w-0 justify-center">
              <span className="text-[12.5px] font-semibold text-white/95 tracking-tight leading-tight truncate">
                {activeLabel}
              </span>
              <span className={`text-[9px] font-medium leading-none mt-0.5 truncate ${pharmacyHealth.textClass}`}>
                {pharmacyHealthSubtitle}
              </span>
            </div>
          </div>

          {/* Chevron */}
          <div className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0 ml-1.5 motion-reduce:transition-none"
               style={{ transition: reduceTrackHubMotion ? "none" : "background-color 150ms ease" }}>
            <ChevronDown size={11} className="text-white/50" />
          </div>
        </div>

        {/* ── Layer 1.5: Compact pharmacy alert peek ─────────────────────── */}
        <div
          role="region"
          aria-label="Pharmacy alert summary"
          className="absolute inset-0 flex items-center gap-2 px-3 motion-reduce:transition-none"
          style={{
            opacity: !confirmOpen && trackHubAlertPeekOpen && !trackHubOpen && !trackHubAssistantOpen ? 1 : 0,
            transform: !confirmOpen && trackHubAlertPeekOpen && !trackHubOpen && !trackHubAssistantOpen ? "scale(1)" : "scale(0.97)",
            transition: reduceTrackHubMotion
              ? "none"
              : trackHubAlertPeekOpen
              ? "opacity 120ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "opacity 60ms ease, transform 60ms ease",
            pointerEvents: !confirmOpen && trackHubAlertPeekOpen && !trackHubOpen && !trackHubAssistantOpen ? "auto" : "none",
          }}
        >
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${pharmacyHealth.dotClass} ${pharmacyHealth.pulse ? "animate-pulse motion-reduce:animate-none" : ""}`} />
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
            className="flex flex-shrink-0 items-center gap-1 rounded-full bg-white/[0.1] px-2.5 py-1.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-white/[0.18] motion-reduce:transition-none"
          >
            Review Alerts <ArrowRight size={11} />
          </button>
          <button
            type="button"
            onClick={() => setTrackHubAlertPeekOpen(false)}
            aria-label="Close alert summary"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none"
          >
            <X size={12} />
          </button>
        </div>

        {/* TrackHub expands into the assistant itself, embedded in the island pill. */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden"
          style={{
            opacity: (!confirmOpen && trackHubAssistantOpen) ? 1 : 0,
            transform: (!confirmOpen && trackHubAssistantOpen) ? "scale(1)" : "scale(0.97)",
            transition: reduceTrackHubMotion ? "none" : (!confirmOpen && trackHubAssistantOpen)
              ? "opacity 160ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "opacity 60ms ease, transform 60ms ease",
            pointerEvents: (!confirmOpen && trackHubAssistantOpen) ? "auto" : "none",
          }}
        >
          <CommandAssistant
            user={user}
            inventory={inventory}
            transactions={transactions}
            allowedPages={allowedPages}
            onNavigate={p => {
              setPage(p);
              setTrackHubAssistantOpen(false);
            }}
            onOpenNewSale={() => {
              setShowAddSale(true);
              setTrackHubAssistantOpen(false);
            }}
            onOpenAddProduct={() => {
              setShowAddProduct(true);
              setTrackHubAssistantOpen(false);
            }}
            enabled={smartBotEnabled}
            mode="trackhub"
            open={trackHubAssistantOpen}
            onOpenChange={next => {
              setTrackHubAssistantOpen(next);
              if (next) setTrackHubOpen(false);
            }}
          />
        </div>

        {/* ── Layer 2: Expanded hub (Centrally locked, blooms gracefully) ──── */}
        <div
          className="absolute top-0 left-1/2 w-[570px] px-3.5 pt-3 pb-5 flex flex-col"
          style={{
            opacity:    (!confirmOpen && trackHubOpen && !trackHubAssistantOpen) ? 1 : 0,
            transform:  (!confirmOpen && trackHubOpen && !trackHubAssistantOpen) ? "translateX(-50%) scale(1)" : "translateX(-50%) scale(0.97)",
            transition: reduceTrackHubMotion ? "none" : (!confirmOpen && trackHubOpen && !trackHubAssistantOpen)
              ? "opacity 150ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "opacity 60ms ease, transform 60ms ease",
            pointerEvents: (!confirmOpen && trackHubOpen && !trackHubAssistantOpen) ? "auto" : "none",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06] px-1">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${pharmacyHealth.dotClass} ${pharmacyHealth.pulse ? "animate-pulse motion-reduce:animate-none" : ""}`} />
              <span className="text-[10px] font-bold text-white/80 tracking-wider uppercase">Navigation</span>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-white/[0.07] border border-white/10 text-white/55">
                {isAdmin ? "Admin / Owner" : isInventoryManager ? "Inventory Manager" : "Cashier"}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setTrackHubOpen(false); }}
              className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center motion-reduce:transition-none"
              style={{ transition: reduceTrackHubMotion ? "none" : "background-color 150ms ease, color 150ms ease" }}
              title="Close (Esc)"
            >
              <X size={10} />
            </button>
          </div>

          {/* Nav grid */}
          <div className={`grid gap-1.5 ${navItems.length > 8 ? "grid-cols-5" : navItems.length > 5 ? "grid-cols-4" : "grid-cols-3"}`}>
            {navItems.map((item) => {
              const isActive  = item.id === page;
              const isPressed = pressedItem === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onPointerDown={() => setPressedItem(item.id)}
                  onPointerUp={()   => setPressedItem(null)}
                  onPointerLeave={() => setPressedItem(null)}
                  onClick={() => {
                    setPressedItem(item.id);
                    // Immediate tactile feedback, then smooth retract & route
                    setTimeout(() => {
                      setPage(item.id);
                      setTrackHubOpen(false);
                      setTrackHubAlertPeekOpen(false);
                      setPressedItem(null);
                    }, 85);
                  }}
                  className={`group relative flex flex-col items-center justify-center py-2 px-1 rounded-2xl focus:outline-none select-none ${
                    isActive
                      ? "bg-blue-500/15 border border-blue-400/30"
                      : "border border-transparent hover:bg-white/[0.05]"
                  } motion-reduce:transition-none`}
                  style={{
                    transform:  isPressed ? "scale(0.92)" : "scale(1)",
                    transition: reduceTrackHubMotion ? "none" : isPressed
                      ? "transform 70ms cubic-bezier(0.32, 0.72, 0, 1), background-color 70ms ease"
                      : "transform 240ms cubic-bezier(0.16, 1, 0.3, 1), background-color 150ms ease, border-color 150ms ease",
                  }}
                >
                  <div className="relative mb-1">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        isPressed
                          ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                          : isActive
                          ? "bg-blue-500/25 border border-blue-400/40 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                          : "bg-blue-500/10 border border-blue-400/20 text-blue-400 group-hover:bg-blue-500/20 group-hover:text-blue-300"
                      }`}
                      style={{
                        transform: isPressed ? "scale(0.88)" : "scale(1)",
                        transition: reduceTrackHubMotion ? "none" : isPressed
                          ? "transform 70ms cubic-bezier(0.32, 0.72, 0, 1)"
                          : "transform 260ms cubic-bezier(0.16, 1, 0.3, 1), background-color 150ms ease",
                      }}
                    >
                      <item.icon size={16} className={isPressed ? "text-white" : "text-blue-400 group-hover:text-blue-300"} />
                    </div>
                    {(item.badge ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[15px] h-3.5 px-0.5 bg-amber-400 rounded-full text-[8px] text-black flex items-center justify-center font-bold shadow-xs leading-none">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] leading-tight text-center line-clamp-1 w-full px-0.5 ${
                      isActive ? "text-blue-300 font-bold" : "text-white/65 group-hover:text-white font-medium"
                    }`}
                    style={{ transition: reduceTrackHubMotion ? "none" : "color 150ms ease" }}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="w-1 h-1 rounded-full bg-blue-400 mt-1 shadow-[0_0_6px_rgba(96,165,250,0.9)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  // Shared settings panel content (used in both TrackHub and sidebar topbars)
  const settingsPanelContent = useMemo(() => (
    <div className="space-y-3.5">
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 shadow-2xs dark:text-purple-400">
              <Shield size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Account &amp; Roles</p>
              <p className="text-[10px] text-muted-foreground">Choose which role is active.</p>
            </div>
          </div>
          <InfoTip
            title="Account roles"
            lines={[
              "Switching roles changes your permissions and which navigation items are available without signing out.",
              "Removing a role updates the account; at least one role must remain.",
            ]}
          />
        </div>
        <div className="flex items-center gap-3 px-3.5 py-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-xs font-semibold text-primary">
            {user.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-[10px] text-muted-foreground">Signed-in account</p>
          </div>
        </div>
        <div role="group" aria-label="Available account roles" className="px-2.5 py-2">
          {(user.roles?.length ? user.roles : [user.role]).map(role => (
            <div key={role} className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-muted/50">
              <button
                type="button"
                aria-pressed={user.role === role}
                disabled={roleActionBusy}
                onClick={() => activateRole(role)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-transform active:scale-[0.98] disabled:cursor-wait"
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
                className="shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-rose-400"
                title={(user.roles?.length ?? 1) <= 1 ? "Your account must keep at least one role" : `Remove ${ROLE_LABELS[role] ?? role}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-700/10 text-slate-600 shadow-2xs dark:bg-slate-700/30 dark:text-teal-400">
              <Settings size={15} />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">Appearance &amp; Layout</p>
              <p className="text-[10px] text-muted-foreground">Personalize how SmartTrack looks.</p>
            </div>
          </div>
          <InfoTip title="Appearance and layout" lines={["These preferences change the appearance and navigation layout on this device."]} />
        </div>
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500 shadow-2xs">
              {darkMode ? <Moon size={14} /> : <Sun size={14} />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Dark Mode</p>
              <p className="text-[10px] text-muted-foreground">Use a darker appearance.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={darkMode}
            aria-label="Dark Mode"
            onClick={() => {
              const nextMode = !darkMode;
              setDarkMode(nextMode);
              showHubToast(nextMode ? "Dark mode enabled" : "Light mode enabled", "info");
            }}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full shadow-inner transition-colors duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.98] motion-reduce:transition-none ${
              darkMode ? "bg-primary shadow-[0_0_10px_rgba(59,130,246,0.22)]" : "bg-muted-foreground/30"
            }`}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
              darkMode ? "translate-x-5" : "translate-x-0"
            }`} />
          </button>
        </div>
        <div className="px-3.5 py-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-500 shadow-2xs">
                <Menu size={14} />
              </span>
              <div>
                <p className="text-xs font-medium text-foreground">Navigation Style</p>
                <p className="text-[10px] text-muted-foreground">Choose your preferred navigation.</p>
              </div>
            </div>
            <InfoTip
              title="Navigation style"
              lines={[
                "TrackHub is the compact floating navigation pill. Classic Sidebar keeps navigation visible along the side of the window.",
                "Changing styles does not change your account permissions.",
              ]}
            />
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
              onClick={() => { setNavMode("island"); setShowTrackHubSettings(false); }}
              className={`relative z-10 rounded-lg px-2 py-2 text-xs transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                navMode === "island" ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              TrackHub
            </button>
            <button
              type="button"
              aria-pressed={navMode === "sidebar"}
              onClick={() => { setNavMode("sidebar"); setShowTrackHubSettings(false); }}
              className={`relative z-10 rounded-lg px-2 py-2 text-xs transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                navMode === "sidebar" ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              Classic Sidebar
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-500 shadow-2xs">
              <Bot size={15} />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">Features &amp; Workspace</p>
              <p className="text-[10px] text-muted-foreground">Quick actions and sharing.</p>
            </div>
          </div>
          <InfoTip title="Workspace features" lines={["Show or hide the assistant, change the window display mode, or create a temporary share link when running the Electron app."]} />
        </div>
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-500 shadow-2xs">
              <Bot size={14} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">SmartTrack Assistant</p>
              <p className="text-[10px] text-muted-foreground">Show assistant in navigation.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={smartBotEnabled}
            aria-label="SmartTrack Assistant"
            onClick={() => toggleSmartBot(!smartBotEnabled)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full shadow-inner transition-colors duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-[0.98] motion-reduce:transition-none ${
              smartBotEnabled ? "bg-primary shadow-[0_0_10px_rgba(99,102,241,0.22)]" : "bg-muted-foreground/30"
            }`}
          >
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
              smartBotEnabled ? "translate-x-5" : "translate-x-0"
            }`} />
          </button>
        </div>
        <button
          type="button"
          onClick={handleToggleFullScreen}
          className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500 shadow-2xs">
            <Maximize2 size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-foreground">Full Screen</span>
            <span className="block text-[10px] text-muted-foreground">Expand SmartTrack to fill your display.</span>
          </span>
          <span className="rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[10px] font-mono font-medium text-muted-foreground">
            {isMac ? "⌃⌘F" : "F11"}
          </span>
        </button>

        {window.smarttrack?.isElectron && (
          <div className="space-y-2.5 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500 shadow-2xs">
                  <Cloud size={14} />
                </span>
                <div>
                  <p className="text-xs font-medium text-foreground">Share SmartTrack</p>
                  <p className="text-[10px] text-muted-foreground">Create a temporary Cloudflare Tunnel link.</p>
                </div>
              </div>
              <InfoTip
                title="Cloudflare sharing"
                lines={[
                  "This creates a temporary Cloudflare Tunnel URL to reach SmartTrack; it is not peer-to-peer sharing.",
                  "Anyone with the link can reach the login page. Share it only with trusted people and stop the tunnel when finished.",
                  "Keep your account credentials private and do not post the link publicly.",
                ]}
              />
            </div>
            {shareStatus.url && (
              <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[10px] text-sky-600 font-mono dark:text-sky-400" title={shareStatus.url}>{shareStatus.url}</span>
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  title="Copy share link"
                  aria-label="Copy share link"
                  className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.98]"
                >
                  <Copy size={13} />
                </button>
              </div>
            )}
            {shareStatus.state === "running" ? (
              <button
                type="button"
                onClick={handleStopShare}
                className="w-full rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/15 active:scale-[0.98] dark:text-rose-400"
              >
                Stop sharing
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartShare}
                disabled={shareStatus.state === "starting" || shareStatus.state === "downloading"}
                className="w-full rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
              >
                {shareStatus.state === "downloading" ? "Downloading Cloudflare…" : shareStatus.state === "starting" ? "Starting tunnel…" : "Create share link"}
              </button>
            )}
            <p className="text-[10px] leading-relaxed text-muted-foreground">Anyone with the link can reach your login page. Share only with trusted people; stop sharing when finished.</p>
            {(shareMessage || shareStatus.error) && (
              <p role="status" className={`text-[10px] leading-relaxed ${shareMessage === "Link copied to clipboard." ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {shareMessage || shareStatus.error}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/40">
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div>
            <p className="text-xs font-semibold text-foreground">System Management</p>
            <p className="text-[10px] text-muted-foreground">Review activity and deleted items.</p>
          </div>
          <InfoTip title="System management" lines={["Open system activity records or, when permitted, restore and manage deleted inventory and accounts."]} />
        </div>
        <button
          type="button"
          onClick={() => { setPage("activity-log"); setShowTrackHubSettings(false); }}
          className="group flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500 shadow-2xs">
            <Activity size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">{isAdmin ? "Activity Log" : "My Activity Log"}</span>
            <span className="block truncate text-[10px] text-muted-foreground">Audit trail of actions and system events</span>
          </span>
          <ChevronRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>

        {(isAdmin || isInventoryManager) && (
          <button
            type="button"
            onClick={() => { setPage("recycle-bin"); setShowTrackHubSettings(false); }}
            className="group flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-500 shadow-2xs">
              <Trash2 size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-foreground">Recycle Bin</span>
              <span className="block text-[10px] text-muted-foreground">Restore or permanently remove deleted items</span>
            </span>
            <ChevronRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => { setShowDatabaseModal(true); setShowTrackHubSettings(false); }}
            className="group flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/35 active:scale-[0.98]"
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500 shadow-2xs">
              <Database size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-foreground">Offline Database &amp; Recovery</span>
              <span className="block text-[10px] text-muted-foreground">Auto-migrations, backups &amp; data safety</span>
            </span>
            <ChevronRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </section>
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
    showHubToast,
    navMode,
    setNavMode,
    setShowTrackHubSettings,
    setShowDatabaseModal,
    smartBotEnabled,
    toggleSmartBot,
    handleToggleFullScreen,
    isMac,
    shareStatus,
    handleCopyShareLink,
    handleStopShare,
    handleStartShare,
    shareMessage,
    isAdmin,
    isInventoryManager,
    setPage,
  ]);

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: "linear-gradient(180deg, #0b1528 0%, #060b14 100%)" }}>
      <button onClick={() => setSidebar(v => !v)}
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

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setPage(item.id)} title={!sidebarExpanded ? item.label : undefined}
            className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl st-nav-item ${page === item.id ? "bg-blue-600/25 text-blue-200 border border-blue-400/30 shadow-2xs font-bold" : "text-white/50 hover:bg-white/[0.06] hover:text-white/90 border border-transparent"}`}>
            <item.icon size={15} className="flex-shrink-0" />
            {sidebarExpanded && <>
              <span className="flex-1 text-left text-xs font-semibold">{item.label}</span>
              {(item.badge ?? 0) > 0 && <span className="w-4 h-4 bg-amber-400 rounded-full text-[9px] text-black flex items-center justify-center font-bold">{item.badge}</span>}
            </>}
          </button>
        ))}
      </nav>

      {smartBotEnabled && (
        <CommandAssistant
          user={user}
          inventory={inventory}
          transactions={transactions}
          allowedPages={allowedPages}
          onNavigate={setPage}
          onOpenNewSale={() => setShowAddSale(true)}
          onOpenAddProduct={() => setShowAddProduct(true)}
          enabled={smartBotEnabled}
          mode="sidebar"
          sidebarExpanded={sidebarExpanded}
          onOpen={() => setSidebar(true)}
        />
      )}

      <div className={`border-t border-white/[0.07] ${sidebarExpanded ? "px-3.5 py-3" : "p-3 flex justify-center"}`}>
        {sidebarExpanded ? (
          <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 bg-white/[0.04] border border-white/[0.06]">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[11px] font-semibold text-white/90 truncate tracking-tight">Active Station</p>
              <p className="text-[10px] text-emerald-400/80 font-medium truncate">Online · Tangub Pharmacy</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center" title="Active Station · Online">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
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
      <YouTubeTopLoader active={refreshing || pageNavigating} />
      {/* Floating Top Notification for Classic Sidebar Mode */}
      {navMode === "sidebar" && hubToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
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
          </div>
        </div>
      )}

      <div className="st-home-enter flex h-screen bg-background overflow-hidden">
        {/* Sidebar — only in sidebar mode */}
        {navMode === "sidebar" && (
          <aside className="flex-shrink-0 transition-all duration-300 overflow-hidden"
            style={{ width: sidebarExpanded ? "224px" : "52px" }}>
            {sidebarContent}
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="flex-shrink-0 h-14 border-b border-border/80 flex items-center gap-3 px-4 sm:px-6 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)]" style={{ zIndex: 40, position: "relative" }}>

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
                    ref={searchInputRef}
                    placeholder={isInventoryManager ? "Search products…" : "Search products, transactions…"}
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchHighlight(0); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full bg-background/95 dark:bg-card/95 border-[1.5px] border-blue-500/50 hover:border-blue-500/80 rounded-full pl-10 pr-10 py-2 text-xs sm:text-[13px] text-foreground font-medium placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-xs transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(""); setSearchOpen(false); searchInputRef.current?.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                      <X size={13} />
                    </button>
                  )}
                  {!searchQuery && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-blue-700/70 dark:text-blue-300/70 font-mono hidden lg:block pointer-events-none font-semibold">⌘K</span>
                  )}
                  {/* Search Dropdown */}
                  {searchOpen && searchQuery.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-[0_12px_32px_-4px_rgba(37,99,235,0.15),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden z-50">
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
                                        <button key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                          onMouseEnter={() => setSearchHighlight(idx)}
                                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                          <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                                            <Package size={11} className="text-violet-600 dark:text-violet-400" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                          </div>
                                          <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
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
                                        <button key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                          onMouseEnter={() => setSearchHighlight(idx)}
                                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                          <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                            <ShoppingCart size={11} className="text-emerald-600 dark:text-emerald-400" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                          </div>
                                          <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
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
                    <button onClick={() => setShowNotifications(v => !v)}
                      className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all">
                      <Bell size={16} />
                      {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">{unreadCount}</span>}
                    </button>
                    {showNotifications && (
                      <NotificationPanel notifs={notifs} onMarkAll={markAllRead} onMarkOne={markOneRead}
                        onNotificationClick={handleNotificationClick}
                        onNotificationHover={setHoveredNotifPid}
                        productMap={Object.fromEntries(inventory.map(p => [p.id, p.name]))}
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
                      <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw_-_1.5rem))] max-h-[calc(100dvh_-_5rem)] overflow-y-auto scrollbar-thin rounded-3xl border border-border bg-card p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_50px_rgba(0,0,0,0.6)] z-50 st-dropdown-in transform-gpu">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Settings size={14} className="text-primary" />
                            <span className="text-xs font-bold text-foreground">Settings</span>
                          </div>
                          <button type="button" onClick={() => setShowTrackHubSettings(false)} aria-label="Close settings" className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"><X size={13} /></button>
                        </div>
                        {settingsPanelContent}
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
                      ref={searchInputRef}
                      placeholder={isInventoryManager ? "Search products…" : "Search products, transactions…"}
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setSearchHighlight(0); setSearchOpen(true); }}
                      onFocus={() => setSearchOpen(true)}
                      onKeyDown={handleSearchKeyDown}
                      className="w-full bg-background/95 dark:bg-card/95 border-[1.5px] border-blue-500/50 hover:border-blue-500/80 rounded-full pl-10 pr-10 py-2 text-xs sm:text-[13px] text-foreground font-medium placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-xs transition-all"
                    />
                    {searchQuery && (
                      <button onClick={() => { setSearchQuery(""); setSearchOpen(false); searchInputRef.current?.focus(); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                        <X size={13} />
                      </button>
                    )}
                    {!searchQuery && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-blue-700/70 dark:text-blue-300/70 font-mono hidden lg:block pointer-events-none font-semibold">⌘K</span>
                    )}

                    {/* Dropdown */}
                    {searchOpen && searchQuery.length >= 2 && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-[0_12px_32px_-4px_rgba(37,99,235,0.15),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden z-50">
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
                                          <button key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                            onMouseEnter={() => setSearchHighlight(idx)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                            <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                                              <Package size={11} className="text-violet-600 dark:text-violet-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                              <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                            </div>
                                            <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
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
                                          <button key={r.id} onMouseDown={() => handleSearchSelect(r)}
                                            onMouseEnter={() => setSearchHighlight(idx)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${idx === searchHighlight ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                                            <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                              <ShoppingCart size={11} className="text-emerald-600 dark:text-emerald-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold text-foreground truncate">{r.label}</p>
                                              <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>
                                            </div>
                                            <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
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
                <div className="flex items-center gap-2">
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
                    <button onClick={() => setShowNotifications(v => !v)}
                      className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all">
                      <Bell size={16} />
                      {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">{unreadCount}</span>}
                    </button>
                    {showNotifications && (
                      <NotificationPanel notifs={notifs} onMarkAll={markAllRead} onMarkOne={markOneRead}
                        onNotificationClick={handleNotificationClick}
                        onNotificationHover={setHoveredNotifPid}
                        productMap={Object.fromEntries(inventory.map(p => [p.id, p.name]))}
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
                      <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw_-_1.5rem))] max-h-[calc(100dvh_-_5rem)] overflow-y-auto scrollbar-thin rounded-3xl border border-border bg-card p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_50px_rgba(0,0,0,0.6)] z-50 st-dropdown-in transform-gpu">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Settings size={14} className="text-primary" />
                            <span className="text-xs font-bold text-foreground">Settings</span>
                          </div>
                          <button type="button" onClick={() => setShowTrackHubSettings(false)} aria-label="Close settings" className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"><X size={13} /></button>
                        </div>
                        {settingsPanelContent}
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
          <main className="flex-1 overflow-y-auto w-full">
            <div key={page} className="st-page-in min-h-full w-full">
            {page === "dashboard"    && <DashboardView user={user} inventory={inventory} transactions={transactions} cashierDashboard={cashierDashboard} />}
            {page === "inventory"    && <InventoryPage inventory={inventory} transactions={transactions} categories={categories}
              onAddProduct={() => setShowAddProduct(true)} onEditProduct={product => { setSuggestedBatchQty(0); setEditingProduct(product); }}
              onDeleteProduct={setDeletingProduct} onAddCategory={handleAddCategory}
              onReload={() => void loadAll(false)} showToast={showHubToast}
              selectedProductId={selectedProductId} hoveredProductId={hoveredNotifPid} 
              userRoles={[user.role]} />}
            {page === "transactions" && <TransactionsPage user={user} transactions={transactions} inventory={inventory}
              selectedTransactionId={selectedTransactionId}
              showToast={showHubToast}
              onAddSale={() => setShowAddSale(true)} onAddReturn={setReturningTx} onViewInvoice={setViewingInvoice} />}
            {page === "analytics"    && <AnalyticsPage inventory={inventory} transactions={transactions} userRoles={[user.role]} onEditProduct={handleStockAlertEditProduct} showToast={showHubToast} />}
            {page === "stock-alerts" && <StockAlertsPage inventory={inventory} transactions={transactions} onGoToInventory={() => setPage("inventory")} onEditProduct={handleStockAlertEditProduct} userRoles={[user.role]} />}
            {page === "reports"      && <ReportsPage inventory={inventory} transactions={transactions} user={user} />}
            {page === "returns" && (isAdmin || isInventoryManager) && (
              <ReturnsPage user={user} inventory={inventory} onDispositionComplete={handleReturnDispositionComplete} />
            )}
            {page === "financial"    && isAdmin && <FinancialPage user={user} showToast={showHubToast} />}
            {page === "purchases" && (isAdmin || isInventoryManager) && <PurchaseOrdersPage inventory={inventory} onInventoryChanged={() => { void loadAll(false); }} userRoles={[user.role]} />}
            {page === "users"        && isAdmin && <UsersPage staff={staff} currentUserId={user.id} currentUserRoles={[user.role]} currentUserName={user.name} roles={roles} onAddUser={() => setShowAddUser(true)} onEditUser={setEditingUser} onDeleteUser={handleDeleteUser} onToggleStatus={handleToggleStatus} onResetPassword={handleAdminResetPassword} onCreatePassword={handleAdminCreatePassword} onRolesChanged={() => { rolesApi.list().then(setRoles).catch(() => {}); }} />}
            {page === "activity-log" && <ActivityLogPanel isAdmin={isAdmin} />}
            {page === "recycle-bin"  && (isAdmin || isInventoryManager) && <RecycleBinPanel currentUserRoles={[user.role]} currentUserName={user.name} onRestored={() => void loadAll(false)} showToast={showHubToast} />}
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
        {showAddSale && <NewSaleModal onClose={() => setShowAddSale(false)} onAdd={handleAddSale} inventory={inventory} currentUser={user} onGoToInventory={() => { setShowAddSale(false); setPage("inventory"); }} />}
        {returningTx  && <ReturnModal saleTx={returningTx} onClose={() => setReturningTx(null)} onAdd={handleReturn} inventory={inventory} currentUser={user} />}
        {showAddUser  && <UserFormModal onClose={() => setShowAddUser(false)} onSave={handleSaveUser} currentUserRoles={[user.role]} roles={roles} />}
        {editingUser  && <UserFormModal initial={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} currentUserRoles={[user.role]} roles={roles} />}
        {viewingInvoice && <InvoiceModal tx={viewingInvoice} settings={receiptSettings} inventory={inventory} onClose={() => setViewingInvoice(null)} />}
        {showAboutSystem && (
          <Modal title="About SmartTrack" onClose={() => setShowAboutSystem(false)} wide>
            <div className="space-y-5">
              <section className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <img src={SMARTTRACK_LOGO_URL} alt="" className="mt-0.5 h-10 w-10 shrink-0 object-contain" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Pharmacy operations, organized in one system</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      SmartTrack helps a pharmacy manage medicine inventory, record point-of-sale transactions,
                      monitor supplier orders and returns, and review business performance from one workspace.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">What SmartTrack manages</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { icon: Package, title: "Inventory", description: "Maintain medicine details, stock levels, batches, expiry information, and reorder thresholds." },
                    { icon: ShoppingCart, title: "Sales & receipts", description: "Record POS sales, update stock from completed transactions, and view transaction receipts." },
                    { icon: Truck, title: "Supplier orders", description: "Prepare purchase orders, track their progress, and record delivered stock." },
                    { icon: ClipboardCheck, title: "Returns", description: "Record returned items and track whether stock is restocked or marked as damaged." },
                    { icon: BarChart2, title: "Analytics & reports", description: "Review sales, stock movement, and forecast summaries to support decisions." },
                    { icon: Shield, title: "Team & accountability", description: "Manage staff access by role and review activity records and removed items where permitted." },
                  ].map(({ icon: Icon, title, description }) => (
                    <div key={title} className="rounded-xl border border-border/70 bg-card p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Icon size={14} className="text-primary" />
                        <h4 className="text-xs font-bold text-foreground">{title}</h4>
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-xs font-bold text-foreground">A typical workflow</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Add or receive stock, process sales, handle returns, then use alerts and reports to see what needs attention.
                    Stock and transaction records are connected so teams can follow day-to-day changes.
                  </p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-foreground">Access follows your role</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Available pages and management actions depend on your account role. Administrators manage staff and system records;
                    inventory managers focus on stock and supplier operations; cashier accounts focus on sales and their permitted pages.
                  </p>
                </div>
              </section>
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
        {systemAlert && (
          <Modal title={systemAlert.title} onClose={() => setSystemAlert(null)} wide closeOnOverlay={false}>
            <div className="space-y-4">
              <p className="text-sm text-foreground">{systemAlert.body}</p>
              <div className="flex justify-end">
                <button onClick={() => { setPage("stock-alerts"); setSystemAlert(null); loadAll(false); }}
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

      </div>
    </div>
  );
}
