import { useState } from "react";
import { Link } from "react-router-dom";
import { Film, MoreVertical, Play } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { PipelineStages } from "@/components/PipelineStages";
import { IN_PROGRESS_STATUSES, type ProjectListItem } from "@/types";

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ProjectCard({
  project,
  onDelete,
  className = "",
}: {
  project: ProjectListItem;
  onDelete?: (id: string) => void;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isActive = IN_PROGRESS_STATUSES.includes(project.status);
  const duration = formatDuration(project.durationSeconds);

  return (
    <div className={`card group relative flex flex-col overflow-hidden transition-colors hover:border-border-strong ${className}`}>
      <Link to={`/projects/${project.id}`} className="block">
        <div className="relative aspect-video overflow-hidden bg-surface-raised">
          {project.thumbnailUrl ? (
            <img
              src={project.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-raised to-surface">
              <Film size={22} className="text-ink-muted" />
            </div>
          )}

          {project.thumbnailUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/30 group-hover:opacity-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-base backdrop-blur">
                <Play size={16} className="ml-0.5 fill-base text-base" />
              </div>
            </div>
          )}

          {duration && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              {duration}
            </span>
          )}

          {isActive && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6">
              <PipelineStages status={project.status} compact />
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/projects/${project.id}`} className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink-primary hover:text-indigo-300">{project.title}</h3>
          </Link>
          {onDelete && (
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Project options"
                className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-primary"
              >
                <MoreVertical size={15} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-7 z-10 w-36 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-panel">
                  {!confirming ? (
                    <button
                      className="block w-full px-3 py-2 text-left text-xs text-status-failed hover:bg-surface-hover"
                      onClick={() => setConfirming(true)}
                    >
                      Delete project
                    </button>
                  ) : (
                    <button
                      className="block w-full px-3 py-2 text-left text-xs font-medium text-status-failed hover:bg-surface-hover"
                      onClick={() => {
                        onDelete(project.id);
                        setMenuOpen(false);
                        setConfirming(false);
                      }}
                    >
                      Confirm delete?
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-ink-secondary">{project.concept}</p>
        <div className="flex items-center justify-between pt-1">
          <StatusBadge status={project.status} />
          <span className="text-[11px] text-ink-muted">{new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
      </div>
    </div>
  );
}
