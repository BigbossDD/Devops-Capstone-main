import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";

const STEPS = [
  "Create your account in seconds",
  "Browse the full catalog and add to cart",
  "Track every order from placed to delivered",
];

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username, password, email || undefined);
      toast.success("Account created!");
      navigate("/");
    } catch (err) {
      const msg = err?.response?.data?.error || "Registration failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
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
            Get started
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tightish">
            Join Marketly in under a minute.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            No setup, no waiting on approval — create an account and start
            shopping right away.
          </p>

          <ol className="mt-10 space-y-5 border-t border-white/10 pt-8">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 text-[11px] font-medium text-ink-300">
                  {i + 1}
                </span>
                <span className="text-sm text-ink-300">{step}</span>
              </li>
            ))}
          </ol>
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

          <h2 className="text-2xl font-semibold tracking-tightish text-ink-950">Create an account</h2>
          <p className="mt-1.5 text-sm text-ink-500">It only takes a minute.</p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="field-label">Username</label>
              <input
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="field-label">Email (optional)</label>
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Password (min 6 characters)</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button className="btn-primary w-full" type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="mt-5 text-sm text-ink-500">
            Already have an account?{" "}
            <Link className="link" to="/login">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
