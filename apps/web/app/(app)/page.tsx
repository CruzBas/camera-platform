"use client";

import { BusFrontIcon, ChevronRightIcon, VideoIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { CameraFormDialog } from "@/components/camera-form-dialog";
import { CameraLive } from "@/components/camera-live";
import { EventsList } from "@/components/events-list";
import { StatusPill } from "@/components/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Camera, type CameraStatusSummary, useApi } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { occupancy } from "@/lib/occupancy";
import { peopleIn, useLiveDetections } from "@/lib/realtime";

const STATUS_REFRESH_MS = 5000;

type Bus = {
  camera: Camera;
  status: CameraStatusSummary | undefined;
  people: number | null;
};

export default function FleetPage() {
  const { data: cameras, error, reload } = useApi<Camera[]>("/api/cameras");
  const { data: statuses } = useApi<CameraStatusSummary[]>("/api/cameras/status", STATUS_REFRESH_MS);
  const ids = useMemo(() => (cameras ?? []).map((c) => c.id), [cameras]);
  const frames = useLiveDetections(ids);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (error) return <p className="text-red-700">No se pudieron cargar los buses: {error.message}</p>;
  if (!cameras) return <h1 className="text-2xl font-bold">Flota en vivo</h1>;

  if (cameras.length === 0) {
    return (
      <Card className="mx-auto w-full max-w-lg">
        <CardHeader>
          <CardTitle>Registra tu primer bus</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 text-sm text-black/45">
          <p>
            Agrega la cámara de un bus con su ruta y capacidad, o corre la simulación de flota:{" "}
            <code className="text-black">scripts/simulate-fleet.sh</code>
          </p>
          <CameraFormDialog triggerLabel="Agregar cámara" onSaved={reload} />
        </CardContent>
      </Card>
    );
  }

  const buses: Bus[] = cameras.map((camera) => {
    const frame = frames[camera.id];
    return {
      camera,
      status: statuses?.find((s) => s.cameraId === camera.id),
      people: frame ? peopleIn(frame) : null,
    };
  });
  const transmitting = buses.filter((b) => b.status?.stream.online);
  const passengers = buses.reduce((sum, b) => sum + (b.people ?? 0), 0);
  const crowded = buses.filter(
    (b) => b.people !== null && b.camera.capacity && occupancy(b.people, b.camera.capacity).percent >= 70,
  );
  const selected = buses.find((b) => b.camera.id === selectedId);

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold">Flota en vivo</h1>
        <p className="mt-1 text-[15px] text-black/45">Toca un bus para abrir su cámara.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de la flota">
        <Kpi label="Buses transmitiendo" value={`${transmitting.length} de ${buses.length}`} />
        <Kpi label="Pasajeros a bordo" value={passengers} />
        <Kpi label="Con ocupación alta" value={crowded.length} alert={crowded.length > 0} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border border-black/10 bg-white px-4 py-1" aria-label="Buses">
          <ul>
            {buses.map((bus) => (
              <li key={bus.camera.id} className="border-b border-black/5 last:border-0">
                <BusRow
                  bus={bus}
                  selected={bus.camera.id === selectedId}
                  onToggle={() => setSelectedId((id) => (id === bus.camera.id ? null : bus.camera.id))}
                />
              </li>
            ))}
          </ul>
        </section>

        {selected ? (
          <BusPanel key={selected.camera.id} bus={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="hidden flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/10 px-6 py-20 text-center lg:flex">
            <span className="flex size-14 items-center justify-center rounded-full bg-black/5 text-black/45">
              <VideoIcon className="size-6" aria-hidden />
            </span>
            <p className="text-[15px] font-semibold text-black">Ninguna cámara abierta</p>
            <p className="max-w-xs text-[13px] text-black/45">
              Selecciona un bus de la lista para ver su imagen en vivo y el conteo de pasajeros.
            </p>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <EventsList limit={10} />
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-5 py-4">
      <p className="text-[13px] font-semibold text-black/45">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${alert ? "text-red-700" : "text-black"}`}>{value}</p>
    </div>
  );
}

function TransmissionPill({ status }: { status: CameraStatusSummary | undefined }) {
  if (!status) return <StatusPill text="Consultando…" />;
  if (status.stream.online) {
    const since = status.stream.onlineSince ? ` · desde ${formatClock(status.stream.onlineSince)}` : "";
    return <StatusPill text={`En vivo${since}`} tone="success" />;
  }
  return status.stream.configured ? <StatusPill text="Sin señal" tone="error" /> : <StatusPill text="Configurando" tone="warning" />;
}

function BusRow({ bus, selected, onToggle }: { bus: Bus; selected: boolean; onToggle: () => void }) {
  const { camera, status, people } = bus;
  const level = people !== null && camera.capacity ? occupancy(people, camera.capacity) : null;
  const online = status?.stream.online ?? false;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={selected}
      aria-controls="bus-panel"
      className="-mx-2 my-1 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-3 text-left transition-colors hover:bg-black/[0.03] aria-expanded:bg-[#1d7fe0]/[0.07]"
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-white ${
          online ? "bg-[#1e3a8a]" : "bg-black/20"
        }`}
      >
        <BusFrontIcon className="size-5" aria-hidden />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-bold whitespace-nowrap text-black">{camera.name}</span>
          {people === null ? (
            <span className="text-[13px] font-semibold whitespace-nowrap text-black/35">Sin análisis</span>
          ) : (
            <span className="flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-2xl leading-none font-bold text-black tabular-nums">{people}</span>
              <span className="text-[13px] font-semibold text-black/45">
                {camera.capacity && `/ ${camera.capacity} `}
                {people === 1 ? "pasajero" : "pasajeros"}
              </span>
            </span>
          )}
        </span>
        <span className="truncate text-[13px] text-black/45">{camera.route ?? "Sin ruta asignada"}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <TransmissionPill status={status} />
          {level && <StatusPill text={`${level.text} · ${level.percent}%`} tone={level.tone} />}
        </span>
      </span>

      <ChevronRightIcon
        className={`size-5 shrink-0 text-black/25 transition-transform ${selected ? "rotate-90 lg:rotate-0" : ""}`}
        aria-hidden
      />
    </button>
  );
}

/** Cámara del bus seleccionado. El video (y su conexión WebRTC) solo existe mientras el panel está abierto. */
function BusPanel({ bus, onClose }: { bus: Bus; onClose: () => void }) {
  const { camera, status } = bus;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    // En pantallas angostas el panel queda debajo de la lista: llevarlo a la vista.
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  return (
    <section
      id="bus-panel"
      ref={ref}
      aria-label={`Cámara de ${camera.name}`}
      className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-white p-4 lg:sticky lg:top-6"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-black">{camera.name}</h2>
          <p className="text-[13px] text-black/45">{camera.route ?? "Sin ruta asignada"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar cámara"
          className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-full text-black/45 hover:bg-black/5 hover:text-black"
        >
          <XIcon className="size-5" />
        </button>
      </header>

      <CameraLive camera={camera} />

      {status && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-3">
          <Detail label="Transmisión" value={<TransmissionPill status={status} />} />
          <Detail
            label="Video"
            value={status.stream.width ? `${status.stream.codec} · ${status.stream.width}×${status.stream.height}` : "—"}
          />
          <Detail label="Capacidad" value={camera.capacity ? `${camera.capacity} pasajeros` : "Sin definir"} />
          <Detail
            label="Análisis"
            value={status.analysis.active ? `${status.analysis.fps?.toFixed(1)} frames/s` : "Inactivo"}
          />
          <Detail
            label="Inferencia"
            value={status.analysis.inferenceMs ? `${Math.round(status.analysis.inferenceMs)} ms` : "—"}
          />
          <Detail label="Espectadores" value={status.stream.viewers} />
        </dl>
      )}

      <Link
        href={`/cameras/${camera.id}`}
        className="flex items-center gap-1 self-start text-[15px] font-medium text-blue-600 hover:underline"
      >
        Ver detalle y eventos del bus
        <ChevronRightIcon className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-semibold text-black/45">{label}</dt>
      <dd className="text-black">{value}</dd>
    </div>
  );
}
