import { useState, useEffect } from "react";
import { Database, Download, Upload, RefreshCw, CheckCircle2, AlertTriangle, X, ShieldCheck, HardDrive } from "lucide-react";
import { backupApi, type DatabaseBackupStatus } from "./api";
import { ConfirmDialog } from "./shared";

export function DatabaseBackupModal({
  isOpen,
  onClose,
  showToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  showToast?: (msg: string, type?: "info" | "success" | "warning") => void;
}) {
  const [status, setStatus] = useState<DatabaseBackupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await backupApi.getStatus();
      setStatus(res);
    } catch {
      setStatusMsg({ text: "Could not fetch database status.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setStatusMsg(null);
    }
  }, [isOpen]);

  const handleDownloadBackup = () => {
    setDownloading(true);
    try {
      const url = backupApi.downloadBackupUrl();
      const a = document.createElement("a");
      a.href = url;
      a.download = `smarttrack_backup_${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (showToast) showToast("Database backup downloaded successfully.", "success");
      setStatusMsg({ text: "Database backup downloaded successfully.", type: "success" });
      setTimeout(fetchStatus, 1500);
    } catch {
      setStatusMsg({ text: "Failed to download backup.", type: "error" });
    } finally {
      setDownloading(false);
    }
  };

  const handleRunMigrations = async () => {
    setMigrating(true);
    setStatusMsg(null);
    try {
      const res = await backupApi.runMigrations();
      setStatusMsg({ text: res.message, type: "success" });
      if (showToast) showToast(res.message, "success");
      fetchStatus();
    } catch {
      setStatusMsg({ text: "Auto-migration check failed.", type: "error" });
    } finally {
      setMigrating(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setConfirmRestore(false);
    setStatusMsg(null);
    try {
      const res = await backupApi.restoreBackup(restoreFile);
      setStatusMsg({ text: res.message, type: "success" });
      if (showToast) showToast(res.message, "success");
      setRestoreFile(null);
      fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      setStatusMsg({ text: msg, type: "error" });
    } finally {
      setRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Offline Database &amp; Data Safety</h3>
              <p className="text-[11px] text-muted-foreground">Self-healing migrations and disaster recovery backups</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Status Message */}
          {statusMsg && (
            <div className={`p-3 rounded-xl border flex items-center gap-2 ${
              statusMsg.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
            }`}>
              {statusMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span className="font-semibold text-xs">{statusMsg.text}</span>
            </div>
          )}

          {/* System Environment Status Card */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Storage Engine</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                ● 100% Offline / Local MariaDB
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50 text-center">
              <div>
                <span className="block text-base font-bold tabular-nums text-foreground">{status?.tableCount ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">Active Tables</span>
              </div>
              <div>
                <span className="block text-base font-bold tabular-nums text-foreground">{status?.productCount ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">Medicines</span>
              </div>
              <div>
                <span className="block text-base font-bold tabular-nums text-foreground">{status?.transactionCount ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">Sales Records</span>
              </div>
            </div>
          </div>

          {/* Automated Migrations Card */}
          <div className="rounded-xl border border-border/80 bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <h4 className="font-bold text-foreground text-xs">Automated Schema Updates</h4>
              </div>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                v{status?.systemVersion ?? "1.0.0"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              When new features are added, SmartTrack automatically runs incremental updates in the background without erasing existing pharmacy sales, customers, or inventory.
            </p>
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Registered Migrations: <strong className="text-foreground">{status?.migrationCount ?? 35} applied</strong>
              </span>
              <button
                type="button"
                disabled={migrating}
                onClick={handleRunMigrations}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-semibold text-foreground text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={migrating ? "animate-spin" : ""} />
                <span>{migrating ? "Checking…" : "Check for Updates"}</span>
              </button>
            </div>
          </div>

          {/* 1-Click Backup Export Card */}
          <div className="rounded-xl border border-border/80 bg-card p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <HardDrive size={16} className="text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-bold text-foreground text-xs">Download Complete Database Backup</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Generate a full, human-readable <code className="font-mono text-foreground font-semibold">.sql</code> archive of all tables, products, batches, and transactions for USB flash drive storage.
            </p>
            {status?.lastBackup && (
              <p className="text-[10px] text-muted-foreground">
                Latest server backup: <strong className="text-foreground">{status.lastBackup.date}</strong> ({status.lastBackup.size})
              </p>
            )}
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadBackup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              <span>{downloading ? "Preparing Backup…" : "Download Database Backup (.sql)"}</span>
            </button>
          </div>

          {/* Database Restore from File */}
          <div className="rounded-xl border border-border/80 bg-card p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-amber-600 dark:text-amber-400" />
              <h4 className="font-bold text-foreground text-xs">Disaster Recovery (Restore from .sql)</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If moving to a new laptop or recovering from hardware failure, select an existing SmartTrack backup file to restore.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".sql"
                id="sql-restore-upload"
                onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  setRestoreFile(file);
                }}
                className="hidden"
              />
              <label
                htmlFor="sql-restore-upload"
                className="flex-1 text-center py-2 px-3 rounded-xl border border-dashed border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground font-medium text-xs cursor-pointer truncate"
              >
                {restoreFile ? restoreFile.name : "Choose .sql Backup File"}
              </label>
              <button
                type="button"
                disabled={!restoreFile || restoring}
                onClick={() => setConfirmRestore(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                {restoring ? "Restoring…" : "Restore"}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex justify-end bg-muted/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted font-semibold text-foreground text-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {confirmRestore && (
        <ConfirmDialog
          title="Restore Database from Backup?"
          message={`Are you sure you want to restore from "${restoreFile?.name}"? A safety snapshot of your current database will be saved automatically before restoring.`}
          confirmLabel="Yes, Restore Database"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handleConfirmRestore}
          onCancel={() => setConfirmRestore(false)}
        />
      )}
    </div>
  );
}

