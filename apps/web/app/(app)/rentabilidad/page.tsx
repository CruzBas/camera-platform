"use client";

import { useCallback, useState } from "react";
import { RouteSelector } from "@/components/route-selector";
import { getFleetHourly } from "@/lib/occupancy-api";
import { usePolling } from "@/lib/use-polling";

const ROUTE_OPTIONS = [
  { id: "R142", name: "Ruta 142 · Troncal" },
  { id: "R142-01", name: "Cascajal" },
  { id: "R142-02", name: "Las Nubes" },
  { id: "R142-03", name: "Dulce Nombre" },
  { id: "R142-04", name: "Patio de Agua" },
  { id: "R142-05", name: "San Rafael" },
  { id: "R142-06", name: "Patalillo" },
];

const PERIODS = [
  { id: "all", label: "Todo el día" },
  { id: "morningPeak", label: "Pico mañana (5-8h)" },
  { id: "midday", label: "Valle (8-16h)" },
  { id: "afternoonPeak", label: "Pico tarde (16-19h)" },
  { id: "night", label: "Noche (19-23h)" },
];

export default function RentabilidadPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");

  const fetchHourly = useCallback((signal: AbortSignal) => getFleetHourly(null, signal), []);
  const { data: fleetHourly, error } = usePolling(fetchHourly, 10000);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-black">Rentabilidad operativa</h1>
        <p className="text-[15px] text-black/50">
          Evaluación de ingresos por tarifa ARESEP frente a costos por hora-bus de la flota de Coronado.
        </p>
      </header>

      {/* Selector de rutas y ramales secundario (dentro de la página, sin segundo sidebar) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[13px] font-semibold text-black/60">
            Filtrar por ruta o ramal:
          </span>
          {/* Selector de franja horaria */}
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setSelectedPeriod(period.id)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  selectedPeriod === period.id
                    ? "bg-black/10 text-black font-semibold"
                    : "text-black/50 hover:bg-black/5 hover:text-black"
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        <RouteSelector
          routes={ROUTE_OPTIONS}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo consultar el servicio de ocupación: {error}
        </div>
      )}

      {/* Contenedor esqueleto de métricas y gráficos (se implementará en commits 6 y 7) */}
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center">
        <p className="text-base font-semibold text-black">
          Panel de rentabilidad ·{" "}
          {selectedRouteId
            ? ROUTE_OPTIONS.find((r) => r.id === selectedRouteId)?.name
            : "Toda la flota"}
        </p>
        <p className="mt-1 text-sm text-black/45">
          {fleetHourly
            ? `Datos recibidos de ${fleetHourly.buses.length} unidades.`
            : "Cargando métricas de operación…"}
        </p>
        <span className="mt-3 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200">
          Nota: Datos simulados para evaluación de costos operativos.
        </span>
      </div>
    </>
  );
}
