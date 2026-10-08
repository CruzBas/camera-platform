"use client";

import { UsersIcon } from "lucide-react";

import { StatusPill } from "@/components/status-pill";
import { WhepPlayer } from "@/components/whep-player";
import { type Camera, whepUrl } from "@/lib/api";
import { objectLabel, percent } from "@/lib/format";
import { occupancy } from "@/lib/occupancy";
import { type DetectionFrame, peopleIn, useCameraDetections } from "@/lib/realtime";

/** Video en vivo de la cámara con las detecciones del servicio de visión superpuestas. */
export function CameraLive({ camera }: { camera: Camera }) {
  const frame = useCameraDetections(camera.id);
  return (
    <WhepPlayer
      url={whepUrl(camera.streamKey)}
      overlay={
        <>
          {frame && <DetectionOverlay frame={frame} />}
          <PeopleCounter people={frame ? peopleIn(frame) : null} capacity={camera.capacity} />
        </>
      }
    />
  );
}

/** Personas en el último frame analizado; sin análisis reciente no hay un número confiable. */
function PeopleCounter({ people, capacity }: { people: number | null; capacity: number | null }) {
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
            <span className="text-2xl leading-none font-bold text-black tabular-nums sm:text-3xl md:text-5xl">{people}</span>
            {capacity && <span className="text-[13px] font-semibold text-black/45">/ {capacity}</span>}
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
    // Mismo encuadre que el <video> (object-contain ↔ xMidYMid meet): las cajas coinciden con la imagen.
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
