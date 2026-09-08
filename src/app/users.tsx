import { useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, ShieldOff, KeyRound, Eye, EyeOff, RotateCcw } from "lucide-react";
import { type StaffMember, ROLE_LABELS } from "./data";
import { UserInfoModal } from "./shared";

// ─── Sweet-style confirm dialog ───────────────────────────────────────────────
function SweetDialog({
  icon, iconColor, title, message, confirmLabel, confirmClass, onConfirm, onCancel,
}: {
  icon: React.ReactNode; iconColor: string; title: string; message: React.ReactNode;
  confirmLabel: string; confirmClass: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${iconColor}`}>{icon}</div>
        <div>
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button onClick={onConfirm} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${confirmClass}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create / Set New Password Modal ─────────────────────────────────────────
function CreatePasswordModal({
  user, onClose, onSave,
}: {
  user: StaffMember;
  onClose: () => void;
  onSave: (userId: string, password: string) => Promise<void>;
}) {
  const [newPwd,     setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState(false);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">
            {user.initials}
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Create New Password</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{user.name} · {ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </div>

        {success ? (
          <div className="text-center py-4 space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto">
              <ShieldCheck size={24} className="text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-foreground">Password Set Successfully</p>
            <p className="text-xs text-muted-foreground">{user.name} can now log in with the new password.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* New Password */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Min. 6 characters"
                  required minLength={6}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConf ? "text" : "password"}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter password"
                  required minLength={6}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowConf(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Mismatch warning */}
            {confirmPwd && newPwd && newPwd !== confirmPwd && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Passwords do not match</p>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                {loading ? "Setting…" : "Set Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Users Page ───────────────────────────────────────────────────────────────
export default function UsersPage({
  staff,
  currentUserId,
  currentUserRole,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onToggleStatus,
  onResetPassword,
  onCreatePassword,
}: {
  staff: StaffMember[];
  currentUserId: string;
  currentUserRole: string;
  onAddUser: () => void;
  onEditUser: (user: StaffMember) => void;
  onDeleteUser: (user: StaffMember) => void;
  onToggleStatus: (user: StaffMember, newStatus: "active" | "inactive") => void;
  onResetPassword: (user: StaffMember) => Promise<void>;
  onCreatePassword: (userId: string, password: string) => Promise<void>;
}) {
  const [deleteTarget,       setDeleteTarget]       = useState<StaffMember | null>(null);
  const [statusTarget,       setStatusTarget]       = useState<StaffMember | null>(null);
  const [pendingStatus,      setPendingStatus]      = useState<"active" | "inactive">("active");
  const [viewingUser,        setViewingUser]        = useState<StaffMember | null>(null);
  const [resetTarget,        setResetTarget]        = useState<StaffMember | null>(null);
  const [createPwdTarget,    setCreatePwdTarget]    = useState<StaffMember | null>(null);
  const [resetSuccess,       setResetSuccess]       = useState<string | null>(null);

  const isSuperAdmin = currentUserRole === "admin/owner";
  const isAdmin      = currentUserRole === "admin";

  const handleStatusClick = (s: StaffMember) => {
    const next = s.status === "active" ? "inactive" : "active";
    setStatusTarget(s);
    setPendingStatus(next);
  };

  // Permission logic:
  // - Cannot manage yourself
  // - Admin/Owner can manage everyone except themselves
  // - Admin can only manage cashier and inventory_manager
  const canManage = (s: StaffMember) => {
    if (s.id === currentUserId) return false;
    if (isSuperAdmin) return true;
    if (isAdmin) return s.role === "cashier" || s.role === "inventory_manager";
    return false;
  };

  // Password management: same rules as canManage
  const canManagePassword = (s: StaffMember) => canManage(s);

  const handleConfirmReset = async () => {
    if (!resetTarget) return;
    try {
      await onResetPassword(resetTarget);
      setResetSuccess(`${resetTarget.name}'s password has been cleared. They cannot log in until a new password is created.`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to reset password.");
    } finally {
      setResetTarget(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {staff.length} users · {staff.filter(s => s.status === "active").length} active
          </p>
        </div>
        <button
          onClick={onAddUser}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 flex-shrink-0"
        >
          <Plus size={14} />Add User
        </button>
      </div>

      {/* Reset success banner */}
      {resetSuccess && (
        <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-3">
          <ShieldCheck size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400 flex-1">{resetSuccess}</p>
          <button onClick={() => setResetSuccess(null)} className="text-emerald-500 hover:text-emerald-700 text-xs font-bold">✕</button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["User", "Role", "Email", "Last Login", "Status", "Actions"].map(h => (
                  <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(s => {
                const manageable       = canManage(s);
                const pwdManageable    = canManagePassword(s);

                return (
                  <tr key={s.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">

                    {/* Name — clickable to view info */}
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => setViewingUser(s)}
                        className="flex items-center gap-3 rounded-xl px-2 py-1 -mx-2 -my-1 border border-transparent hover:border-border hover:bg-muted/40 transition-all group"
                        title="View user info"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0">
                          {s.initials}
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{s.id}</p>
                        </div>
                      </button>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">{ROLE_LABELS[s.role] ?? s.role}</td>

                    {/* Email */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.email}</td>

                    {/* Last Login */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.lastLogin}</td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => manageable && handleStatusClick(s)}
                        disabled={!manageable}
                        title={
                          s.id === currentUserId ? "Cannot change your own status" :
                          !manageable ? "Insufficient permissions" :
                          s.status === "active" ? "Click to deactivate" : "Click to activate"
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                          s.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 hover:bg-emerald-100"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                        } ${!manageable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {s.status === "active" ? "Active" : "Inactive"}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">

                        {/* Edit */}
                        <button
                          onClick={() => manageable ? onEditUser(s) : undefined}
                          disabled={!manageable}
                          className={`p-1.5 rounded-lg transition-all ${manageable ? "text-muted-foreground hover:text-primary hover:bg-primary/10" : "text-muted-foreground/20 cursor-not-allowed"}`}
                          title={manageable ? "Edit user" : "Cannot edit this account"}
                        >
                          <Pencil size={13} />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => manageable ? setDeleteTarget(s) : undefined}
                          disabled={!manageable}
                          className={`p-1.5 rounded-lg transition-all ${manageable ? "text-muted-foreground hover:text-red-500 hover:bg-red-500/10" : "text-muted-foreground/20 cursor-not-allowed"}`}
                          title={manageable ? "Delete user" : "Cannot delete this account"}
                        >
                          <Trash2 size={13} />
                        </button>

                        {/* Divider */}
                        {pwdManageable && <span className="w-px h-4 bg-border mx-0.5" />}

                        {/* Reset Password — clears the password */}
                        {pwdManageable && (
                          <button
                            onClick={() => setResetTarget(s)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-all"
                            title="Reset password (clears current password)"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}

                        {/* Create / Set New Password */}
                        {pwdManageable && (
                          <button
                            onClick={() => setCreatePwdTarget(s)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                            title="Create / set new password"
                          >
                            <KeyRound size={13} />
                          </button>
                        )}

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── User info modal ── */}
      {viewingUser && <UserInfoModal user={viewingUser} onClose={() => setViewingUser(null)} />}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <SweetDialog
          iconColor="bg-red-100 dark:bg-red-500/15"
          icon={<Trash2 size={28} className="text-red-500" />}
          title="Delete User?"
          message={<>Permanently delete <span className="font-semibold text-foreground">{deleteTarget.name}</span>?<br />This <span className="font-semibold text-red-500">cannot be undone</span>.</>}
          confirmLabel="Yes, Delete"
          confirmClass="bg-red-500 text-white hover:bg-red-600 shadow-sm"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { onDeleteUser(deleteTarget); setDeleteTarget(null); }}
        />
      )}

      {/* ── Toggle status confirm ── */}
      {statusTarget && (
        <SweetDialog
          iconColor={pendingStatus === "inactive" ? "bg-amber-100 dark:bg-amber-500/15" : "bg-emerald-100 dark:bg-emerald-500/15"}
          icon={pendingStatus === "inactive" ? <ShieldOff size={28} className="text-amber-500" /> : <ShieldCheck size={28} className="text-emerald-500" />}
          title={pendingStatus === "inactive" ? "Deactivate User?" : "Activate User?"}
          message={
            pendingStatus === "inactive"
              ? <><span className="font-semibold text-foreground">{statusTarget.name}</span> will no longer be able to log in.</>
              : <><span className="font-semibold text-foreground">{statusTarget.name}</span> will be able to log in again.</>
          }
          confirmLabel={pendingStatus === "inactive" ? "Deactivate" : "Activate"}
          confirmClass={pendingStatus === "inactive" ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-emerald-500 text-white hover:bg-emerald-600"}
          onCancel={() => setStatusTarget(null)}
          onConfirm={() => { onToggleStatus(statusTarget, pendingStatus); setStatusTarget(null); }}
        />
      )}

      {/* ── Reset password confirm ── */}
      {resetTarget && (
        <SweetDialog
          iconColor="bg-amber-100 dark:bg-amber-500/15"
          icon={<RotateCcw size={28} className="text-amber-500" />}
          title="Reset Password?"
          message={
            <>
              This will <span className="font-semibold text-red-500">clear the password</span> of{" "}
              <span className="font-semibold text-foreground">{resetTarget.name}</span>.<br />
              They will <span className="font-semibold">not be able to log in</span> until a new password is created for them.
            </>
          }
          confirmLabel="Yes, Reset"
          confirmClass="bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
          onCancel={() => setResetTarget(null)}
          onConfirm={handleConfirmReset}
        />
      )}

      {/* ── Create / Set new password modal ── */}
      {createPwdTarget && (
        <CreatePasswordModal
          user={createPwdTarget}
          onClose={() => setCreatePwdTarget(null)}
          onSave={onCreatePassword}
        />
      )}
    </div>
  );
}
