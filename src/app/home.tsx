import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, BarChart2, Users,
  Bell, Search, Shield, Pill,
  Moon, Sun, Settings, BellRing, ClipboardList,
} from "lucide-react";
import {
  sortBatchesByExpiry, normalizeProduct,
  type AuthUser, type Notification, type Page,
  type Product, type StaffMember, type Transaction,
} from "./data";
import {
  Modal, DeleteConfirmModal,
  NotificationPanel, ProductFormModal, NewSaleModal, ReturnModal,
  InventoryAdjustmentModal, UserFormModal, InvoiceModal, UserInfoModal, ResetPasswordModal,
  initials,
} from "./shared";
import {
  productsApi, categoriesApi, transactionsApi,
  usersApi, notificationsApi,
} from "./api";
import DashboardView  from "./dashboard";
import InventoryPage  from "./inventory";
import TransactionsPage from "./transactions";
import AnalyticsPage  from "./analytics";
import StockAlertsPage from "./stockalerts";
import ReportsPage    from "./reports";
import UsersPage      from "./users";

export default function Home({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const isAdmin            = user.role === "admin" || user.role === "admin/owner";
  const isInventoryManager = user.role === "inventory_manager";
  const isCashier          = user.role === "cashier";

  const defaultPage = (): Page =>
    isAdmin ? "dashboard" : isInventoryManager ? "inventory" : "transactions";

  const [page, setPage]               = useState<Page>(defaultPage());
  const [darkMode, setDarkMode]       = useState(false);
  const [sidebarExpanded, setSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // ── Data state (loaded from API) ────────────────────────────────────────────
  const [inventory,     setInventory]     = useState<Product[]>([]);
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [staff,         setStaff]         = useState<StaffMember[]>([]);
  const [notifs,        setNotifs]        = useState<Notification[]>([]);
  const [categories,    setCategories]    = useState<string[]>([]);
  const [loading,       setLoading]       = useState(true);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [showAddProduct,    setShowAddProduct]    = useState(false);
  const [editingProduct,    setEditingProduct]    = useState<Product | null>(null);
  const [deletingProduct,   setDeletingProduct]   = useState<Product | null>(null);
  const [showAddSale,       setShowAddSale]       = useState(false);
  const [returningTx,       setReturningTx]       = useState<Transaction | null>(null);
  const [showAddUser,       setShowAddUser]        = useState(false);
  const [editingUser,       setEditingUser]        = useState<StaffMember | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [viewingInvoice,    setViewingInvoice]    = useState<Transaction | null>(null);
  const [systemAlert,       setSystemAlert]       = useState<Notification | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [hoveredNotifPid,   setHoveredNotifPid]   = useState<string | null>(null);
  const [showUserProfile,   setShowUserProfile]   = useState(false);

  // ── Initial data load ───────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, txns, staffList, notifList, cats] = await Promise.all([
        productsApi.list(),
        transactionsApi.list(),
        isAdmin ? usersApi.list() : Promise.resolve([]),
        notificationsApi.list(),
        categoriesApi.list(),
      ]);
      setInventory(prods.map(normalizeProduct));
      setTransactions(txns);
      setStaff(staffList);
      setNotifs(notifList);
      setCategories(cats);
    } catch (e) {
      console.error("Load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Listen for global navigation events (used by dashboard widgets)
  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent<string>).detail;
      if (page) setPage(page as Page);
    };
    window.addEventListener("smarttrack:navigate", handler);
    return () => window.removeEventListener("smarttrack:navigate", handler);
  }, []);

  // Guard: redirect non-admin away from admin-only pages
  useEffect(() => {
    if (!isAdmin && (page === "dashboard" || page === "users")) setPage(defaultPage());
    if (isCashier && page === "inventory") setPage("transactions");
    if (isInventoryManager && page === "transactions") setPage("inventory");
  }, [isAdmin, isCashier, isInventoryManager, page]);

  // ── Computed alert counts ────────────────────────────────────────────────────
  const now = Date.now();
  const lowStockCount = inventory.filter(i => i.status === "critical" || i.status === "low").length;
  const expiryAlerts  = useMemo(() => {
    const expired: Product[] = [], within30: Product[] = [], within90: Product[] = [];
    inventory.forEach(p => {
      const batches = sortBatchesByExpiry(p.batches);
      if (!batches.length) return;
      const days = (new Date(batches[0].expiryDate).getTime() - now) / 86400000;
      if (days <= 0)   expired.push(p);
      else if (days <= 30)  within30.push(p);
      else if (days <= 90)  within90.push(p);
    });
    return { expired, within30, within90 };
  }, [inventory, now]);
  const totalExpiryAlerts = expiryAlerts.expired.length + expiryAlerts.within30.length + expiryAlerts.within90.length;
  const totalAlertBadge   = lowStockCount + totalExpiryAlerts;
  const unreadCount       = notifs.filter(n => !n.read).length;

  // ── Handlers ─────────────────────────────────────────────────────────────────

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
        id: updated.id, name: updated.name, category: updated.category,
        supplier: updated.supplier, reorder: updated.reorder,
        price: updated.price,
        sale_price: updated.salePrice ?? updated.sale_price ?? null,
        batches: updated.batches.map(b => ({
          batchId: b.batchId, qty: b.qty,
          expiryDate: b.expiryDate ?? b.expiry,
          receivedDate: b.receivedDate,
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
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to save product.");
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    try {
      await productsApi.delete(p.id);
      setInventory(prev => prev.filter(x => x.id !== p.id));
      setDeletingProduct(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete product.");
    }
  };

  const handleAddSale = async (tx: Transaction, productId: string, qty: number) => {
    try {
      const res = await transactionsApi.sale({ product_id: productId, qty });
      setTransactions(prev => [res.transaction, ...prev]);
      setInventory(prev => prev.map(p => p.id === productId ? normalizeProduct(res.product) : p));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Sale failed.");
    }
  };

  const handleReturn = async (tx: Transaction, _productId: string, qty: number) => {
    try {
      // tx is the return TX built in ReturnModal — returnedTxId is the sale ID
      const res = await transactionsApi.return({
        sale_tx_id: tx.returnedTxId!,
        qty,
        reason: tx.note ?? "",
      });
      setTransactions(prev => [res.transaction, ...prev]);
      setInventory(prev => prev.map(p => p.id === res.product.id ? normalizeProduct(res.product) : p));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Return failed.");
    }
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
        name: updated.name, role: updated.role,
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
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to save user.");
    }
  };

  const handleDeleteUser = async (target: StaffMember) => {
    try {
      await usersApi.delete(target.id);
      setStaff(prev => prev.filter(s => s.id !== target.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete user.");
    }
  };

  const handleToggleStatus = async (target: StaffMember, newStatus: "active" | "inactive") => {
    try {
      const payload = {
        name: target.name, role: target.role,
        email: target.email, status: newStatus,
        position: target.position ?? "",
      };
      const saved = await usersApi.update(target.id, payload);
      setStaff(prev => prev.map(s => s.id === target.id ? saved : s));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to update user status.");
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
    // Update via API
    await usersApi.update(user.id, {
      name,
      email,
      role: user.role,
      status: user.status,
      position: user.position ?? "",
    });
    
    // Refresh the page to reflect changes from backend session
    window.location.reload();
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

  const handleStockAlertEditProduct = (product: Product) => {
    setPage("inventory");
    setSelectedProductId(product.id);
    setEditingProduct(product);
  };

  // ── Navigation ───────────────────────────────────────────────────────────────
  const adminNav:     { id: Page; icon: any; label: string; badge?: number }[] = [
    { id: "dashboard",    icon: LayoutDashboard, label: "Dashboard" },
    { id: "inventory",    icon: Package,         label: "Inventory",    badge: lowStockCount },
    { id: "transactions", icon: ShoppingCart,    label: "Transactions" },
    { id: "analytics",    icon: BarChart2,       label: "Analytics" },
    { id: "stock-alerts", icon: BellRing,        label: "Stock Alerts", badge: totalAlertBadge },
    { id: "reports",      icon: ClipboardList,   label: "Reports" },
    { id: "users",        icon: Users,           label: "Users" },
  ];
  const invNav: typeof adminNav = [
    { id: "inventory",    icon: Package,       label: "Inventory",    badge: lowStockCount },
    { id: "analytics",    icon: BarChart2,     label: "Analytics" },
    { id: "stock-alerts", icon: BellRing,      label: "Stock Alerts", badge: totalAlertBadge },
    { id: "reports",      icon: ClipboardList, label: "Reports" },
  ];
  const cashierNav: typeof adminNav = [
    { id: "transactions", icon: ShoppingCart,  label: "Transactions" },
    { id: "analytics",    icon: BarChart2,     label: "Analytics" },
    { id: "stock-alerts", icon: BellRing,      label: "Stock Alerts", badge: totalAlertBadge },
    { id: "reports",      icon: ClipboardList, label: "Reports" },
  ];
  const navItems = isAdmin ? adminNav : isInventoryManager ? invNav : cashierNav;

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: "linear-gradient(180deg, #1a3040 0%, #132633 100%)" }}>
      <button onClick={() => setSidebar(v => !v)}
        className={`flex items-center gap-3 px-4 py-[18px] border-b border-white/[0.07] w-full hover:bg-white/[0.04] transition-colors group ${sidebarExpanded ? "text-left" : "justify-center"}`}>
        <div className="w-7 h-7 rounded-lg bg-teal-400/20 border border-teal-400/30 flex items-center justify-center flex-shrink-0 group-hover:bg-teal-400/30 transition-colors">
          <Pill size={14} className="text-teal-300" />
        </div>
        {sidebarExpanded && <div className="flex-1 overflow-hidden">
          <p className="text-sm font-bold text-white leading-tight">SmartTrack</p>
          <p className="text-[9px] text-teal-300/70 leading-tight mt-0.5">Tangub Pharmacy</p>
        </div>}
      </button>

      {sidebarExpanded && (
        <div className="px-3 py-2.5 border-b border-white/[0.07]">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${isAdmin ? "bg-teal-400/15" : isInventoryManager ? "bg-amber-400/15" : "bg-violet-400/15"}`}>
            <Shield size={10} className={isAdmin ? "text-teal-300" : isInventoryManager ? "text-amber-300" : "text-violet-300"} />
            <span className={`text-[10px] font-bold ${isAdmin ? "text-teal-300" : isInventoryManager ? "text-amber-300" : "text-violet-300"}`}>
              {isAdmin ? (user.role === "admin/owner" ? "Admin / Owner" : "Admin") : isInventoryManager ? "Inventory Manager" : "Cashier / Pharmacist"}
            </span>
          </div>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setPage(item.id)} title={!sidebarExpanded ? item.label : undefined}
            className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-150 ${page === item.id ? "bg-teal-400/20 text-teal-200 border border-teal-400/25" : "text-white/50 hover:bg-white/[0.06] hover:text-white/90 border border-transparent"}`}>
            <item.icon size={15} className="flex-shrink-0" />
            {sidebarExpanded && <>
              <span className="flex-1 text-left text-xs font-semibold">{item.label}</span>
              {(item.badge ?? 0) > 0 && <span className="w-4 h-4 bg-amber-400 rounded-full text-[9px] text-black flex items-center justify-center font-bold">{item.badge}</span>}
            </>}
          </button>
        ))}
      </nav>

      <div className="border-t border-white/[0.07] px-2 py-2">
        <button onClick={() => setShowSettings(v => !v)} title={!sidebarExpanded ? "Settings" : undefined}
          className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all ${showSettings ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/[0.06] hover:text-white/80"}`}>
          <Settings size={14} className="flex-shrink-0" />
          {sidebarExpanded && <span className="text-xs font-semibold">Settings</span>}
        </button>
        {showSettings && sidebarExpanded && (
          <div className="mt-1 mx-1 bg-white/[0.06] border border-white/[0.08] rounded-xl p-3 space-y-2">
            {/* Dark Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {darkMode ? <Moon size={12} className="text-teal-300" /> : <Sun size={12} className="text-amber-300" />}
                <span className="text-[11px] font-semibold text-white/70">Dark Mode</span>
              </div>
              <button onClick={() => setDarkMode(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${darkMode ? "bg-teal-400" : "bg-white/20"}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${darkMode ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
            {/* Collapse */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/50">Collapse panel</span>
              <button onClick={() => setSidebar(false)} className="text-[10px] text-teal-300 font-semibold hover:underline">Hide</button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.07] p-3">
        <button
          type="button"
          onClick={() => setShowUserProfile(true)}
          className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 border border-transparent hover:border-white/20 hover:bg-white/[0.06] transition-all ${sidebarExpanded ? "" : "justify-center"}`}
          title={sidebarExpanded ? undefined : user.name}
        >
          <div className="w-8 h-8 rounded-full bg-teal-400/20 border border-teal-400/30 flex items-center justify-center text-[11px] font-bold text-teal-300 flex-shrink-0">{user.initials}</div>
          {sidebarExpanded && <div className="flex-1 overflow-hidden text-left">
            <p className="text-xs font-bold text-white truncate">{user.name}</p>
            <p className="text-[10px] text-white/40 truncate">{user.position}</p>
          </div>}
        </button>
      </div>
    </div>
  );

  // ── Loading splash ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Pill size={32} className="text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading SmartTrack…</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-background overflow-hidden">
        <aside className="flex-shrink-0 transition-all duration-300 overflow-hidden"
          style={{ width: sidebarExpanded ? "224px" : "52px" }}>
          {sidebarContent}
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="flex-shrink-0 h-14 border-b border-border flex items-center gap-3 px-4 sm:px-6 bg-card shadow-sm" style={{ zIndex: 10, position: "relative" }}>
            <div className="flex-1 flex items-center">
              <div className="relative max-w-xs w-full hidden sm:block">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input placeholder="Search products, transactions"
                  className="w-full bg-background border border-border rounded-xl pl-8 pr-4 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary">{user.initials}</div>
                <div className="hidden sm:flex items-center gap-3">
                  <span className="text-xs font-bold text-foreground">{user.name.split(" ")[0]}</span>
                  <button onClick={onLogout}
                    className="inline-flex items-center justify-center rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] font-semibold text-foreground hover:bg-background hover:border-primary hover:text-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30">
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Pages */}
          <main className="flex-1 overflow-y-auto">
            {page === "dashboard"    && isAdmin && <DashboardView user={user} inventory={inventory} transactions={transactions} />}
            {page === "inventory"    && <InventoryPage inventory={inventory} categories={categories}
              onAddProduct={() => setShowAddProduct(true)} onEditProduct={setEditingProduct}
              onDeleteProduct={setDeletingProduct} onAddCategory={handleAddCategory}
              selectedProductId={selectedProductId} hoveredProductId={hoveredNotifPid} 
              userRole={user.role} />}
            {page === "transactions" && <TransactionsPage user={user} transactions={transactions} inventory={inventory} currentUser={user}
              onAddSale={() => setShowAddSale(true)} onAddReturn={setReturningTx} onViewInvoice={setViewingInvoice} />}
            {page === "analytics"    && <AnalyticsPage inventory={inventory} transactions={transactions} />}
            {page === "stock-alerts" && <StockAlertsPage inventory={inventory} onGoToInventory={() => setPage("inventory")} onEditProduct={handleStockAlertEditProduct} />}
            {page === "reports"      && <ReportsPage inventory={inventory} transactions={transactions} user={user} />}
            {page === "users"        && isAdmin && <UsersPage staff={staff} currentUserId={user.id} currentUserRole={user.role} onAddUser={() => setShowAddUser(true)} onEditUser={setEditingUser} onDeleteUser={handleDeleteUser} onToggleStatus={handleToggleStatus} onResetPassword={handleAdminResetPassword} onCreatePassword={handleAdminCreatePassword} />}
          </main>
        </div>

        {/* Modals */}
        {showAddProduct && <ProductFormModal inventory={inventory} categories={categories}
          onClose={() => setShowAddProduct(false)} onSave={handleSaveProduct} onAddCategory={handleAddCategory} />}
        {editingProduct && <ProductFormModal initial={editingProduct} inventory={inventory} categories={categories}
          onClose={() => setEditingProduct(null)} onSave={handleSaveProduct} onAddCategory={handleAddCategory} />}
        {deletingProduct && <DeleteConfirmModal product={deletingProduct}
          onClose={() => setDeletingProduct(null)} onConfirm={() => handleDeleteProduct(deletingProduct)} />}
        {showAddSale && <NewSaleModal onClose={() => setShowAddSale(false)} onAdd={handleAddSale} inventory={inventory} currentUser={user} />}
        {returningTx  && <ReturnModal saleTx={returningTx} onClose={() => setReturningTx(null)} onAdd={handleReturn} inventory={inventory} currentUser={user} />}
        {showAddUser  && <UserFormModal onClose={() => setShowAddUser(false)} onSave={handleSaveUser} currentUserRole={user.role} />}
        {editingUser  && <UserFormModal initial={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} currentUserRole={user.role} />}
        {viewingInvoice && <InvoiceModal tx={viewingInvoice} onClose={() => setViewingInvoice(null)} />}
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
                <button onClick={() => { setPage("stock-alerts"); setSystemAlert(null); }}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                  View Alerts
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
