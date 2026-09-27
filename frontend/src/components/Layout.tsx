import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { LayoutDashboard, Clapperboard, Gauge, Settings as SettingsIcon, LogOut, Plus, Search, Menu, X } from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { useProjects } from "@/hooks/useProjects";
import { Logo } from "@/components/Logo";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: Clapperboard },
  { to: "/usage", label: "Usage", icon: Gauge },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Layout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-base">
      <div className="flex">
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
        )}

        <aside
          className={clsx(
            "fixed inset-y-0 left-0 z-40 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 transition-transform duration-200 md:sticky md:top-0 md:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-8 flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="font-display text-[15px] font-bold leading-tight text-ink-primary">AI Content Studio</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised hover:text-ink-primary md:hidden"
            >
              <X size={16} />
            </button>
          </div>

          <nav className="flex-1 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-indigo-500/12 text-ink-primary" : "text-ink-secondary hover:bg-surface-raised hover:text-ink-primary",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={18} strokeWidth={2} className={isActive ? "text-indigo-400" : "text-ink-muted group-hover:text-ink-secondary"} />
                    {item.label}
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white">
                {initial}
              </div>
              <p className="min-w-0 flex-1 truncate text-xs text-ink-secondary">{user?.email}</p>
              <button
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink-primary"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
          <main className="px-4 py-6 sm:px-6 md:px-10 md:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !projects) return [];
    return projects.filter((p) => p.title.toLowerCase().includes(q) || p.concept.toLowerCase().includes(q)).slice(0, 6);
  }, [query, projects]);

  function goTo(id: string) {
    setQuery("");
    navigate(`/projects/${id}`);
  }

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-base/80 px-4 py-3.5 backdrop-blur sm:gap-4 sm:px-6 md:px-10">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-raised hover:text-ink-primary md:hidden"
      >
        <Menu size={18} />
      </button>

      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          className="input pl-9"
          placeholder="Search projects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) goTo(matches[0].id);
            if (e.key === "Escape") setQuery("");
          }}
        />
        {query.trim() && (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-panel">
            {matches.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">No projects match "{query}"</p>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goTo(p.id)}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="text-sm font-medium text-ink-primary">{p.title}</span>
                  <span className="truncate text-xs text-ink-muted">{p.concept}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="ml-auto shrink-0">
        <button onClick={() => navigate("/projects/new")} className="btn-primary px-3 sm:px-4">
          <Plus size={16} />
          <span className="hidden sm:inline">New project</span>
        </button>
      </div>
    </header>
  );
}
