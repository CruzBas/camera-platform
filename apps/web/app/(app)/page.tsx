"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { CameraFormDialog } from "@/components/camera-form-dialog";
import { CameraLive } from "@/components/camera-live";
import { EventsList } from "@/components/events-list";
import { FleetMap } from "@/components/fleet-map";
import { StatusPill } from "@/components/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Camera, type CameraStatusSummary, useApi } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { occupancy } from "@/lib/occupancy";
import { getVehicles } from "@/lib/occupancy-api";
import { peopleIn, useLiveDetections } from "@/lib/realtime";
import { usePolling } from "@/lib/use-polling";

const STATUS_REFRESH_MS = 5000;
const OCCUPANCY_REFRESH_MS = 3000;

export default function FleetPage() {
  const { data: cameras, error, reload } = useApi<Camera[]>("/api/cameras");
  const { data: statuses } = useApi<CameraStatusSummary[]>(
    "/api/cameras/status",
    STATUS_REFRESH_MS
  );
  const ids = useMemo(() => (cameras ?? []).map((c) => c.id), [cameras]);
  const frames = useLiveDetections(ids);

  // Polling del simulador de flota (Occupancy API)
  const fetchVehicles = useCallback((signal: AbortSignal) => getVehicles(signal), []);
  const { data: vehicleList } = usePolling(fetchVehicles, OCCUPANCY_REFRESH_MS);
  const vehicles = vehicleList?.vehicles ?? [];

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  if (error) {
    return (
      <p className="text-red-700">No se pudieron cargar los buses: {error.message}</p>
    );
  }
  if (!cameras) {
    return <h1 className="text-2xl font-bold">Flota en vivo</h1>;
  }

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

  // Camera del sistema (Decision 2: panel de cámara siempre visible con la primera cámara)
  const primaryCamera = cameras[0];
  const primaryStatus = statuses?.find((s) => s.cameraId === primaryCamera.id);
  const primaryFrame = frames[primaryCamera.id];
  const primaryPeople = primaryFrame ? peopleIn(primaryFrame) : null;
  const primaryOccupancy =
    primaryPeople !== null && primaryCamera.capacity
      ? occupancy(primaryPeople, primaryCamera.capacity)
      : null;

  // Métricas del simulador de flota
  const activeBuses = vehicles.filter((v) => !v.stale && v.location != null);
  const totalFleetPassengers = vehicles.reduce(
    (sum, v) => sum + (v.occupancy?.passengerCount ?? 0),
    0
  );
  const highOccupancyBuses = vehicles.filter((v) => {
    const p = v.occupancy?.percent ?? 0;
    return p >= 70;
  });

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold">Flota en vivo</h1>
        <p className="mt-1 text-[15px] text-black/45">
          Monitoreo de la red de Coronado con telemetría en tiempo real y cámara en cabina.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de la flota">
        <Kpi
          label="Unidades en ruta"
          value={`${activeBuses.length} de ${vehicles.length}`}
        />
        <Kpi label="Pasajeros a bordo (flota)" value={totalFleetPassengers} />
        <Kpi
          label="Con ocupación alta"
          value={highOccupancyBuses.length}
          alert={highOccupancyBuses.length > 0}
        />
      </section>

      {/* Reemplazo de la lista de buses con el mapa de flota + panel de cámara siempre visible */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section
          className="flex h-[560px] flex-col rounded-2xl border border-black/10 bg-white p-2"
          aria-label="Mapa de flota"
        >
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <span className="text-[13px] font-semibold text-black/60">
              Red de Coronado · {vehicles.length} buses simulados
            </span>
            {selectedVehicleId && (
              <button
                type="button"
                onClick={() => setSelectedVehicleId(null)}
                className="text-[12px] font-medium text-[#1d7fe0] hover:underline"
              >
                Limpiar selección ({selectedVehicleId})
              </button>
            )}
          </div>
          <FleetMap
            vehicles={vehicles}
            selectedId={selectedVehicleId}
            onSelect={(id) => setSelectedVehicleId(id)}
            className="flex-1"
          />
        </section>

        {/* Panel de cámara siempre visible */}
        <section
          aria-label={`Cámara de ${primaryCamera.name}`}
          className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-white p-4"
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-black">{primaryCamera.name}</h2>
                <TransmissionPill status={primaryStatus} />
              </div>
              <p className="text-[13px] text-black/45">
                {primaryCamera.route ?? "Sin ruta asignada"}
              </p>
            </div>
            {primaryPeople !== null && (
              <span className="flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-2xl font-bold leading-none tabular-nums text-black">
                  {primaryPeople}
                </span>
                <span className="text-[13px] font-semibold text-black/45">
                  {primaryCamera.capacity && `/ ${primaryCamera.capacity} `}
                  {primaryPeople === 1 ? "pasajero" : "pasajeros"}
                </span>
              </span>
            )}
          </header>

          <CameraLive camera={primaryCamera} />

          {primaryOccupancy && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-black/50">Ocupación IA:</span>
              <StatusPill
                text={`${primaryOccupancy.text} · ${primaryOccupancy.percent}%`}
                tone={primaryOccupancy.tone}
              />
            </div>
          )}

          {primaryStatus && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-3">
              <Detail
                label="Video"
                value={
                  primaryStatus.stream.width
                    ? `${primaryStatus.stream.codec} · ${primaryStatus.stream.width}×${primaryStatus.stream.height}`
                    : "—"
                }
              />
              <Detail
                label="Capacidad"
                value={
                  primaryCamera.capacity
                    ? `${primaryCamera.capacity} pasajeros`
                    : "Sin definir"
                }
              />
              <Detail
                label="Análisis"
                value={
                  primaryStatus.analysis.active
                    ? `${primaryStatus.analysis.fps?.toFixed(1)} frames/s`
                    : "Inactivo"
                }
              />
              <Detail
                label="Inferencia"
                value={
                  primaryStatus.analysis.inferenceMs
                    ? `${Math.round(primaryStatus.analysis.inferenceMs)} ms`
                    : "—"
                }
              />
              <Detail label="Espectadores" value={primaryStatus.stream.viewers} />
            </dl>
          )}

          <Link
            href={`/cameras/${primaryCamera.id}`}
            className="flex items-center gap-1 self-start text-[14px] font-medium text-[#1d7fe0] hover:underline"
          >
            Ver detalle y eventos de la cámara
            <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </section>
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

function Kpi({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-5 py-4">
      <p className="text-[13px] font-semibold text-black/45">{label}</p>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${
          alert ? "text-red-700" : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TransmissionPill({
  status,
}: {
  status: CameraStatusSummary | undefined;
}) {
  if (!status) return <StatusPill text="Consultando…" />;
  if (status.stream.online) {
    const since = status.stream.onlineSince
      ? ` · ${formatClock(status.stream.onlineSince)}`
      : "";
    return <StatusPill text={`En vivo${since}`} tone="success" />;
  }
  return status.stream.configured ? (
    <StatusPill text="Sin señal" tone="error" />
  ) : (
    <StatusPill text="Configurando" tone="warning" />
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
