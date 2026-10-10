// Motor de narrativa ejecutiva: explica en español claro la rentabilidad de la flota o ruta seleccionada.
// Construido a partir de las mismas cifras de los KPIs y gráficos, asegurando coherencia total.

import type { Assumptions } from "./operator-settings";
import {
  costaRicaHour,
  formatColones,
  formatColonesShort,
  formatOne,
  groupBy,
  inPeriod,
  rowsInPeriod,
  totals,
  type Period,
  type UsageRow,
} from "./kpis";

export interface NarrativeInput {
  /** Registros de la ruta seleccionada (o de toda la flota) para todas las horas. */
  rows: UsageRow[];
  /** Nombre de la ruta seleccionada o null para toda la flota. */
  routeName: string | null;
  period: Period;
  dayLabel?: "hoy" | "ayer";
  assumptions: Assumptions;
}

function subject(routeName: string | null) {
  if (!routeName) return "la flota";
  if (routeName.startsWith("Ruta")) return `la ${routeName}`;
  if (routeName.startsWith("Ramal")) return `el ${routeName}`;
  return routeName;
}

const ofSubject = (who: string) =>
  who.startsWith("el ") ? `del ${who.slice(3)}` : `de ${who}`;

const periodPhrase: Record<Period, string> = {
  all: "",
  peak: " en hora pico",
  offpeak: " en horas valle",
};

const clock = (hour: number) => `${hour % 24}:00`;

function ranges(hours: number[], lastHour: number, ongoing: boolean) {
  const runs: [number, number][] = [];
  for (const hour of hours) {
    const run = runs[runs.length - 1];
    if (run && hour === run[1] + 1) run[1] = hour;
    else runs.push([hour, hour]);
  }
  const parts = runs.map(([first, last]) =>
    ongoing && last === lastHour
      ? `a partir de las ${clock(first)}`
      : `entre las ${clock(first)} y las ${clock(last + 1)}`
  );
  return parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

export function buildNarrative({
  rows,
  routeName,
  period,
  dayLabel = "hoy",
  assumptions,
}: NarrativeInput): string[] {
  const scoped = rowsInPeriod(rows, period);
  const t = totals(scoped, assumptions);
  const who = subject(routeName);
  const ongoing = dayLabel === "hoy";
  const day = ongoing ? "Hoy" : "Ayer";
  const inFavor = ongoing ? "opera con saldo a favor" : "operó con saldo a favor";
  const inRed = ongoing ? "está en números rojos" : "cerró en números rojos";

  if (t.measuredHours < 0.05) {
    return [
      `${day} ${who}${periodPhrase[period]} todavía no tiene horas en servicio con abordajes contabilizados.`,
    ];
  }

  const byHour = [...groupBy(scoped, (row) => costaRicaHour(row.usage.hour)).entries()]
    .map(([hour, hourRows]) => ({ hour, ...totals(hourRows, assumptions) }))
    .filter((h) => h.measuredHours >= 0.05 && inPeriod(h.hour, period))
    .sort((a, b) => a.hour - b.hour);

  const lastHour = byHour.length > 0 ? byHour[byHour.length - 1].hour : 0;
  const goodHours = byHour.filter((h) => h.ridersPerBusHour >= t.breakEven).map((h) => h.hour);
  const badHours = byHour.filter((h) => h.ridersPerBusHour < t.breakEven).map((h) => h.hour);
  const good = ranges(goodHours, lastHour, ongoing);
  const bad = ranges(badHours, lastHour, ongoing);

  const above = t.ridersPerBusHour >= t.breakEven;
  let streak = 0;
  for (let i = byHour.length - 1; i >= 0 && byHour[i].ridersPerBusHour < t.breakEven; i--) {
    streak++;
  }
  const trend =
    ongoing && above && streak >= 2
      ? " Si esta tendencia continúa en las siguientes horas, el margen operativo se irá estrechando hacia el punto de equilibrio."
      : "";

  const net = t.revenue - t.cost;
  const money = formatColonesShort;
  const paragraphs: string[] = [];

  // 1. Balance neto
  paragraphs.push(
    net >= 0
      ? `${day} ${who}${periodPhrase[period]} ${inFavor}: los ingresos estimados (${money(
          t.revenue
        )}) superan los costos de operación (${money(t.cost)}) por ${money(net)}.`
      : `${day} ${who}${periodPhrase[period]} ${inRed}: los costos de operación (${money(
          t.cost
        )}) superan los ingresos recaudados (${money(t.revenue)}) por ${money(-net)}.`
  );

  // 2. Detalle y contraste horario
  let contrast: string;
  if (t.loss <= 0) {
    contrast = "Todas las horas-bus registradas lograron cubrir sus costos de operación.";
  } else if (t.gain <= 0) {
    contrast =
      "Ninguna hora-bus logró cubrir sus costos: en todas las franjas los buses transportaron menos pasajeros de los necesarios para pagar el servicio.";
  } else if (net >= 0) {
    contrast = `Ese balance global positivo esconde un contraste operativo: las horas rentables sumaron ${money(
      t.gain
    )}, mientras que las deficitarias restaron ${money(t.loss)}.`;
  } else {
    contrast = `Las horas que lograron cubrir costos apenas aportaron ${money(
      t.gain
    )}, cifra insuficiente para compensar los ${money(
      t.loss
    )} perdidos en horarios de baja demanda de pasajeros.`;
  }

  if (goodHours.length && badHours.length) {
    contrast += ` Al analizar el detalle por hora, los buses mantuvieron un promedio sostenible ${good}, pero cayeron en pérdida ${bad}.${trend}`;
  }
  paragraphs.push(contrast);

  // 3. Rendimiento frente al equilibrio
  const lead: Record<Period, string> = {
    all: ongoing ? "En lo que va del día" : "En el día",
    peak: "En hora pico",
    offpeak: "En horas valle",
  };
  const clearly = t.ridersPerBusHour >= t.breakEven * 1.25 ? "con claridad " : "";
  paragraphs.push(
    above
      ? `${lead[period]}, el rendimiento ${ofSubject(
          who
        )} es positivo: el promedio de ${formatOne(
          t.ridersPerBusHour
        )} abordajes por hora-bus supera ${clearly}el punto de equilibrio fijado en ${formatOne(
          t.breakEven
        )} abordajes/h-bus.`
      : `${lead[period]}, el rendimiento ${ofSubject(
          who
        )} es negativo: el promedio de ${formatOne(
          t.ridersPerBusHour
        )} abordajes por hora-bus no alcanza el punto de equilibrio mínimo fijado en ${formatOne(
          t.breakEven
        )} abordajes/h-bus.`
  );

  // 4. Oportunidad operativa concreta
  if (t.loss > 0 && badHours.length) {
    paragraphs.push(
      `La oportunidad de optimización está ${bad}: circulan más buses de los que la demanda de pasajeros justifica. Reduciendo frecuencias o espaciando viajes en esas horas, cada bus viajará con mejor ocupación y se recuperará parte de los ${money(
        t.loss
      )} perdidos.`
    );
  }

  paragraphs.push(
    `Cifras estimadas con tarifas oficiales de ARESEP y un costo de referencia de ${formatColones(
      assumptions.costPerBusHour
    )} por hora-bus. Datos del simulador de flota.`
  );

  return paragraphs;
}
