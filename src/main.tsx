import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Login from "./app/login.tsx";
import "./styles/index.css";

// ─── Error boundary — shows a readable message instead of blank screen ────────
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#0f172a", padding: "2rem",
        }}>
          <div style={{
            background: "#1e293b", border: "1px solid #ef4444",
            borderRadius: "12px", padding: "2rem", maxWidth: "480px", width: "100%",
          }}>
            <p style={{ color: "#ef4444", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>
              Something went wrong
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "1rem" }}>
              {err.message}
            </p>
            <pre style={{
              color: "#64748b", fontSize: "0.7rem", overflowX: "auto",
              background: "#0f172a", padding: "0.75rem", borderRadius: "6px",
            }}>
              {err.stack?.slice(0, 600)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: "1rem", background: "#0d9488", color: "#fff",
                border: "none", borderRadius: "8px", padding: "0.5rem 1.25rem",
                cursor: "pointer", fontSize: "0.8rem", fontWeight: 700,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Mount ────────────────────────────────────────────────────────────────────
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

createRoot(rootElement).render(
  <ErrorBoundary>
    <Login />
  </ErrorBoundary>
);
