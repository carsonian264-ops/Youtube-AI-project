import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-base text-center">
      <p className="font-display text-4xl font-extrabold text-ink-primary">404</p>
      <p className="text-sm text-ink-secondary">This page doesn't exist.</p>
      <Link to="/dashboard" className="btn-primary mt-2">
        Back to dashboard
      </Link>
    </div>
  );
}
