"use client";

import { useEffect, useRef, useState } from "react";

const RETRY_DELAY_MS = 2000;
const ICE_GATHERING_TIMEOUT_MS = 2000;
const STATS_INTERVAL_MS = 1000;

type Status = "connecting" | "live" | "reconnecting";

type VideoStats = {
  width: number;
  height: number;
  fps: number;
  jitterBufferMs: number;
};

const STATUS_LABEL: Record<Status, string> = {
  connecting: "Conectando…",
  live: "En vivo",
  reconnecting: "Sin señal, reintentando…",
};

const STATUS_COLOR: Record<Status, string> = {
  connecting: "bg-amber-500",
  live: "bg-green-600",
  reconnecting: "bg-red-600",
};

/**
 * Reproduce un stream de MediaMTX por WebRTC usando WHEP (POST de la oferta SDP,
 * respuesta 201 con el SDP de answer). Si la cámara o el gateway se caen,
 * reintenta indefinidamente hasta recuperar el video.
 */
export function WhepPlayer({ url, overlay }: { url: string; overlay?: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [stats, setStats] = useState<VideoStats | null>(null);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let session: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    function teardown() {
      pc?.close();
      pc = null;
      if (session) {
        // Libera la sesión en MediaMTX; si falla, el servidor la expira solo.
        fetch(session, { method: "DELETE" }).catch(() => {});
        session = null;
      }
      setStats(null);
    }

    function retry() {
      if (disposed) return;
      teardown();
      setStatus("reconnecting");
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, RETRY_DELAY_MS);
    }

    async function connect() {
      const conn = new RTCPeerConnection();
      pc = conn;

      const stream = new MediaStream();
      conn.addTransceiver("video", { direction: "recvonly" });
      conn.addTransceiver("audio", { direction: "recvonly" });
      conn.ontrack = (event) => {
        stream.addTrack(event.track);
        if (videoRef.current) videoRef.current.srcObject = stream;
      };
      conn.onconnectionstatechange = () => {
        if (conn !== pc) return;
        const state = conn.connectionState;
        if (state === "connected") setStatus("live");
        else if (state === "failed" || state === "disconnected" || state === "closed") retry();
      };

      try {
        await conn.setLocalDescription(await conn.createOffer());
        await iceGatheringComplete(conn);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: conn.localDescription!.sdp,
        });
        // 404 mientras la cámara no está disponible: se reintenta.
        if (res.status !== 201) throw new Error(`WHEP respondió ${res.status}`);

        const location = res.headers.get("Location");
        const sessionUrl = location ? new URL(location, url).href : null;
        const answer = await res.text();
        if (conn !== pc) {
          // Se desmontó o reintentó mientras esperábamos: no dejar la sesión huérfana.
          if (sessionUrl) fetch(sessionUrl, { method: "DELETE" }).catch(() => {});
          return;
        }
        session = sessionUrl;
        await conn.setRemoteDescription({ type: "answer", sdp: answer });
      } catch {
        if (conn === pc) retry();
      }
    }

    const statsTimer = setInterval(async () => {
      if (pc?.connectionState !== "connected") return;
      const report = await pc.getStats();
      report.forEach((s) => {
        if (s.type !== "inbound-rtp" || s.kind !== "video" || !s.frameWidth) return;
        setStats({
          width: s.frameWidth ?? 0,
          height: s.frameHeight ?? 0,
          fps: s.framesPerSecond ?? 0,
          jitterBufferMs: s.jitterBufferEmittedCount
            ? (s.jitterBufferDelay / s.jitterBufferEmittedCount) * 1000
            : 0,
        });
      });
    }, STATS_INTERVAL_MS);

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(statsTimer);
      teardown();
    };
  }, [url]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          autoPlay
          muted
          playsInline
          controls
        />
        {overlay}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-black/45">
        <span className="flex items-center gap-2" data-status={status}>
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[status]}`} />
          {STATUS_LABEL[status]}
        </span>
        {stats && (
          <>
            <span>
              {stats.width}×{stats.height}
            </span>
            <span>{stats.fps} fps</span>
            <span>buffer {Math.round(stats.jitterBufferMs)} ms</span>
          </>
        )}
      </div>
    </div>
  );
}

function iceGatheringComplete(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timer = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      resolve();
    });
  });
}
