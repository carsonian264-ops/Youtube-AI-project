import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AspectRatio, Project, ProjectWorkspace } from "@/types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get<Project[]>("/projects")).data,
  });
}

const IN_PROGRESS_STATUSES = [
  "PLANNING",
  "SCRIPT_GENERATING",
  "SCENES_GENERATING",
  "ASSETS_GENERATING",
  "AUDIO_GENERATING",
  "RENDERING",
  "QUALITY_CHECK",
];

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId],
    queryFn: async () => (await api.get<ProjectWorkspace>(`/projects/${projectId}`)).data,
    enabled: Boolean(projectId),
    // Self-polls while generation is in progress so the pipeline view,
    // per-stage job progress, and newly-created scenes/assets/video all
    // stay live without the user refreshing the page. Stops automatically
    // once the project reaches a terminal-for-now status.
    refetchInterval: (query) => {
      const status = query.state.data?.project.status;
      return status && IN_PROGRESS_STATUSES.includes(status) ? 2000 : false;
    },
  });
}

export interface CreateProjectInput {
  title: string;
  concept: string;
  targetAudience?: string;
  tone?: string;
  estimatedDurationSeconds?: number;
  aspectRatio?: AspectRatio;
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => (await api.post<Project>("/projects", input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useGenerateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/generate`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}

export function useRegenerateScript(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/script/regenerate`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
}

export function useRenderProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/render`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
}

export function useRunQualityCheck(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/quality-check`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
}

export function useRegenerateScene(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sceneId, instructions }: { sceneId: string; instructions?: string }) =>
      (await api.post(`/scenes/${sceneId}/regenerate`, { instructions })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
}

export function useGenerateSceneVisual(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sceneId: string) => (await api.post(`/scenes/${sceneId}/visual`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
}

export function useGenerateSceneVoice(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sceneId: string) => (await api.post(`/scenes/${sceneId}/voice`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
}
