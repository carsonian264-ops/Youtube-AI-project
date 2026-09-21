import { useState } from "react";
import { Link } from "react-router-dom";
import { useDeleteProject, useProjects } from "@/hooks/useProjects";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/States";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/api";

export default function Projects() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const deleteProject = useDeleteProject();
  const { showToast } = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    try {
      await deleteProject.mutateAsync(id);
      showToast("Project deleted", "success");
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      setConfirmId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Every video you've started producing.</p>
        </div>
        <Link to="/projects/new" className="btn-primary">
          New project
        </Link>
      </div>

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
          title="No projects yet"
          description="Turn an idea into a fully produced video, start to finish."
          action={
            <Link to="/projects/new" className="btn-primary">
              Create your first project
            </Link>
          }
        />
      )}

      {!isLoading && !isError && projects && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="card flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <StatusBadge status={p.status} />
              </div>
              <p className="mb-4 line-clamp-2 flex-1 text-sm text-slate-500 dark:text-slate-400">{p.concept}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                {confirmId === p.id ? (
                  <span className="flex gap-2">
                    <button className="text-red-600 hover:underline" onClick={() => handleDelete(p.id)}>
                      Confirm delete
                    </button>
                    <button className="hover:underline" onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button className="hover:underline" onClick={() => setConfirmId(p.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
