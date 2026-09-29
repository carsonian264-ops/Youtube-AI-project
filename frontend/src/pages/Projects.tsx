import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useDeleteProject, useProjects } from "@/hooks/useProjects";
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/States";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/api";
import { IN_PROGRESS_STATUSES, type ProjectStatus } from "@/types";

type Filter = "all" | "draft" | "in-progress" | "review" | "published" | "failed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in-progress", label: "Generating" },
  { key: "review", label: "Ready for review" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
];

function matches(status: ProjectStatus, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "draft") return status === "DRAFT";
  if (filter === "in-progress") return IN_PROGRESS_STATUSES.includes(status);
  if (filter === "review") return status === "READY_FOR_REVIEW";
  if (filter === "published") return status === "PUBLISHED";
  if (filter === "failed") return status === "FAILED";
  return true;
}

export default function Projects() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const deleteProject = useDeleteProject();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => (projects ?? []).filter((p) => matches(p.status, filter)), [projects, filter]);

  async function handleDelete(id: string) {
    try {
      await deleteProject.mutateAsync(id);
      showToast("Project deleted", "success");
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Your projects</h1>
          <p className="text-sm text-ink-secondary">Every video you've started producing.</p>
        </div>
        <Link to="/projects/new" className="btn-primary">
          <Plus size={16} />
          New project
        </Link>
      </div>

      {!isLoading && !isError && (projects?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filter === f.key ? "bg-indigo-500/15 text-indigo-300" : "text-ink-secondary hover:bg-surface-raised hover:text-ink-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {isError && <ErrorState message="Couldn't load your projects." onRetry={() => refetch()} />}

      {!isLoading && !isError && projects?.length === 0 && (
        <EmptyState
          title="Your studio is empty"
          description="Turn an idea into a fully produced video, start to finish."
          action={
            <Link to="/projects/new" className="btn-primary">
              <Plus size={16} />
              Create your first video
            </Link>
          }
        />
      )}

      {!isLoading && !isError && (projects?.length ?? 0) > 0 && filtered.length === 0 && (
        <EmptyState title="Nothing here yet" description="No projects match this filter." />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
