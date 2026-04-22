import type { JobControlAction, QueueControlAction } from "../types";

export interface ApiErrorPayload {
  ok: false;
  error: string;
  message: string;
  [key: string]: unknown;
}

export function isJobControlAction(value: unknown): value is JobControlAction {
  return value === "pause" || value === "cancel" || value === "resume" || value === "rerun";
}

export function isQueueControlAction(value: unknown): value is QueueControlAction {
  return value === "pause" || value === "resume" || value === "cancel" || value === "retry";
}

export function createApiError(
  error: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorPayload {
  return {
    ok: false,
    error,
    message,
    ...(details ?? {})
  };
}
