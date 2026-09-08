import { useState, useEffect } from "react";
import { AlertTriangle, Eye, EyeOff, Pill, ShieldOff } from "lucide-react";
import { type AuthUser } from "./data";
import { authApi } from "./api";
import Home from "./home";

function FieldInput({ label, type = "text", value, onChange, placeholder, required }: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      />
    </div>
  );
}

// ─── Inactive-account sweet dialog ───────────────────────────────────────────
function InactiveAccountDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center mx-auto">
          <ShieldOff size={30} className="text-amber-500" />
        </div>

        <div>
          <h3 className="text-base font-bold text-foreground">Account Inactive</h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Your account has been <span className="font-semibold text-amber-600 dark:text-amber-400">deactivated</span> by the administrator.
          </p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Please contact your admin to have your account status set back to <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active</span> before logging in.
          </p>
        </div>

        {/* Info box */}
        <div className="bg-muted/60 border border-border rounded-xl px-4 py-3 text-left space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">What to do</p>
          <p className="text-xs text-foreground">Ask your administrator to go to <span className="font-semibold">Users</span> → find your account → click the status badge to set it to <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active</span>.</p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
        >
          OK, Got It
        </button>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPwd]  = useState(false);
  const [error, setError]           = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(email.trim(), password);
      onLogin(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      if (msg === "account_inactive") {
        setShowInactive(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1a3040 0%, #0d1f2d 60%, #0a3040 100%)" }}
      >
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="relative text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <Pill size={36} className="text-teal-300" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-3">SmartTrack</h1>
          <p className="text-teal-300 text-lg font-medium mb-2">Tangub Pharmacy</p>
          <p className="text-white/50 text-sm leading-relaxed">
            Automated Financial &amp; Inventory Management with Supply-Demand Analytics
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[["Real-time Stock","Track inventory live"],["Financial Reports","Revenue analytics"],["Smart Alerts","Auto reorder alerts"]].map(([t, d]) => (
              <div key={t} className="bg-white/5 border border-white/10 rounded-xl p-3 text-left">
                <p className="text-white text-xs font-semibold">{t}</p>
                <p className="text-white/40 text-[10px] mt-0.5">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Pill size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">SmartTrack</p>
              <p className="text-[10px] text-muted-foreground">Tangub Pharmacy</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Welcome back</h2>
          <p className="text-sm text-muted-foreground mb-7">Sign in to your SmartTrack account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldInput label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@tangub.ph" required />
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password" required
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={12} />{error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg shadow-primary/20">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-[11px] text-muted-foreground mt-6">
            SmartTrack v2.1 · Tangub City, Misamis Occidental
          </p>
        </div>
      </div>
    </div>

    {/* Inactive account dialog — rendered outside the form so it overlays everything */}
    {showInactive && <InactiveAccountDialog onClose={() => setShowInactive(false)} />}
    </>
  );
}

export default function Login() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [validatingSession, setValidatingSession] = useState(true);

  // Validate session on mount - check backend only, no localStorage
  useEffect(() => {
    const validateSession = async () => {
      try {
        // Check if there's a valid session on the backend
        const res = await authApi.me();
        setUser(res.user);
      } catch {
        // No valid session, user needs to login
        setUser(null);
      } finally {
        setValidatingSession(false);
      }
    };

    validateSession();
  }, []);

  const handleLogin = (user: AuthUser) => {
    // Just set the user state - session is managed by PHP backend
    setUser(user);
  };

  const handleLogout = async () => {
    try { 
      await authApi.logout(); 
    } catch { /* ignore */ }
    setUser(null);
  };

  // Show loading while validating session
  if (validatingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Pill size={32} className="text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Validating session…</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return <Home user={user} onLogout={handleLogout} />;
}
