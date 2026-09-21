import { Link } from "react-router-dom";
import { useProjects } from "@/hooks/useProjects";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/States";
import { useAuthStore } from "@/lib/authStore";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: projects, isLoading, isError, refetch } = useProjects();

  const recent = projects?.slice(0, 5) ?? [];
  const counts = {
    total: projects?.length ?? 0,
    inProgress: projects?.filter((p) => !["DRAFT", "READY_FOR_REVIEW", "PUBLISHED", "FAILED", "CANCELLED"].includes(p.status)).length ?? 0,
    readyForReview: projects?.filter((p) => p.status === "READY_FOR_REVIEW").length ?? 0,
    published: projects?.filter((p) => p.status === "PUBLISHED").length ?? 0,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Here's what's happening across your productions.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total projects", value: counts.total },
          { label: "In progress", value: counts.inProgress },
          { label: "Ready for review", value: counts.readyForReview },
          { label: "Published", value: counts.published },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent projects</h2>
          <Link to="/projects" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            View all
          </Link>
        </div>

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isError && <ErrorState message="Couldn't load your projects." onRetry={() => refetch()} />}

        {!isLoading && !isError && recent.length === 0 && (
          <EmptyState
            title="No projects yet"
            description="Turn an idea into a fully produced video."
            action={
              <Link to="/projects/new" className="btn-primary">
                Create your first project
              </Link>
            }
          />
        )}

        {!isLoading && !isError && recent.length > 0 && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {recent.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="flex items-center justify-between gap-4 py-3 hover:opacity-80">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{p.concept}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
