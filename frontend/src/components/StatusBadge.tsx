import clsx from "clsx";
import type { ProjectStatus } from "@/types";

const STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PLANNING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  SCRIPT_GENERATING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  SCRIPT_READY: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  SCENES_GENERATING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  SCENES_READY: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ASSETS_GENERATING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  AUDIO_GENERATING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  RENDERING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  QUALITY_CHECK: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  READY_FOR_REVIEW: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  PUBLISHING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PUBLISHED: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  CANCELLED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function StatusBadge({ status }: { status: ProjectStatus | string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STYLES[status] ?? STYLES.DRAFT)}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
