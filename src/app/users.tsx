import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Shield, UsersRound, ShieldCheck, KeyRound,
  Eye, EyeOff, RotateCcw, ShieldPlus, Lock, Unlock,
  ArchiveRestore, Flame, Clock, AlertTriangle, Activity,
  UserX, RefreshCw, Search, Filter, Pill, UserRound,
} from "lucide-react";
import { type StaffMember, type CustomRole, ROLE_LABELS, PERMISSION_MODULES } from "./data";
import { activityApi, rolesApi, usersApi, productsApi, type ActivityLogEntry, type DeletedUser, type DeletedProduct } from "./api";
import { UserInfoModal, InfoTip, TablePager, ConfirmDialog } from "./shared";
import { appendLog } from "./activity";
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
      <div className="absolute inset-0 bg-black/50 st-overlay-in" onClick={onClose} />
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
        <div className="flex flex-wrap gap-1">
          {(s.roles ?? [s.role]).map(role => <span key={role}>{roleChip(role, roleLabelsMap)}</span>)}
        </div>
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
export function ActivityLogPanel({ isAdmin = true }: { isAdmin?: boolean }) {
  const [log, setLog] = useState<ActivityLogEntry[]>([]);
  const [actors, setActors] = useState<{ id: string | null; name: string }[]>([]);
  const [filterActor, setFilterActor] = useState("");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async (before?: string) => {
    setLoading(true);
    setError("");
    try {
      const page = await activityApi.list({ before, actorId: isAdmin ? filterActor : undefined });
      setLog(current => before ? [...current, ...page.entries] : page.entries);
      setActors(page.actors);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load activity logs.");
    } finally {
      setLoading(false);
    }
  }, [filterActor, isAdmin]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLog = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return log;
    return log.filter(entry =>
      [entry.actor, entry.method, entry.path, String(entry.status)]
        .some(value => value.toLowerCase().includes(query))
    );
  }, [log, search]);

  const methodColour = (method: string) => {
    if (method === "GET") return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    if (method === "POST") return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    if (method === "PUT" || method === "PATCH") return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    if (method === "DELETE") return "bg-rose-500/10 text-rose-500 border-rose-500/20";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full max-w-[1400px] mx-auto st-page-in">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
            <Activity size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Activity Log</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isAdmin ? "A searchable record of activity across accounts." : "A searchable record of your activity."}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void loadLogs()} disabled={loading}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search actor, endpoint, method, or status"
            aria-label="Search activity log"
            className="w-full rounded-xl border border-border/70 bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        {isAdmin && (
          <select
            id="activity-user-filter"
            aria-label="Filter activity by user"
            value={filterActor}
            onChange={event => {
              setLog([]);
              setNextCursor(null);
              setHasMore(false);
              setFilterActor(event.target.value);
            }}
            className="app-select w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15 sm:w-52"
          >
            <option value="">All users</option>
            {actors.map((actor, index) => (
              <option key={actor.id ?? `anonymous-${index}`} value={actor.id ?? "anonymous"}>{actor.name}</option>
            ))}
          </select>
        )}
        <span className="flex-shrink-0 px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {filteredLog.length} {filteredLog.length === 1 ? "match" : "matches"} · {log.length} loaded
        </span>
      </section>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={() => void loadLogs()} className="flex-shrink-0 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      {loading && log.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card py-16 text-center">
          <RefreshCw size={20} className="animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        </div>
      ) : log.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card py-16 text-center">
          <Activity size={28} className="text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No activity records found.</p>
        </div>
      ) : filteredLog.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card py-14 text-center">
          <Search size={24} className="text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No activity matches this search.</p>
        </div>
      ) : (
        <div className="max-h-[calc(100dvh-270px)] overflow-y-auto rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="divide-y divide-border/60">
            {filteredLog.map(entry => {
              const actorInitials = entry.actor.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
              const timestamp = new Date(entry.ts);
              const timestampLabel = Number.isNaN(timestamp.getTime())
                ? entry.ts
                : `${timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} ${timestamp.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
              return (
                <article key={entry.id} className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/25 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-xs font-semibold text-primary">
                      {actorInitials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{entry.actor || "Unknown actor"}</span>
                        <span className="rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {entry.actorId ? "Account" : "Unattributed"}
                        </span>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs leading-relaxed text-muted-foreground">{entry.path}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                    <span className={`inline-flex min-w-14 justify-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold ${methodColour(entry.method)}`}>
                      {entry.method}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold ${
                      entry.status >= 400
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {entry.status}
                    </span>
                    <time dateTime={entry.ts} className="font-mono text-[10px] tabular-nums text-muted-foreground sm:min-w-40 sm:text-right">
                      {timestampLabel}
                    </time>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
      {hasMore && nextCursor && (
        <div className="flex justify-center">
          <button type="button" disabled={loading} onClick={() => void loadLogs(nextCursor)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 disabled:opacity-50">
            {loading && <RefreshCw size={13} className="animate-spin" />}
            {loading ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
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
  currentUserRoles, currentUserName, onRestored,
}: {
  currentUserRoles: string[]; currentUserName: string; onRestored: () => void;
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

  const isOwner = currentUserRoles.includes("admin/owner");
  const isAdmin = isOwner || currentUserRoles.includes("admin");

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
    <div className="p-4 sm:p-6 space-y-5 w-full max-w-[1400px] mx-auto st-page-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/60 text-muted-foreground">
            <Trash2 size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Recycle Bin</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Restore deleted items or remove them permanently.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          {isOwner && expired.length > 0 && (
            <button type="button" onClick={() => setConfirmPurgeAll(true)}
              className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/15 dark:text-rose-400">
              <Flame size={13} /> Purge expired ({expired.length})
            </button>
          )}
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/35 p-4">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground shadow-sm">
          <Clock size={17} />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">Items in Trash are automatically deleted after {AUTO_PURGE_DAYS} days.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Restore an item before then, or permanently purge it now.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="flex-shrink-0 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Recycle Bin item type" className="inline-flex w-full rounded-xl border border-border/70 bg-muted/45 p-1 sm:w-auto">
            {([
              { id: "products" as const, label: "Products", count: deletedProducts.length },
              { id: "users" as const, label: "Users", count: deletedUsers.length },
            ]).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => { setActiveTab(tab.id); setPage(1); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-all sm:flex-initial ${
                  activeTab === tab.id
                    ? "bg-card font-semibold text-foreground shadow-sm"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1); }}
              placeholder={`Search deleted ${activeTab}…`}
              aria-label={`Search deleted ${activeTab}`}
              className="w-full rounded-xl border border-border/70 bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {currentItems.length} {currentItems.length === 1 ? "item" : "items"} in {activeTab === "products" ? "Products" : "Users"}
          {search.trim() ? " matching your search" : ""}
        </p>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card py-16 text-center">
            <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading Trash…</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card px-6 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-border/70 bg-muted/50 text-muted-foreground/70">
              {search.trim() ? <Search size={26} /> : <Trash2 size={27} />}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {search.trim() ? "No matching items" : deletedUsers.length + deletedProducts.length === 0 ? "Trash is Empty" : `No deleted ${activeTab}`}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {search.trim()
                  ? "Try a different search term."
                  : deletedUsers.length + deletedProducts.length === 0
                  ? `Deleted items from the last ${AUTO_PURGE_DAYS} days will appear here.`
                  : `There are no deleted ${activeTab} to show.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pageItems.map(item => {
              const isExpired = item.daysSinceDelete >= AUTO_PURGE_DAYS;
              const isRecent = item.daysSinceDelete < 1;
              const isUser = activeTab === "users";
              const daysLeft = Math.max(0, AUTO_PURGE_DAYS - item.daysSinceDelete);
              const countdownClass = isExpired
                ? "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                : daysLeft <= 7
                ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-emerald-500/15 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
              const canPurge = isUser ? isOwner : (isAdmin || currentUserRoles.includes("inventory_manager"));
              return (
                <article key={item.id} className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${
                      isUser
                        ? "border-violet-500/15 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        : "border-primary/15 bg-primary/10 text-primary"
                    }`}>
                      {isUser ? <UserRound size={19} /> : <Pill size={19} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-sm font-semibold text-foreground">{item.name}</h2>
                        {isRecent && <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Recently deleted</span>}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {isUser
                          ? ((item as DeletedUser).roles ?? [(item as DeletedUser).role]).map(role => ROLE_LABELS[role] ?? role).join(" · ")
                          : `${(item as DeletedProduct).category} · ${(item as DeletedProduct).stock} units`}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className={`inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-[11px] font-medium ${countdownClass}`}>
                      {isExpired
                        ? "Ready for permanent purge"
                        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left until permanent purge`}
                    </span>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Deleted {item.daysSinceDelete === 0 ? "today" : `${item.daysSinceDelete} ${item.daysSinceDelete === 1 ? "day" : "days"} ago`}
                      {item.deletedByName ? ` by ${item.deletedByName}` : ""}
                      {item.deleteNote ? ` · ${item.deleteNote}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(isUser ? { kind: "user", item: item as DeletedUser } : { kind: "product", item: item as DeletedProduct })}
                      disabled={busy !== null}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
                    >
                      <ArchiveRestore size={14} /> Put Back
                    </button>
                    {canPurge && (
                      <button
                        type="button"
                        onClick={() => setConfirmPurge(isUser ? { kind: "user", item: item as DeletedUser } : { kind: "product", item: item as DeletedProduct })}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                      >
                        <Trash2 size={14} /> Purge Permanently
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

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
  staff, currentUserId, currentUserRoles, currentUserName = "Admin",
  roles, onAddUser, onEditUser, onDeleteUser, onToggleStatus,
  onResetPassword, onCreatePassword, onRolesChanged,
}: {
  staff: StaffMember[];
  currentUserId: string;
  currentUserRoles: string[];
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
  type MainTab = "users" | "roles";
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

  const isSuperAdmin = currentUserRoles.includes("admin/owner");
  const isAdmin      = isSuperAdmin || currentUserRoles.includes("admin");

  const canManage = (s: StaffMember) => {
    if (s.id === currentUserId) return false;
    if ((s.roles ?? [s.role]).includes("admin/owner")) return false;
    if (isSuperAdmin) return true;
    if (isAdmin) {
      const targetRoles = s.roles ?? [s.role];
      return targetRoles.length > 0 && targetRoles.every(role => ["cashier", "inventory_manager"].includes(role));
    }
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
      const matchRole = staffFilter === "all" || (s.roles ?? [s.role]).includes(staffFilter);
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
  const staffRoles = useMemo(() => [...new Set(staff.flatMap(s => s.roles ?? [s.role]))], [staff]);

  // Stats
  const activeCount   = staff.filter(s => s.status === "active").length;
  const inactiveCount = staff.filter(s => s.status !== "active").length;

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full max-w-[1400px] mx-auto st-page-in">

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
          { id: "users", label: "Users", icon: UsersRound },
          { id: "roles", label: "Roles", icon: Shield },
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
              <div className="absolute inset-0 bg-black/50 st-overlay-in" onClick={() => setShowRoleForm(false)} />
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
