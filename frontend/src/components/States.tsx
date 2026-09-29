import type { ReactNode } from "react";
import { Film, AlertTriangle } from "lucide-react";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-secondary">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-status-failed/25 bg-status-failed/5 py-12 text-center">
      <AlertTriangle size={20} className="text-status-failed" />
      <p className="text-sm font-medium text-ink-primary">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-ink-muted">
        <Film size={18} />
      </div>
      <p className="text-base font-medium text-ink-primary">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-secondary">{description}</p>}
      {action}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card animate-pulse p-5">
      <div className="mb-3 h-4 w-2/3 rounded bg-white/5" />
      <div className="mb-2 h-3 w-full rounded bg-white/5" />
      <div className="h-3 w-1/2 rounded bg-white/5" />
    </div>
  );
}
