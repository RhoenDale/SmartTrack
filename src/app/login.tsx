import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, BarChart3, Bell, Eye, EyeOff, LockKeyhole, Mail, Package, Shield, ShieldOff } from "lucide-react";
import { ROLE_LABELS, type AuthUser } from "./data";
import { activeRoleStore, authApi, receiptSettingsApi, tokenStore, type PublicBusinessSettings } from "./api";
import Home from "./home";

const SMARTTRACK_LOGO_URL = `${import.meta.env.BASE_URL}smarttrack-mark.png`;

function FieldInput({ label, type = "text", value, onChange, placeholder, required }: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={type === "email" ? "username" : undefined}
          className="w-full h-12 bg-white/95 border border-white/95 rounded-2xl pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/70 focus:bg-white transition-colors"
        />
        {type === "email" && (
          <Mail
            size={18}
            strokeWidth={2.2}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-20 text-blue-600"
            style={{ color: "#2563eb" }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Inactive-account dialog ───────────────────────────────────────────
function InactiveAccountDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[#0b1728] border border-blue-400/30 rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200 text-white">
        <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
          <ShieldOff size={26} className="text-amber-400" />
        </div>

        <div>
          <h3 className="text-base font-bold text-white">Account Inactive</h3>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Your account has been <span className="font-semibold text-amber-400">deactivated</span> by the administrator.
          </p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Please contact your administrator to set your status back to <span className="font-semibold text-blue-300">Active</span> before logging in.
          </p>
        </div>

        <div className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-left space-y-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Resolution Guide</p>
          <p className="text-[11px] text-slate-300">
            An administrator can navigate to <span className="font-semibold text-white">Users</span> → locate your account → switch the badge to <span className="font-semibold text-blue-300">Active</span>.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/30 transition-all cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Pure Vector Split Background (Pre-baked Gradients — Zero GPU Blur Passes) ───
function SplitVectorBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Right-Side Luminous Dimmed Daylight & Soft Blue Ambiance */}
      <div
        className="absolute inset-0 bg-[#edf2f7]"
        style={{
          backgroundImage: [
            "radial-gradient(620px 520px at 94% 38%, rgba(147, 197, 253, 0.42) 0%, rgba(147, 197, 253, 0) 70%)",
            "radial-gradient(680px 480px at 80% 62%, rgba(96, 165, 250, 0.28) 0%, rgba(96, 165, 250, 0) 70%)",
            "radial-gradient(820px 540px at 88% 98%, rgba(37, 99, 235, 0.22) 0%, rgba(37, 99, 235, 0) 72%)",
            "radial-gradient(480px 380px at 66% 78%, rgba(56, 189, 248, 0.24) 0%, rgba(56, 189, 248, 0) 70%)",
            "linear-gradient(180deg, #e0ecf8 0%, #eef4fb 52%, #edf2f7 100%)",
          ].join(", "),
        }}
      />

      {/* Left-Side Sweeping Oceanic Royal Blue Silk Wave */}
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Deep multi-stop oceanic royal blue gradient */}
          <linearGradient id="blueWaveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#030816" />
            <stop offset="25%" stopColor="#06122d" />
            <stop offset="55%" stopColor="#0b214d" />
            <stop offset="85%" stopColor="#143c7d" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          {/* Soft ambient edge glow replacing heavy feDropShadow */}
          <linearGradient id="spineEdgeShadow" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#020817" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#020817" stopOpacity="0" />
          </linearGradient>

          {/* Luminous glowing sky spine highlight along the curve */}
          <linearGradient id="spineSkyGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#60a5fa" stopOpacity="0.85" />
            <stop offset="80%" stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>

          {/* Pre-baked soft aurora radial gradients replacing feGaussianBlur */}
          <radialGradient id="auroraGlowCyan" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="auroraGlowBlue" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.26" />
            <stop offset="65%" stopColor="#60a5fa" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="auroraGlowIndigo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.22" />
            <stop offset="65%" stopColor="#6366f1" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>

          {/* Clip luminous wave ribbons inside the deep ocean S-curve */}
          <clipPath id="blueWaveClip">
            <path d="M 0 0 L 1150 0 C 1085 280 960 650 1030 1080 L 0 1080 Z" />
          </clipPath>
        </defs>

        {/* Soft edge halo along S-curve (zero SVG filter passes) */}
        <path
          d="M 1150 0 C 1085 280 960 650 1030 1080"
          fill="none"
          stroke="rgba(2, 8, 23, 0.14)"
          strokeWidth="36"
        />

        {/* Primary sweeping S-curve covering the left side */}
        <path
          d="M 0 0 L 1150 0 C 1085 280 960 650 1030 1080 L 0 1080 Z"
          fill="url(#blueWaveGrad)"
        />

        {/* Pre-baked cyan & royal-sky radial aurora circles behind feature cards */}
        <g clipPath="url(#blueWaveClip)">
          <circle cx="265" cy="740" r="240" fill="url(#auroraGlowCyan)" />
          <circle cx="535" cy="790" r="260" fill="url(#auroraGlowBlue)" />
          <circle cx="835" cy="705" r="250" fill="url(#auroraGlowCyan)" />
          <circle cx="480" cy="340" r="320" fill="url(#auroraGlowBlue)" />
          <circle cx="360" cy="960" r="360" fill="url(#auroraGlowIndigo)" />
        </g>

        {/* Soft glowing spine highlight */}
        <path
          d="M 1150 0 C 1085 280 960 650 1030 1080"
          fill="none"
          stroke="rgba(96, 165, 250, 0.22)"
          strokeWidth="12"
        />
        <path
          d="M 1150 0 C 1085 280 960 650 1030 1080"
          fill="none"
          stroke="url(#spineSkyGlow)"
          strokeWidth="3.5"
        />
      </svg>
    </div>
  );
}

function LoginPage({ onLogin, businessSettings }: {
  onLogin: (user: AuthUser) => void;
  businessSettings: PublicBusinessSettings | null;
}) {
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
      if (!email.trim() || !password.trim()) {
        throw new Error("Email and password are required.");
      }

      tokenStore.clear();
      const res = await authApi.login(email.trim(), password);
      if (!res.user) {
        throw new Error("Invalid response from server.");
      }
      
      console.log('[Login Success]', {
        userId: res.user.id,
        email: res.user.email,
        role: res.user.role,
      });
      
      onLogin(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      console.error('[Login Error]', msg);
      
      if (msg.includes("account_inactive")) {
        setShowInactive(true);
      } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Cannot connect to server. Please ensure the app services are running.");
      } else if (msg.includes("401") || msg.includes("Invalid email or password")) {
        setError("Invalid email or password.");
      } else {
        setError(msg || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="st-login-enter min-h-screen w-full flex flex-col justify-between text-white relative overflow-hidden select-none">
      
      {/* Pure Vector Split Background (Zero Images, S-Curve Wave + Soft Mint Daylight Depth) */}
      <SplitVectorBackdrop />

      {/* Top navigation bar */}
      <header className="w-full max-w-[1400px] mx-auto px-6 sm:px-12 py-7 flex items-center justify-end z-10">
        <div className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] bg-white/85 border border-white/90 text-blue-950 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          Pharmacy operations · Tangub Pharmacy
        </div>
      </header>

      {/* Main split-screen container */}
      <main className="w-full max-w-[1400px] mx-auto px-6 sm:px-12 py-8 my-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center z-10">
        
        {/* Left Column: Branding and Capabilities (Center-aligned) */}
        <div className="st-login-brand lg:col-span-7 flex flex-col justify-center items-center text-center">
          {/* Official 3D SmartTrack App Icon */}
          <div className="relative mb-7 group mx-auto">
            <div
              className="pointer-events-none absolute -inset-6 rounded-full opacity-85"
              style={{ background: "radial-gradient(circle, rgba(56,189,248,0.28) 0%, rgba(59,130,246,0.12) 50%, transparent 72%)" }}
            />
            <img
              src={SMARTTRACK_LOGO_URL}
              alt="SmartTrack mark"
              className="relative w-40 h-28 sm:w-48 sm:h-32 object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.3)] transition-transform duration-200 group-hover:scale-105 group-hover:-translate-y-1 opacity-100"
            />
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold tracking-tight text-white mb-3 drop-shadow-md leading-tight text-center">
            Smart<span className="text-blue-300">Track</span>
          </h1>
          <p className="text-lg sm:text-xl font-semibold text-slate-100 tracking-tight mb-3 drop-shadow text-center">
            Pharmacy operations, in one place.
          </p>
          <p className="text-sm text-blue-100/85 leading-relaxed max-w-lg mb-8 drop-shadow-sm text-center mx-auto">
            Manage medicine stock and expiry, record sales and returns, and use reports and sales history to plan what to restock at {businessSettings?.businessName || "Tangub Pharmacy"}.
          </p>

          {/* Core pharmacy workflows */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 max-w-xl w-full mx-auto">
            {[
              { title: "Inventory & expiry", detail: "Track quantities, batches, and expiry dates", Icon: Package },
              { title: "Sales & returns", detail: "Record POS sales and manage returns", Icon: BarChart3 },
              { title: "Restock & reports", detail: "Review low stock, demand, and finances", Icon: Bell },
            ].map(({ title, detail, Icon }, index) => (
              <div
                key={title}
                style={{
                  animationDelay: `${140 + index * 70}ms`,
                  background:
                    "linear-gradient(155deg, rgba(255, 255, 255, 0.24) 0%, rgba(224, 242, 254, 0.14) 48%, rgba(191, 219, 254, 0.10) 100%)",
                }}
                className="relative overflow-hidden st-login-feature border border-white/35 hover:border-white/55 hover:-translate-y-0.5 rounded-2xl p-4 shadow-[0_14px_30px_rgba(2,8,23,0.32),inset_0_1px_1px_rgba(255,255,255,0.55)] transition-[transform,border-color] duration-200 text-center flex flex-col items-center group"
              >
                {/* Frosted glass specular sheen */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-sky-200/10 opacity-75 transition-opacity duration-200 group-hover:opacity-100" />
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-white/32 to-white/12 border border-white/45 flex items-center justify-center mb-3 text-white shadow-[0_6px_14px_rgba(2,8,23,0.22),inset_0_1px_1px_rgba(255,255,255,0.65)] group-hover:scale-105 group-hover:border-white/65 transition-[transform,border-color] duration-200 mx-auto">
                    <Icon size={15} />
                  </div>
                  <p className="text-xs font-bold text-white tracking-wide drop-shadow-[0_1px_2px_rgba(2,8,23,0.45)]">{title}</p>
                  <p className="text-[11px] text-sky-50/95 mt-1 leading-normal drop-shadow-[0_1px_1px_rgba(2,8,23,0.3)]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Milky Frosted-Glass Login Card */}
        <div className="st-login-card-wrap lg:col-span-5 flex justify-center lg:justify-end">
          <div className="st-login-card w-full max-w-[430px] bg-white/88 backdrop-blur-md border border-white/95 rounded-[32px] shadow-[0_24px_54px_-15px_rgba(15,23,42,0.18),inset_0_1px_2px_rgba(255,255,255,0.95)] p-8 sm:p-9 text-left">
            
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 text-center">
              Welcome back
            </h2>
            <p className="text-xs text-slate-500 text-center mt-1 mb-6 font-medium">
              Sign in to manage pharmacy operations
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FieldInput
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="email"
                required
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="password"
                    required
                    autoComplete="current-password"
                    className="w-full h-12 bg-white/95 border border-white/95 rounded-2xl pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/70 focus:bg-white transition-colors"
                  />
                  <LockKeyhole
                    size={18}
                    strokeWidth={2.2}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-20 text-blue-600"
                    style={{ color: "#2563eb" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 z-20 text-slate-500 hover:text-blue-600 transition-colors p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-700 text-xs bg-rose-50/90 border border-rose-200 rounded-xl px-3.5 py-2.5 animate-in fade-in duration-150 shadow-xs">
                  <AlertTriangle size={14} className="shrink-0 text-rose-600" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* Tangub Royal Blue Gradient Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-sm font-semibold shadow-[0_10px_25px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)] active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer mt-3"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            <div className="border-t border-slate-300/60 mt-6 pt-4 text-center">
              <p className="text-[11px] text-slate-500 font-medium tracking-wide">
                Secure staff access · {businessSettings?.businessName || "Tangub Pharmacy"}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>

    {/* Inactive account dialog */}
    {showInactive && <InactiveAccountDialog onClose={() => setShowInactive(false)} />}
    </>
  );
}

export default function Login() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingRoleUser, setPendingRoleUser] = useState<AuthUser | null>(null);
  const [businessSettings, setBusinessSettings] = useState<PublicBusinessSettings | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [loginMounted, setLoginMounted] = useState(false);
  const [launchVisible, setLaunchVisible] = useState(true);
  const [splashFading, setSplashFading]   = useState(false);
  const [homeReady, setHomeReady]         = useState(false);
  const launchLayerRef = useRef<HTMLDivElement>(null);
  const launchLogoRef  = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setLogoReady(true); };
    image.onerror = () => { if (active) setLogoReady(true); };
    image.src = SMARTTRACK_LOGO_URL;
    if (image.complete) setLogoReady(true);

    authApi.me()
      .then(res => {
        if (!active) return;
        const assignedRoles = res.user.roles?.length ? res.user.roles : [res.user.role];
        const savedRole = activeRoleStore.get();
        if (assignedRoles.length > 1 && (!savedRole || !assignedRoles.includes(savedRole))) {
          setPendingRoleUser(res.user);
        } else {
          setUser({ ...res.user, role: (savedRole && assignedRoles.includes(savedRole) ? savedRole : res.user.role) as AuthUser["role"] });
        }
      })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setSessionReady(true); });

    receiptSettingsApi.getPublic()
      .then(settings => { if (active) setBusinessSettings(settings); })
      .catch(error => console.error("Business settings load failed:", error))
      .finally(() => { if (active) setSettingsReady(true); });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (sessionReady && settingsReady && logoReady && !user) {
      setLoginMounted(true);
    }
  }, [sessionReady, settingsReady, logoReady, user]);

  useEffect(() => {
    if (!launchVisible || !logoReady) return;
    if (user ? !homeReady : !loginMounted) return;

    // Smoothly fade out the splash screen without morphing/flying the logo (like Facebook and modern native apps)
    setSplashFading(true);
    const timer = setTimeout(() => {
      setLaunchVisible(false);
    }, 320);

    return () => clearTimeout(timer);
  }, [launchVisible, logoReady, user, homeReady, loginMounted]);

  const handleLogin = useCallback((nextUser: AuthUser) => {
    const assignedRoles = nextUser.roles?.length ? nextUser.roles : [nextUser.role];
    if (assignedRoles.length > 1) {
      setPendingRoleUser(nextUser);
      return;
    }
    const selectedRole = assignedRoles[0];
    activeRoleStore.set(selectedRole);
    try {
      if (localStorage.getItem("st_nav_prompt_on_login") !== "false") {
        sessionStorage.setItem("st_nav_prompt_pending", "1");
      } else {
        sessionStorage.removeItem("st_nav_prompt_pending");
      }
    } catch { /* ignore */ }
    setUser({ ...nextUser, role: selectedRole as AuthUser["role"] });
  }, []);

  const handleSelectRole = (role: string) => {
    if (!pendingRoleUser || !(pendingRoleUser.roles ?? [pendingRoleUser.role]).includes(role)) return;
    activeRoleStore.set(role);
    try {
      if (localStorage.getItem("st_nav_prompt_on_login") !== "false") {
        sessionStorage.setItem("st_nav_prompt_pending", "1");
      } else {
        sessionStorage.removeItem("st_nav_prompt_pending");
      }
    } catch { /* ignore */ }
    setUser({ ...pendingRoleUser, role: role as AuthUser["role"] });
    setPendingRoleUser(null);
  };

  const handleCancelRoleSelection = async () => {
    try { sessionStorage.removeItem("st_nav_prompt_pending"); } catch { /* ignore */ }
    await authApi.logout();
    setPendingRoleUser(null);
  };
  const handleHomeReady = useCallback(() => setHomeReady(true), []);

  const handleLogout = async () => {
    try { sessionStorage.removeItem("st_nav_prompt_pending"); } catch { /* ignore */ }
    try {
      await authApi.logout();
    } catch {
      /* Logout still clears the local session if the server is unreachable. */
    }
    setHomeReady(false);
    setUser(null);
  };

  return (
    <>
      {user ? (
        <Home
          user={user}
          onLogout={handleLogout}
          onUserUpdated={setUser}
          onReady={handleHomeReady}
        />
      ) : loginMounted ? (
        <LoginPage
          onLogin={handleLogin}
          businessSettings={businessSettings}
        />
      ) : null}

      {pendingRoleUser && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/70 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="role-choice-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Shield size={22} />
              </div>
              <div>
                <h2 id="role-choice-title" className="text-lg font-bold text-slate-900">Choose a role</h2>
                <p className="text-sm text-slate-500">Select the role to use for this session.</p>
              </div>
            </div>
            <div className="space-y-2">
              {(pendingRoleUser.roles ?? [pendingRoleUser.role]).map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleSelectRole(role)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-blue-400 hover:bg-blue-50"
                >
                  {ROLE_LABELS[role] ?? role}
                  <span className="text-xs font-medium text-slate-400">Use this role</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleCancelRoleSelection()}
              className="mt-4 w-full rounded-xl py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              Sign out
            </button>
          </section>
        </div>
      )}

      {launchVisible && (
        <div
          ref={launchLayerRef}
          className={`fixed inset-0 z-[10000] flex items-center justify-center bg-[#07182c] select-none pointer-events-none transition-opacity duration-300 ease-out ${
            splashFading ? "opacity-0" : "opacity-100"
          }`}
        >
          <img
            ref={launchLogoRef}
            src={SMARTTRACK_LOGO_URL}
            alt="SmartTrack"
            className="w-[180px] h-[120px] object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
          />
        </div>
      )}
    </>
  );
}
