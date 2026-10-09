"use client";

import { useEffect, useRef, useState } from "react";
import L, { geoJSON, type PathOptions, type LayerGroup, type GeoJSON as LeafletGeoJSON } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";
import type { VehicleState } from "@/lib/occupancy-api";
import { inService } from "@/lib/kpis";
import { statusDisplay, vehicleColor } from "@/lib/display";
import { busIcon } from "@/lib/bus-icon";

const coronado: [number, number] = [9.955, -84.03];
const busZoom = 16;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<LeafletGeoJSON | null>(null);
  const markersLayerRef = useRef<LayerGroup | null>(null);
  const [routes, setRoutes] = useState<FeatureCollection | null>(null);
  const fittedRouteRef = useRef<string | null>(null);
  const prevSelectedIdRef = useRef<string | null>(null);

  // Cargar GeoJSON de rutas
  useEffect(() => {
    let active = true;
    fetch("/routes/coronado-routes-osm.geojson")
      .then((res) => res.json())
      .then((data) => {
        if (active) setRoutes(data);
      })
      .catch((err) => console.error("Error loading route geojson", err));

    return () => {
      active = false;
    };
  }, []);

  // Inicializar mapa de Leaflet una única vez con limpieza completa al desmontar
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: coronado,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapRef.current = map;

    const updateLabels = () => {
      try {
        const c = map.getContainer();
        if (c) c.classList.toggle("hide-labels", map.getZoom() < 14);
      } catch {}
    };
    updateLabels();
    map.on("zoomend", updateLabels);

    const resizeTimer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      map.off("zoomend", updateLabels);
      markersGroup.clearLayers();
      map.remove();
      mapRef.current = null;
      geojsonLayerRef.current = null;
      markersLayerRef.current = null;
      fittedRouteRef.current = null;
    };
  }, []);

  // Actualizar capa GeoJSON de rutas
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routes) return;

    if (geojsonLayerRef.current) {
      map.removeLayer(geojsonLayerRef.current);
      geojsonLayerRef.current = null;
    }

    const layer = L.geoJSON(routes, {
      style: routeStyle(routeId),
      interactive: false,
    }).addTo(map);

    geojsonLayerRef.current = layer;

    // Auto-ajustar mapa a la ruta seleccionada o general
    const key = routeId ?? "all";
    if (fittedRouteRef.current !== key) {
      const features = routeId
        ? routes.features.filter((f) => f.properties?.routeId === routeId)
        : routes.features;
      const focused: FeatureCollection = { ...routes, features };
      if (features.length > 0) {
        try {
          map.fitBounds(geoJSON(focused).getBounds(), { padding: [16, 16] });
        } catch {}
      }
      fittedRouteRef.current = key;
    }
  }, [routes, routeId]);

  // Actualizar Marcadores de Buses y seguimiento
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // Dispersión visual para buses en terminal/coincidentes
    const coordCounts = new Map<string, number>();
    const vehiclePositions = new Map<string, [number, number]>();

    for (const vehicle of vehicles) {
      if (!vehicle.location) continue;
      const active = inService(vehicle);
      const coordKey = `${vehicle.location.lat.toFixed(4)},${vehicle.location.lon.toFixed(4)}`;
      const count = coordCounts.get(coordKey) ?? 0;
      coordCounts.set(coordKey, count + 1);

      let lat = vehicle.location.lat;
      let lon = vehicle.location.lon;
      if (count > 0 && !active) {
        const angle = (count * 2 * Math.PI) / 8;
        const ring = Math.floor(count / 8) + 1;
        const radius = 0.00022 * ring;
        lat += radius * Math.cos(angle);
        lon += radius * Math.sin(angle);
      }
      vehiclePositions.set(vehicle.vehicleId, [lat, lon]);
    }

    for (const vehicle of vehicles) {
      if (!vehicle.location) continue;
      const isSelected = vehicle.vehicleId === selectedId;
      const active = inService(vehicle);
      const occ = vehicle.occupancy;
      const pos = vehiclePositions.get(vehicle.vehicleId) ?? [
        vehicle.location.lat,
        vehicle.location.lon,
      ];

      const marker = L.marker(pos, {
        icon: busIcon(
          vehicle.vehicleId,
          vehicleColor(vehicle),
          vehicle.stale ? null : vehicle.location.headingDeg,
          isSelected
        ),
        opacity: isSelected ? 1 : vehicle.stale ? 0.6 : active ? 1 : 0.45,
        zIndexOffset: isSelected ? 1000 : active ? 100 : 0,
      });

      const tooltipContent = `
        <div style="font-family: inherit;">
          <span style="font-weight: 600;">${vehicle.vehicleId}</span>
          ${
            active
              ? `${occ ? ` · ${occ.passengerCount}/${occ.capacity} pasajeros` : ""}<br/>
                 <span style="color: #047857; font-weight: 500;">
                   ${vehicle.stale ? "Sin reporte" : occ ? statusDisplay[occ.status]?.label ?? occ.status : "En ruta"}
                 </span>`
              : `<br/><span style="color: rgba(0,0,0,0.55); font-style: italic;">En terminal (estacionado)</span>`
          }
        </div>
      `;

      marker.bindTooltip(tooltipContent, { direction: "top" });
      marker.on("click", () => {
        onSelect?.(vehicle.vehicleId);
      });

      marker.addTo(markersGroup);
    }

    // Centrado suave o seguimiento al bus seleccionado
    if (selectedId) {
      const targetPos = vehiclePositions.get(selectedId);
      if (targetPos) {
        if (prevSelectedIdRef.current !== selectedId) {
          // Zoom inicial al seleccionar
          const targetZoom = Math.max(map.getZoom(), busZoom);
          map.flyTo(targetPos, targetZoom, { duration: 0.8 });
          prevSelectedIdRef.current = selectedId;
        } else {
          // Seguimiento continuo
          if (!map.getBounds().pad(-0.15).contains(targetPos)) {
            map.panTo(targetPos, { animate: true, duration: 0.5 });
          }
        }
      }
    } else {
      prevSelectedIdRef.current = null;
    }
  }, [vehicles, selectedId, onSelect]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-2xl border border-black/10 bg-white ${className}`}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
