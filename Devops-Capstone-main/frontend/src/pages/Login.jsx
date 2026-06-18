import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";

const FEATURES = [
  { label: "Live inventory", detail: "Stock levels sync the moment an order is placed." },
  { label: "Order tracking", detail: "Every order has a clear status from placed to delivered." },
  { label: "Built for speed", detail: "A catalog that loads instantly, even on a slow connection." },
];

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      toast.success("Welcome back!");
      navigate(location.state?.from?.pathname || "/");
    } catch (err) {
      const msg = err?.response?.data?.error || "Login failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(role) {
    if (role === "admin") {
      setUsername("admin");
      setPassword("admin1234");
    } else {
      setUsername("demo");
      setPassword("demo1234");
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] lg:grid-cols-2">
      {/* Brand / pitch panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 px-12 py-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <Link to="/" className="relative z-10 flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[12px] font-bold text-ink-950">
            M
          </span>
          Marketly
        </Link>

        <div className="relative z-10 max-w-md">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-300">
            Marketly for teams
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tightish">
            Run your storefront with total clarity.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            One dashboard for catalog, orders, and customers — built to feel
            instant at every step.
          </p>

          <div className="mt-10 space-y-5 border-t border-white/10 pt-8">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                <div>
                  <p className="text-sm font-medium text-white">{f.label}</p>
                  <p className="mt-0.5 text-sm text-ink-400">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-ink-500">© {new Date().getFullYear()} Marketly</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-950 text-[12px] font-bold text-white">
              M
            </span>
            <span className="text-sm font-semibold text-ink-950">Marketly</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tightish text-ink-950">Welcome back</h2>
          <p className="mt-1.5 text-sm text-ink-500">Log in to continue to your account.</p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="field-label">Username</label>
              <input
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button className="btn-primary w-full" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>

          <p className="mt-5 text-sm text-ink-500">
            No account?{" "}
            <Link className="link" to="/register">
              Register here
            </Link>
          </p>

          <div className="mt-8 rounded-md border border-ink-200 bg-ink-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Try it instantly
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => fillDemo("customer")}>
                Use demo customer
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => fillDemo("admin")}>
                Use demo admin
              </button>
            </div>
            <p className="mt-3 font-mono text-[11px] text-ink-400">
              demo / demo1234 &middot; admin / admin1234
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
