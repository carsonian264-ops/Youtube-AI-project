export type ProjectStatus =
  | "DRAFT"
  | "PLANNING"
  | "SCRIPT_GENERATING"
  | "SCRIPT_READY"
  | "SCENES_GENERATING"
  | "SCENES_READY"
  | "ASSETS_GENERATING"
  | "AUDIO_GENERATING"
  | "RENDERING"
  | "QUALITY_CHECK"
  | "READY_FOR_REVIEW"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED";

/**
 * Statuses where a background job is actively running for the project.
 * Single source of truth for "should the UI keep polling / show the live
 * progress panel" -- previously duplicated (and, for PUBLISHING, out of
 * sync) between useProjects.ts and ProjectWorkspace.tsx.
 */
export const IN_PROGRESS_STATUSES: ProjectStatus[] = [
  "PLANNING",
  "SCRIPT_GENERATING",
  "SCENES_GENERATING",
  "ASSETS_GENERATING",
  "AUDIO_GENERATING",
  "RENDERING",
  "QUALITY_CHECK",
  "PUBLISHING",
];

export type AspectRatio = "LANDSCAPE_16_9" | "PORTRAIT_9_16" | "SQUARE_1_1";

export type MusicMood = "NONE" | "UPBEAT" | "CALM" | "CINEMATIC" | "DRAMATIC";

export interface Project {
  id: string;
  userId: string;
  title: string;
  concept: string;
  targetAudience: string | null;
  tone: string | null;
  estimatedDurationSeconds: number | null;
  aspectRatio: AspectRatio;
  musicMood: MusicMood;
  status: ProjectStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
  sceneNumber: number;
  title: string;
  narration: string;
  visualDescription: string;
  visualPrompt: string;
  cameraDirection: string | null;
  durationSeconds: number;
  soundEffects: string[];
  transition: string | null;
  status: "PENDING" | "GENERATING" | "READY" | "FAILED";
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  appearance: string;
  clothing: string | null;
  personality: string | null;
  ageCategory: string | null;
  colors: string[];
  visualStyle: string | null;
  environment: string | null;
  recurringObjects: string[];
}

export interface Asset {
  id: string;
  projectId: string;
  sceneId: string | null;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "MUSIC" | "SOUND_EFFECT" | "CAPTION" | "THUMBNAIL" | "FINAL_VIDEO";
  provider: string;
  url: string | null;
  status: "PENDING" | "GENERATING" | "READY" | "FAILED";
  createdAt: string;
}

export interface JobSummary {
  id: string;
  type: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED" | "DELAYED";
  progress: number;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Script {
  id: string;
  projectId: string;
  versionNumber: number;
  content: {
    title: string;
    concept: string;
    targetAudience: string;
    tone: string;
    estimatedDurationSeconds: number;
  };
  isActive: boolean;
}

export interface Video {
  id: string;
  projectId: string;
  url: string | null;
  durationSeconds: number | null;
  status: string;
  createdAt: string;
}

export interface Thumbnail {
  id: string;
  projectId: string;
  url: string | null;
  isSelected: boolean;
}

export interface ProjectWorkspace {
  project: Project;
  scripts: Script[];
  scenes: Scene[];
  characters: Character[];
  assets: Asset[];
  jobs: JobSummary[];
  videos: Video[];
  thumbnails: Thumbnail[];
}

export interface YoutubeAccount {
  id: string;
  channelId: string | null;
  channelTitle: string | null;
  createdAt: string;
}

export interface UsageSummaryRow {
  type: string;
  total: number;
}
