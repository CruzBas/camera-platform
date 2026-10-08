"use client";

import { useCallback, useEffect, useState } from "react";

export type SourceType = "rtsp" | "push";

export type Camera = {
  id: string;
  name: string;
  streamKey: string;
  sourceType: SourceType;
  sourceUrlMasked: string | null;
  route: string | null;
  capacity: number | null;
  createdAt: string;
};

export type CameraStatus = {
  stream: {
    configured: boolean;
    online: boolean;
    onlineSince: string | null;
    codec: string | null;
    width: number | null;
    height: number | null;
    viewers: number;
  };
  analysis: {
    active: boolean;
    lastFrameAt: string | null;
    fps: number | null;
    inferenceMs: number | null;
  };
};

export type CameraStatusSummary = CameraStatus & { cameraId: string };

export type DetectionEvent = {
  id: string;
  cameraId: string;
  cameraName: string;
  type: string;
  startedAt: string;
  lastSeenAt: string;
  maxConfidence: number;
  maxCount: number;
};

export type CameraInput = {
  name: string;
  streamKey?: string;
  sourceType: SourceType;
  sourceUrl?: string | null;
  route?: string | null;
  capacity?: number | null;
};

/** Error de la API con los mensajes por campo de un ValidationProblem (400). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });

  if (res.status === 401 && !path.startsWith("/api/auth/login")) {
    // Sesión vencida o inexistente: volver al login y regresar aquí después.
    const next = encodeURIComponent(window.location.pathname);
    // Recarga completa a propósito: descarta el estado de la sesión anterior.
    window.location.replace(`/login?next=${next}`);
    throw new ApiError("No autenticado", 401);
  }
  if (!res.ok) {
    const problem = await res.json().catch(() => null);
    throw new ApiError(problem?.detail ?? problem?.title ?? `Error ${res.status}`, res.status, problem?.errors);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** GET con recarga opcional cada `refreshMs`. */
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(String(e), 0));
    }
  }, [path]);

  useEffect(() => {
    // Carga inicial asíncrona; el estado se actualiza al resolver la petición.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!refreshMs) return;
    const timer = setInterval(load, refreshMs);
    return () => clearInterval(timer);
  }, [load, refreshMs]);

  return { data, error, reload: load, setData };
}

export function whepUrl(streamKey: string) {
  return `${process.env.NEXT_PUBLIC_WEBRTC_URL}/${streamKey}/whep`;
}
