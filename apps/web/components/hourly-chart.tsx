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

const width = 480;
const height = 135;
const pad = { top: 12, right: 10, bottom: 20, left: 28 };

interface HourlyChartProps {
  rows: UsageRow[];
  assumptions: Assumptions;
  period?: Period;
}

export function HourlyChart({
  rows,
  assumptions,
  period = "all",
}: HourlyChartProps) {
  const hours = [...groupBy(rows, (row) => costaRicaHour(row.usage.hour)).entries()]
    .map(([hour, hourRows]) => ({ hour, ...totals(hourRows, assumptions) }))
    .filter((hour) => hour.serviceHours > 0.01)
    .sort((a, b) => a.hour - b.hour);

  if (hours.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-black/40">
        Todavía no hay horas en servicio hoy.
      </div>
    );
  }

  const dayBreakEven = totals(rows, assumptions).breakEven;
  const yMax = Math.max(10, dayBreakEven, ...hours.map((h) => h.ridersPerBusHour)) * 1.15;
  const first = Math.min(...hours.map((h) => h.hour));
  const last = Math.max(...hours.map((h) => h.hour));
  const slot = (width - pad.left - pad.right) / (last - first + 1);
  const x = (hour: number) => pad.left + (hour - first) * slot;
  const y = (v: number) => pad.top + (1 - v / yMax) * (height - pad.top - pad.bottom);
  const ticks = [0, Math.round(yMax / 2), Math.round(yMax / 1.15)];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        className="w-full min-w-[380px] h-auto overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Abordajes por hora-bus en cada hora del día"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(0,0,0,0.06)"
              strokeDasharray="2 2"
            />
            <text
              x={pad.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-black/40 text-[10px] font-medium"
            >
              {tick}
            </text>
          </g>
        ))}

        {hours.map((h) => {
          const v = h.ridersPerBusHour;
          const covers = v >= dayBreakEven;
          const active = inPeriod(h.hour, period);
          return (
            <rect
              key={h.hour}
              x={x(h.hour) + slot * 0.15}
              width={slot * 0.7}
              y={y(v)}
              height={Math.max(2, y(0) - y(v))}
              rx={2}
              fill={covers ? "#10b981" : "#ef4444"}
              opacity={active ? 1 : 0.25}
              className="transition-opacity"
            >
              <title>{`${h.hour}:00 · ${formatOne(v)} abordajes/h-bus (${covers ? "cubre costo" : "bajo equilibrio"})`}</title>
            </rect>
          );
        })}

        {/* Línea de punto de equilibrio */}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={y(dayBreakEven)}
          y2={y(dayBreakEven)}
          stroke="#111827"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text
          x={width - pad.right}
          y={y(dayBreakEven) - 5}
          textAnchor="end"
          className="fill-black/70 text-[11px] font-semibold"
        >
          equilibrio {formatOne(dayBreakEven)}
        </text>

        {hours
          .filter((h) => h.hour % 2 === 0)
          .map((h) => (
            <text
              key={h.hour}
              x={x(h.hour) + slot / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-black/45 text-[10px]"
            >
              {h.hour}h
            </text>
          ))}
      </svg>
    </div>
  );
}
