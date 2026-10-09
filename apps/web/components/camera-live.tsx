"use client";

import { useEffect, useState } from "react";
import { UsersIcon, VideoIcon, RadioIcon } from "lucide-react";

import { RecordedDetections } from "@/components/recorded-detections";
import { StatusPill } from "@/components/status-pill";
import { WhepPlayer } from "@/components/whep-player";
import { type Camera, whepUrl } from "@/lib/api";
import { objectLabel, percent } from "@/lib/format";
import { occupancy } from "@/lib/occupancy";
import { type DetectionFrame, peopleIn, useCameraDetections } from "@/lib/realtime";

const VIDEO_SOURCE_KEY = "camera-platform.videoSource";

type VideoSource = "live" | "demo";

/** Video en vivo de la cámara con las detecciones del servicio de visión superpuestas, con selector de fuente. */
export function CameraLive({ camera }: { camera: Camera }) {
  const [source, setSource] = useState<VideoSource>("live");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIDEO_SOURCE_KEY) as VideoSource | null;
      if (saved === "live" || saved === "demo") {
        setSource(saved);
      }
    } catch {
      // Ignorar fallback
    }
  }, []);

  const handleSourceChange = (newSource: VideoSource) => {
    setSource(newSource);
    try {
      window.localStorage.setItem(VIDEO_SOURCE_KEY, newSource);
    } catch {
      // Ignorar fallback
    }
  };

  const frame = useCameraDetections(camera.id);

  return (
    <div className="flex flex-col gap-2">
      {/* Selector de fuente de video global/local */}
      <div className="flex items-center justify-between pb-1">
        <span className="text-[12px] font-medium text-black/50">Fuente de video:</span>
        <div className="flex rounded-lg border border-black/10 bg-black/[0.02] p-0.5">
          <button
            type="button"
            onClick={() => handleSourceChange("live")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              source === "live"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-black/50 hover:text-black"
            }`}
          >
            <RadioIcon className={`size-3 ${source === "live" ? "text-emerald-600" : ""}`} />
            En vivo (WHEP)
          </button>
          <button
            type="button"
            onClick={() => handleSourceChange("demo")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              source === "demo"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-black/50 hover:text-black"
            }`}
          >
            <VideoIcon className={`size-3 ${source === "demo" ? "text-[#1d7fe0]" : ""}`} />
            Demo grabado (RF-DETR)
          </button>
        </div>
      </div>

      {source === "demo" ? (
        <RecordedDetections capacity={camera.capacity} />
      ) : (
        <WhepPlayer
          url={whepUrl(camera.streamKey)}
          overlay={
            <>
              {frame && <DetectionOverlay frame={frame} />}
              <PeopleCounter
                people={frame ? peopleIn(frame) : null}
                capacity={camera.capacity}
              />
            </>
          }
        />
      )}
    </div>
  );
}

/** Personas en el último frame analizado; sin análisis reciente no hay un número confiable. */
function PeopleCounter({
  people,
  capacity,
}: {
  people: number | null;
  capacity: number | null;
}) {
  const level = people !== null && capacity ? occupancy(people, capacity) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-2 left-2 flex items-center gap-2 rounded-2xl bg-white/95 py-1.5 pr-3 pl-1.5 shadow-lg sm:top-3 sm:left-3 sm:gap-3 sm:py-2.5 sm:pr-5 sm:pl-2.5 md:top-4 md:left-4"
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full text-white sm:size-11 md:size-14 ${
          people ? "bg-[#1e3a8a]" : "bg-black/25"
        }`}
      >
        <UsersIcon className="size-5 sm:size-6 md:size-7" aria-hidden />
      </span>
      {people === null ? (
        <span className="text-[15px] font-semibold text-black/45">Sin análisis</span>
      ) : (
        <span className="flex flex-col items-start">
          <span className="flex items-baseline gap-1.5">
            <span className="text-2xl leading-none font-bold text-black tabular-nums sm:text-3xl md:text-5xl">
              {people}
            </span>
            {capacity && (
              <span className="text-[13px] font-semibold text-black/45">
                / {capacity}
              </span>
            )}
          </span>
          <span className="mt-1 hidden text-[13px] font-semibold text-black/55 sm:block">
            {people === 1 ? "persona en cámara" : "personas en cámara"}
          </span>
          {level && (
            <span className="mt-1.5">
              <StatusPill text={`${level.text} · ${level.percent}%`} tone={level.tone} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function DetectionOverlay({ frame }: { frame: DetectionFrame }) {
  const { width, height } = frame;
  const stroke = Math.max(2, width / 400);
  const fontSize = Math.max(14, width / 60);

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {frame.detections.map((d, i) => {
        const [x1, y1, x2, y2] = d.box;
        const label = `${objectLabel(d.label)} ${percent(d.confidence)}`;
        return (
          <g key={i}>
            <rect
              x={x1 * width}
              y={y1 * height}
              width={(x2 - x1) * width}
              height={(y2 - y1) * height}
              className="fill-none stroke-green-600"
              strokeWidth={stroke}
            />
            <rect
              x={x1 * width}
              y={Math.max(0, y1 * height - fontSize * 1.4)}
              width={label.length * fontSize * 0.6 + fontSize * 0.6}
              height={fontSize * 1.4}
              className="fill-green-600"
            />
            <text
              x={x1 * width + fontSize * 0.3}
              y={Math.max(0, y1 * height - fontSize * 1.4) + fontSize * 1.05}
              fontSize={fontSize}
              className="fill-white font-sans font-semibold"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
