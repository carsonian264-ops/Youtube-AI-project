import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateProject } from "@/hooks/useProjects";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/api";
import type { AspectRatio, MusicMood } from "@/types";

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "LANDSCAPE_16_9", label: "16:9 (YouTube standard)" },
  { value: "PORTRAIT_9_16", label: "9:16 (Shorts / Reels)" },
  { value: "SQUARE_1_1", label: "1:1 (Square)" },
];

const MUSIC_MOODS: { value: MusicMood; label: string }[] = [
  { value: "NONE", label: "No music" },
  { value: "UPBEAT", label: "Upbeat" },
  { value: "CALM", label: "Calm" },
  { value: "CINEMATIC", label: "Cinematic" },
  { value: "DRAMATIC", label: "Dramatic" },
];

export default function CreateProject() {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { showToast } = useToast();

  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [tone, setTone] = useState("confident, clear");
  const [durationMinutes, setDurationMinutes] = useState(3);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("LANDSCAPE_16_9");
  const [musicMood, setMusicMood] = useState<MusicMood>("NONE");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      setError("Enter a target length of at least 1 minute.");
      return;
    }

    try {
      const project = await createProject.mutateAsync({
        title: title.trim() || idea.slice(0, 80),
        concept: idea,
        tone,
        estimatedDurationSeconds: Math.round(durationMinutes * 60),
        aspectRatio,
        musicMood,
      });
      showToast("Project created", "success");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New project</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Describe the video you want. Studio will plan the script, scenes, visuals, voice, and captions for you --
          you stay in control of every step and nothing publishes without your explicit confirmation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="idea">
            Video idea
          </label>
          <textarea
            id="idea"
            required
            rows={4}
            className="input"
            placeholder='e.g. "Create a 5-minute YouTube video explaining how artificial intelligence will change software development."'
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="title">
            Title (optional -- Studio will draft one if left blank)
          </label>
          <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="duration">
              Target length (minutes)
            </label>
            <input
              id="duration"
              type="number"
              min={1}
              max={30}
              className="input"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="tone">
              Tone
            </label>
            <input id="tone" className="input" value={tone} onChange={(e) => setTone(e.target.value)} />
          </div>
        </div>

        <div>
          <span className="label">Aspect ratio</span>
          <div className="grid grid-cols-3 gap-2">
            {ASPECT_RATIOS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setAspectRatio(option.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  aspectRatio === option.value
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Background music</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MUSIC_MOODS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setMusicMood(option.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  musicMood === option.value
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={createProject.isPending}>
            {createProject.isPending ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}
