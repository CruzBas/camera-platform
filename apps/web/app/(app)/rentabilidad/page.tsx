"use client";

import { useCallback, useMemo, useState } from "react";
import { AssumptionsDialog } from "@/components/assumptions-dialog";
import { ExplainDialog } from "@/components/explain-dialog";
import { Gauge } from "@/components/gauge";
import { Heatmap } from "@/components/heatmap";
import { HelpButton } from "@/components/help-popover";
import { HourlyChart } from "@/components/hourly-chart";
import { LoadStack } from "@/components/load-stack";
import { RouteSelector } from "@/components/route-selector";
import type { HelpKey } from "@/lib/help";
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

export type DayOption = "today" | "yesterday";

const DAY_OPTIONS: { id: DayOption; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
];

export default function RentabilidadPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("all");
  // En horario nocturno (00:00 - 05:00), el día de hoy apenas empieza sin viajes concluidos,
  // por lo que el operador consulta por defecto el reporte completo del día anterior (como en TPOC).
  const [selectedDay, setSelectedDay] = useState<DayOption>(() => {
    const crHour = (new Date().getUTCHours() + 18) % 24;
    return crHour < 5 ? "yesterday" : "today";
  });
  const { assumptions, setAssumptions, reset, isDefault } = useAssumptions();

  // Rango de fechas según el día seleccionado (horario Costa Rica UTC-6)
  const range = useMemo(() => {
    if (selectedDay === "today") return null;
    const now = new Date();
    // Medianoche de ayer y fin de día de ayer en Costa Rica
    const end = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    // Usamos el rango completo de 24 horas del día previo
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dStr = yesterdayDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
    return {
      from: new Date(`${dStr}T00:00:00-06:00`),
      to: new Date(`${dStr}T23:59:59-06:00`),
    };
  }, [selectedDay]);

  const fetchHourly = useCallback((signal: AbortSignal) => getFleetHourly(range, signal), [range]);
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

  const selectedRouteName = selectedRouteId
    ? routeNames.get(selectedRouteId) ?? selectedRouteId
    : null;

  return (
    <div className="flex flex-col gap-2 -my-2 md:-my-5 max-w-full">
      {/* Header compacto con Explicar resultado y Supuestos */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-lg font-bold text-black">Rentabilidad operativa</h1>
          <p className="hidden text-xs text-black/50 md:inline">
            Tarifa ARESEP vs costos por hora-bus · Flota de Coronado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExplainDialog
            rows={routeRows}
            routeName={selectedRouteName}
            period={selectedPeriod}
            dayLabel={selectedDay === "today" ? "hoy" : "ayer"}
            assumptions={assumptions}
          />
          <AssumptionsDialog
            assumptions={assumptions}
            onChange={setAssumptions}
            onReset={reset}
            isDefault={isDefault}
          />
        </div>
      </header>

      {/* Selector compacto de rutas, día y franjas en una sola barra */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-black/50 mr-0.5">
            Ruta:
          </span>
          <RouteSelector
            routes={ROUTE_OPTIONS}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-black/50 mr-0.5">
              Día:
            </span>
            {DAY_OPTIONS.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => setSelectedDay(day.id)}
                className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  selectedDay === day.id
                    ? "bg-[#1d7fe0]/15 text-[#1d7fe0] font-semibold"
                    : "text-black/50 hover:bg-black/5 hover:text-black"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
          <div className="h-3.5 w-px bg-black/10" aria-hidden />
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-black/50 mr-0.5">
              Franja:
            </span>
            {PERIOD_OPTIONS.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setSelectedPeriod(period.id)}
                className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  selectedPeriod === period.id
                    ? "bg-[#1d7fe0]/15 text-[#1d7fe0] font-semibold"
                    : "text-black/50 hover:bg-black/5 hover:text-black"
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700">
          No se pudo consultar el servicio de ocupación: {error}
        </div>
      )}

      {/* KPI Tiles compactos en 4 columnas con ícono de ayuda */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Indicadores de rentabilidad">
        <KpiTile
          topic="boardings"
          assumptions={assumptions}
          label={`Abordajes (${selectedDay === "today" ? "hoy" : "ayer"})`}
          value={measured ? formatWhole(t.boardings) : "—"}
          hint={
            measured
              ? `${formatOne(t.measuredHours)} h-bus · ${periodLabels[selectedPeriod].toLowerCase()}`
              : "Sin mediciones"
          }
        />
        <KpiTile
          topic="revenue"
          assumptions={assumptions}
          label="Ingreso estimado"
          value={measured ? formatColonesShort(t.revenue) : "—"}
          hint="Abordajes × tarifa ARESEP"
        />
        <KpiTile
          topic="cost"
          assumptions={assumptions}
          label="Costo de operación"
          value={measured ? formatColonesShort(t.cost) : "—"}
          hint={`${formatColonesShort(assumptions.costPerBusHour)}/h-bus`}
        />
        <KpiTile
          topic="loss"
          assumptions={assumptions}
          label="Pérdida bajo equilibrio"
          value={measured ? formatColonesShort(t.loss) : "—"}
          alert={t.loss > 0}
          hint={
            measured
              ? `${formatOne(t.lossHours)} h-bus bajo eq.`
              : "Sin mediciones"
          }
        />
      </section>

      {/* Grid de Gráficos: 3 columnas x 2 filas con ícono de ayuda en cada panel */}
      <div className="grid gap-2 lg:grid-cols-[minmax(200px,0.75fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Dial de equilibrio (Fila 1, Col 1) */}
        <div className="flex flex-col rounded-xl border border-black/10 bg-white p-2.5">
          <div className="flex items-center justify-between pb-0.5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[12.5px] font-bold text-black">Abordajes por hora-bus</h2>
              <HelpButton topic="gauge" assumptions={assumptions} />
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center">
            <Gauge
              value={t.ridersPerBusHour}
              breakEven={t.breakEven}
              measured={measured}
            />
            <p className="mt-1 text-center text-[10.5px] text-black/50">
              {measured
                ? t.ridersPerBusHour >= t.breakEven
                  ? "Cubre costos en esta selección."
                  : "Bajo el volumen necesario."
                : "Esperando registros."}
            </p>
          </div>
        </div>

        {/* Gráfico horario contra equilibrio (Fila 1, Col 2 & 3) */}
        <div className="flex flex-col rounded-xl border border-black/10 bg-white p-2.5 lg:col-span-2">
          <div className="flex items-center justify-between pb-0.5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[12.5px] font-bold text-black">¿Qué horas pagan su costo?</h2>
              <HelpButton topic="hourly" assumptions={assumptions} />
            </div>
            <span className="text-[10.5px] text-black/45">
              Verde: cubre costo · Rojo: bajo equilibrio
            </span>
          </div>
          <div className="flex-1">
            <HourlyChart
              rows={routeRows}
              assumptions={assumptions}
              period={selectedPeriod}
            />
          </div>
        </div>

        {/* Matriz Ruta × Hora (Fila 2, Col 1 & 2) */}
        <div className="flex flex-col rounded-xl border border-black/10 bg-white p-2.5 lg:col-span-2">
          <div className="flex items-center justify-between pb-0.5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[12.5px] font-bold text-black">Ruta × hora de operación</h2>
              <HelpButton topic="heatmap" assumptions={assumptions} />
            </div>
            <span className="text-[10.5px] text-black/45">
              Toque una ruta para filtrar
            </span>
          </div>
          <div className="flex-1">
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
          </div>
        </div>

        {/* Tiempo por nivel de ocupación (Fila 2, Col 3) */}
        <div className="flex flex-col rounded-xl border border-black/10 bg-white p-2.5">
          <div className="flex items-center justify-between pb-0.5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[12.5px] font-bold text-black">Tiempo por nivel de ocupación</h2>
              <HelpButton topic="load" assumptions={assumptions} />
            </div>
          </div>
          <div className="flex-1">
            <LoadStack
              rows={rowsInPeriod(allRows, selectedPeriod)}
              routeIds={routeIds}
              routeNames={routeNames}
              selectedRoute={selectedRouteId}
              onSelectRoute={(id) =>
                setSelectedRouteId((prev) => (prev === id ? null : id))
              }
            />
          </div>
        </div>
      </div>

      {/* Nota inferior compacta */}
      <div className="flex justify-center pt-0.5">
        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">
          Nota: Datos simulados para evaluación de rentabilidad y frecuencias operativas.
        </span>
      </div>
    </div>
  );
}

function KpiTile({
  topic,
  assumptions,
  label,
  value,
  hint,
  alert = false,
}: {
  topic: HelpKey;
  assumptions: any;
  label: string;
  value: string | number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <p className="text-[11px] font-semibold text-black/50">{label}</p>
          <HelpButton topic={topic} assumptions={assumptions} />
        </div>
        {hint && <span className="text-[10px] text-black/40 truncate max-w-[130px]">{hint}</span>}
      </div>
      <p
        className={`mt-0.5 text-xl font-bold tabular-nums ${
          alert ? "text-red-700" : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
