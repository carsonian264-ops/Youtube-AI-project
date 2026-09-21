import clsx from "clsx";
import type { JobSummary } from "@/types";

const TYPE_LABELS: Record<string, string> = {
  CONTENT_GENERATION: "Script & scenes",
  VISUAL_GENERATION: "Visuals",
  VOICE_GENERATION: "Voice",
  CAPTION_GENERATION: "Captions",
  VIDEO_RENDERING: "Video render",
  THUMBNAIL_GENERATION: "Thumbnail",
  QUALITY_CHECK: "Quality check",
  PUBLISHING: "Publishing",
};

function summarize(jobs: JobSummary[], type: string) {
  const forType = jobs.filter((j) => j.type === type);
  if (forType.length === 0) return null;
  const completed = forType.filter((j) => j.status === "COMPLETED").length;
  const failed = forType.filter((j) => j.status === "FAILED").length;
  const active = forType.some((j) => j.status === "ACTIVE");
  const avgProgress = Math.round(forType.reduce((sum, j) => sum + j.progress, 0) / forType.length);

  let status: "waiting" | "active" | "done" | "failed" = "waiting";
  if (failed > 0 && completed + failed === forType.length) status = "failed";
  else if (completed === forType.length) status = "done";
  else if (active || completed > 0) status = "active";

  return { status, progress: avgProgress, count: forType.length, completed, errorMessage: forType.find((j) => j.errorMessage)?.errorMessage };
}

export function JobsProgress({ jobs }: { jobs: JobSummary[] }) {
  const types = Object.keys(TYPE_LABELS);
  const rows = types.map((type) => ({ type, summary: summarize(jobs, type) })).filter((r) => r.summary);

  if (rows.length === 0) return null;

  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold">Generation progress</h3>
      <ul className="space-y-3">
        {rows.map(({ type, summary }) => (
          <li key={type} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm text-slate-600 dark:text-slate-400">{TYPE_LABELS[type]}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={clsx(
                  "h-full rounded-full transition-all",
                  summary!.status === "done" && "bg-emerald-500",
                  summary!.status === "active" && "bg-brand-500",
                  summary!.status === "failed" && "bg-red-500",
                  summary!.status === "waiting" && "bg-slate-300",
                )}
                style={{ width: `${summary!.status === "done" ? 100 : summary!.progress}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
              {summary!.status === "done"
                ? `${summary!.count}/${summary!.count} ✓`
                : summary!.status === "failed"
                  ? "Failed"
                  : summary!.status === "active"
                    ? `${summary!.completed}/${summary!.count} · ${summary!.progress}%`
                    : "Waiting"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
