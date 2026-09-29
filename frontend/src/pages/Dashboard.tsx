import { Link } from "react-router-dom";
import { Plus, Film, ArrowUpRight, Layers, Activity, CheckCircle2, Rocket } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { StatusBadge } from "@/components/StatusBadge";
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/States";
import { useAuthStore } from "@/lib/authStore";
import { IN_PROGRESS_STATUSES } from "@/types";

const STAT_ICON_STYLES = {
  indigo: "bg-indigo-500/10 text-indigo-400",
  progress: "bg-status-progress/10 text-status-progress",
  ready: "bg-status-ready/10 text-status-ready",
  published: "bg-status-published/10 text-status-published",
} as const;

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: projects, isLoading, isError, refetch } = useProjects();

  const recent = projects?.slice(0, 8) ?? [];
  const featured = projects?.[0];
  const firstName = user?.name || user?.email?.split("@")[0] || "there";

  const counts = {
    total: projects?.length ?? 0,
    draft: projects?.filter((p) => p.status === "DRAFT").length ?? 0,
    inProgress: projects?.filter((p) => IN_PROGRESS_STATUSES.includes(p.status)).length ?? 0,
    readyForReview: projects?.filter((p) => p.status === "READY_FOR_REVIEW").length ?? 0,
    published: projects?.filter((p) => p.status === "PUBLISHED").length ?? 0,
    failed: projects?.filter((p) => p.status === "FAILED" || p.status === "CANCELLED").length ?? 0,
  };

  const stats = [
    { label: "Total projects", value: counts.total, icon: Layers, color: "indigo" as const },
    { label: "In progress", value: counts.inProgress, icon: Activity, color: "progress" as const },
    { label: "Ready for review", value: counts.readyForReview, icon: CheckCircle2, color: "ready" as const },
    { label: "Published", value: counts.published, icon: Rocket, color: "published" as const },
  ];

  const pipeline = [
    { label: "Draft", count: counts.draft, className: "bg-ink-muted" },
    { label: "In progress", count: counts.inProgress, className: "bg-status-progress" },
    { label: "Ready for review", count: counts.readyForReview, className: "bg-status-ready" },
    { label: "Published", count: counts.published, className: "bg-status-published" },
    { label: "Failed", count: counts.failed, className: "bg-status-failed" },
  ].filter((s) => s.count > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface">
        <div className="pointer-events-none absolute inset-0 bg-aurora" />
        <div className="relative grid gap-8 p-8 md:grid-cols-[1.1fr_1fr] md:p-10">
          <div className="flex flex-col justify-center">
            <p className="text-sm text-ink-secondary">Welcome back, {firstName}</p>
            <h1 className="font-display mt-2 text-[32px] font-extrabold leading-[1.1] tracking-tight text-ink-primary md:text-[38px]">
              Create. Generate. Publish.
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-secondary">
              Turn your ideas into fully produced videos — script, scenes, visuals, voice, and captions, handled by AI.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/projects/new" className="btn-primary px-5 py-2.5 text-[15px]">
                <Plus size={17} />
                New project
              </Link>
              {featured && (
                <Link to={`/projects/${featured.id}`} className="btn-ghost">
                  Continue "{featured.title}"
                  <ArrowUpRight size={15} />
                </Link>
              )}
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            {featured ? (
              <Link
                to={`/projects/${featured.id}`}
                className="group relative w-full max-w-sm overflow-hidden rounded-2xl border border-border-strong bg-base shadow-panel"
              >
                <div className="relative aspect-video overflow-hidden bg-surface-raised">
                  {featured.thumbnailUrl ? (
                    <img
                      src={featured.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Film size={28} className="text-ink-muted" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3">
                    <p className="truncate text-sm font-medium text-white">{featured.title}</p>
                    <div className="mt-1">
                      <StatusBadge status={featured.status} />
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="flex aspect-video w-full max-w-sm flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong text-ink-muted">
                <Film size={24} />
                <p className="text-xs">Your first production will preview here</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="card flex items-start gap-3 p-4 transition-colors hover:border-border-strong">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STAT_ICON_STYLES[stat.color]}`}>
                <stat.icon size={17} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold leading-tight text-ink-primary">{stat.value}</p>
                <p className="mt-0.5 truncate text-xs text-ink-secondary">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {pipeline.length > 0 && (
          <div className="card mt-4 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-secondary">Pipeline breakdown</p>
              <p className="text-xs text-ink-muted">{counts.total} total</p>
            </div>
            <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full bg-surface-raised">
              {pipeline.map((seg) => (
                <div
                  key={seg.label}
                  title={`${seg.label}: ${seg.count}`}
                  className={`h-full ${seg.className}`}
                  style={{ width: `${(seg.count / counts.total) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {pipeline.map((seg) => (
                <div key={seg.label} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                  <span className={`h-1.5 w-1.5 rounded-full ${seg.className}`} />
                  {seg.label}
                  <span className="text-ink-muted">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recent projects */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-primary">Recent projects</h2>
          {recent.length > 0 && (
            <Link to="/projects" className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
              View all
            </Link>
          )}
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isError && <ErrorState message="Couldn't load your projects." onRetry={() => refetch()} />}

        {!isLoading && !isError && recent.length === 0 && (
          <EmptyState
            title="Your studio is empty"
            description="Your next great video starts with an idea."
            action={
              <Link to="/projects/new" className="btn-primary">
                <Plus size={16} />
                Create your first video
              </Link>
            }
          />
        )}

        {!isLoading && !isError && recent.length > 0 && (
          <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
            {recent.map((p) => (
              <ProjectCard key={p.id} project={p} className="w-72 shrink-0 snap-start" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
