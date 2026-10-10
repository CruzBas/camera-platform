"use client";

import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { createContext, useContext, useEffect, useState } from "react";

import type { DetectionEvent } from "@/lib/api";

const RETRY_MS = 3000;
/**
 * Sin frames analizados durante este tiempo, las cajas y el conteo dejan de mostrarse. Igual que el
 * umbral de «análisis activo» de la API: con inferencias lentas (CPU ocupada) un frame puede tardar
 * más de un segundo, y no debe parpadear.
 */
const DETECTIONS_STALE_MS = 5000;

export type DetectionFrame = {
  capturedAt: string;
  width: number;
  height: number;
  inferenceMs: number;
  detections: { label: string; confidence: number; box: [number, number, number, number] }[];
};

type ServerEvents = {
  eventStarted: (event: DetectionEvent) => void;
  detections: (cameraId: string, frame: DetectionFrame) => void;
};

/**
 * Conexión única con el hub de eventos. Reintenta para siempre y, al reconectar, vuelve a
 * suscribirse a las cámaras observadas (los grupos de SignalR se pierden con la conexión).
 */
class RealtimeClient {
  private readonly connection: HubConnection;
  private readonly watched = new Map<string, number>();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;

  constructor() {
    this.connection = new HubConnectionBuilder()
      .withUrl("/hubs/events")
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => RETRY_MS })
      .configureLogging(LogLevel.Warning)
      .build();
    this.connection.onreconnected(() => this.rewatchAll());
  }

  start() {
    this.stopped = false;
    const attempt = () =>
      this.connection
        .start()
        .then(() => this.rewatchAll())
        .catch(() => {
          if (!this.stopped) this.retryTimer = setTimeout(attempt, RETRY_MS);
        });
    attempt();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.connection.stop();
  }

  on<K extends keyof ServerEvents>(event: K, handler: ServerEvents[K]) {
    this.connection.on(event, handler);
    return () => this.connection.off(event, handler);
  }

  watch(cameraId: string) {
    const count = this.watched.get(cameraId) ?? 0;
    this.watched.set(cameraId, count + 1);
    if (count === 0) this.invoke("WatchCamera", cameraId);

    return () => {
      const remaining = (this.watched.get(cameraId) ?? 1) - 1;
      if (remaining > 0) {
        this.watched.set(cameraId, remaining);
        return;
      }
      this.watched.delete(cameraId);
      this.invoke("UnwatchCamera", cameraId);
    };
  }

  private rewatchAll() {
    for (const cameraId of this.watched.keys()) this.invoke("WatchCamera", cameraId);
  }

  private invoke(method: string, cameraId: string) {
    // Si no hay conexión, rewatchAll se encarga al conectar.
    if (this.connection.state !== HubConnectionState.Connected) return;
    this.connection.invoke(method, cameraId).catch(() => {});
  }
}

const RealtimeContext = createContext<RealtimeClient | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  // Solo en el navegador: SignalR resuelve "/hubs/events" contra window.location.
  const [client] = useState(() => (typeof window === "undefined" ? null : new RealtimeClient()));
  useEffect(() => {
    if (!client) return;
    // Diferido: en desarrollo React monta, desmonta y vuelve a montar; así no se aborta una negociación.
    const timer = setTimeout(() => client.start());
    return () => {
      clearTimeout(timer);
      client.stop();
    };
  }, [client]);
  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

/** Ejecuta `handler` cada vez que se inicia un evento de detección en cualquier cámara. */
export function useEventStarted(handler: (event: DetectionEvent) => void) {
  const client = useContext(RealtimeContext);
  useEffect(() => client?.on("eventStarted", handler), [client, handler]);
}

/** Último frame analizado de cada cámara (null si no hay análisis reciente). */
export function useLiveDetections(cameraIds: string[]) {
  const client = useContext(RealtimeContext);
  const [frames, setFrames] = useState<Record<string, DetectionFrame | null>>({});
  const key = cameraIds.join(",");

  useEffect(() => {
    if (!client || !key) return;
    const ids = new Set(key.split(","));
    const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const unwatchAll = [...ids].map((id) => client.watch(id));
    const off = client.on("detections", (id, next) => {
      if (!ids.has(id)) return;
      setFrames((current) => ({ ...current, [id]: next }));
      clearTimeout(staleTimers.get(id));
      staleTimers.set(
        id,
        setTimeout(() => setFrames((current) => ({ ...current, [id]: null })), DETECTIONS_STALE_MS),
      );
    });
    return () => {
      off();
      unwatchAll.forEach((unwatch) => unwatch());
      staleTimers.forEach(clearTimeout);
    };
  }, [client, key]);

  return frames;
}

/** Último frame analizado de la cámara, o null si no hay análisis reciente. */
export function useCameraDetections(cameraId: string) {
  return useLiveDetections([cameraId])[cameraId] ?? null;
}

/** Personas en un frame analizado (compatible con YOLO 'person' y RF-DETR 'sitting'/'standing'). */
export function peopleIn(frame: DetectionFrame) {
  return frame.detections.filter(
    (d) => d.label === "person" || d.label === "sitting" || d.label === "standing"
  ).length;
}
