"use client";

import { useCallback, useState } from "react";
import { AssumptionsDialog } from "@/components/assumptions-dialog";
import { RouteSelector } from "@/components/route-selector";
import { Card, CardContent } from "@/components/ui/card";
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

  const allRows = usageRows(fleetHourly);
  const routeRows = selectedRouteId
    ? allRows.filter((r) => r.routeId === selectedRouteId)
    : allRows;
  const scopedRows = rowsInPeriod(routeRows, selectedPeriod);
  const t = totals(scopedRows, assumptions);
  const measured = t.measuredHours > 0;

  return (
    <>
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Selector de rutas y franjas */}
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

      {/* Contenedor temporal de gráficos (commit 7 los integrará) */}
      <Card>
        <CardContent className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center text-sm text-black/45">
          <p className="font-semibold text-black">
            {selectedRouteId
              ? ROUTE_OPTIONS.find((r) => r.id === selectedRouteId)?.name
              : "Toda la flota"}{" "}
            · Abordajes por hora-bus:{" "}
            <span className="font-bold text-black">{measured ? formatOne(t.ridersPerBusHour) : "—"}</span>{" "}
            (Punto de equilibrio: {formatOne(t.breakEven)})
          </p>
          <span className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            Nota: Datos simulados para evaluación de costos operativos.
          </span>
        </CardContent>
      </Card>
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
