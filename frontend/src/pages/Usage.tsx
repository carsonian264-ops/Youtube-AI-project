import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import type { UsageSummaryRow } from "@/types";

const UNIT_LABELS: Record<string, string> = {
  CLAUDE_REQUEST: "Claude requests",
  CLAUDE_TOKENS: "Claude tokens",
  IMAGE_GENERATION: "Images generated",
  VOICE_GENERATION: "Voice clips generated",
  RENDER_SECONDS: "Render time (seconds)",
  STORAGE_BYTES: "Storage used (bytes)",
  YOUTUBE_UPLOAD: "YouTube uploads",
};

export default function Usage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["usage"],
    queryFn: async () => (await api.get<UsageSummaryRow[]>("/usage")).data,
  });

  const max = Math.max(1, ...(data ?? []).map((r) => r.total));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-primary">Usage</h1>
        <p className="text-sm text-ink-secondary">
          What your account has consumed across AI, media generation, and rendering. This is the foundation for future billing — no charges are applied today.
        </p>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Couldn't load usage." onRetry={() => refetch()} />}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <EmptyState title="No usage yet" description="Generate your first project to see usage appear here." />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="card space-y-5 p-6">
          {data.map((row) => (
            <div key={row.type}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-ink-secondary">{UNIT_LABELS[row.type] ?? row.type}</span>
                <span className="font-medium text-ink-primary">{Math.round(row.total * 100) / 100}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.max(4, (row.total / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
