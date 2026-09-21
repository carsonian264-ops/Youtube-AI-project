import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api";
import {
  useGenerateProject,
  useGenerateSceneVisual,
  useGenerateSceneVoice,
  useProject,
  useRegenerateScene,
  useRegenerateScript,
  useRenderProject,
  useRunQualityCheck,
} from "@/hooks/useProjects";
import { StatusBadge } from "@/components/StatusBadge";
import { PipelineStages } from "@/components/PipelineStages";
import { JobsProgress } from "@/components/JobsProgress";
import { ErrorState, LoadingState } from "@/components/States";
import { useToast } from "@/components/Toast";
import type { Asset, Character, Scene, Script, Thumbnail, Video, YoutubeAccount } from "@/types";

const IN_PROGRESS_STATUSES = [
  "PLANNING",
  "SCRIPT_GENERATING",
  "SCENES_GENERATING",
  "ASSETS_GENERATING",
  "AUDIO_GENERATING",
  "RENDERING",
  "QUALITY_CHECK",
];

type Tab = "script" | "scenes" | "characters" | "assets" | "video" | "publish";

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

  const { project, scripts, scenes, characters, assets, jobs, videos, thumbnails } = workspace;
  const activeScript = scripts.find((s) => s.isActive) ?? scripts[0];
  const finalVideo = videos.find((v) => v.status === "READY");
  const selectedThumbnail = thumbnails.find((t) => t.isSelected) ?? thumbnails[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.title}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">{project.concept}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(project.status === "DRAFT" || project.status === "FAILED") && (
            <button
              className="btn-primary"
              disabled={generateProject.isPending}
              onClick={() => runAction(() => generateProject.mutateAsync(), "Generation started")}
            >
              {generateProject.isPending ? "Starting..." : "Generate video"}
            </button>
          )}
          {project.status === "SCRIPT_READY" && (
            <button className="btn-secondary" onClick={() => runAction(() => regenerateScript.mutateAsync(), "Regenerating script")}>
              Regenerate script
            </button>
          )}
          {(project.status === "SCENES_READY" || project.status === "READY_FOR_REVIEW") && scenes.length > 0 && (
            <button className="btn-secondary" onClick={() => runAction(() => renderProject.mutateAsync(), "Render started")}>
              Re-render video
            </button>
          )}
          {activeScript && (
            <button className="btn-secondary" onClick={() => runAction(() => runQualityCheck.mutateAsync(), "Quality check started")}>
              Run quality check
            </button>
          )}
        </div>
      </div>

      {project.status === "FAILED" && project.failureReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <span className="font-medium">Generation failed: </span>
          {project.failureReason}
        </div>
      )}

      <PipelineStages status={project.status} />

      {isRunning && jobs.length > 0 && <JobsProgress jobs={jobs} />}

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {(
            [
              ["script", "Script"],
              ["scenes", `Scenes (${scenes.length})`],
              ["characters", `Characters (${characters.length})`],
              ["assets", `Assets (${assets.length})`],
              ["video", "Video & thumbnail"],
              ["publish", "Publish"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                tab === key
                  ? "border-brand-600 text-brand-700 dark:text-brand-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "script" && <ScriptTab script={activeScript} />}
      {tab === "scenes" && <ScenesTab projectId={project.id} scenes={scenes} assets={assets} />}
      {tab === "characters" && <CharactersTab characters={characters} />}
      {tab === "assets" && <AssetsTab assets={assets} />}
      {tab === "video" && <VideoTab video={finalVideo} thumbnail={selectedThumbnail} />}
      {tab === "publish" && <PublishTab projectId={project.id} projectStatus={project.status} defaultTitle={project.title} defaultDescription={project.concept} />}
    </div>
  );
}

function ScriptTab({ script }: { script: Script | undefined }) {
  if (!script) {
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No script generated yet.</p>;
  }
  return (
    <div className="card space-y-3 p-6">
      <div>
        <span className="text-xs uppercase tracking-wide text-slate-400">Title</span>
        <p className="font-medium">{script.content.title}</p>
      </div>
      <div>
        <span className="text-xs uppercase tracking-wide text-slate-400">Concept</span>
        <p className="text-sm text-slate-600 dark:text-slate-300">{script.content.concept}</p>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-xs uppercase tracking-wide text-slate-400">Audience</span>
          <p>{script.content.targetAudience}</p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-wide text-slate-400">Tone</span>
          <p>{script.content.tone}</p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-wide text-slate-400">Duration</span>
          <p>{Math.round(script.content.estimatedDurationSeconds / 60)} min</p>
        </div>
      </div>
    </div>
  );
}

function ScenesTab({ projectId, scenes, assets }: { projectId: string; scenes: Scene[]; assets: Asset[] }) {
  const regenerateScene = useRegenerateScene(projectId);
  const generateVisual = useGenerateSceneVisual(projectId);
  const generateVoice = useGenerateSceneVoice(projectId);
  const { showToast } = useToast();

  if (scenes.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No scenes yet -- generate a script first.</p>;
  }

  return (
    <div className="space-y-4">
      {scenes
        .slice()
        .sort((a, b) => a.sceneNumber - b.sceneNumber)
        .map((scene) => {
          const image = assets.find((a) => a.sceneId === scene.id && a.type === "IMAGE");
          const audio = assets.find((a) => a.sceneId === scene.id && a.type === "AUDIO");
          return (
            <div key={scene.id} className="card grid gap-4 p-5 sm:grid-cols-[120px_1fr]">
              <div className="flex h-[68px] w-[120px] items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                {image?.url ? (
                  <img src={image.url} alt={scene.title} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400">No image</span>
                )}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">
                    Scene {scene.sceneNumber}: {scene.title}
                  </h4>
                  <span className="text-xs text-slate-400">{scene.durationSeconds}s</span>
                </div>
                <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{scene.narration}</p>
                {audio?.url && <audio controls src={audio.url} className="mb-3 h-8 w-full" />}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary text-xs"
                    onClick={() =>
                      regenerateScene
                        .mutateAsync({ sceneId: scene.id })
                        .then(() => showToast("Scene regenerating", "success"))
                        .catch((err) => showToast(getErrorMessage(err), "error"))
                    }
                  >
                    Regenerate scene
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() =>
                      generateVisual
                        .mutateAsync(scene.id)
                        .then(() => showToast("Visual regenerating", "success"))
                        .catch((err) => showToast(getErrorMessage(err), "error"))
                    }
                  >
                    Regenerate visual
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() =>
                      generateVoice
                        .mutateAsync(scene.id)
                        .then(() => showToast("Voice regenerating", "success"))
                        .catch((err) => showToast(getErrorMessage(err), "error"))
                    }
                  >
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
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No characters in the visual bible for this script.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {characters.map((c) => (
        <div key={c.id} className="card space-y-2 p-5">
          <h4 className="font-semibold">{c.name}</h4>
          <p className="text-sm text-slate-600 dark:text-slate-300">{c.appearance}</p>
          {c.visualStyle && <p className="text-xs text-slate-400">Style: {c.visualStyle}</p>}
          {c.colors.length > 0 && (
            <div className="flex gap-1">
              {c.colors.map((color) => (
                <span key={color} className="h-5 w-5 rounded-full border border-slate-200 dark:border-slate-700" style={{ backgroundColor: color }} />
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
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No assets generated yet.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <div key={asset.id} className="card overflow-hidden">
          <div className="flex h-24 items-center justify-center bg-slate-100 dark:bg-slate-800">
            {asset.type === "IMAGE" || asset.type === "THUMBNAIL" ? (
              asset.url && <img src={asset.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-slate-400">{asset.type}</span>
            )}
          </div>
          <div className="p-2 text-xs text-slate-500 dark:text-slate-400">
            <p className="truncate">{asset.type}</p>
            <p className="truncate">{asset.provider}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoTab({ video, thumbnail }: { video: Video | undefined; thumbnail: Thumbnail | undefined }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="card p-5">
        <h4 className="mb-3 text-sm font-semibold">Final video</h4>
        {video?.url ? (
          <video controls src={video.url} poster={thumbnail?.url ?? undefined} className="w-full rounded-lg bg-black" />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Not rendered yet.</p>
        )}
      </div>
      <div className="card p-5">
        <h4 className="mb-3 text-sm font-semibold">Thumbnail</h4>
        {thumbnail?.url ? (
          <img src={thumbnail.url} alt="Thumbnail" className="w-full rounded-lg" />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Not generated yet.</p>
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
}: {
  projectId: string;
  projectStatus: string;
  defaultTitle: string;
  defaultDescription: string;
}) {
  const { showToast } = useToast();
  const { data: accounts } = useQuery({
    queryKey: ["youtube-accounts"],
    queryFn: async () => (await api.get<YoutubeAccount[]>("/youtube/accounts")).data,
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
    <div className="card max-w-2xl space-y-4 p-6">
      {!canPublish && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          The project must reach "Ready for review" before it can be published.
        </p>
      )}

      {!accounts?.length && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No YouTube account connected yet. Connect one from <span className="font-medium">Settings</span> first.
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

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            <span>
              I've reviewed the video, title, description, tags, and thumbnail, and I want to publish this to YouTube now.
            </span>
          </label>

          <button
            className="btn-primary w-full"
            disabled={!canPublish || !confirmed || !accountId || publishing}
            onClick={handlePublish}
          >
            {publishing ? "Publishing..." : "Publish to YouTube"}
          </button>
        </>
      )}
    </div>
  );
}
