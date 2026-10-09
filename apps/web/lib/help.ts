// Textos explicativos para cada tarjeta e indicador de rentabilidad.
// Fórmulas y definiciones según el modelo de negocio del operador y tarifas ARESEP.

import { defaultFare, fares, type Assumptions } from "./operator-settings";
import { formatColones, loadGroups } from "./kpis";

export interface HelpTopic {
  title: string;
  what: string;
  how: string[];
  note?: string;
}

export type HelpKey =
  | "boardings"
  | "revenue"
  | "cost"
  | "loss"
  | "gauge"
  | "hourly"
  | "heatmap"
  | "load"
  | "routes"
  | "period";

const percent = (share: number) => `${Math.round(share * 100)} %`;

const fareList = () => {
  const values = [...new Set(Object.values(fares))].sort((a, b) => b - a);
  return values.map(formatColones).join(" o ") || formatColones(defaultFare);
};

export function helpTopic(key: HelpKey, assumptions: Assumptions): HelpTopic {
  const cost = formatColones(assumptions.costPerBusHour);
  const seniors = percent(assumptions.seniorShare);
  const breakEven = `costo por hora-bus (${cost}) ÷ (tarifa × (1 − ${seniors} de adultos mayores))`;

  switch (key) {
    case "boardings":
      return {
        title: "Abordajes",
        what: "Cuántas personas subieron a los buses en el día, con la ruta y la franja seleccionadas.",
        how: [
          "Suma de las personas que entraron por las puertas de cada bus, hora por hora.",
          "Horas-bus: tiempo total que los buses estuvieron en servicio. Un bus durante una hora equivale a 1 hora-bus; tiempo estacionado no cuenta.",
          "Los buses con cámara de cabina IA reportan ocupación en tiempo real; los abordajes históricos provienen de los sensores de conteo.",
        ],
        note: "Datos simulados para evaluación de la red de Coronado.",
      };
    case "revenue":
      return {
        title: "Ingreso estimado",
        what: "Estimación del recaudo según las tarifas oficiales de los pasajeros que abordaron.",
        how: [
          "Ingreso = abordajes × tarifa de su ruta × (1 − proporción de adultos mayores).",
          `Tarifas oficiales ARESEP (resolución RE-0115-IT-2026): ${fareList()} según la ruta o ramal.`,
          `Los adultos mayores viajan con exoneración por ley; se asume un ${seniors} de los abordajes (configurable en Supuestos).`,
        ],
        note: "Es una estimación del recaudo teórico, no considera evasión ni otros medios de pago.",
      };
    case "cost":
      return {
        title: "Costo de operación",
        what: "Costo total de mantener las unidades circulando durante las horas de servicio medidas.",
        how: [
          `Costo = horas-bus en servicio × ${cost} por hora-bus.`,
          "El costo por hora-bus incluye combustible (diésel), salario y cargas del chofer, mantenimiento preventivo y llantas, depreciación del bus, seguros, cánones de ARESEP y administración.",
        ],
        note: "El costo por hora-bus es una referencia operativa estándar (₡12 950); puede personalizarse en Supuestos.",
      };
    case "loss":
      return {
        title: "Pérdida en horas bajo equilibrio",
        what: "Monto deficitario acumulado en las horas donde los buses no llevaron suficientes pasajeros para cubrir su costo operativo.",
        how: [
          "Para cada unidad y cada hora: se compara el ingreso estimado frente al costo de operación de esa hora.",
          "Si el ingreso no cubrió el costo, la diferencia se suma como pérdida operativa. Las horas rentables no descuentan esta pérdida.",
          "Horas-bus: cantidad de horas acumuladas que operaron bajo el punto de equilibrio.",
        ],
        note: "Indica el potencial de ahorro si se optimizan o recortan frecuencias ociosas.",
      };
    case "gauge":
      return {
        title: "Abordajes por hora-bus (Dial de equilibrio)",
        what: "Promedio de pasajeros que aborda un bus por cada hora de servicio y si el volumen alcanza para cubrir costos.",
        how: [
          "Abordajes por hora-bus = total de abordajes ÷ horas-bus en servicio.",
          `Punto de equilibrio = ${breakEven}: abordajes mínimos por hora que requiere una unidad para no generar pérdidas.`,
          "Zonas: Rojo (déficit operativo), Amarillo (hasta 15% sobre el equilibrio), Verde (operación rentable).",
        ],
      };
    case "hourly":
      return {
        title: "¿Qué horas pagan su costo? (Gráfico horario)",
        what: "Comportamiento hora a hora de la demanda frente a la línea de equilibrio económico.",
        how: [
          "Cada barra representa los abordajes por hora-bus de esa hora específica.",
          "Línea discontinua: punto de equilibrio diario.",
          "Barras verdes: la hora pagó sus costos operativos. Barras rojas: operó con pérdida.",
          "Las horas fuera de la franja seleccionada (pico/valle) se muestran con menor opacidad.",
        ],
      };
    case "heatmap":
      return {
        title: "Ruta × hora de operación (Matriz de calor)",
        what: "Radiografía completa de rentabilidad por ramal y horario: identifica focos de ganancia y déficit.",
        how: [
          "Cada celda compara los abordajes de esa ruta a esa hora con el equilibrio propio de la ruta (según su tarifa).",
          "Rojo intenso: < 70% del equilibrio. Rojo suave: 70% a 100%. Verde suave: 100% a 140%. Verde intenso: > 140%.",
          "Gris: sin buses en servicio a esa hora.",
          "Hacer clic en cualquier ruta filtra todo el tablero a ese ramal.",
        ],
      };
    case "load":
      return {
        title: "Tiempo por nivel de ocupación",
        what: "Distribución del tiempo de servicio según el nivel de carga de los buses en cada ramal.",
        how: [
          "Nivel de ocupación = pasajeros a bordo ÷ capacidad del bus.",
          `Cada barra desglosa el tiempo en: ${loadGroups.map((g) => `${g.label.toLowerCase()} (${g.range})`).join(", ")}.`,
          "Mucho tiempo casi vacío señala exceso de buses en la calle; saturación prolongada indica necesidad de refuerzo.",
        ],
      };
    case "routes":
      return {
        title: "Filtro de rutas y ramales",
        what: "Permite enfocar el análisis en toda la flota consolidada o en un ramal particular de Coronado.",
        how: [
          "Filtra abordajes, ingresos, costos y gráficos al ramal seleccionado.",
          "Toda la flota restablece la vista global de la concesión.",
        ],
      };
    case "period":
      return {
        title: "Franjas horarias",
        what: "Segmenta el rendimiento según la hora del día.",
        how: [
          "Hora pico: de 6:00 a 9:00 y de 16:00 a 19:00 (mayor demanda laboral y escolar).",
          "Valle: horas diurnas intermedias y nocturnas.",
          "Todo el día: jornada completa de servicio.",
        ],
      };
  }
}
