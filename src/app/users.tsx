import { memo, useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Shield, UsersRound, ShieldCheck, KeyRound,
  Eye, EyeOff, RotateCcw, ShieldPlus, Lock,
  ArchiveRestore, Flame, Clock, AlertTriangle, Activity,
  UserX, RefreshCw, Search, Pill, UserRound,
  LayoutGrid, List, X,
} from "lucide-react";
import { type StaffMember, type CustomRole, ROLE_LABELS, PERMISSION_MODULES } from "./data";
import { activityApi, rolesApi, usersApi, productsApi, type ActivityLogEntry, type DeletedUser, type DeletedProduct } from "./api";
import { UserInfoModal, InfoTip, TablePager, ConfirmDialog, SegmentedTabs } from "./shared";
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
      <div className="relative bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden st-modal-in">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
              {user.initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Set Password</h3>
              <p className="text-xs text-muted-foreground truncate">{user.name} · {ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5">
          {success ? (
            <div className="text-center py-4 space-y-2.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <ShieldCheck size={24} className="text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-foreground">Password Updated</p>
              <p className="text-xs text-muted-foreground">{user.name} can now sign in with the new password.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {[
                { label: "New Password", val: newPwd, set: setNewPwd, show: showNew, toggle: () => setShowNew(v => !v), placeholder: "Minimum 6 characters" },
                { label: "Confirm Password", val: confirmPwd, set: setConfirmPwd, show: showConf, toggle: () => setShowConf(v => !v), placeholder: "Re-enter password" },
              ].map(f => (
                <div key={f.label} className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-muted-foreground">{f.label}</label>
                  <div className="relative">
                    <input
                      type={f.show ? "text" : "password"}
                      value={f.val}
                      onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      required
                      minLength={6}
                      className="w-full rounded-xl border border-border/80 bg-background/80 px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={f.toggle}
                      aria-label={f.show ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {f.show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ))}

              {confirmPwd && newPwd && newPwd !== confirmPwd && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Passwords do not match yet.</p>
              )}
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-60 transition-opacity"
                >
                  {loading ? "Saving…" : "Set Password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Role & user styling helpers ──────────────────────────────────────────────
const ROLE_CHIP_STYLES: Record<string, { pill: string; dot: string }> = {
  "admin/owner":       { pill: "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-300", dot: "bg-purple-500" },
  "admin":             { pill: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-300",         dot: "bg-blue-500" },
  "inventory_manager": { pill: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",      dot: "bg-amber-500" },
  "cashier":           { pill: "bg-teal-500/10 text-teal-700 border-teal-500/20 dark:text-teal-300",         dot: "bg-teal-500" },
};

const AVATAR_TONES: Record<string, string> = {
  "admin/owner":       "bg-purple-500/12 text-purple-600 border-purple-500/25 dark:text-purple-300",
  "admin":             "bg-blue-500/12 text-blue-600 border-blue-500/25 dark:text-blue-300",
  "inventory_manager": "bg-amber-500/12 text-amber-600 border-amber-500/25 dark:text-amber-300",
  "cashier":           "bg-teal-500/12 text-teal-600 border-teal-500/25 dark:text-teal-300",
};

function roleChip(role: string, labelMap: Record<string, string>) {
  const tone = ROLE_CHIP_STYLES[role] ?? { pill: "bg-muted/70 text-foreground/80 border-border/70", dot: "bg-muted-foreground/60" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${tone.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
      {labelMap[role] ?? role}
    </span>
  );
}

interface UserItemProps {
  s: StaffMember;
  canManage: boolean;
  pwdManageable: boolean;
  isSelf: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onReset: () => void;
  onSetPassword: () => void;
  roleLabelsMap: Record<string, string>;
}

function UserStatusBadge({ isActive, canManage, onToggleStatus }: {
  isActive: boolean; canManage: boolean; onToggleStatus: () => void;
}) {
  return (
    <button
      type="button"
      onClick={canManage ? onToggleStatus : undefined}
      disabled={!canManage}
      title={canManage ? (isActive ? "Click to deactivate account" : "Click to activate account") : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all shrink-0 ${
        isActive
          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400"
          : "bg-muted/70 text-muted-foreground border-border/70"
      } ${canManage ? "hover:brightness-95 cursor-pointer" : "cursor-default opacity-75"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
      {isActive ? "Active" : "Inactive"}
    </button>
  );
}

function UserActionControls({
  canManage, pwdManageable, isSelf, onView, onEdit, onDelete, onReset, onSetPassword,
}: Pick<UserItemProps, "canManage" | "pwdManageable" | "isSelf" | "onView" | "onEdit" | "onDelete" | "onReset" | "onSetPassword">) {
  if (!canManage && !pwdManageable) {
    return (
      <div className="flex items-center justify-between gap-2 w-full">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          {isSelf ? "Current session" : <><Lock size={11} /> Protected account</>}
        </span>
        <button
          type="button"
          onClick={onView}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          <UserRound size={11} />
          {isSelf ? "Profile" : "View"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 w-full">
      <div className="flex items-center gap-1.5 flex-wrap">
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Pencil size={11} /> Edit
          </button>
        )}
        {pwdManageable && (
          <button
            type="button"
            onClick={onSetPassword}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <KeyRound size={11} /> Password
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {pwdManageable && (
          <button
            type="button"
            onClick={onReset}
            title="Clear saved password"
            aria-label="Clear saved password"
            className="p-1.5 rounded-full text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        )}
        {canManage && (
          <button
            type="button"
            onClick={onDelete}
            title="Move to recycle bin"
            aria-label="Move to recycle bin"
            className="p-1.5 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── User card (Apple grid view) ──────────────────────────────────────────────
function UserCard({
  s, canManage, pwdManageable, isSelf,
  onView, onEdit, onDelete, onToggleStatus, onReset, onSetPassword, roleLabelsMap,
}: UserItemProps) {
  const av = AVATAR_TONES[s.role] ?? "bg-muted text-muted-foreground border-border";
  const isActive = s.status === "active";
  const lastActiveText = s.lastLogin && s.lastLogin !== "Never" ? `Last active ${s.lastLogin}` : "Never signed in";

  return (
    <div className="group bg-card border border-border/70 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-sm hover:border-primary/30 hover:shadow-md transition-all st-card">
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onView} className="flex items-center gap-3 text-left min-w-0 flex-1 group/btn">
            <div className={`w-11 h-11 rounded-full border flex items-center justify-center text-sm font-semibold shrink-0 ${av}`}>
              {s.initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate group-hover/btn:text-primary transition-colors">{s.name}</p>
                {isSelf && (
                  <span className="shrink-0 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                    You
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{s.email}</p>
            </div>
          </button>

          <UserStatusBadge isActive={isActive} canManage={canManage} onToggleStatus={onToggleStatus} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(s.roles ?? [s.role]).map(role => <span key={role}>{roleChip(role, roleLabelsMap)}</span>)}
        </div>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Clock size={11} className="shrink-0 opacity-75" />
          <span>{lastActiveText}</span>
        </p>
      </div>

      <div className="border-t border-border/50 pt-3">
        <UserActionControls
          canManage={canManage}
          pwdManageable={pwdManageable}
          isSelf={isSelf}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onReset={onReset}
          onSetPassword={onSetPassword}
        />
      </div>
    </div>
  );
}

// ─── User grouped list row (Apple System Settings style) ──────────────────────
function UserListRow({
  s, canManage, pwdManageable, isSelf,
  onView, onEdit, onDelete, onToggleStatus, onReset, onSetPassword, roleLabelsMap,
}: UserItemProps) {
  const av = AVATAR_TONES[s.role] ?? "bg-muted text-muted-foreground border-border";
  const isActive = s.status === "active";
  const lastActiveText = s.lastLogin && s.lastLogin !== "Never" ? `Last active ${s.lastLogin}` : "Never signed in";

  return (
    <div className="px-4 sm:px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-muted/25 transition-colors">
      <button type="button" onClick={onView} className="flex items-center gap-3.5 text-left min-w-0 flex-1 group/btn">
        <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-xs font-semibold shrink-0 ${av}`}>
          {s.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate group-hover/btn:text-primary transition-colors">{s.name}</p>
            {isSelf && (
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                You
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
            <span className="truncate">{s.email}</span>
            <span className="opacity-40">·</span>
            <span className="inline-flex items-center gap-1 text-[11px]">
              <Clock size={10} /> {lastActiveText}
            </span>
          </div>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {(s.roles ?? [s.role]).map(role => <span key={role}>{roleChip(role, roleLabelsMap)}</span>)}
        </div>
        <UserStatusBadge isActive={isActive} canManage={canManage} onToggleStatus={onToggleStatus} />
        <div className="min-w-[180px] flex justify-end">
          <UserActionControls
            canManage={canManage}
            pwdManageable={pwdManageable}
            isSelf={isSelf}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onReset={onReset}
            onSetPassword={onSetPassword}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log panel ───────────────────────────────────────────────────────
export const ActivityLogPanel = memo(function ActivityLogPanel({ isAdmin = true }: { isAdmin?: boolean }) {
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
    <div
      className="st-page-shell flex flex-col w-full overflow-hidden"
      style={{ height: "calc(100dvh - 56px)" }}
    >
      {/* ── Fixed top content: header + search/filter ── */}
      <div className="st-page-header flex-shrink-0 st-shell-px pt-4 sm:pt-6 pb-4 bg-background border-b border-border/60 z-20 space-y-4">
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
            <button type="button" onClick={() => void loadLogs()} className="st-chip-btn st-chip-btn--rose flex-shrink-0">Retry</button>
          </div>
        )}
      </div>

      {/* ── Scrollable log list only ── */}
      <div className="st-page-fixed-body flex-1 min-h-0 flex flex-col st-shell-px py-4 overflow-hidden">
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
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
            <div className="flex-shrink-0 hidden sm:flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/35 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Account &amp; Request</span>
              <div className="flex items-center gap-2">
                <span className="min-w-14 text-center">Method</span>
                <span className="min-w-12 text-center">Status</span>
                <span className="sm:min-w-40 text-right">Timestamp</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/60" data-table-scroll="fixed">
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
                      <span className={`min-w-12 text-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold ${
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
            {hasMore && nextCursor && (
              <div className="flex-shrink-0 border-t border-border/60 bg-card px-4 py-3 flex justify-center">
                <button type="button" disabled={loading} onClick={() => void loadLogs(nextCursor)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 disabled:opacity-50">
                  {loading && <RefreshCw size={13} className="animate-spin" />}
                  {loading ? "Loading…" : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Recycle Bin types (module-level to avoid re-declaration issues) ──────────
type RecycleConfirmState =
  | { kind: "user"; item: DeletedUser }
  | { kind: "product"; item: DeletedProduct }
  | null;

// ─── Recycle Bin panel ────────────────────────────────────────────────────────
const AUTO_PURGE_DAYS = 30;

export const RecycleBinPanel = memo(function RecycleBinPanel({
  currentUserRoles, currentUserName, onRestored, showToast,
}: {
  currentUserRoles: string[]; currentUserName: string; onRestored: () => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
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

  const { allItems, expired } = useMemo(() => {
    const combined = [...deletedUsers, ...deletedProducts];
    return {
      allItems: combined,
      expired: combined.filter(i => i.daysSinceDelete >= AUTO_PURGE_DAYS),
    };
  }, [deletedUsers, deletedProducts]);

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
      showToast?.(`"${state.item.name}" restored successfully`, "success");
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
      showToast?.(`"${state.item.name}" permanently deleted`, "info");
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
      showToast?.(`Cleared ${expired.length} expired items`, "info");
    } catch (e) { setError(e instanceof Error ? e.message : "Purge failed."); }
    finally { setBusy(null); setConfirmPurgeAll(false); }
  };

  const { currentItems, pageItems } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (activeTab === "users" ? deletedUsers : deletedProducts).filter(i => {
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.deleteNote && i.deleteNote.toLowerCase().includes(q)) ||
        (i.deletedByName && i.deletedByName.toLowerCase().includes(q))
      );
    });
    return {
      currentItems: filtered,
      pageItems: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    };
  }, [activeTab, deletedUsers, deletedProducts, search, page]);

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, Math.ceil(currentItems.length / PAGE_SIZE))));
  }, [currentItems.length]);

  return (
    <div
      className="st-page-shell flex flex-col w-full overflow-hidden"
      style={{ height: "calc(100dvh - 56px)" }}
    >
      {/* ── Fixed top content: header + notice + tabs + search ── */}
      <div className="st-page-header flex-shrink-0 st-shell-px pt-4 sm:pt-6 pb-3 bg-background border-b border-border/60 z-20 space-y-3.5">
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

        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/35 px-4 py-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground shadow-sm">
            <Clock size={15} />
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Items in Trash are automatically deleted after {AUTO_PURGE_DAYS} days.</span>{" "}
            Restore an item before then, or permanently purge it now.
          </p>
        </div>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="st-chip-btn st-chip-btn--rose flex-shrink-0">Retry</button>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedTabs<"products" | "users">
            ariaLabel="Recycle Bin item type"
            value={activeTab}
            onChange={id => { setActiveTab(id); setPage(1); }}
            className="w-full sm:w-auto"
            buttonClassName="flex-1 sm:flex-initial px-4 py-2 text-sm gap-2"
            items={[
              {
                id: "products",
                label: "Products",
                badge: <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{deletedProducts.length}</span>,
              },
              {
                id: "users",
                label: "Users",
                badge: <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{deletedUsers.length}</span>,
              },
            ]}
          />
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="hidden md:inline text-xs text-muted-foreground whitespace-nowrap">
              {currentItems.length} {currentItems.length === 1 ? "item" : "items"} in {activeTab === "products" ? "Products" : "Users"}
              {search.trim() ? " matching" : ""}
            </span>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={event => { setSearch(event.target.value); setPage(1); }}
                placeholder={`Search deleted ${activeTab}…`}
                aria-label={`Search deleted ${activeTab}`}
                className="w-full rounded-xl border border-border/70 bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable deleted items only ── */}
      <div className="st-page-passthrough flex-1 min-h-0 flex flex-col st-shell-px pt-4 pb-3 overflow-hidden">
        <div className="st-page-scroll-body flex-1 min-h-0 overflow-y-auto pr-0.5 pb-1" data-table-scroll="fixed">
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
        </div>
        {!loading && currentItems.length > 0 && (
          <div className="flex-shrink-0 pt-2">
            <TablePager total={currentItems.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
          </div>
        )}
      </div>

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
});
// ─── Users Page ───────────────────────────────────────────────────────────────
function UsersPage({
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
  type StatusFilter = "all" | "active" | "inactive";
  type StaffViewMode = "grid" | "list";

  const [activeTab,         setActiveTab]         = useState<MainTab>("users");
  const [staffSearch,       setStaffSearch]       = useState("");
  const [staffFilter,       setStaffFilter]       = useState<string>("all");
  const [staffStatusFilter, setStaffStatusFilter] = useState<StatusFilter>("all");
  const [staffViewMode,     setStaffViewMode]     = useState<StaffViewMode>("grid");

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
  const [actionError,     setActionError]     = useState<string | null>(null);

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
    setActionError(null);
    try {
      await onResetPassword(resetTarget);
      setResetSuccess(`${resetTarget.name}'s password has been cleared.`);
    } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to reset password."); }
    finally { setResetTarget(null); }
  };

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return staff.filter(s => {
      const matchRole = staffFilter === "all" || (s.roles ?? [s.role]).includes(staffFilter);
      const matchStatus =
        staffStatusFilter === "all" ||
        (staffStatusFilter === "active" ? s.status === "active" : s.status !== "active");
      const matchSearch = !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
      return matchRole && matchStatus && matchSearch;
    });
  }, [staff, staffSearch, staffFilter, staffStatusFilter]);

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
  const toggleCategoryPermissions = (modIds: string[]) => {
    setRoleForm(f => {
      const allSelected = modIds.every(id => f.permissions.includes(id));
      const next = allSelected
        ? f.permissions.filter(id => !modIds.includes(id))
        : Array.from(new Set([...f.permissions, ...modIds]));
      return { ...f, permissions: next };
    });
  };
  const toggleAllPermissions = () => {
    const allIds = PERMISSION_MODULES.map(m => m.id);
    setRoleForm(f => ({
      ...f,
      permissions: f.permissions.length === allIds.length ? [] : allIds,
    }));
  };

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
    setActionError(null);
    try {
      await rolesApi.delete(r.id);
      setRoleSuccess(`Role "${r.name}" deleted.`); setDeletingRole(null); onRolesChanged?.();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Failed to delete role."); setDeletingRole(null); }
  };

  const permissionsByCategory = useMemo(() => {
    const g: Record<string, typeof PERMISSION_MODULES> = {};
    PERMISSION_MODULES.forEach(m => { if (!g[m.category]) g[m.category] = []; g[m.category].push(m); });
    return g;
  }, []);

  // Unique roles present in staff for the filter dropdown
  const staffRoles = useMemo(() => [...new Set(staff.flatMap(s => s.roles ?? [s.role]))], [staff]);

  // Stats
  const { activeCount, inactiveCount, roleList, systemRoleCount, customRoleCount } = useMemo(() => {
    const active = staff.filter(s => s.status === "active").length;
    const list = roles ?? [];
    const sysCount = list.filter(r => r.isSystem).length;
    return {
      activeCount: active,
      inactiveCount: staff.length - active,
      roleList: list,
      systemRoleCount: sysCount,
      customRoleCount: list.length - sysCount,
    };
  }, [staff, roles]);
  const hasStaffFilters = Boolean(staffSearch.trim() || staffFilter !== "all" || staffStatusFilter !== "all");

  const resetStaffFilters = () => {
    setStaffSearch("");
    setStaffFilter("all");
    setStaffStatusFilter("all");
  };

  return (
    <div
      className="st-page-shell flex flex-col w-full overflow-hidden"
      style={{ height: "calc(100dvh - 56px)" }}
    >
      {/* ── Fixed top content: header + tabs + alerts + toolbar ── */}
      <div className="st-page-header flex-shrink-0 st-shell-px pt-4 sm:pt-6 pb-3.5 bg-background border-b border-border/60 z-20 space-y-3.5">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shrink-0">
              {activeTab === "users" ? <UsersRound size={20} /> : <Shield size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Users & Roles</h1>
                <InfoTip title="Role & Account Rules" lines={[
                  "Controls permissions, active status, and admin recovery safeguards.",
                  { label: "Multiple roles", value: "Users assigned multiple roles can switch workspace views without signing out" },
                  { label: "Deactivated users", value: "Blocks sign-in while preserving past sales receipts and audit logs" },
                  { label: "Owner safeguard", value: "System Admin/Owner privileges remain protected against accidental lockout" },
                ]} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {staff.length} total accounts · {activeCount} active
                {inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ""} · {roleList.length} roles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "users" ? (
              <button
                type="button"
                onClick={onAddUser}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition-opacity st-btn"
              >
                <Plus size={14} /> Add User
              </button>
            ) : (
              <button
                type="button"
                onClick={openAddRole}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition-opacity st-btn"
              >
                <ShieldPlus size={14} /> New Role
              </button>
            )}
          </div>
        </div>

        {/* ── Segmented switcher ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SegmentedTabs<MainTab>
            ariaLabel="Users and roles sections"
            value={activeTab}
            onChange={setActiveTab}
            buttonClassName="px-3.5 py-1.5 gap-2"
            items={([
              { id: "users", label: "Users", count: staff.length, icon: UsersRound },
              { id: "roles", label: "Roles", count: roleList.length, icon: Shield },
            ] as const).map(({ id, label, count, icon: Icon }) => ({
              id,
              label,
              icon: <Icon size={13} />,
              badge: (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                  activeTab === id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              ),
            }))}
          />
        </div>

        {/* ── Feedback banners ── */}
        {(resetSuccess || roleSuccess) && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5">
            <ShieldCheck size={15} className="text-emerald-500 shrink-0" />
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex-1">{resetSuccess ?? roleSuccess}</p>
            <button
              type="button"
              onClick={() => { setResetSuccess(null); setRoleSuccess(null); }}
              aria-label="Dismiss notice"
              className="p-1 rounded-full text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/15 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {actionError && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5">
            <AlertTriangle size={15} className="text-red-500 shrink-0" />
            <p className="text-xs font-medium text-red-700 dark:text-red-300 flex-1">{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Dismiss error"
              className="p-1 rounded-full text-red-500 hover:bg-red-500/15 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Active tab fixed toolbar ── */}
        {activeTab === "users" ? (
          <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                placeholder="Search by name or email…"
                aria-label="Search staff accounts"
                className="w-full rounded-xl border border-border/70 bg-background/80 pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
              />
              {staffSearch && (
                <button
                  type="button"
                  onClick={() => setStaffSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter pill */}
              <SegmentedTabs<typeof staffStatusFilter>
                size="sm"
                ariaLabel="Filter staff status"
                value={staffStatusFilter}
                onChange={setStaffStatusFilter}
                items={([
                  { id: "all",      label: "All",      count: staff.length },
                  { id: "active",   label: "Active",   count: activeCount },
                  { id: "inactive", label: "Inactive", count: inactiveCount },
                ] as const).map(opt => ({
                  id: opt.id,
                  label: opt.label,
                  badge: (
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                      staffStatusFilter === opt.id
                        ? "bg-primary/15 text-primary dark:bg-blue-400/20 dark:text-blue-100"
                        : "text-muted-foreground/80"
                    }`}>
                      {opt.count}
                    </span>
                  ),
                }))}
              />

              {/* Role dropdown */}
              <select
                value={staffFilter}
                onChange={e => setStaffFilter(e.target.value)}
                aria-label="Filter by role"
                className="app-select rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="all">All roles</option>
                {staffRoles.map(r => <option key={r} value={r}>{roleLabelsMap[r] ?? r}</option>)}
              </select>

              {/* Grid / List segmented toggle */}
              <SegmentedTabs<"grid" | "list">
                size="sm"
                ariaLabel="View layout"
                value={staffViewMode}
                onChange={setStaffViewMode}
                buttonClassName="!px-2 !py-1.5"
                items={[
                  { id: "grid", label: <LayoutGrid size={13} aria-label="Card view" /> },
                  { id: "list", label: <List size={13} aria-label="List view" /> },
                ]}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {systemRoleCount} built-in system · {customRoleCount} custom roles
            </span>
            <span>Configure updates module access; only unassigned custom roles can be deleted.</span>
          </div>
        )}
      </div>

      {/* ══════════════════════ USERS TAB (Scrollable list/grid only) ════════ */}
      {activeTab === "users" && (
        <div className="st-page-passthrough flex-1 min-h-0 flex flex-col st-shell-px pt-4 pb-3 overflow-hidden">
          {filteredStaff.length === 0 ? (
            <div className="st-page-scroll-body flex-1 min-h-0 overflow-y-auto flex items-center justify-center" data-table-scroll="fixed">
              <div className="w-full rounded-2xl border border-border/70 bg-card/60 py-14 px-6 flex flex-col items-center justify-center gap-3 text-center">
                <div className="h-11 w-11 rounded-2xl bg-muted/70 border border-border/60 flex items-center justify-center text-muted-foreground">
                  <UserX size={20} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {staff.length === 0 ? "No staff accounts yet" : "No matching staff accounts"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {staff.length === 0
                      ? "Create the first user account to grant access to SmartTrack."
                      : "Try clearing your search term or switching filters."}
                  </p>
                </div>
                {hasStaffFilters && (
                  <button
                    type="button"
                    onClick={resetStaffFilters}
                    className="rounded-full border border-border/80 bg-background px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : staffViewMode === "grid" ? (
            <div className="st-page-scroll-body flex-1 min-h-0 overflow-y-auto pr-0.5 pb-1" data-table-scroll="fixed">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 st-grid">
                {filteredStaff.map(s => (
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
            </div>
          ) : (
            <div className="st-page-fixed-card flex-1 min-h-0 flex flex-col rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
              <div className="flex-shrink-0 hidden lg:flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-b border-border/60 bg-muted/35 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Account &amp; Last Active</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span>Roles</span>
                  <span className="w-16 text-center">Status</span>
                  <span className="min-w-[180px] text-right">Actions</span>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/60" data-table-scroll="fixed">
                {filteredStaff.map(s => (
                  <UserListRow
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
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ ROLES TAB (Scrollable role cards) ════════════ */}
      {activeTab === "roles" && (
        <div className="st-page-passthrough flex-1 min-h-0 flex flex-col st-shell-px pt-4 pb-3 overflow-hidden">
          <div className="st-page-scroll-body flex-1 min-h-0 overflow-y-auto pr-0.5 pb-2" data-table-scroll="fixed">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 st-grid">
            {roleList.map((role, idx) => {
              const totalModules = PERMISSION_MODULES.length || 1;
              const coveragePct = Math.min(100, Math.round((role.permissions.length / totalModules) * 100));
              const visiblePerms = role.permissions.slice(0, 5);
              const extraPermsCount = Math.max(0, role.permissions.length - visiblePerms.length);

              return (
                <div
                  key={role.id}
                  className="bg-card border border-border/70 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-sm hover:border-primary/30 hover:shadow-md transition-colors duration-150 st-card"
                >
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
                          role.isSystem
                            ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                            : "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                        }`}>
                          {role.isSystem ? <Lock size={16} /> : <ShieldCheck size={17} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{role.name}</p>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium mt-1 ${
                            role.isSystem
                              ? "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-300"
                              : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-300"
                          }`}>
                            {role.isSystem ? "System Role" : "Custom Role"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed min-h-[2.25rem]">
                      {role.description || "No role summary added yet."}
                    </p>

                    <div className="rounded-xl border border-border/60 bg-muted/25 p-3 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-muted-foreground">Module access</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {role.permissions.length} of {PERMISSION_MODULES.length}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full st-bar-fill ${role.isSystem ? "bg-blue-500" : "bg-indigo-500"}`}
                          style={{ width: `${coveragePct}%`, animationDelay: `${Math.min(idx * 45, 270)}ms` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {visiblePerms.map(pid => {
                          const mod = PERMISSION_MODULES.find(m => m.id === pid);
                          return (
                            <span
                              key={pid}
                              className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-background/80 border border-border/70 text-foreground/85"
                            >
                              {mod?.name ?? pid}
                            </span>
                          );
                        })}
                        {extraPermsCount > 0 && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60">
                            +{extraPermsCount} more
                          </span>
                        )}
                        {role.permissions.length === 0 && (
                          <span className="text-[11px] text-muted-foreground italic">No modules enabled</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/50 pt-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <UsersRound size={12} className="shrink-0 opacity-75" />
                      {role.userCount === undefined
                        ? "Assigned users"
                        : role.userCount === 0
                          ? "0 users assigned"
                          : `${role.userCount} user${role.userCount > 1 ? "s" : ""} assigned`}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditRole(role)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
                      >
                        <Pencil size={11} /> Configure
                      </button>
                      {!role.isSystem && (
                        <button
                          type="button"
                          onClick={() => setDeletingRole(role)}
                          title="Delete custom role"
                          aria-label={`Delete ${role.name}`}
                          className="p-1.5 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {roleList.length === 0 && (
              <div className="col-span-full rounded-2xl border border-border/70 bg-card/60 py-16 px-6 flex flex-col items-center gap-3 text-center">
                <div className="h-11 w-11 rounded-2xl bg-muted/70 border border-border/60 flex items-center justify-center text-muted-foreground">
                  <ShieldPlus size={20} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">No roles configured</p>
                  <p className="text-xs text-muted-foreground">Create your first custom role to define tailored staff permissions.</p>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Apple-style Role Form Modal */}
          {showRoleForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50 st-overlay-in" onClick={() => setShowRoleForm(false)} />
              <div className="relative bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden st-modal-in">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-2xl border border-primary/15 bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {editingRole ? <Shield size={18} /> : <ShieldPlus size={18} />}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold tracking-tight text-foreground truncate">
                        {editingRole ? editingRole.name : "New Custom Role"}
                      </h2>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {editingRole ? "Adjust module permissions and description." : "Name this role and toggle which modules it can access."}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRoleForm(false)}
                    aria-label="Close modal"
                    className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Identity grouped card */}
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-medium text-muted-foreground">
                        Role Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={roleForm.name}
                        onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Store Auditor"
                        disabled={editingRole?.isSystem}
                        className="w-full rounded-xl border border-border/80 bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all disabled:opacity-60"
                      />
                      {editingRole?.isSystem && (
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1.5 pt-0.5">
                          <Lock size={11} /> Built-in system role name is locked; module permissions remain configurable.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-medium text-muted-foreground">Description</label>
                      <textarea
                        value={roleForm.description}
                        onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Briefly describe what this role is responsible for…"
                        rows={2}
                        className="w-full rounded-xl border border-border/80 bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all resize-none"
                      />
                    </div>
                  </div>

                  {/* Permissions grouped switches */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          Module Permissions <span className="text-red-500">*</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {roleForm.permissions.length} of {PERMISSION_MODULES.length} enabled
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleAllPermissions}
                        className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        {roleForm.permissions.length === PERMISSION_MODULES.length ? "Clear all" : "Select all"}
                      </button>
                    </div>

                    <div className="space-y-3">
                      {Object.entries(permissionsByCategory).map(([category, mods]) => {
                        const modIds = mods.map(m => m.id);
                        const selectedInCat = modIds.filter(id => roleForm.permissions.includes(id)).length;
                        const allCatSelected = selectedInCat === mods.length;

                        return (
                          <div key={category} className="rounded-2xl border border-border/70 bg-card overflow-hidden divide-y divide-border/50">
                            <div className="px-4 py-2 bg-muted/35 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                {category} · {selectedInCat}/{mods.length}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleCategoryPermissions(modIds)}
                                className="st-chip-btn"
                              >
                                {allCatSelected ? "Clear" : "Select all"}
                              </button>
                            </div>

                            {mods.map(mod => {
                              const checked = roleForm.permissions.includes(mod.id);
                              return (
                                <label
                                  key={mod.id}
                                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/25 cursor-pointer transition-colors"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-foreground">{mod.name}</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{mod.description}</p>
                                  </div>

                                  <div className="relative shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => togglePermission(mod.id)}
                                      className="sr-only"
                                    />
                                    <div
                                      aria-hidden="true"
                                      className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                                        checked ? "bg-primary" : "bg-muted-foreground/30"
                                      }`}
                                    >
                                      <div
                                        className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                          checked ? "translate-x-4" : "translate-x-0"
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {roleFormError && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>{roleFormError}</span>
                    </div>
                  )}
                </div>

                <div className="px-5 py-4 border-t border-border/60 bg-card flex items-center justify-end gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowRoleForm(false)}
                    disabled={roleSaving}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveRole}
                    disabled={roleSaving}
                    className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-60 transition-opacity st-btn"
                  >
                    {roleSaving ? "Saving…" : editingRole ? "Save Changes" : "Create Role"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {deletingRole && (
            <ConfirmDialog
              title="Delete Role?"
              message={<>Permanently delete <span className="font-semibold text-foreground">"{deletingRole.name}"</span>? Any users assigned to this role must be reassigned first.</>}
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

export default memo(UsersPage);
