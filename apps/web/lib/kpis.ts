import {
  fareOf,
  sourcesWithBoardings,
  thresholds,
  type Assumptions,
} from "./operator-settings";
import type {
  BusHourlyUsage,
  FleetHourlyUsage,
  HourlyUsage,
  VehicleState,
} from "./occupancy-api";

export interface UsageRow {
  vehicleId: string;
  routeId: string | null;
  usage: HourlyUsage;
}

export function usageRows(fleet: FleetHourlyUsage | null): UsageRow[] {
  if (!fleet) return [];
  return fleet.buses.flatMap((bus: BusHourlyUsage) =>
    bus.hours.map((usage) => ({
      vehicleId: bus.vehicleId,
      routeId: usage.routeId ?? bus.routeId,
      usage,
    }))
  );
}

export interface Totals {
  buses: number;
  serviceHours: number;
  measuredHours: number;
  boardings: number;
  revenue: number;
  cost: number;
  loss: number;
  lossHours: number;
  gain: number;
  averagePercent: number;
  crowdedHours: number;
  nearlyEmptyHours: number;
  ridersPerBusHour: number;
  breakEven: number;
}

const crowdedBand = Math.floor(thresholds.crowdedPercent / 10);
const nearlyEmptyBands = Math.floor(thresholds.nearlyEmptyPercent / 10);

export function totals(rows: UsageRow[], assumptions: Assumptions): Totals {
  const paying = 1 - assumptions.seniorShare;
  let serviceSeconds = 0;
  let measuredSeconds = 0;
  let percentSeconds = 0;
  let crowdedSeconds = 0;
  let nearlyEmptySeconds = 0;
  let boardings = 0;
  let fareBoardings = 0;
  let revenue = 0;
  let cost = 0;
  let loss = 0;
  let lossSeconds = 0;
  const buses = new Set<string>();

  for (const { vehicleId, routeId, usage } of rows) {
    const seconds = usage.serviceSeconds;
    if (seconds > 0) buses.add(vehicleId);
    serviceSeconds += seconds;
    percentSeconds += usage.averagePercent * seconds;
    crowdedSeconds += usage.secondsByBand
      .slice(crowdedBand)
      .reduce((a, b) => a + b, 0);
    nearlyEmptySeconds += usage.secondsByBand
      .slice(0, nearlyEmptyBands)
      .reduce((a, b) => a + b, 0);

    if (!usage.source || !sourcesWithBoardings.has(usage.source)) continue;
    const fare = fareOf(routeId);
    const hourRevenue = usage.boardings * fare * paying;
    const hourCost = (seconds / 3600) * assumptions.costPerBusHour;
    measuredSeconds += seconds;
    boardings += usage.boardings;
    fareBoardings += usage.boardings * fare;
    revenue += hourRevenue;
    cost += hourCost;
    if (seconds > 0 && hourCost > hourRevenue) {
      loss += hourCost - hourRevenue;
      lossSeconds += seconds;
    }
  }

  const measuredHours = measuredSeconds / 3600;
  const averageFare =
    boardings > 0 ? fareBoardings / boardings : fareOf(rows[0]?.routeId);
  return {
    buses: buses.size,
    serviceHours: serviceSeconds / 3600,
    measuredHours,
    boardings,
    revenue,
    cost,
    loss,
    lossHours: lossSeconds / 3600,
    gain: revenue - cost + loss,
    averagePercent: serviceSeconds > 0 ? percentSeconds / serviceSeconds : 0,
    crowdedHours: crowdedSeconds / 3600,
    nearlyEmptyHours: nearlyEmptySeconds / 3600,
    ridersPerBusHour: measuredHours > 0 ? boardings / measuredHours : 0,
    breakEven: breakEven(averageFare, assumptions),
  };
}

export function breakEven(fare: number, assumptions: Assumptions): number {
  return assumptions.costPerBusHour / (fare * (1 - assumptions.seniorShare));
}

export function groupBy<K>(
  rows: UsageRow[],
  key: (row: UsageRow) => K
): Map<K, UsageRow[]> {
  const groups = new Map<K, UsageRow[]>();
  for (const row of rows) {
    const k = key(row);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
}

/** Hora del día en Costa Rica (UTC−6). */
export function costaRicaHour(iso: string): number {
  return (new Date(iso).getUTCHours() + 18) % 24;
}

export type Period = "all" | "peak" | "offpeak";

export const periodLabels: Record<Period, string> = {
  all: "Todo el día",
  peak: "Hora pico",
  offpeak: "Valle",
};

export function isPeakHour(hour: number): boolean {
  return (hour >= 6 && hour < 9) || (hour >= 16 && hour < 19);
}

export function inPeriod(hour: number, period: Period): boolean {
  return period === "all" || (period === "peak") === isPeakHour(hour);
}

export function rowsInPeriod(rows: UsageRow[], period: Period): UsageRow[] {
  return period === "all"
    ? rows
    : rows.filter((row) => inPeriod(costaRicaHour(row.usage.hour), period));
}

export const loadGroups = [
  { label: "Casi vacío", range: "< 20 %", bands: [0, 1], color: "#c9dff7" },
  { label: "Con asientos", range: "20–49 %", bands: [2, 3, 4], color: "#5bb34a" },
  { label: "Pocos asientos", range: "50–79 %", bands: [5, 6, 7], color: "#d9a400" },
  { label: "De pie", range: "80–89 %", bands: [8], color: "#e8730c" },
  { label: "Saturado", range: "≥ 90 %", bands: [9, 10], color: "#d1352b" },
];

export function loadShares(rows: UsageRow[]): number[] {
  const seconds = loadGroups.map((group) =>
    rows.reduce(
      (sum, row) =>
        sum +
        group.bands.reduce((s, band) => s + (row.usage.secondsByBand[band] ?? 0), 0),
      0
    )
  );
  const total = seconds.reduce((a, b) => a + b, 0);
  return seconds.map((value) => (total > 0 ? value / total : 0));
}

// Formateadores específicos de Costa Rica
const colones = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  maximumFractionDigits: 0,
});
const whole = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-CR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export const formatColones = (value: number) => colones.format(value);
export const formatWhole = (value: number) => whole.format(value);
export const formatOne = (value: number) => oneDecimal.format(value);
export const formatPercent = (value: number) => `${whole.format(value)} %`;

export function formatColonesShort(value: number): string {
  if (Math.abs(value) >= 1_000_000)
    return `₡${oneDecimal.format(value / 1_000_000)} M`;
  if (Math.abs(value) >= 1_000)
    return `₡${whole.format(value / 1_000)} k`;
  return formatColones(value);
}

/** Determina si un bus está activamente en servicio (en ruta con viaje asignado o con pasajeros reales). */
export function inService(vehicle: VehicleState): boolean {
  return (
    !vehicle.stale &&
    (vehicle.trip !== null ||
      (vehicle.occupancy !== null && vehicle.occupancy.source !== "SIMULATED"))
  );
}
