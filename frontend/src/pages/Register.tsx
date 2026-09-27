import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/authStore";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";

export default function Register() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/auth/register", { email, password, name: name || undefined });
      setSession(res.data.token, res.data.user);
      showToast("Account created", "success");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-base px-4">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="card relative w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <Logo size={30} />
          <span className="font-display text-base font-bold text-ink-primary">AI Content Studio</span>
        </div>
        <h1 className="mb-1 text-xl font-semibold text-ink-primary">Create your account</h1>
        <p className="mb-6 text-sm text-ink-secondary">Start producing AI-assisted video content</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Name (optional)
            </label>
            <input id="name" type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
          </div>
          {error && <p className="text-sm text-status-failed">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
