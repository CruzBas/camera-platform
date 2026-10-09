"use client";

import { useCallback, useMemo, useState } from "react";
import { AssumptionsDialog } from "@/components/assumptions-dialog";
import { Gauge } from "@/components/gauge";
import { Heatmap } from "@/components/heatmap";
import { HourlyChart } from "@/components/hourly-chart";
import { LoadStack } from "@/components/load-stack";
import { RouteSelector } from "@/components/route-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatColonesShort,
  formatOne,
  formatWhole,
  periodLabels,
  rowsInPeriod,
  totals,
  usageRows,
  type Period,
} from "@/lib/kpis";
import { getFleetHourly } from "@/lib/occupancy-api";
import { useAssumptions } from "@/lib/use-assumptions";
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

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "all", label: "Todo el día" },
  { id: "peak", label: "Hora pico" },
  { id: "offpeak", label: "Valle" },
];

export default function RentabilidadPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("all");
  const { assumptions, setAssumptions, reset, isDefault } = useAssumptions();

  const fetchHourly = useCallback((signal: AbortSignal) => getFleetHourly(null, signal), []);
  const { data: fleetHourly, error } = usePolling(fetchHourly, 10000);

  const allRows = useMemo(() => usageRows(fleetHourly), [fleetHourly]);
  const routeRows = useMemo(
    () => (selectedRouteId ? allRows.filter((r) => r.routeId === selectedRouteId) : allRows),
    [allRows, selectedRouteId]
  );
  const scopedRows = useMemo(
    () => rowsInPeriod(routeRows, selectedPeriod),
    [routeRows, selectedPeriod]
  );

  const t = totals(scopedRows, assumptions);
  const measured = t.measuredHours > 0;

  const routeIds = useMemo(() => ROUTE_OPTIONS.map((r) => r.id), []);
  const routeNames = useMemo(
    () => new Map(ROUTE_OPTIONS.map((r) => [r.id, r.name])),
    []
  );

  return (
    <>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black">Rentabilidad operativa</h1>
          <p className="text-[15px] text-black/50">
            Evaluación de ingresos por tarifa ARESEP frente a costos por hora-bus de la flota de Coronado.
          </p>
        </div>
        <AssumptionsDialog
          assumptions={assumptions}
          onChange={setAssumptions}
          onReset={reset}
          isDefault={isDefault}
        />
      </header>

      {/* Selector secundario de rutas y franjas dentro de la página */}
      <div className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[13px] font-semibold text-black/60">
            Filtrar por ruta o ramal:
          </span>
          <div className="flex flex-wrap gap-1">
            {PERIOD_OPTIONS.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setSelectedPeriod(period.id)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  selectedPeriod === period.id
                    ? "bg-[#1d7fe0]/10 text-[#1d7fe0] font-semibold"
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

      {/* KPI Tiles principales */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de rentabilidad">
        <KpiTile
          label="Abordajes (hoy)"
          value={measured ? formatWhole(t.boardings) : "—"}
          hint={
            measured
              ? `${formatOne(t.measuredHours)} horas-bus · ${periodLabels[selectedPeriod].toLowerCase()}`
              : "Sin mediciones"
          }
        />
        <KpiTile
          label="Ingreso estimado"
          value={measured ? formatColonesShort(t.revenue) : "—"}
          hint="Abordajes × tarifa ARESEP"
        />
        <KpiTile
          label="Costo de operación"
          value={measured ? formatColonesShort(t.cost) : "—"}
          hint={`${formatColonesShort(assumptions.costPerBusHour)} por hora-bus`}
        />
        <KpiTile
          label="Pérdida bajo equilibrio"
          value={measured ? formatColonesShort(t.loss) : "—"}
          alert={t.loss > 0}
          hint={
            measured
              ? `${formatOne(t.lossHours)} horas-bus bajo equilibrio`
              : "Sin mediciones"
          }
        />
      </section>

      {/* Panel de Gráficos de Rentabilidad */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
        {/* Dial de equilibrio */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">
              Abordajes por hora-bus
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-0">
            <Gauge
              value={t.ridersPerBusHour}
              breakEven={t.breakEven}
              measured={measured}
            />
            <p className="mt-2 text-center text-[12px] text-black/50">
              {measured
                ? t.ridersPerBusHour >= t.breakEven
                  ? "La operación cubre sus costos en esta selección."
                  : "Por debajo del volumen necesario para cubrir costos."
                : "Esperando registros de la flota."}
            </p>
          </CardContent>
        </Card>

        {/* Gráfico horario contra equilibrio */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-bold">
                ¿Qué horas pagan su costo?
              </CardTitle>
              <span className="text-[12px] text-black/45">
                Verde: cubre costo · Rojo: bajo equilibrio
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <HourlyChart
              rows={routeRows}
              assumptions={assumptions}
              period={selectedPeriod}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Matriz Ruta × Hora */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">
              Ruta × hora de operación
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Heatmap
              rows={allRows}
              routeIds={routeIds}
              routeNames={routeNames}
              assumptions={assumptions}
              selectedRoute={selectedRouteId}
              period={selectedPeriod}
              onSelectRoute={(id) =>
                setSelectedRouteId((prev) => (prev === id ? null : id))
              }
            />
          </CardContent>
        </Card>

        {/* Tiempo por nivel de ocupación */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">
              Tiempo por nivel de ocupación
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <LoadStack
              rows={rowsInPeriod(allRows, selectedPeriod)}
              routeIds={routeIds}
              routeNames={routeNames}
              selectedRoute={selectedRouteId}
              onSelectRoute={(id) =>
                setSelectedRouteId((prev) => (prev === id ? null : id))
              }
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center py-1">
        <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          Nota: Datos simulados para evaluación de rentabilidad y frecuencias operativas.
        </span>
      </div>
    </>
  );
}

function KpiTile({
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
    <div className="rounded-2xl border border-black/10 bg-white px-5 py-4">
      <p className="text-[13px] font-semibold text-black/45">{label}</p>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${
          alert ? "text-red-700" : "text-black"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[12px] text-black/40">{hint}</p>}
    </div>
  );
}
