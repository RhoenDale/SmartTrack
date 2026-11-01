import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Shield, UsersRound, ShieldCheck, KeyRound,
  Eye, EyeOff, RotateCcw, ShieldPlus, Lock, Unlock,
  ArchiveRestore, Flame, Clock, AlertTriangle, Activity,
  CheckCircle2, UserX, RefreshCw, Search, Filter,
} from "lucide-react";
import { type StaffMember, type CustomRole, ROLE_LABELS, PERMISSION_MODULES } from "./data";
import { rolesApi, usersApi, productsApi, type DeletedUser, type DeletedProduct } from "./api";
import { UserInfoModal, InfoTip, TablePager, ConfirmDialog } from "./shared";
import { appendLog, clearActivityLog, readActivityLog, type ActivityEntry } from "./activity";
export { appendLog } from "./activity";

// ─── Create / Set New Password Modal ─────────────────────────────────────────
function CreatePasswordModal({ user, onClose, onSave }: {
  user: StaffMember;
  onClose: () => void;
  onSave: (userId: string, password: string) => Promise<void>;
}) {
  const [newPwd, setNewPwd]       = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew, setShowNew]     = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPwd.trim().length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd)    { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await onSave(user.id, newPwd);
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password.");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm st-overlay-in" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 st-modal-in">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">{user.initials}</div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Set Password</h3>
            <p className="text-[11px] text-muted-foreground">{user.name} · {ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </div>
        {success ? (
          <div className="text-center py-4 space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto"><ShieldCheck size={24} className="text-emerald-500" /></div>
            <p className="text-sm font-bold text-foreground">Password Set</p>
            <p className="text-xs text-muted-foreground">{user.name} can now log in.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {[
              { label: "New Password", val: newPwd, set: setNewPwd, show: showNew, toggle: () => setShowNew(v => !v) },
              { label: "Confirm", val: confirmPwd, set: setConfirmPwd, show: showConf, toggle: () => setShowConf(v => !v) },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{f.label}</label>
                <div className="relative">
                  <input type={f.show ? "text" : "password"} value={f.val} onChange={e => f.set(e.target.value)}
                    required minLength={6}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                  <button type="button" tabIndex={-1} onClick={f.toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {f.show ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            ))}
            {confirmPwd && newPwd && newPwd !== confirmPwd && <p className="text-xs text-amber-600">Passwords do not match</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-all">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-60 transition-opacity">{loading ? "Setting…" : "Set Password"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Role colour helper ───────────────────────────────────────────────────────
function roleChip(role: string, labelMap: Record<string, string>) {
  const colours: Record<string, string> = {
    "admin/owner": "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25",
    "admin":       "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25",
    "inventory_manager": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25",
    "cashier":     "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/25",
  };
  const cls = colours[role] ?? "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{labelMap[role] ?? role}</span>;
}

// ─── User card ────────────────────────────────────────────────────────────────
function UserCard({
  s, canManage, pwdManageable, isSelf,
  onView, onEdit, onDelete, onToggleStatus, onReset, onSetPassword, roleLabelsMap,
}: {
  s: StaffMember;
  canManage: boolean; pwdManageable: boolean; isSelf: boolean;
  onView: () => void; onEdit: () => void; onDelete: () => void;
  onToggleStatus: () => void; onReset: () => void; onSetPassword: () => void;
  roleLabelsMap: Record<string, string>;
}) {
  const avatarColours: Record<string, string> = {
    "admin/owner": "bg-purple-500/15 text-purple-600 border-purple-300/50 dark:text-purple-300",
    "admin":       "bg-blue-500/15 text-blue-600 border-blue-300/50 dark:text-blue-300",
    "inventory_manager": "bg-amber-500/15 text-amber-600 border-amber-300/50 dark:text-amber-300",
    "cashier":     "bg-teal-500/15 text-teal-600 border-teal-300/50 dark:text-teal-300",
  };
  const av = avatarColours[s.role] ?? "bg-muted text-muted-foreground border-border";
  const isActive = s.status === "active";

  return (
    <div className="group relative bg-card border border-border/80 rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 hover:shadow-[0_4px_16px_-4px_rgba(37,99,235,0.1)] transition-all st-card">
      {/* Status dot */}
      <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} title={isActive ? "Active" : "Inactive"} />

      {/* Avatar + name */}
      <button type="button" onClick={onView} className="flex items-center gap-3 text-left w-full">
        <div className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center text-sm font-bold flex-shrink-0 ${av}`}>
          {s.initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate leading-tight">{s.name}</p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{s.email}</p>
        </div>
      </button>

      {/* Role + status row */}
      <div className="flex items-center justify-between gap-2">
        {roleChip(s.role, roleLabelsMap)}
        <button
          type="button"
          onClick={canManage ? onToggleStatus : undefined}
          disabled={!canManage}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
            isActive
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 hover:bg-emerald-100"
              : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
          } ${!canManage ? "opacity-40 cursor-default" : "cursor-pointer"}`}
        >
          {isActive ? "Active" : "Inactive"}
        </button>
      </div>

      {/* Last login */}
      <p className="text-[10px] text-muted-foreground flex items-center gap-1 -mt-1">
        <Clock size={10} />
        {s.lastLogin ? `Last login ${s.lastLogin}` : "Never logged in"}
      </p>

      {/* Actions — visible on hover */}
      {(canManage || isSelf) && (
        <div className="flex items-center gap-1 border-t border-border/60 pt-2 -mb-1 flex-wrap">
          {canManage && (
            <button onClick={onEdit} title="Edit user" className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all st-btn-ghost">
              <Pencil size={13} />
            </button>
          )}
          {canManage && (
            <button onClick={onDelete} title="Move to recycle bin" className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all st-btn-ghost">
              <Trash2 size={13} />
            </button>
          )}
          {pwdManageable && <span className="w-px h-4 bg-border" />}
          {pwdManageable && (
            <button onClick={onReset} title="Clear password" className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-all st-btn-ghost">
              <RotateCcw size={13} />
            </button>
          )}
          {pwdManageable && (
            <button onClick={onSetPassword} title="Set new password" className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all st-btn-ghost">
              <KeyRound size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Activity Log panel ───────────────────────────────────────────────────────
export function ActivityLogPanel() {
  const [log, setLog] = useState<ActivityEntry[]>(readActivityLog());
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<ActivityEntry["kind"] | "all">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    let active = true;
    const syncServerDeletions = async () => {
      try {
        const [delProds, delUsers] = await Promise.all([
          productsApi.listDeleted().catch(() => [] as DeletedProduct[]),
          usersApi.listDeleted().catch(() => [] as DeletedUser[]),
        ]);
        if (!active) return;

        setLog(prevLog => {
          const updated = [...prevLog];
          let changed = false;

          delProds.forEach(p => {
            const exists = updated.some(e => e.subject === p.name || (e.detail && e.detail.includes(`ID ${p.id}`)));
            if (!exists && p.deletedAt) {
              updated.push({
                id: `server-del-prod-${p.id}`,
                ts: new Date(p.deletedAt).getTime() || Date.now(),
                actor: p.deletedByName || "Admin",
                action: "deleted product",
                subject: p.name,
                detail: `ID ${p.id} · ${p.category || "General"}`,
                kind: "delete",
              });
              changed = true;
            }
          });

          delUsers.forEach(u => {
            const exists = updated.some(e => e.subject === u.name || (e.detail && e.detail.includes(`ID ${u.id}`)));
            if (!exists && u.deletedAt) {
              updated.push({
                id: `server-del-user-${u.id}`,
                ts: new Date(u.deletedAt).getTime() || Date.now(),
                actor: u.deletedByName || "Admin",
                action: "deleted user",
                subject: u.name,
                detail: `ID ${u.id} · ${ROLE_LABELS[u.role] ?? u.role}`,
                kind: "delete",
              });
              changed = true;
            }
          });

          if (changed) {
            updated.sort((a, b) => b.ts - a.ts);
            try { localStorage.setItem("st_user_activity_log", JSON.stringify(updated)); }
            catch (err) { console.error("Could not save synced activity log.", err); }
          }
          return updated;
        });
      } catch (err) {
        console.error("Failed to sync server deletions into activity log", err);
      }
    };

    void syncServerDeletions();

    const handleLogged = () => setLog(readActivityLog());
    window.addEventListener("st_activity_logged", handleLogged);
    window.addEventListener("storage", handleLogged);
    return () => {
      active = false;
      window.removeEventListener("st_activity_logged", handleLogged);
      window.removeEventListener("storage", handleLogged);
    };
  }, []);

  const filtered = useMemo(() => log.filter(e => {
    if (filterKind !== "all" && e.kind !== filterKind) return false;
    if (search && ![e.actor, e.action, e.subject, e.detail ?? ""].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [log, search, filterKind]);
  const pageEntries = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))));
  }, [filtered.length]);

  const kindLabel: Record<ActivityEntry["kind"], string> = {
    create: "Created", update: "Updated", delete: "Deleted",
    restore: "Restored", password: "Password", role: "Role",
    sale: "Sale", stock: "Stock", return: "Return", purchase: "Purchase", auth: "Access",
  };
  const kindColour: Record<ActivityEntry["kind"], string> = {
    create:   "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    update:   "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    delete:   "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    restore:  "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20",
    password: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    role:     "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
    sale:     "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    stock:    "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20",
    return:   "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
    purchase: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20",
    auth:     "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20",
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto st-page-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">Activity Log</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Successful sales, stock, return, purchase, and account changes recorded in this browser.</p>
        </div>
        {log.length > 0 && (
          <button onClick={() => { clearActivityLog(); setLog([]); setPage(1); }}
            className="text-xs text-muted-foreground hover:text-red-500 border border-border hover:border-red-300 rounded-lg px-3 py-2 transition-all flex-shrink-0">
            Clear log
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search log…"
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/25" />
        </div>
        <select value={filterKind} onChange={e => { setFilterKind(e.target.value as any); setPage(1); }}
          className="app-select rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/25">
          <option value="all">All actions</option>
          {(Object.keys(kindLabel) as ActivityEntry["kind"][]).map(k => (
            <option key={k} value={k}>{kindLabel[k]}</option>
          ))}
        </select>
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center gap-2">
          <Activity size={32} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{log.length === 0 ? "No activity recorded yet." : "No entries match your filter."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-card divide-y divide-border/60 overflow-hidden shadow-sm">
          {pageEntries.map(e => (
            <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <span className={`mt-0.5 flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${kindColour[e.kind]}`}>{kindLabel[e.kind]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground"><span className="font-semibold">{e.actor}</span> {e.action} <span className="font-semibold">{e.subject}</span></p>
                {e.detail && <p className="text-[11px] text-muted-foreground mt-0.5">{e.detail}</p>}
              </div>
              <p className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">{new Date(e.ts).toLocaleTimeString()}</p>
            </div>
          ))}
        </div>
      )}
      <TablePager total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}

// ─── Recycle Bin types (module-level to avoid re-declaration issues) ──────────
type RecycleConfirmState =
  | { kind: "user"; item: DeletedUser }
  | { kind: "product"; item: DeletedProduct }
  | null;

// ─── Recycle Bin panel ────────────────────────────────────────────────────────
const AUTO_PURGE_DAYS = 30;

export function RecycleBinPanel({
  currentUserRole, currentUserName, onRestored,
}: {
  currentUserRole: string; currentUserName: string; onRestored: () => void;
}) {
  const [deletedUsers,    setDeletedUsers]    = useState<DeletedUser[]>([]);
  const [deletedProducts, setDeletedProducts] = useState<DeletedProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [busy,     setBusy]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "products">("products");
  const [confirmRestore,  setConfirmRestore]  = useState<RecycleConfirmState>(null);
  const [confirmPurge,    setConfirmPurge]    = useState<RecycleConfirmState>(null);
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);
  const [search,          setSearch]          = useState("");
  const [page,            setPage]            = useState(1);
  const PAGE_SIZE = 10;

  const isOwner = currentUserRole === "admin/owner";
  const isAdmin = currentUserRole === "admin/owner" || currentUserRole === "admin";

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [users, products] = await Promise.all([
        usersApi.listDeleted().catch(() => [] as DeletedUser[]),
        productsApi.listDeleted().catch(() => [] as DeletedProduct[]),
      ]);
      setDeletedUsers(users);
      setDeletedProducts(products);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load recycle bin."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const allItems = [...deletedUsers, ...deletedProducts];
  const expired  = allItems.filter(i => i.daysSinceDelete >= AUTO_PURGE_DAYS);
  const recent   = allItems.filter(i => i.daysSinceDelete < 1);

  const handleRestore = async (state: RecycleConfirmState) => {
    if (!state) return;
    setBusy(state.item.id);
    try {
      if (state.kind === "user") {
        await usersApi.restore(state.item.id);
      } else {
        await productsApi.restore(state.item.id);
      }
      onRestored();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Restore failed."); }
    finally { setBusy(null); setConfirmRestore(null); }
  };

  const handlePurge = async (state: RecycleConfirmState) => {
    if (!state) return;
    setBusy(state.item.id);
    try {
      if (state.kind === "user") {
        await usersApi.purge(state.item.id);
      } else {
        await productsApi.purge(state.item.id);
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Purge failed."); }
    finally { setBusy(null); setConfirmPurge(null); }
  };

  const handlePurgeAll = async () => {
    setBusy("all");
    try {
      const expiredUsers    = deletedUsers.filter(u => u.daysSinceDelete >= AUTO_PURGE_DAYS);
      const expiredProducts = deletedProducts.filter(p => p.daysSinceDelete >= AUTO_PURGE_DAYS);
      await Promise.all([
        ...expiredUsers.map(u => usersApi.purge(u.id)),
        ...expiredProducts.map(p => productsApi.purge(p.id)),
      ]);
      appendLog({ actor: currentUserName, action: `purged ${expired.length} expired items`, subject: "Recycle Bin", kind: "delete" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Purge failed."); }
    finally { setBusy(null); setConfirmPurgeAll(false); }
  };

  const currentItems = (activeTab === "users" ? deletedUsers : deletedProducts).filter(i => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      (i.deleteNote && i.deleteNote.toLowerCase().includes(q)) ||
      (i.deletedByName && i.deletedByName.toLowerCase().includes(q))
    );
  });
  const pageItems = currentItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, Math.ceil(currentItems.length / PAGE_SIZE))));
  }, [currentItems.length]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto st-page-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Recycle Bin</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deleted items are held for {AUTO_PURGE_DAYS} days. Restore anytime or purge permanently.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-muted/50 transition-all disabled:opacity-50">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          {isOwner && expired.length > 0 && (
            <button onClick={() => setConfirmPurgeAll(true)}
              className="inline-flex items-center gap-1.5 text-xs bg-red-600 text-white rounded-lg px-3 py-2 hover:bg-red-700 transition-all">
              <Flame size={12} /> Purge {expired.length} expired
            </button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {/* Smart notices */}
      {recent.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Recent deletion detected</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              {recent.map(i => i.name).join(", ")} {recent.length === 1 ? "was" : "were"} deleted less than 24 hours ago. Restore if it was a mistake.
            </p>
          </div>
        </div>
      )}
      {expired.length > 0 && isOwner && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-start gap-2.5">
          <Flame size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">{expired.length} item{expired.length > 1 ? "s" : ""} ready for purge</p>
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{expired.map(i => i.name).join(", ")} {expired.length === 1 ? "has" : "have"} been in the bin for {AUTO_PURGE_DAYS}+ days.</p>
          </div>
        </div>
      )}

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex gap-1">
          {([
            { id: "products" as const, label: `Products (${deletedProducts.length})` },
            { id: "users"    as const, label: `Users (${deletedUsers.length})` },
          ]).map(t => (
            <button key={t.id} type="button" onClick={() => { setActiveTab(t.id); setPage(1); }}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={`Search deleted ${activeTab}…`}
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : currentItems.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-2 text-center">
          <CheckCircle2 size={28} className="text-emerald-500/50" />
          <p className="text-sm text-muted-foreground">No deleted {activeTab} found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-card divide-y divide-border/60 overflow-hidden shadow-sm">
          {pageItems.map(item => {
            const isExpired = item.daysSinceDelete >= AUTO_PURGE_DAYS;
            const isRecent  = item.daysSinceDelete < 1;
            const isUser    = activeTab === "users";
            return (
              <div key={item.id} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${isExpired ? "bg-red-50/40 dark:bg-red-500/5" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isUser ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    {isUser ? (item as DeletedUser).initials : (item as DeletedProduct).name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      {isRecent  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">Recent</span>}
                      {isExpired && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">Expired</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {isUser
                        ? `${ROLE_LABELS[(item as DeletedUser).role] ?? (item as DeletedUser).role}`
                        : `${(item as DeletedProduct).category} · ${(item as DeletedProduct).stock} units`}
                      {" · "}Deleted {item.daysSinceDelete === 0 ? "today" : `${item.daysSinceDelete}d ago`}
                      {item.deletedByName ? ` by ${item.deletedByName}` : ""}
                      {item.deleteNote ? ` · "${item.deleteNote}"` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setConfirmRestore(isUser ? { kind: "user", item: item as DeletedUser } : { kind: "product", item: item as DeletedProduct })}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                  >
                    <ArchiveRestore size={12} /> Restore
                  </button>
                  {(isOwner || isAdmin) && (
                    <button
                      onClick={() => setConfirmPurge(isUser ? { kind: "user", item: item as DeletedUser } : { kind: "product", item: item as DeletedProduct })}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300/60 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all"
                    >
                      <Trash2 size={12} /> Purge
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && currentItems.length > 0 && (
        <TablePager total={currentItems.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
      )}

      {confirmRestore && (
        <ConfirmDialog
          title={confirmRestore.kind === "user" ? "Restore User?" : "Restore Product?"}
          message={confirmRestore.kind === "user"
            ? <><span className="font-semibold text-foreground">{confirmRestore.item.name}</span> will be restored as inactive — activate when ready.</>
            : <><span className="font-semibold text-foreground">{confirmRestore.item.name}</span> will be restored back to inventory.</>}
          confirmLabel="Yes, Restore" variant="info"
          onConfirm={() => void handleRestore(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
      {confirmPurge && (
        <ConfirmDialog
          title="Permanently Delete?"
          message={<>Permanently erase <span className="font-semibold text-foreground">{confirmPurge.item.name}</span>. <span className="font-semibold text-red-500">This cannot be undone.</span></>}
          confirmLabel="Yes, Delete Forever" variant="danger"
          onConfirm={() => void handlePurge(confirmPurge)}
          onCancel={() => setConfirmPurge(null)}
        />
      )}
      {confirmPurgeAll && (
        <ConfirmDialog
          title={`Purge ${expired.length} expired items?`}
          message={<>Permanently delete <span className="font-semibold text-foreground">{expired.map(i => i.name).join(", ")}</span>. This cannot be undone.</>}
          confirmLabel="Purge All Expired" variant="danger"
          onConfirm={() => void handlePurgeAll()}
          onCancel={() => setConfirmPurgeAll(false)}
        />
      )}
    </div>
  );
}
// ─── Users Page ───────────────────────────────────────────────────────────────
export default function UsersPage({
  staff, currentUserId, currentUserRole, currentUserName = "Admin",
  roles, onAddUser, onEditUser, onDeleteUser, onToggleStatus,
  onResetPassword, onCreatePassword, onRolesChanged,
}: {
  staff: StaffMember[];
  currentUserId: string;
  currentUserRole: string;
  currentUserName?: string;
  roles?: CustomRole[];
  onAddUser: () => void;
  onEditUser: (user: StaffMember) => void;
  onDeleteUser: (user: StaffMember) => void;
  onToggleStatus: (user: StaffMember, newStatus: "active" | "inactive") => void;
  onResetPassword: (user: StaffMember) => Promise<void>;
  onCreatePassword: (userId: string, password: string) => Promise<void>;
  onRolesChanged?: () => void;
}) {
  type MainTab = "users" | "roles" | "activity" | "recycle";
  const [activeTab, setActiveTab]         = useState<MainTab>("users");
  const [staffSearch, setStaffSearch]     = useState("");
  const [staffFilter, setStaffFilter]     = useState<string>("all");

  const roleLabelsMap = useMemo(() => {
    const map: Record<string, string> = { ...ROLE_LABELS };
    (roles ?? []).forEach(r => { map[r.id] = r.name; });
    return map;
  }, [roles]);

  // ── Staff tab state ──────────────────────────────────────────────────────────
  const [deleteTarget,    setDeleteTarget]    = useState<StaffMember | null>(null);
  const [statusTarget,    setStatusTarget]    = useState<StaffMember | null>(null);
  const [pendingStatus,   setPendingStatus]   = useState<"active" | "inactive">("active");
  const [viewingUser,     setViewingUser]     = useState<StaffMember | null>(null);
  const [resetTarget,     setResetTarget]     = useState<StaffMember | null>(null);
  const [createPwdTarget, setCreatePwdTarget] = useState<StaffMember | null>(null);
  const [resetSuccess,    setResetSuccess]    = useState<string | null>(null);
  const [staffPage,       setStaffPage]       = useState(1);
  const PAGE_SIZE = 12;

  const isSuperAdmin = currentUserRole === "admin/owner";
  const isAdmin      = currentUserRole === "admin";

  const canManage = (s: StaffMember) => {
    if (s.id === currentUserId) return false;
    if (isSuperAdmin) return true;
    if (isAdmin) return s.role === "cashier" || s.role === "inventory_manager";
    return false;
  };

  const handleStatusClick = (s: StaffMember) => {
    setPendingStatus(s.status === "active" ? "inactive" : "active");
    setStatusTarget(s);
  };

  const handleConfirmReset = async () => {
    if (!resetTarget) return;
    try {
      await onResetPassword(resetTarget);
      setResetSuccess(`${resetTarget.name}'s password has been cleared.`);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to reset password."); }
    finally { setResetTarget(null); }
  };

  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const matchRole = staffFilter === "all" || s.role === staffFilter;
      const matchSearch = !staffSearch || s.name.toLowerCase().includes(staffSearch.toLowerCase()) || s.email.toLowerCase().includes(staffSearch.toLowerCase());
      return matchRole && matchSearch;
    });
  }, [staff, staffSearch, staffFilter]);

  const paginatedStaff = useMemo(() => {
    const start = (staffPage - 1) * PAGE_SIZE;
    return filteredStaff.slice(start, start + PAGE_SIZE);
  }, [filteredStaff, staffPage]);

  // ── Roles tab state ──────────────────────────────────────────────────────────
  const [showRoleForm,  setShowRoleForm]  = useState(false);
  const [editingRole,   setEditingRole]   = useState<CustomRole | null>(null);
  const [deletingRole,  setDeletingRole]  = useState<CustomRole | null>(null);
  const [roleFormError, setRoleFormError] = useState("");
  const [roleSaving,    setRoleSaving]    = useState(false);
  const [roleSuccess,   setRoleSuccess]   = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", permissions: [] as string[] });

  const openAddRole = () => { setEditingRole(null); setRoleForm({ name: "", description: "", permissions: [] }); setRoleFormError(""); setShowRoleForm(true); };
  const openEditRole = (r: CustomRole) => { setEditingRole(r); setRoleForm({ name: r.name, description: r.description ?? "", permissions: [...r.permissions] }); setRoleFormError(""); setShowRoleForm(true); };
  const togglePermission = (pid: string) => setRoleForm(f => ({ ...f, permissions: f.permissions.includes(pid) ? f.permissions.filter(p => p !== pid) : [...f.permissions, pid] }));

  const handleSaveRole = async () => {
    setRoleFormError("");
    if (!roleForm.name.trim()) { setRoleFormError("Role name is required."); return; }
    if (roleForm.permissions.length === 0) { setRoleFormError("Select at least one permission module."); return; }
    setRoleSaving(true);
    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, { name: roleForm.name.trim(), description: roleForm.description.trim(), permissions: roleForm.permissions });
        setRoleSuccess(`Role "${roleForm.name}" updated.`);
      } else {
        await rolesApi.create({ name: roleForm.name.trim(), description: roleForm.description.trim(), permissions: roleForm.permissions });
        setRoleSuccess(`Role "${roleForm.name}" created.`);
      }
      setShowRoleForm(false); onRolesChanged?.();
    } catch (e) { setRoleFormError(e instanceof Error ? e.message : "Failed to save role."); }
    finally { setRoleSaving(false); }
  };

  const handleDeleteRole = async (r: CustomRole) => {
    try {
      await rolesApi.delete(r.id);
      setRoleSuccess(`Role "${r.name}" deleted.`); setDeletingRole(null); onRolesChanged?.();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to delete role."); setDeletingRole(null); }
  };

  const permissionsByCategory = useMemo(() => {
    const g: Record<string, typeof PERMISSION_MODULES> = {};
    PERMISSION_MODULES.forEach(m => { if (!g[m.category]) g[m.category] = []; g[m.category].push(m); });
    return g;
  }, []);

  // Unique roles present in staff for the filter dropdown
  const staffRoles = useMemo(() => [...new Set(staff.map(s => s.role))], [staff]);

  // Stats
  const activeCount   = staff.filter(s => s.status === "active").length;
  const inactiveCount = staff.filter(s => s.status !== "active").length;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto st-page-in">

      {/* ── Header ── */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">Users & Roles</h1>
            <InfoTip title="Staff Accounts & Role Management" lines={[
              "Manage employee credentials and define custom access roles.",
              { label: "Staff", value: "Add, activate/deactivate, reset passwords" },
              { label: "Roles", value: "Create custom roles with specific permissions" },
              { label: "Settings", value: "Activity log and recycle bin for deleted users" },
            ]} />
          </div>
          {/* KPI strip */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{staff.length} total staff</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-semibold">{activeCount} active</span>
            {inactiveCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-semibold">{inactiveCount} inactive</span>}
            <span className="text-[10px] text-muted-foreground">{(roles ?? []).filter(r => !r.isSystem).length} custom roles</span>
          </div>
        </div>
        {activeTab === "users" && (
          <button onClick={onAddUser} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 flex-shrink-0 st-btn">
            <Plus size={14} /> Add User
          </button>
        )}
        {activeTab === "roles" && (
          <button onClick={openAddRole} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 flex-shrink-0 st-btn">
            <ShieldPlus size={14} /> New Role
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: "users",    label: "Users",        icon: UsersRound },
          { id: "roles",    label: "Roles",        icon: Shield },
          { id: "activity", label: "Activity Log", icon: Activity },
          { id: "recycle",  label: "Recycle Bin",  icon: Trash2 },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <Icon size={13} /> {label}
            {id === "users" && <span className="ml-1 text-[9px] opacity-70">({staff.length})</span>}
          </button>
        ))}
      </div>

      {/* ── Success banner ── */}
      {(resetSuccess || roleSuccess) && (
        <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-4 py-3">
          <ShieldCheck size={14} className="text-emerald-500 flex-shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400 flex-1">{resetSuccess ?? roleSuccess}</p>
          <button onClick={() => { setResetSuccess(null); setRoleSuccess(null); }} className="text-emerald-500 hover:text-emerald-700 text-xs font-bold leading-none">✕</button>
        </div>
      )}

      {/* ══════════════════════ USERS TAB ══════════════════════════════════════ */}
      {activeTab === "users" && (
        <div className="space-y-3">
          {/* Search + filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={staffSearch} onChange={e => { setStaffSearch(e.target.value); setStaffPage(1); }}
                placeholder="Search staff…"
                className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all" />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-muted-foreground" />
              <select value={staffFilter} onChange={e => { setStaffFilter(e.target.value); setStaffPage(1); }}
                className="app-select rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/25">
                <option value="all">All roles</option>
                {staffRoles.map(r => <option key={r} value={r}>{roleLabelsMap[r] ?? r}</option>)}
              </select>
            </div>
          </div>

          {/* Cards grid */}
          {filteredStaff.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-2 text-center">
              <UserX size={28} className="text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{staff.length === 0 ? "No staff accounts yet." : "No staff match your search."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 st-grid">
              {paginatedStaff.map(s => (
                <UserCard
                  key={s.id}
                  s={s}
                  canManage={canManage(s)}
                  pwdManageable={canManage(s)}
                  isSelf={s.id === currentUserId}
                  roleLabelsMap={roleLabelsMap}
                  onView={() => setViewingUser(s)}
                  onEdit={() => onEditUser(s)}
                  onDelete={() => setDeleteTarget(s)}
                  onToggleStatus={() => handleStatusClick(s)}
                  onReset={() => setResetTarget(s)}
                  onSetPassword={() => setCreatePwdTarget(s)}
                />
              ))}
            </div>
          )}
          <TablePager total={filteredStaff.length} page={staffPage} pageSize={PAGE_SIZE} onPage={setStaffPage} />
        </div>
      )}

      {/* ══════════════════════ ROLES TAB ══════════════════════════════════════ */}
      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(roles ?? []).map(role => (
              <div key={role.id}
                className="bg-card border border-border/80 rounded-xl p-4 space-y-3 shadow-sm hover:border-primary/30 transition-all group st-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${role.isSystem ? "bg-blue-500/10 border border-blue-500/20" : "bg-indigo-500/10 border border-indigo-500/20"}`}>
                      {role.isSystem ? <Lock size={13} className="text-blue-500" /> : <Unlock size={13} className="text-indigo-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{role.name}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border inline-block mt-0.5 ${role.isSystem ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"}`}>
                        {role.isSystem ? "System" : "Custom"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditRole(role)} title="Edit role"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all st-btn-ghost">
                      <Pencil size={12} />
                    </button>
                    {!role.isSystem && (
                      <button onClick={() => setDeletingRole(role)} title="Delete role"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all st-btn-ghost">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {role.description && <p className="text-[11px] text-muted-foreground leading-relaxed">{role.description}</p>}
                <div className="space-y-1">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Permissions ({role.permissions.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map(pid => {
                      const mod = PERMISSION_MODULES.find(m => m.id === pid);
                      return <span key={pid} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/70 border border-border font-medium text-foreground/80">{mod?.name ?? pid}</span>;
                    })}
                    {role.permissions.length === 0 && <span className="text-[9px] text-muted-foreground italic">No permissions</span>}
                  </div>
                </div>
                {role.userCount !== undefined && (
                  <p className="text-[10px] text-muted-foreground border-t border-border pt-2">{role.userCount === 0 ? "No users assigned" : `${role.userCount} user${role.userCount > 1 ? "s" : ""} assigned`}</p>
                )}
              </div>
            ))}
            {(roles ?? []).length === 0 && (
              <div className="col-span-3 flex flex-col items-center py-16 gap-2 text-center">
                <ShieldPlus size={28} className="text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No roles yet. Create your first custom role.</p>
              </div>
            )}
          </div>

          {/* Role Form Modal */}
          {showRoleForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/45 backdrop-blur-sm st-overlay-in" onClick={() => setShowRoleForm(false)} />
              <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto st-modal-in">
                <div className="p-5 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{editingRole ? `Edit: ${editingRole.name}` : "Create New Role"}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{editingRole ? "Update permissions and description." : "Define access for a new role."}</p>
                  </div>
                  <button onClick={() => setShowRoleForm(false)} className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-xs">✕</button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Role Name <span className="text-red-500">*</span></label>
                    <input type="text" value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Store Auditor" disabled={editingRole?.isSystem}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50" />
                    {editingRole?.isSystem && <p className="text-[11px] text-blue-500 mt-1 flex items-center gap-1"><Lock size={10} /> System role — name is protected.</p>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Description</label>
                    <textarea value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What does this role do?" rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Permissions <span className="text-red-500">*</span>
                      <span className="ml-2 font-normal normal-case text-muted-foreground/70">({roleForm.permissions.length} selected)</span>
                    </label>
                    <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                      {Object.entries(permissionsByCategory).map(([category, mods]) => (
                        <div key={category}>
                          <div className="px-3 py-1.5 bg-muted/40"><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{category}</span></div>
                          {mods.map(mod => (
                            <label key={mod.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors">
                              <div className="relative flex-shrink-0 mt-0.5">
                                <input type="checkbox" checked={roleForm.permissions.includes(mod.id)} onChange={() => togglePermission(mod.id)} className="sr-only" />
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${roleForm.permissions.includes(mod.id) ? "bg-primary border-primary" : "border-border bg-background"}`}>
                                  {roleForm.permissions.includes(mod.id) && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground">{mod.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{mod.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  {roleFormError && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{roleFormError}</div>}
                </div>
                <div className="p-5 border-t border-border flex gap-3">
                  <button onClick={() => setShowRoleForm(false)} disabled={roleSaving} className="flex-1 py-2.5 border border-border rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-all disabled:opacity-50">Cancel</button>
                  <button onClick={handleSaveRole} disabled={roleSaving} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-60 transition-opacity st-btn">
                    {roleSaving ? "Saving…" : editingRole ? "Save Changes" : "Create Role"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {deletingRole && (
            <ConfirmDialog
              title="Delete Role?"
              message={<>Permanently delete <span className="font-semibold text-foreground">"{deletingRole.name}"</span>? Users assigned to this role must be reassigned first.</>}
              confirmLabel="Yes, Delete" variant="danger"
              onCancel={() => setDeletingRole(null)}
              onConfirm={() => handleDeleteRole(deletingRole)}
            />
          )}
        </div>
      )}

      {/* ══════════════════════ ACTIVITY LOG TAB ══════════════════════════════ */}
      {activeTab === "activity" && <ActivityLogPanel />}

      {/* ══════════════════════ RECYCLE BIN TAB ════════════════════════════════ */}
      {activeTab === "recycle" && (
        <RecycleBinPanel
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onRestored={() => onRolesChanged?.()}
        />
      )}

      {/* ── Modals & confirms ── */}
      {viewingUser    && <UserInfoModal user={viewingUser} onClose={() => setViewingUser(null)} />}
      {createPwdTarget && <CreatePasswordModal user={createPwdTarget} onClose={() => setCreatePwdTarget(null)} onSave={onCreatePassword} />}

      {deleteTarget && (
        <ConfirmDialog
          title="Move to Recycle Bin?"
          message={<>Move <span className="font-semibold text-foreground">{deleteTarget.name}</span> to the recycle bin? They can be restored within {30} days.</>}
          confirmLabel="Yes, Delete" variant="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDeleteUser(deleteTarget);
            setDeleteTarget(null);
          }}
        />
      )}
      {statusTarget && (
        <ConfirmDialog
          title={pendingStatus === "inactive" ? "Deactivate User?" : "Activate User?"}
          message={pendingStatus === "inactive"
            ? <><span className="font-semibold text-foreground">{statusTarget.name}</span> will no longer be able to log in.</>
            : <><span className="font-semibold text-foreground">{statusTarget.name}</span> will be able to log in again.</>}
          confirmLabel={pendingStatus === "inactive" ? "Deactivate" : "Activate"}
          variant={pendingStatus === "inactive" ? "warning" : "info"}
          onCancel={() => setStatusTarget(null)}
          onConfirm={() => {
            onToggleStatus(statusTarget, pendingStatus);
            setStatusTarget(null);
          }}
        />
      )}
      {resetTarget && (
        <ConfirmDialog
          title="Clear Password?"
          message={<>This clears <span className="font-semibold text-foreground">{resetTarget.name}</span>'s password. They won't be able to log in until a new password is set.</>}
          confirmLabel="Yes, Clear" variant="warning"
          onCancel={() => setResetTarget(null)}
          onConfirm={handleConfirmReset}
        />
      )}
    </div>
  );
}
