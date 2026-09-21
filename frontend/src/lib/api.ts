import axios from "axios";
import { useAuthStore } from "./authStore";

/**
 * Single axios instance for all backend calls. The Anthropic/OpenArt/TTS/
 * YouTube API keys never appear here or anywhere else in this package --
 * the frontend only ever talks to our own backend, which is the sole
 * holder of third-party credentials (see backend/src/services/providers.ts).
 */
export const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearSession();
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.error?.message) return body.error.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
