import { useState } from "react";
import { AlertTriangle, Pill } from "lucide-react";
import { CREDENTIALS, type AuthUser } from "./data";
import Home from "./home";

function FieldInput({ label, type = "text", value, onChange, placeholder, required }: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      />
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 600));

    const entry = CREDENTIALS[email.toLowerCase().trim()];
    if (!entry || entry.password !== password) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    onLogin(entry.user);
  };


  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a3040 0%, #0d1f2d 60%, #0a3040 100%)" }}>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="relative text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <Pill size={36} className="text-teal-300" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-3">SmartTrack</h1>
          <p className="text-teal-300 text-lg font-medium mb-2">Tangub Pharmacy</p>
          <p className="text-white/50 text-sm leading-relaxed">Automated Financial &amp; Inventory Management with Supply-Demand Analytics</p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[["Real-time Stock", "Track inventory live"], ["Financial Reports", "Revenue analytics"], ["Smart Alerts", "Auto reorder alerts"]].map(([title, description]) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-xl p-3 text-left">
                <p className="text-white text-xs font-semibold">{title}</p>
                <p className="text-white/40 text-[10px] mt-0.5">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

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
            <FieldInput label="Password" type="password" value={password} onChange={setPassword} placeholder="Password" required />
            {error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={12} />{error}
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg shadow-primary/20">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>


          <p className="text-center text-[11px] text-muted-foreground mt-6">SmartTrack v2.1 - Tangub City, Misamis Occidental</p>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const [user, setUser] = useState<AuthUser | null>(null);

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return <Home user={user} onLogout={() => setUser(null)} />;
}
