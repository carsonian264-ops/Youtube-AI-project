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
  error: {
    code: string;
    message: string;
    details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | unknown;
  };
}

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    // Every validation failure (validate.ts's per-route Zod schemas, and
    // any ZodError that reaches errorHandler unvalidated) returns the same
    // generic "Request validation failed" as `message`, with the actual
    // per-field reasons only in `details` (Zod's flatten() shape: field
    // name -> messages, plus top-level formErrors). Surfacing those here
    // is the difference between "Request validation failed" and "title:
    // String must contain at most 200 character(s)" for e.g. a too-long
    // project title or an empty YouTube publish description.
    const details = body?.error?.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    if (details && (details.fieldErrors || details.formErrors)) {
      const messages = [
        ...(details.formErrors ?? []),
        ...Object.entries(details.fieldErrors ?? {}).flatMap(([field, msgs]) => msgs.map((m) => `${field}: ${m}`)),
      ];
      if (messages.length > 0) return messages.join("; ");
    }
    if (body?.error?.message) return body.error.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
