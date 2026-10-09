import type {
  OccupancyStatus,
  SensorSource,
  VehicleState,
} from "./occupancy-api";

// Niveles de ocupación GTFS-Realtime
export const statusDisplay: Record<
  OccupancyStatus,
  { label: string; color: string }
> = {
  EMPTY: { label: "Vacío", color: "#2e9e5b" },
  MANY_SEATS_AVAILABLE: { label: "Muchos asientos", color: "#5bb34a" },
  FEW_SEATS_AVAILABLE: { label: "Pocos asientos", color: "#d9a400" },
  STANDING_ROOM_ONLY: { label: "Solo de pie", color: "#e8730c" },
  CRUSHED_STANDING_ROOM_ONLY: { label: "Muy lleno", color: "#d1352b" },
  FULL: { label: "Lleno", color: "#8e1b2c" },
};

export const statusOrder = Object.keys(statusDisplay) as OccupancyStatus[];

export const staleColor = "#9aa0a6";

export const sourceDisplay: Record<SensorSource, string> = {
  DOOR_COUNTER_3D: "Contador de puerta",
  CABIN_CAMERA: "Cámara IA",
  DOOR_CAMERA: "Cámara de puerta",
  SIMULATED: "Simulado",
};

export function vehicleColor(vehicle: VehicleState): string {
  if (vehicle.stale || !vehicle.occupancy) return staleColor;
  return statusDisplay[vehicle.occupancy.status]?.color ?? staleColor;
}

export function formatAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 120) return `hace ${seconds} s`;
  if (seconds < 7200) return `hace ${Math.round(seconds / 60)} min`;
  return `hace ${Math.round(seconds / 3600)} h`;
}
