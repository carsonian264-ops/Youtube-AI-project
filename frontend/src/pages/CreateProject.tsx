import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useCreateProject } from "@/hooks/useProjects";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/api";
import type { AspectRatio, MusicMood, QualityTier, VideoStyle } from "@/types";

const ASPECT_RATIOS: { value: AspectRatio; label: string; hint: string }[] = [
  { value: "LANDSCAPE_16_9", label: "16:9", hint: "YouTube standard" },
  { value: "PORTRAIT_9_16", label: "9:16", hint: "Shorts / Reels" },
  { value: "SQUARE_1_1", label: "1:1", hint: "Square" },
];

const MUSIC_MOODS: { value: MusicMood; label: string }[] = [
  { value: "NONE", label: "No music" },
  { value: "UPBEAT", label: "Upbeat" },
  { value: "CALM", label: "Calm" },
  { value: "CINEMATIC", label: "Cinematic" },
  { value: "DRAMATIC", label: "Dramatic" },
];

const VIDEO_STYLES: { value: VideoStyle; label: string; hint: string }[] = [
  { value: "CINEMATIC", label: "Cinematic", hint: "Dramatic fades, elegant captions" },
  { value: "DOCUMENTARY", label: "Documentary", hint: "Slow, deliberate pacing" },
  { value: "EDUCATIONAL", label: "Educational", hint: "Clear, classic captions" },
  { value: "TECH", label: "Tech", hint: "Minimal, clean captions" },
  { value: "MOTIVATIONAL", label: "Motivational", hint: "Bold, punchy captions" },
  { value: "STORYTELLING", label: "Storytelling", hint: "Creator-style highlight captions" },
  { value: "NEWS", label: "News", hint: "Hard cuts, lower-third captions" },
  { value: "FACELESS_YOUTUBE", label: "Faceless YouTube", hint: "Word-by-word highlight captions" },
  { value: "SHORT_FORM", label: "Short-form", hint: "Fast cuts, punchy highlight captions" },
];

const QUALITY_TIERS: { value: QualityTier; label: string; hint: string }[] = [
  { value: "DRAFT", label: "Draft", hint: "Fast, lower-res preview" },
  { value: "STANDARD", label: "Standard", hint: "1080p, balanced (recommended)" },
  { value: "HIGH", label: "High", hint: "1440p, sharper, slower render" },
];

function optionClasses(active: boolean) {
  return `rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
    active ? "border-indigo-400/60 bg-indigo-500/12 text-indigo-200" : "border-border text-ink-secondary hover:border-border-strong hover:text-ink-primary"
  }`;
}

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
  const [videoStyle, setVideoStyle] = useState<VideoStyle>("CINEMATIC");
  const [qualityTier, setQualityTier] = useState<QualityTier>("STANDARD");
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
        videoStyle,
        qualityTier,
      });
      showToast("Project created", "success");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="font-display text-[28px] font-bold text-ink-primary">What's your next video?</h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-secondary">
          Give AI your idea. We'll help turn it into a complete production — script, scenes, visuals, voice, and captions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6 md:p-7">
        <textarea
          id="idea"
          required
          rows={4}
          className="w-full resize-none rounded-xl border border-border bg-surface-raised px-4 py-3.5 text-[15px] leading-relaxed text-ink-primary placeholder:text-ink-muted focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Describe the video you want to create... e.g. a 5-minute explainer on how artificial intelligence will change software development"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />

        <div>
          <label className="label" htmlFor="title">
            Title <span className="text-ink-muted">(optional — we'll draft one if left blank)</span>
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
              <button type="button" key={option.value} onClick={() => setAspectRatio(option.value)} className={optionClasses(aspectRatio === option.value)}>
                <div>{option.label}</div>
                <div className="mt-0.5 text-[11px] font-normal text-ink-muted">{option.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Video style</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VIDEO_STYLES.map((option) => (
              <button type="button" key={option.value} onClick={() => setVideoStyle(option.value)} className={optionClasses(videoStyle === option.value)}>
                <div>{option.label}</div>
                <div className="mt-0.5 text-[11px] font-normal text-ink-muted">{option.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Quality</span>
          <div className="grid grid-cols-3 gap-2">
            {QUALITY_TIERS.map((option) => (
              <button type="button" key={option.value} onClick={() => setQualityTier(option.value)} className={optionClasses(qualityTier === option.value)}>
                <div>{option.label}</div>
                <div className="mt-0.5 text-[11px] font-normal text-ink-muted">{option.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Background music</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MUSIC_MOODS.map((option) => (
              <button type="button" key={option.value} onClick={() => setMusicMood(option.value)} className={optionClasses(musicMood === option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-status-failed">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary px-5" disabled={createProject.isPending}>
            <Sparkles size={16} />
            {createProject.isPending ? "Starting production..." : "Generate production"}
          </button>
        </div>
      </form>
    </div>
  );
}
