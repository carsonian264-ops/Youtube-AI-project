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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          What your account has consumed across AI, media generation, and rendering. This is the foundation for
          future billing -- no charges are applied today.
        </p>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Couldn't load usage." onRetry={() => refetch()} />}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <EmptyState title="No usage yet" description="Generate your first project to see usage appear here." />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="card divide-y divide-slate-200 dark:divide-slate-800">
          {data.map((row) => (
            <div key={row.type} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="text-slate-600 dark:text-slate-300">{UNIT_LABELS[row.type] ?? row.type}</span>
              <span className="font-medium">{Math.round(row.total * 100) / 100}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
