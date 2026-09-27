import clsx from "clsx";
import { Check } from "lucide-react";
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

export function PipelineStages({ status, compact = false }: { status: ProjectStatus; compact?: boolean }) {
  const currentIndex = STAGES.findIndex((s) => s.statuses.includes(status));

  return (
    <div className={compact ? "" : "card overflow-x-auto p-5"}>
      <ol className="flex min-w-max items-center gap-1">
        {STAGES.map((stage, index) => {
          const state = stageState(index, currentIndex, status);
          return (
            <li key={stage.key} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={clsx(
                    "flex items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    compact ? "h-5 w-5" : "h-8 w-8",
                    state === "done" && "border-status-ready bg-status-ready/15 text-status-ready",
                    state === "active" && "border-indigo-400 bg-indigo-500/15 text-indigo-300 shadow-[0_0_0_3px_rgba(91,110,245,0.15)]",
                    state === "waiting" && "border-border text-ink-muted",
                    state === "failed" && "border-status-failed bg-status-failed/15 text-status-failed",
                  )}
                >
                  {state === "done" ? <Check size={compact ? 11 : 14} strokeWidth={3} /> : index + 1}
                </div>
                {!compact && (
                  <span className={clsx("text-xs font-medium", state === "active" ? "text-ink-primary" : "text-ink-muted")}>{stage.label}</span>
                )}
              </div>
              {index < STAGES.length - 1 && (
                <div
                  className={clsx(compact ? "mx-1 h-px w-4" : "mx-2 h-px w-8", index < currentIndex ? "bg-status-ready/50" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
