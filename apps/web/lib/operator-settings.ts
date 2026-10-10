// Tarifas, costos y umbrales aplicados por el dashboard a los reportes de buses.
// Valores documentados según resolución ARESEP RE-0115-IT-2026.

/** Tarifa regular por ruta (colones), ARESEP RE-0115-IT-2026. */
export const fares: Record<string, number> = {
  R142: 460, // San José–Coronado
  "R142-01": 460, // Cascajal (Coronado–Las Nubes–Cascajal)
  "R142-02": 460, // Las Nubes
  "R142-03": 400, // Dulce Nombre
  "R142-04": 400, // Patio de Agua
  "R142-05": 400, // San Rafael
  "R142-06": 400, // Patalillo
  "R142-07": 400,
  "R142-08": 400,
  "R142-09": 400,
  "R142-10": 400,
};

/** Tarifa por defecto para rutas no listadas. */
export const defaultFare = 400;

export const fareSource =
  "Tarifas ARESEP RE-0115-IT-2026, vigentes desde el 4 sep 2026";

export interface Assumptions {
  /** Costo de operación de un bus por una hora en servicio, colones. */
  costPerBusHour: number;
  /** Proporción de abordajes de adultos mayores (viajan gratis, 0–1). */
  seniorShare: number;
}

/** Estimaciones por defecto hasta contar con datos auditados del operador. */
export const defaultAssumptions: Assumptions = {
  costPerBusHour: 12950,
  seniorShare: 0.12,
};

export const thresholds = {
  /** Bus en servicio a o sobre este porcentaje se considera lleno/saturado. */
  crowdedPercent: 90,
  /** Bus en servicio bajo este porcentaje se considera casi vacío. */
  nearlyEmptyPercent: 20,
  /** Dos buses en la misma ruta y sentido más cercanos que esto se consideran agrupados. */
  bunchingMeters: 400,
};

/** Fuentes con conteo de abordajes por puerta. */
export const sourcesWithBoardings = new Set([
  "SIMULATED",
  "DOOR_COUNTER_3D",
  "DOOR_CAMERA",
]);

export function fareOf(routeId: string | null | undefined): number {
  return (routeId && fares[routeId]) || defaultFare;
}
