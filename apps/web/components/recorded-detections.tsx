"use client";

import { useEffect, useRef, useState } from "react";
import { UsersIcon } from "lucide-react";

interface Detection {
  trackId: number;
  confirmed: boolean;
  className: "sitting" | "standing";
  score: number;
  box: { x1: number; y1: number; x2: number; y2: number };
}

interface ClipResult {
  width: number;
  height: number;
  durationSeconds: number;
  model: string;
  frames: { timestampSeconds: number; detections: Detection[] }[];
}

const DEMO_VIDEO = "/demo/la_bus_highlights.mp4";
const DEMO_RESULT = "/demo/la_bus_highlights.mp4.result.json";

function frameAt(result: ClipResult, second: number) {
  const frames = result.frames;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].timestampSeconds <= second) low = mid;
    else high = mid - 1;
  }
  return frames[low];
}

export function RecordedDetections({ capacity }: { capacity: number | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<ClipResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [second, setSecond] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(DEMO_RESULT)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ClipResult>;
      })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        console.error("No se pudo cargar el análisis del demo", err);
        if (!cancelled) setMissing(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Sincronización del tiempo del video con el reloj Unix
  useEffect(() => {
    if (!result) return;
    const duration = result.durationSeconds;

    const sync = () => {
      const el = videoRef.current;
      if (!el || el.readyState < 1) return;
      const target = (Date.now() / 1000) % duration;
      const drift = Math.abs(el.currentTime - target);
      if (drift > 0.8 && drift < duration - 0.8) el.currentTime = target;
      if (el.paused) el.play().catch(() => undefined);
    };

    sync();
    const syncTimer = window.setInterval(sync, 2000);
    const drawTimer = window.setInterval(() => {
      setSecond(videoRef.current?.currentTime ?? (Date.now() / 1000) % duration);
    }, 200);

    return () => {
      window.clearInterval(syncTimer);
      window.clearInterval(drawTimer);
    };
  }, [result]);

  if (missing) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-black/5 text-sm text-black/50">
        No se encontró el clip de demostración en public/demo/.
      </div>
    );
  }

  const frame = result ? frameAt(result, second) : null;
  const detections = frame?.detections.filter((d) => d.confirmed) ?? [];
  const sitting = detections.filter((d) => d.className === "sitting").length;
  const standing = detections.length - sitting;
  const total = sitting + standing;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <div
        className="relative w-full"
        style={result ? { aspectRatio: `${result.width} / ${result.height}` } : { minHeight: "320px" }}
      >
        <video
          ref={videoRef}
          src={DEMO_VIDEO}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          className="h-full w-full object-contain"
        />

        {result && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${result.width} ${result.height}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            {detections.map((d) => {
              const [x1, y1, x2, y2] = [d.box.x1, d.box.y1, d.box.x2, d.box.y2];
              const isSitting = d.className === "sitting";
              const color = isSitting ? "#ec3fc8" : "#843fe5";
              const label = isSitting ? "sentado" : "de pie";
              return (
                <g key={d.trackId}>
                  <rect
                    x={x1}
                    y={y1}
                    width={x2 - x1}
                    height={y2 - y1}
                    fill="none"
                    stroke={color}
                    strokeWidth={Math.max(2, result.width / 400)}
                  />
                  <rect
                    x={x1}
                    y={Math.max(0, y1 - 20)}
                    width={72}
                    height={20}
                    fill={color}
                  />
                  <text
                    x={x1 + 4}
                    y={Math.max(0, y1 - 20) + 14}
                    fill="#ffffff"
                    fontSize={12}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Contador de personas y split sentado/pie */}
        <div
          role="status"
          aria-live="polite"
          className="absolute top-2 left-2 flex items-center gap-2 rounded-2xl bg-white/95 py-1.5 pr-3 pl-1.5 shadow-lg sm:top-3 sm:left-3 sm:gap-3 sm:py-2.5 sm:pr-4 sm:pl-2.5"
        >
          <span className="flex size-9 sm:size-11 items-center justify-center rounded-full bg-[#1e3a8a] text-white">
            <UsersIcon className="size-5 sm:size-6" aria-hidden />
          </span>
          <div className="flex flex-col items-start">
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-bold leading-none tabular-nums text-black">
                {total}
              </span>
              {capacity && (
                <span className="text-[13px] font-semibold text-black/45">
                  / {capacity}
                </span>
              )}
            </span>
            <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-[#ec3fc8]">
                <span className="size-2 rounded-full bg-[#ec3fc8]" />
                Sentados {sitting}
              </span>
              <span className="flex items-center gap-1 text-[#843fe5]">
                <span className="size-2 rounded-full bg-[#843fe5]" />
                De pie {standing}
              </span>
            </div>
          </div>
        </div>

        {/* Badge distintivo de clip grabado */}
        <div className="absolute top-2 right-2 rounded-md bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
          Video demo · Modelo RF-DETR
        </div>
      </div>
    </div>
  );
}
