"use client";

export interface RouteOption {
  id: string;
  name: string;
}

interface RouteSelectorProps {
  routes: RouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
}

export function RouteSelector({
  routes,
  selectedRouteId,
  onSelectRoute,
}: RouteSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Filtro de rutas y ramales">
      <button
        type="button"
        role="tab"
        aria-selected={selectedRouteId === null}
        onClick={() => onSelectRoute(null)}
        className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
          selectedRouteId === null
            ? "bg-[#1d7fe0] text-white shadow-xs"
            : "border border-black/10 bg-white text-black/70 hover:bg-black/5 hover:text-black"
        }`}
      >
        Toda la flota
      </button>

      {routes.map((route) => {
        const isSelected = selectedRouteId === route.id;
        return (
          <button
            key={route.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelectRoute(isSelected ? null : route.id)}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              isSelected
                ? "bg-[#1d7fe0] text-white shadow-xs"
                : "border border-black/10 bg-white text-black/70 hover:bg-black/5 hover:text-black"
            }`}
          >
            {route.name}
          </button>
        );
      })}
    </div>
  );
}
