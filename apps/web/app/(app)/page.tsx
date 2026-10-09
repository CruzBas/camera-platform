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
import { inService } from "@/lib/kpis";
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

  // Métricas reales del simulador de flota según horario operativo
  const runningBuses = vehicles.filter(inService);
  const parkedBuses = vehicles.filter((v) => !v.stale && !inService(v));
  const totalFleetPassengers = runningBuses.reduce(
    (sum, v) => sum + (v.occupancy?.passengerCount ?? 0),
    0
  );
  const highOccupancyBuses = runningBuses.filter((v) => {
    const p = v.occupancy?.percent ?? 0;
    return p >= 70;
  });
  const selectedVehicle = vehicles.find((v) => v.vehicleId === selectedVehicleId);

  return (
    <div className="flex flex-col gap-2.5 -my-2 md:-my-5 max-w-full">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-black">Flota en vivo</h1>
          <p className="text-xs text-black/45">
            Monitoreo de la red de Coronado con telemetría en tiempo real y cámara en cabina.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-2" aria-label="Resumen de la flota">
        <Kpi
          label="Unidades en servicio"
          value={`${runningBuses.length} de ${vehicles.length}`}
          hint={
            runningBuses.length < vehicles.length
              ? `${parkedBuses.length} en terminal`
              : undefined
          }
        />
        <Kpi label="Pasajeros a bordo" value={totalFleetPassengers} />
        <Kpi
          label="Con ocupación alta"
          value={highOccupancyBuses.length}
          alert={highOccupancyBuses.length > 0}
        />
      </section>

      {/* Reemplazo de la lista de buses con el mapa de flota + panel de cámara siempre visible */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section
          className="flex h-full min-h-[460px] flex-col rounded-2xl border border-black/10 bg-white p-2"
          aria-label="Mapa de flota"
        >
          <div className="mb-1.5 flex items-center justify-between px-2 pt-0.5">
            <span className="text-[12px] font-semibold text-black/60">
              Red de Coronado · {runningBuses.length} en servicio · {parkedBuses.length} en terminal
            </span>
            {selectedVehicleId && (
              <button
                type="button"
                onClick={() => setSelectedVehicleId(null)}
                className="text-[11px] font-medium text-[#1d7fe0] hover:underline"
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

          {/* Tarjeta de seguimiento del bus seleccionado (como en TPOC) */}
          {selectedVehicle && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5 text-[12px] border border-black/5">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-black">{selectedVehicle.vehicleId}</span>
                {selectedVehicle.trip ? (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-800">
                    Ruta {selectedVehicle.trip.routeId} · {selectedVehicle.trip.direction === "INBOUND" ? "San José" : "Coronado"}
                  </span>
                ) : (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">
                    En terminal
                  </span>
                )}
                {selectedVehicle.occupancy && (
                  <span className="text-black/65">
                    {selectedVehicle.occupancy.passengerCount} / {selectedVehicle.occupancy.capacity} pax ({selectedVehicle.occupancy.percent}%)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-black/45 text-[11px]">
                {selectedVehicle.location?.speedKmh != null && (
                  <span>Vel: <strong>{Math.round(selectedVehicle.location.speedKmh)} km/h</strong></span>
                )}
                <span>Seguimiento activo</span>
              </div>
            </div>
          )}
        </section>

        {/* Panel de cámara siempre visible */}
        <section
          aria-label={`Cámara de ${primaryCamera.name}`}
          className="flex flex-col gap-2.5 rounded-2xl border border-black/10 bg-white p-3"
        >
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-bold text-black">{primaryCamera.name}</h2>
                <TransmissionPill status={primaryStatus} />
              </div>
              <p className="text-[12px] text-black/45">
                {primaryCamera.route ?? "Sin ruta asignada"}
              </p>
            </div>
            {primaryPeople !== null && (
              <span className="flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-xl font-bold leading-none tabular-nums text-black">
                  {primaryPeople}
                </span>
                <span className="text-[12px] font-semibold text-black/45">
                  {primaryCamera.capacity && `/ ${primaryCamera.capacity} `}
                  {primaryPeople === 1 ? "pasajero" : "pasajeros"}
                </span>
              </span>
            )}
          </header>

          <CameraLive camera={primaryCamera} />

          {primaryOccupancy && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-black/50">Ocupación IA:</span>
              <StatusPill
                text={`${primaryOccupancy.text} · ${primaryOccupancy.percent}%`}
                tone={primaryOccupancy.tone}
              />
            </div>
          )}

          {primaryStatus && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] sm:grid-cols-3">
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
                    ? `${primaryCamera.capacity} pax`
                    : "Sin definir"
                }
              />
              <Detail
                label="Análisis"
                value={
                  primaryStatus.analysis.active
                    ? `${primaryStatus.analysis.fps?.toFixed(1)} fps`
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
            className="flex items-center gap-1 self-start text-[13px] font-medium text-[#1d7fe0] hover:underline"
          >
            Ver detalle y eventos de la cámara
            <ChevronRightIcon className="size-3.5" aria-hidden />
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
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  alert = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-black/45">{label}</p>
        {hint && <span className="text-[10.5px] text-black/40">{hint}</span>}
      </div>
      <p
        className={`mt-0.5 text-2xl font-bold tabular-nums ${
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
