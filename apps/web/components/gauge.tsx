import { formatOne } from "@/lib/kpis";

const cx = 100;
const cy = 100;
const radius = 78;

function point(fraction: number, r = radius) {
  const angle = Math.PI * (1 - fraction);
  return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)] as const;
}

function arc(from: number, to: number) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
}

export function Gauge({
  value,
  breakEven,
  measured,
}: {
  value: number;
  breakEven: number;
  measured: boolean;
}) {
  const max = Math.ceil(Math.max(80, breakEven * 2, value * 1.15) / 10) * 10;
  const at = (v: number) => Math.min(1, Math.max(0, v / max));
  const [nx, ny] = point(at(value), radius - 16);
  const covers = value >= breakEven;

  return (
    <div className="flex flex-col items-center justify-center p-2">
      <svg
        className="w-full max-w-[240px] overflow-visible"
        viewBox="0 0 200 146"
        role="img"
        aria-label={`Abordajes por hora-bus: ${formatOne(value)}; equilibrio ${formatOne(breakEven)}`}
      >
        {/* Zonas del dial */}
        <path
          d={arc(0, at(breakEven))}
          fill="none"
          stroke="#ef4444"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={arc(at(breakEven), at(breakEven * 1.15))}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="12"
        />
        <path
          d={arc(at(breakEven * 1.15), 1)}
          fill="none"
          stroke="#10b981"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {measured && (
          <>
            <line
              x1={cx}
              y1={cy}
              x2={nx}
              y2={ny}
              stroke="#111827"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={6} fill="#111827" />
          </>
        )}

        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          className={`text-2xl font-bold tabular-nums ${
            measured ? (covers ? "fill-emerald-600" : "fill-red-600") : "fill-black/30"
          }`}
        >
          {measured ? formatOne(value) : "—"}
        </text>
        <text
          x={20}
          y={cy + 15}
          textAnchor="middle"
          className="fill-black/40 text-[11px] font-medium"
        >
          0
        </text>
        <text
          x={180}
          y={cy + 15}
          textAnchor="middle"
          className="fill-black/40 text-[11px] font-medium"
        >
          {max}
        </text>
        <text
          x={cx}
          y={cy + 42}
          textAnchor="middle"
          className="fill-black/50 text-[12px] font-semibold"
        >
          equilibrio {formatOne(breakEven)}
        </text>
      </svg>
    </div>
  );
}
