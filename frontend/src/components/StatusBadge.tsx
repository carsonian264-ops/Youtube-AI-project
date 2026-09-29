import clsx from "clsx";
import type { ProjectStatus } from "@/types";

const IN_PROGRESS: ProjectStatus[] = [
  "PLANNING",
  "SCRIPT_GENERATING",
  "SCENES_GENERATING",
  "ASSETS_GENERATING",
  "AUDIO_GENERATING",
  "RENDERING",
  "QUALITY_CHECK",
  "PUBLISHING",
];

const LABELS: Partial<Record<ProjectStatus, string>> = {
  DRAFT: "Draft",
  PLANNING: "Planning",
  SCRIPT_GENERATING: "Writing script",
  SCRIPT_READY: "Script ready",
  SCENES_GENERATING: "Planning scenes",
  SCENES_READY: "Scenes ready",
  ASSETS_GENERATING: "Generating visuals",
  AUDIO_GENERATING: "Generating voice",
  RENDERING: "Rendering",
  QUALITY_CHECK: "Quality check",
  READY_FOR_REVIEW: "Ready for review",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function styleFor(status: ProjectStatus | string) {
  if (status === "READY_FOR_REVIEW") return "bg-status-ready/12 text-status-ready";
  if (status === "PUBLISHED") return "bg-status-published/15 text-status-published";
  if (status === "FAILED") return "bg-status-failed/12 text-status-failed";
  if (status === "CANCELLED") return "bg-white/5 text-ink-muted";
  if (status === "DRAFT") return "bg-white/5 text-ink-secondary";
  if (IN_PROGRESS.includes(status as ProjectStatus)) return "bg-status-progress/12 text-status-progress";
  return "bg-white/5 text-ink-secondary";
}

export function StatusBadge({ status }: { status: ProjectStatus | string }) {
  const isActive = IN_PROGRESS.includes(status as ProjectStatus);
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", styleFor(status))}>
      {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-progress" />}
      {LABELS[status as ProjectStatus] ?? status.toString().replaceAll("_", " ")}
    </span>
  );
}
