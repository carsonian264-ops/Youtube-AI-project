import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Clapperboard,
  Users,
  Image as ImageIcon,
  Film,
  Send,
  Sparkles,
  RotateCcw,
  Wand2,
  Mic,
  ShieldCheck,
  X,
  ExternalLink,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import {
  useCancelProject,
  useGenerateProject,
  useGenerateSceneVisual,
  useGenerateSceneVoice,
  useProject,
  useRegenerateScene,
  useRegenerateSceneVisuals,
  useRegenerateScript,
  useRegenerateThumbnails,
  useRenderProject,
  useRunQualityCheck,
  useSelectThumbnail,
} from "@/hooks/useProjects";
import { StatusBadge } from "@/components/StatusBadge";
import { PipelineStages } from "@/components/PipelineStages";
import { JobsProgress } from "@/components/JobsProgress";
import { ErrorState, LoadingState } from "@/components/States";
import { useToast } from "@/components/Toast";
import {
  IN_PROGRESS_STATUSES,
  type Asset,
  type Character,
  type PublishingJob,
  type Scene,
  type Script,
  type Thumbnail,
  type Video,
  type VideoStats,
  type YoutubeAccount,
} from "@/types";

type Tab = "script" | "scenes" | "characters" | "media" | "video" | "publish";

const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: "script", label: "Script", icon: FileText },
  { key: "scenes", label: "Scenes", icon: Clapperboard },
  { key: "characters", label: "Characters", icon: Users },
  { key: "media", label: "Media", icon: ImageIcon },
  { key: "video", label: "Video & thumbnail", icon: Film },
  { key: "publish", label: "Publish", icon: Send },
];

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("script");

  const { data: workspace, isLoading, isError, refetch } = useProject(id);
  const isRunning = workspace ? IN_PROGRESS_STATUSES.includes(workspace.project.status) : false;

  const generateProject = useGenerateProject(id ?? "");
  const regenerateScript = useRegenerateScript(id ?? "");
  const renderProject = useRenderProject(id ?? "");
  const runQualityCheck = useRunQualityCheck(id ?? "");
  const cancelProject = useCancelProject(id ?? "");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function runAction<T>(action: () => Promise<T>, successMessage: string) {
    try {
      await action();
      showToast(successMessage, "success");
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
  }

  if (isLoading) return <LoadingState label="Loading project..." />;
  if (isError || !workspace) return <ErrorState message="Couldn't load this project." onRetry={() => refetch()} />;

  const { project, scripts, scenes, characters, assets, jobs, videos, thumbnails, publishingJobs } = workspace;
  const activeScript = scripts.find((s) => s.isActive) ?? scripts[0];
  const finalVideo = videos.find((v) => v.status === "READY");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-ink-primary">{project.title}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="max-w-2xl text-sm text-ink-secondary">{project.concept}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(project.status === "DRAFT" || project.status === "FAILED") && (
            <button
              className="btn-primary"
              disabled={generateProject.isPending}
              onClick={() => runAction(() => generateProject.mutateAsync(), "Generation started")}
            >
              <Sparkles size={15} />
              {generateProject.isPending ? "Starting..." : "Generate video"}
            </button>
          )}
          {project.status === "SCRIPT_READY" && (
            <button className="btn-secondary" onClick={() => runAction(() => regenerateScript.mutateAsync(), "Regenerating script")}>
              <RotateCcw size={14} />
              Regenerate script
            </button>
          )}
          {/* READY_FOR_REVIEW and PUBLISHED are the legal sources for a manual
              re-render -- SCENES_READY has no visual/voice assets yet, so
              rendering from there would just fail at the FFmpeg stage.
              Re-rendering a published project only replaces the local video
              file; it never touches the already-live YouTube upload, since
              publishing is a separate, explicit action -- the toast below
              says so and the project moves back to "Ready for review"
              afterward rather than staying "Published". */}
          {(project.status === "READY_FOR_REVIEW" || project.status === "PUBLISHED") && scenes.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() =>
                runAction(
                  () => renderProject.mutateAsync(),
                  project.status === "PUBLISHED"
                    ? "Re-render started. The video already live on YouTube won't change until you publish again."
                    : "Render started",
                )
              }
            >
              <RotateCcw size={14} />
              Re-render video
            </button>
          )}
          {project.status === "READY_FOR_REVIEW" && (
            <button className="btn-secondary" onClick={() => runAction(() => runQualityCheck.mutateAsync(), "Quality check started")}>
              <ShieldCheck size={14} />
              Run quality check
            </button>
          )}
          {!["DRAFT", "PUBLISHING", "PUBLISHED", "CANCELLED"].includes(project.status) &&
            (confirmingCancel ? (
              <>
                <button
                  className="btn-danger"
                  disabled={cancelProject.isPending}
                  onClick={async () => {
                    await runAction(() => cancelProject.mutateAsync(), "Project cancelled");
                    setConfirmingCancel(false);
                  }}
                >
                  {cancelProject.isPending ? "Cancelling..." : "Confirm cancel"}
                </button>
                <button className="btn-secondary" onClick={() => setConfirmingCancel(false)}>
                  Never mind
                </button>
              </>
            ) : (
              <button className="btn-ghost" onClick={() => setConfirmingCancel(true)}>
                <X size={14} />
                Cancel project
              </button>
            ))}
        </div>
      </div>

      {project.status === "FAILED" && project.failureReason && (
        <div className="rounded-xl border border-status-failed/25 bg-status-failed/8 px-4 py-3 text-sm text-ink-primary">
          <span className="font-medium text-status-failed">Generation failed. </span>
          {project.failureReason}
          <p className="mt-1 text-xs text-ink-secondary">Your project is safe — nothing has been lost. Try generating again.</p>
        </div>
      )}

      <PipelineStages status={project.status} />

      {isRunning && jobs.length > 0 && <JobsProgress jobs={jobs} />}

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === key ? "border-indigo-400 text-ink-primary" : "border-transparent text-ink-muted hover:text-ink-secondary"
              }`}
            >
              <Icon size={15} />
              {label === "Scenes" ? `Scenes (${scenes.length})` : label === "Characters" ? `Characters (${characters.length})` : label === "Media" ? `Media (${assets.length})` : label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "script" && <ScriptTab script={activeScript} />}
      {tab === "scenes" && <ScenesTab projectId={project.id} scenes={scenes} assets={assets} />}
      {tab === "characters" && <CharactersTab characters={characters} />}
      {tab === "media" && <AssetsTab assets={assets} />}
      {tab === "video" && <VideoTab projectId={project.id} video={finalVideo} thumbnails={thumbnails} />}
      {tab === "publish" && (
        <PublishTab
          projectId={project.id}
          projectStatus={project.status}
          defaultTitle={project.title}
          defaultDescription={project.concept}
          publishingJobs={publishingJobs}
        />
      )}
    </div>
  );
}

function ScriptTab({ script }: { script: Script | undefined }) {
  if (!script) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No script generated yet.</p>;
  }
  return (
    <div className="card space-y-4 p-6">
      <div>
        <span className="text-xs font-medium text-ink-muted">Title</span>
        <p className="mt-0.5 font-medium text-ink-primary">{script.content.title}</p>
      </div>
      <div>
        <span className="text-xs font-medium text-ink-muted">Concept</span>
        <p className="mt-0.5 text-sm text-ink-secondary">{script.content.concept}</p>
      </div>
      <div className="grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
        <div>
          <span className="text-xs font-medium text-ink-muted">Audience</span>
          <p className="mt-0.5 text-ink-primary">{script.content.targetAudience}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-ink-muted">Tone</span>
          <p className="mt-0.5 text-ink-primary">{script.content.tone}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-ink-muted">Duration</span>
          <p className="mt-0.5 text-ink-primary">{Math.round(script.content.estimatedDurationSeconds / 60)} min</p>
        </div>
      </div>
    </div>
  );
}

function ScenesTab({ projectId, scenes, assets }: { projectId: string; scenes: Scene[]; assets: Asset[] }) {
  const regenerateScene = useRegenerateScene(projectId);
  const generateVisual = useGenerateSceneVisual(projectId);
  const generateVoice = useGenerateSceneVoice(projectId);
  const regenerateAllVisuals = useRegenerateSceneVisuals(projectId);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  if (scenes.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No scenes yet — generate a script first.</p>;
  }

  async function handleRegenerateAllVisuals() {
    try {
      await regenerateAllVisuals.mutateAsync();
      showToast("Regenerating every scene's visual — re-render the video afterward to update the final file.", "success");
      // Scene visual generation runs as sceneOnly background jobs that
      // never touch project.status, so it isn't covered by useProject's
      // normal in-progress polling -- poll briefly here instead.
      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
        if (attempts >= 10) clearInterval(interval);
      }, 3000);
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn-secondary px-2.5 py-1.5 text-xs"
          disabled={regenerateAllVisuals.isPending}
          onClick={handleRegenerateAllVisuals}
        >
          <Wand2 size={12} />
          {regenerateAllVisuals.isPending ? "Regenerating..." : "Regenerate all visuals"}
        </button>
      </div>
      {scenes
        .slice()
        .sort((a, b) => a.sceneNumber - b.sceneNumber)
        .map((scene) => {
          const image = assets.find((a) => a.sceneId === scene.id && a.type === "IMAGE");
          const audio = assets.find((a) => a.sceneId === scene.id && a.type === "AUDIO");
          return (
            <div key={scene.id} className="card grid gap-4 p-5 sm:grid-cols-[140px_1fr]">
              <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-surface-raised sm:w-[140px]">
                {image?.url ? (
                  <img src={image.url} alt={scene.title} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-ink-muted">No image</span>
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink-primary">
                    Scene {scene.sceneNumber}: {scene.title}
                  </h4>
                  <span className="shrink-0 text-xs text-ink-muted">{scene.durationSeconds}s</span>
                </div>
                <p className="mb-3 text-sm leading-relaxed text-ink-secondary">{scene.narration}</p>
                {audio?.url && <audio controls src={audio.url} className="mb-3 h-8 w-full" />}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                    onClick={() =>
                      regenerateScene
                        .mutateAsync({ sceneId: scene.id })
                        .then(() => showToast("Scene regenerating", "success"))
                        .catch((err) => showToast(getErrorMessage(err), "error"))
                    }
                  >
                    <RotateCcw size={12} />
                    Regenerate scene
                  </button>
                  <button
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                    onClick={() =>
                      generateVisual
                        .mutateAsync(scene.id)
                        .then(() => showToast("Visual regenerating", "success"))
                        .catch((err) => showToast(getErrorMessage(err), "error"))
                    }
                  >
                    <Wand2 size={12} />
                    Regenerate visual
                  </button>
                  <button
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                    onClick={() =>
                      generateVoice
                        .mutateAsync(scene.id)
                        .then(() => showToast("Voice regenerating", "success"))
                        .catch((err) => showToast(getErrorMessage(err), "error"))
                    }
                  >
                    <Mic size={12} />
                    Regenerate voice
                  </button>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

function CharactersTab({ characters }: { characters: Character[] }) {
  if (characters.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No recurring characters in this script.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {characters.map((c) => (
        <div key={c.id} className="card space-y-2.5 p-5">
          <h4 className="font-semibold text-ink-primary">{c.name}</h4>
          <p className="text-sm text-ink-secondary">{c.appearance}</p>
          {c.visualStyle && <p className="text-xs text-ink-muted">Style: {c.visualStyle}</p>}
          {c.colors.length > 0 && (
            <div className="flex gap-1.5 pt-1">
              {c.colors.map((color) => (
                <span key={color} className="h-5 w-5 rounded-full border border-border-strong" style={{ backgroundColor: color }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AssetsTab({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-secondary">No media generated yet.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <div key={asset.id} className="card overflow-hidden">
          <div className="flex aspect-video items-center justify-center bg-surface-raised">
            {asset.type === "IMAGE" || asset.type === "THUMBNAIL" ? (
              asset.url && <img src={asset.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-ink-muted">{asset.type}</span>
            )}
          </div>
          <div className="p-2.5 text-xs text-ink-secondary">
            <p className="truncate font-medium text-ink-primary">{asset.type}</p>
            <p className="truncate text-ink-muted">{asset.provider}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoTab({ projectId, video, thumbnails }: { projectId: string; video: Video | undefined; thumbnails: Thumbnail[] }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const selectThumbnail = useSelectThumbnail(projectId);
  const regenerateThumbnails = useRegenerateThumbnails(projectId);
  const selectedThumbnail = thumbnails.find((t) => t.isSelected) ?? thumbnails[0];

  async function handleSelect(thumbnailId: string) {
    if (thumbnailId === selectedThumbnail?.id) return;
    try {
      await selectThumbnail.mutateAsync(thumbnailId);
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
  }

  async function handleRegenerate() {
    try {
      await regenerateThumbnails.mutateAsync();
      showToast("Regenerating thumbnails...", "success");
      // Thumbnail generation runs as a background job that never touches
      // project.status, so it isn't covered by useProject's normal
      // in-progress polling -- poll briefly here instead so the new
      // candidates show up without a manual page refresh.
      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
        if (attempts >= 8) clearInterval(interval);
      }, 2000);
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-ink-primary">Final video</h4>
          {video?.durationSeconds && <span className="text-xs text-ink-muted">{Math.round(video.durationSeconds)}s · {video.aspectRatio ? video.aspectRatio.replace(/_/g, " ") : ""}</span>}
        </div>
        {video?.url ? (
          <video controls src={video.url} poster={selectedThumbnail?.url ?? undefined} className="w-full rounded-xl bg-black" />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-surface-raised">
            <div className="flex flex-col items-center gap-2 text-ink-muted">
              <Film size={22} />
              <p className="text-xs">Not rendered yet</p>
            </div>
          </div>
        )}
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-ink-primary">Thumbnail</h4>
          {thumbnails.length > 0 && (
            <button
              className="btn-ghost px-2 py-1 text-xs"
              disabled={regenerateThumbnails.isPending}
              onClick={handleRegenerate}
            >
              <RotateCcw size={12} />
              {regenerateThumbnails.isPending ? "Regenerating..." : "Regenerate"}
            </button>
          )}
        </div>
        {thumbnails.length === 0 ? (
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-surface-raised">
            <p className="text-xs text-ink-muted">Not generated yet</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-secondary">
              {thumbnails.length > 1 ? "Pick which thumbnail to use." : "Generated thumbnail."}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {thumbnails.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t.id)}
                  disabled={selectThumbnail.isPending}
                  className={`relative overflow-hidden rounded-lg border-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    t.isSelected ? "border-indigo-400 ring-2 ring-indigo-400/30" : "border-transparent hover:border-border-strong"
                  }`}
                >
                  {t.url ? (
                    <img src={t.url} alt="Thumbnail option" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="aspect-video w-full bg-surface-raised" />
                  )}
                  {t.isSelected && (
                    <span className="absolute right-1 top-1 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Selected</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PublishTab({
  projectId,
  projectStatus,
  defaultTitle,
  defaultDescription,
  publishingJobs,
}: {
  projectId: string;
  projectStatus: string;
  defaultTitle: string;
  defaultDescription: string;
  publishingJobs: PublishingJob[];
}) {
  const { showToast } = useToast();
  const completedJob = publishingJobs.find((j) => j.status === "COMPLETED" && j.youtubeVideoId);
  const { data: accounts } = useQuery({
    queryKey: ["youtube-accounts"],
    queryFn: async () => (await api.get<YoutubeAccount[]>("/youtube/accounts")).data,
  });
  const statsQuery = useQuery({
    queryKey: ["youtube-stats", completedJob?.id],
    queryFn: async () => (await api.get<VideoStats>(`/youtube/publishing-jobs/${completedJob!.id}/stats`)).data,
    enabled: Boolean(completedJob),
    refetchOnWindowFocus: false,
  });

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "UNLISTED" | "PUBLIC">("PRIVATE");
  const [accountId, setAccountId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const canPublish = projectStatus === "READY_FOR_REVIEW";

  async function handlePublish() {
    if (!confirmed || !accountId) return;
    setPublishing(true);
    try {
      await api.post(`/projects/${projectId}/youtube/publish`, {
        youtubeAccountId: accountId,
        title,
        description,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        visibility,
        confirmed: true,
      });
      showToast("Publishing started", "success");
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-4">
      {completedJob && (
        <div className="card max-w-2xl space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">Published to YouTube</h3>
            <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => statsQuery.refetch()} disabled={statsQuery.isFetching}>
              {statsQuery.isFetching ? "Refreshing..." : "Refresh stats"}
            </button>
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${completedJob.youtubeVideoId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
          >
            Watch on YouTube
            <ExternalLink size={13} />
          </a>
          {statsQuery.isLoading && <p className="text-sm text-ink-secondary">Loading stats...</p>}
          {statsQuery.isError && <p className="text-sm text-status-failed">{getErrorMessage(statsQuery.error)}</p>}
          {statsQuery.data && (
            <div className="grid grid-cols-3 gap-4 border-t border-border pt-3">
              <VideoStat label="Views" value={statsQuery.data.viewCount} />
              <VideoStat label="Likes" value={statsQuery.data.likeCount} />
              <VideoStat label="Comments" value={statsQuery.data.commentCount} />
            </div>
          )}
        </div>
      )}

      <div className="card max-w-2xl space-y-4 p-6">
        {!canPublish && (
          <p className="rounded-lg bg-status-progress/10 px-3 py-2 text-sm text-status-progress">
            {projectStatus === "PUBLISHING"
              ? "Publishing is already in progress for this project."
              : projectStatus === "PUBLISHED"
                ? "This project has already been published."
                : 'The project must reach "Ready for review" before it can be published.'}
          </p>
        )}

        {!accounts?.length && (
          <p className="text-sm text-ink-secondary">
            No YouTube account connected yet. Connect one from <span className="font-medium text-ink-primary">Settings</span> first.
          </p>
        )}

        {Boolean(accounts?.length) && (
          <>
            <div>
              <label className="label">YouTube channel</label>
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select a channel...</option>
                {accounts!.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.channelTitle ?? a.channelId ?? a.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="label">Tags (comma-separated)</label>
              <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div>
              <label className="label">Visibility</label>
              <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
                <option value="PRIVATE">Private</option>
                <option value="UNLISTED">Unlisted</option>
                <option value="PUBLIC">Public</option>
              </select>
            </div>

            <label className="flex items-start gap-2 text-sm text-ink-secondary">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              <span>I've reviewed the video, title, description, tags, and thumbnail, and I want to publish this to YouTube now.</span>
            </label>

            <button className="btn-primary w-full" disabled={!canPublish || !confirmed || !accountId || publishing} onClick={handlePublish}>
              <Send size={15} />
              {publishing ? "Publishing..." : "Publish to YouTube"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VideoStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-lg font-bold text-ink-primary">{value.toLocaleString()}</div>
      <div className="text-xs text-ink-secondary">{label}</div>
    </div>
  );
}
