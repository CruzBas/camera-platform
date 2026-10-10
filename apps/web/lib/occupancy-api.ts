// Tipos de respuesta de la API de Ocupación / Simulador de flota.

export type OccupancyStatus =
  | "EMPTY"
  | "MANY_SEATS_AVAILABLE"
  | "FEW_SEATS_AVAILABLE"
  | "STANDING_ROOM_ONLY"
  | "CRUSHED_STANDING_ROOM_ONLY"
  | "FULL";

export type SensorSource =
  | "DOOR_COUNTER_3D"
  | "CABIN_CAMERA"
  | "DOOR_CAMERA"
  | "SIMULATED";

export type TravelDirection = "INBOUND" | "OUTBOUND";

export interface GeoLocation {
  lat: number;
  lon: number;
  speedKmh?: number | null;
  headingDeg?: number | null;
}

export interface OccupancySnapshot {
  passengerCount: number;
  capacity: number;
  percent: number;
  status: OccupancyStatus;
  source: SensorSource;
  measuredAt: string;
}

export interface DeviceHealth {
  online: boolean;
  lastSeen: string;
  cameraOnline: boolean | null;
  firmware: string | null;
}

export interface VehicleState {
  vehicleId: string;
  asOf: string;
  stale: boolean;
  location: GeoLocation | null;
  trip: { routeId: string; direction: TravelDirection } | null;
  occupancy: OccupancySnapshot | null;
  device: DeviceHealth;
}

export interface VehicleList {
  vehicles: VehicleState[];
}

export interface HourlyUsage {
  hour: string;
  routeId: string | null;
  source: SensorSource | null;
  serviceSeconds: number;
  boardings: number;
  alightings: number;
  averagePercent: number;
  peakPercent: number;
  secondsByBand: number[];
}

export interface BusHourlyUsage {
  vehicleId: string;
  routeId: string | null;
  capacity: number | null;
  hours: HourlyUsage[];
}

export interface FleetHourlyUsage {
  from: string;
  to: string;
  buses: BusHourlyUsage[];
}

// En el cliente Next.js pasamos por el rewrite /occupancy configurado en next.config.ts
const baseUrl = "/occupancy";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.title ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getVehicles(signal?: AbortSignal): Promise<VehicleList> {
  return getJson<VehicleList>("/api/v1/vehicles", signal);
}

/** Por unidad y por hora. Sin rango: hoy en Costa Rica, desde medianoche hasta ahora. */
export function getFleetHourly(
  range: { from: Date; to: Date } | null,
  signal?: AbortSignal
): Promise<FleetHourlyUsage> {
  const query = range
    ? `?${new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      })}`
    : "";
  return getJson<FleetHourlyUsage>(`/api/v1/fleet/hourly${query}`, signal);
}
