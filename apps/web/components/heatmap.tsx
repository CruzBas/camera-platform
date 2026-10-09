import type { Assumptions } from "@/lib/operator-settings";
import {
  costaRicaHour,
  formatOne,
  groupBy,
  inPeriod,
  totals,
  type Period,
  type UsageRow,
} from "@/lib/kpis";

interface HeatmapProps {
  rows: UsageRow[];
  routeIds: string[];
  routeNames: Map<string, string>;
  assumptions: Assumptions;
  selectedRoute: string | null;
  period: Period;
  onSelectRoute: (routeId: string) => void;
}

function cellColor(ratio: number): string {
  if (ratio < 0.7) return "#ef4444"; // Muy por debajo
  if (ratio < 1.0) return "#fca5a5"; // Debajo del equilibrio
  if (ratio < 1.4) return "#86efac"; // Cubre su costo
  return "#22c55e"; // Holgado
}

export function Heatmap({
  rows,
  routeIds,
  routeNames,
  assumptions,
  selectedRoute,
  period,
  onSelectRoute,
}: HeatmapProps) {
  const byRoute = groupBy(rows, (row) => row.routeId ?? "—");
  const hours = [
    ...new Set(
      rows
        .filter((row) => row.usage.serviceSeconds > 0)
        .map((row) => costaRicaHour(row.usage.hour))
    ),
  ].sort((a, b) => a - b);

  if (hours.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-black/40">
        Todavía no hay horas en servicio hoy.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-1 min-w-[500px]"
          style={{
            gridTemplateColumns: `minmax(110px, auto) repeat(${hours.length}, minmax(18px, 1fr))`,
          }}
        >
          <span />
          {hours.map((hour) => (
            <span
              key={hour}
              className={`text-center text-[10px] font-medium ${
                inPeriod(hour, period) ? "text-black/70" : "text-black/20"
              }`}
            >
              {hour % 2 === 0 ? `${hour}h` : ""}
            </span>
          ))}

          {routeIds.map((routeId) => {
            const byHour = groupBy(
              byRoute.get(routeId) ?? [],
              (row) => costaRicaHour(row.usage.hour)
            );
            const isSelected = selectedRoute === routeId;
            const faded = selectedRoute !== null && !isSelected;
            const name = routeNames.get(routeId) ?? routeId;

            return (
              <div key={routeId} className="contents">
                <button
                  type="button"
                  onClick={() => onSelectRoute(routeId)}
                  className={`truncate rounded px-1.5 py-1 text-left text-[11px] font-medium transition-colors ${
                    isSelected
                      ? "bg-[#1d7fe0]/15 font-bold text-[#1d7fe0]"
                      : faded
                      ? "text-black/30 hover:text-black/60"
                      : "text-black/80 hover:bg-black/5"
                  }`}
                  title={name}
                >
                  {name}
                </button>

                {hours.map((hour) => {
                  const t = totals(byHour.get(hour) ?? [], assumptions);
                  const empty = t.measuredHours < 0.05;
                  const ratio = t.ridersPerBusHour / t.breakEven;
                  const inActivePeriod = inPeriod(hour, period);

                  return (
                    <button
                      key={`${routeId}-${hour}`}
                      type="button"
                      onClick={() => onSelectRoute(routeId)}
                      className={`h-6 rounded-xs transition-opacity ${
                        faded || !inActivePeriod ? "opacity-30" : "opacity-100"
                      } hover:ring-2 hover:ring-black/20`}
                      style={{
                        backgroundColor: empty ? "#f3f4f6" : cellColor(ratio),
                      }}
                      title={
                        empty
                          ? `${name}, ${hour}:00: sin servicio`
                          : `${name}, ${hour}:00: ${formatOne(t.ridersPerBusHour)} abordajes/h-bus (equilibrio ${formatOne(t.breakEven)})`
                      }
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-4 text-[11px] text-black/60">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-xs bg-[#ef4444]" />
          Muy por debajo
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-xs bg-[#fca5a5]" />
          Debajo de equilibrio
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-xs bg-[#86efac]" />
          Cubre costo
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-xs bg-[#22c55e]" />
          Holgado
        </li>
      </ul>
    </div>
  );
}
