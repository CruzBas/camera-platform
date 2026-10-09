"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";
import { geoJSON, latLng, point, type PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";
import type { VehicleState } from "@/lib/occupancy-api";
import { statusDisplay, vehicleColor } from "@/lib/display";
import { busIcon } from "@/lib/bus-icon";

const coronado: [number, number] = [9.955, -84.03];
const busZoom = 15;

function routeStyle(routeId: string | null | undefined) {
  return (feature?: Feature): PathOptions => {
    const id = feature?.properties?.routeId;
    const focused = routeId ? id === routeId : id === "R142";
    return {
      color: focused ? "#1d7fe0" : "#4a63b8",
      weight: focused ? 4 : 2.5,
      opacity: routeId && !focused ? 0.3 : 0.75,
    };
  };
}

function FitTo({
  routes,
  routeId,
}: {
  routes: FeatureCollection | null;
  routeId?: string | null;
}) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const key = routeId ?? "all";
    if (!routes || fitted.current === key) return;
    const features = routeId
      ? routes.features.filter((f) => f.properties?.routeId === routeId)
      : routes.features;
    const focused: FeatureCollection = { ...routes, features };
    if (features.length > 0) {
      map.fitBounds(geoJSON(focused).getBounds(), { padding: [16, 16] });
    }
    fitted.current = key;
  }, [map, routes, routeId]);
  return null;
}

function LabelsByZoom() {
  const map = useMap();
  useEffect(() => {
    const update = () =>
      map.getContainer().classList.toggle("hide-labels", map.getZoom() < 14);
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);
  return null;
}

export interface FleetMapProps {
  vehicles: VehicleState[];
  selectedId?: string | null;
  routeId?: string | null;
  onSelect?: (vehicleId: string) => void;
  className?: string;
}

export default function FleetMapInner({
  vehicles,
  selectedId,
  routeId,
  onSelect,
  className = "",
}: FleetMapProps) {
  const [routes, setRoutes] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/routes/coronado-routes-osm.geojson")
      .then((res) => res.json())
      .then((data) => setRoutes(data))
      .catch((err) => console.error("Error loading route geojson", err));
  }, []);

  return (
    <div className={`relative h-full w-full min-h-[360px] overflow-hidden rounded-2xl border border-black/10 bg-white ${className}`}>
      <MapContainer
        center={coronado}
        zoom={13}
        className="h-full w-full"
        style={{ minHeight: "360px" }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        {routes && (
          <GeoJSON
            key={routeId ?? "all"}
            data={routes}
            style={routeStyle(routeId)}
            interactive={false}
          />
        )}
        <FitTo routes={routes} routeId={routeId} />
        <LabelsByZoom />
        {vehicles.map((vehicle) => {
          if (!vehicle.location) return null;
          const isSelected = vehicle.vehicleId === selectedId;
          const occ = vehicle.occupancy;
          return (
            <Marker
              key={vehicle.vehicleId}
              position={[vehicle.location.lat, vehicle.location.lon]}
              icon={busIcon(
                vehicle.vehicleId,
                vehicleColor(vehicle),
                vehicle.stale ? null : vehicle.location.headingDeg,
                isSelected
              )}
              opacity={vehicle.stale ? 0.75 : 1}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{
                click: () => onSelect?.(vehicle.vehicleId),
              }}
            >
              <Tooltip direction="top">
                <span className="font-semibold">{vehicle.vehicleId}</span>
                {occ && ` · ${occ.passengerCount}/${occ.capacity}`}
                <br />
                {vehicle.stale
                  ? "Sin reporte"
                  : occ
                  ? statusDisplay[occ.status]?.label ?? occ.status
                  : "Sin ocupación"}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
