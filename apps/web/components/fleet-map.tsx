"use client";

import dynamic from "next/dynamic";
import type { FleetMapProps } from "./fleet-map-inner";

const DynamicFleetMap = dynamic(() => import("./fleet-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[360px] h-full w-full items-center justify-center rounded-2xl border border-black/10 bg-white text-sm text-black/45">
      Cargando mapa de flota…
    </div>
  ),
});

export function FleetMap(props: FleetMapProps) {
  return <DynamicFleetMap {...props} />;
}
