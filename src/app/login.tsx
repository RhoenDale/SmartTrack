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
          className="w-full h-12 bg-white/85 backdrop-blur-md border border-white/95 rounded-2xl pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/70 focus:bg-white transition-all"
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

// ─── Pure Vector Split Background (Zero Images, Royal Blue Oceanic S-Curve Glassmorphism) ───
function SplitVectorBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Right-Side Luminous Dimmed Daylight & Soft Blue Ambiance */}
      <div className="absolute inset-0 bg-[#edf2f7]">
        {/* Soft daylight sky on top right */}
        <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-b from-[#e0ecf8] via-[#eef4fb] to-[#edf2f7]" />

        {/* Soft blurred organic nature shapes in sky blue, royal sapphire, and indigo */}
        <div className="absolute top-1/4 -right-16 w-[620px] h-[520px] rounded-full bg-[#93c5fd]/50 blur-[90px] transform-gpu" />
        <div className="absolute top-1/2 right-12 w-[680px] h-[480px] rounded-full bg-[#60a5fa]/35 blur-[95px] transform-gpu" />
        <div className="absolute -bottom-24 right-0 w-[820px] h-[540px] rounded-full bg-[#2563eb]/25 blur-[105px] transform-gpu" />
        <div className="absolute bottom-16 right-1/4 w-[480px] h-[380px] rounded-full bg-[#38bdf8]/30 blur-[85px] transform-gpu" />
      </div>

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

          {/* Luminous glowing sky spine highlight along the curve */}
          <linearGradient id="spineSkyGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#60a5fa" stopOpacity="0.85" />
            <stop offset="80%" stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>

          {/* Lower left soft ambient light ribbon */}
          <linearGradient id="lowerBlueArc" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#2563eb" stopOpacity="0.15" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>

          {/* Layer shadow */}
          <filter id="waveShadow" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="15" dy="0" stdDeviation="30" floodColor="#020817" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Primary sweeping S-curve covering the left side and flowing through center */}
        <path
          d="M 0 0 L 1180 0 C 1100 280 820 620 980 1080 L 0 1080 Z"
          fill="url(#blueWaveGrad)"
          filter="url(#waveShadow)"
        />

        {/* Glowing luminous curved spine edge */}
        <path
          d="M 1180 0 C 1100 280 820 620 980 1080"
          fill="none"
          stroke="url(#spineSkyGlow)"
          strokeWidth="3.5"
          filter="drop-shadow(0 0 16px rgba(96, 165, 250, 0.8))"
        />

        {/* Lower left ambient light ribbon */}
        <path
          d="M -50 820 Q 280 680 450 1080"
          fill="none"
          stroke="url(#lowerBlueArc)"
          strokeWidth="90"
          filter="blur(30px)"
        />
      </svg>

      {/* Gentle ambient lighting orbs to soften transitions */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-500/15 blur-[120px]" />
      <div className="absolute -bottom-20 left-10 w-[600px] h-[400px] rounded-full bg-indigo-500/20 blur-[130px]" />
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
        <div className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] bg-white/60 backdrop-blur-md border border-white/80 text-blue-950 shadow-sm">
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
            <div className="absolute -inset-3 bg-gradient-to-tr from-teal-400/30 via-sky-400/25 to-blue-500/20 rounded-3xl blur-2xl opacity-80 group-hover:opacity-100 transition-opacity" />
            <img
              src={SMARTTRACK_LOGO_URL}
              alt="SmartTrack mark"
              className="relative w-40 h-28 sm:w-48 sm:h-32 object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)] transition-all duration-300 group-hover:scale-105 group-hover:-translate-y-1 opacity-100"
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
                  animationDelay: `${180 + index * 100}ms`,
                  backdropFilter: "blur(24px) saturate(180%)",
                  WebkitBackdropFilter: "blur(24px) saturate(180%)",
                }}
                className="st-login-feature bg-gradient-to-b from-white/[0.18] to-white/[0.09] border border-white/25 rounded-2xl p-4 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.4),inset_0_-1px_1px_rgba(255,255,255,0.1)] hover:from-white/[0.24] hover:to-white/[0.14] hover:border-white/40 hover:shadow-[0_16px_36px_rgba(0,0,0,0.28),inset_0_1px_2px_rgba(255,255,255,0.55)] transition-all text-center flex flex-col items-center group"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-500/25 border border-blue-300/40 flex items-center justify-center mb-3 text-blue-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] group-hover:scale-105 transition-transform mx-auto">
                  <Icon size={15} />
                </div>
                <p className="text-xs font-bold text-white tracking-wide drop-shadow-sm">{title}</p>
                <p className="text-[11px] text-blue-100/90 mt-1 leading-normal">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Milky Frosted-Glass Login Card */}
        <div className="st-login-card-wrap lg:col-span-5 flex justify-center lg:justify-end">
          <div className="st-login-card w-full max-w-[430px] bg-white/70 backdrop-blur-2xl border border-white/90 rounded-[32px] shadow-[0_25px_60px_-15px_rgba(15,23,42,0.2),inset_0_1px_2px_rgba(255,255,255,0.95)] p-8 sm:p-9 text-left">
            
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
                    className="w-full h-12 bg-white/85 backdrop-blur-md border border-white/95 rounded-2xl pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/70 focus:bg-white transition-all"
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
    setUser({ ...nextUser, role: selectedRole as AuthUser["role"] });
  }, []);

  const handleSelectRole = (role: string) => {
    if (!pendingRoleUser || !(pendingRoleUser.roles ?? [pendingRoleUser.role]).includes(role)) return;
    activeRoleStore.set(role);
    setUser({ ...pendingRoleUser, role: role as AuthUser["role"] });
    setPendingRoleUser(null);
  };

  const handleCancelRoleSelection = async () => {
    await authApi.logout();
    setPendingRoleUser(null);
  };
  const handleHomeReady = useCallback(() => setHomeReady(true), []);

  const handleLogout = async () => {
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
