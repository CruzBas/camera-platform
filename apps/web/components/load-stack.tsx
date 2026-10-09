import { groupBy, loadGroups, loadShares, type UsageRow } from "@/lib/kpis";

interface LoadStackProps {
  rows: UsageRow[];
  routeIds: string[];
  routeNames: Map<string, string>;
  selectedRoute: string | null;
  onSelectRoute: (routeId: string) => void;
}

export function LoadStack({
  rows,
  routeIds,
  routeNames,
  selectedRoute,
  onSelectRoute,
}: LoadStackProps) {
  const byRoute = groupBy(rows, (row) => row.routeId ?? "—");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {routeIds.map((routeId) => {
          const shares = loadShares(byRoute.get(routeId) ?? []);
          const isSelected = selectedRoute === routeId;
          const faded = selectedRoute !== null && !isSelected;
          const name = routeNames.get(routeId) ?? routeId;

          return (
            <button
              key={routeId}
              type="button"
              onClick={() => onSelectRoute(routeId)}
              className={`flex items-center gap-3 rounded-lg p-1.5 text-left transition-colors ${
                isSelected
                  ? "bg-[#1d7fe0]/10"
                  : faded
                  ? "opacity-40 hover:opacity-80"
                  : "hover:bg-black/[0.03]"
              }`}
            >
              <span
                className={`w-32 shrink-0 truncate text-[12px] font-medium ${
                  isSelected ? "font-bold text-[#1d7fe0]" : "text-black/80"
                }`}
                title={name}
              >
                {name}
              </span>

              <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-black/5">
                {shares.map((share, index) => {
                  if (share <= 0) return null;
                  const group = loadGroups[index];
                  return (
                    <div
                      key={group.label}
                      style={{
                        flexGrow: share,
                        backgroundColor: group.color,
                      }}
                      className="h-full transition-all"
                      title={`${name}: ${Math.round(share * 100)}% del tiempo ${group.label.toLowerCase()} (${group.range})`}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap items-center gap-4 text-[11px] text-black/60 pt-1">
        {loadGroups.map((group) => (
          <li key={group.label} className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-xs"
              style={{ backgroundColor: group.color }}
            />
            <span>
              {group.label} ({group.range})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
