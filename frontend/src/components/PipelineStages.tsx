import clsx from "clsx";
import type { ProjectStatus } from "@/types";

const STAGES: { key: string; label: string; statuses: ProjectStatus[] }[] = [
  { key: "idea", label: "Idea", statuses: ["DRAFT"] },
  { key: "script", label: "Script", statuses: ["PLANNING", "SCRIPT_GENERATING", "SCRIPT_READY"] },
  { key: "scenes", label: "Scenes", statuses: ["SCENES_GENERATING", "SCENES_READY"] },
  { key: "visuals", label: "Visuals", statuses: ["ASSETS_GENERATING"] },
  { key: "voice", label: "Voice", statuses: ["AUDIO_GENERATING"] },
  { key: "video", label: "Video", statuses: ["RENDERING"] },
  { key: "review", label: "Review", statuses: ["QUALITY_CHECK", "READY_FOR_REVIEW"] },
  { key: "publish", label: "Publish", statuses: ["PUBLISHING", "PUBLISHED"] },
];

function stageState(stageIndex: number, currentIndex: number, status: ProjectStatus): "done" | "active" | "waiting" | "failed" {
  // FAILED/CANCELLED aren't in any stage's status list, so there's no
  // reliable way to know *which* stage it stopped at from this status
  // alone -- showing every stage as plain "waiting" is honest; guessing
  // stage 1 (the old `Math.max(0, -1)` fallback) would actively mislead
  // ("Idea" marked failed for a project that died during rendering).
  // The StatusBadge above already communicates FAILED/CANCELLED clearly.
  if (currentIndex === -1) return "waiting";
  if (status === "FAILED" && stageIndex === currentIndex) return "failed";
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "active";
  return "waiting";
}

export function PipelineStages({ status }: { status: ProjectStatus }) {
  const currentIndex = STAGES.findIndex((s) => s.statuses.includes(status));

  return (
    <div className="card overflow-x-auto p-5">
      <ol className="flex min-w-max items-center gap-1">
        {STAGES.map((stage, index) => {
          const state = stageState(index, currentIndex, status);
          return (
            <li key={stage.key} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                    state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                    state === "active" && "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
                    state === "waiting" && "border-slate-300 text-slate-400 dark:border-slate-700",
                    state === "failed" && "border-red-500 bg-red-500 text-white",
                  )}
                >
                  {state === "done" ? "✓" : index + 1}
                </div>
                <span
                  className={clsx(
                    "text-xs font-medium",
                    state === "active" ? "text-brand-700 dark:text-brand-300" : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {stage.label}
                </span>
              </div>
              {index < STAGES.length - 1 && (
                <div className={clsx("mx-2 h-0.5 w-8", index < currentIndex ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700")} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
