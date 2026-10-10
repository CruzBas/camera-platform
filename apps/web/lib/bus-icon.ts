import { divIcon, type DivIcon } from "leaflet";

const cache = new Map<string, DivIcon>();

export function busIcon(
  vehicleId: string,
  color: string,
  headingDeg: number | null | undefined,
  selected: boolean
): DivIcon {
  const heading = headingDeg == null ? null : Math.round(headingDeg);
  const key = `${vehicleId}|${color}|${heading}|${selected}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const size = selected ? 38 : 28;
  const ring = selected ? "#111" : "#fff";
  const arrow =
    heading == null
      ? ""
      : `<g transform="rotate(${heading})"><path d="M0 -22 L6 -11 L-6 -11 Z" fill="#1c2430" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>`;

  const icon = divIcon({
    className: selected ? "bus-icon selected" : "bus-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
    html: `<svg viewBox="-20 -20 40 40" width="${size}" height="${size}" aria-hidden="true">
      ${arrow}
      <circle r="11" fill="${color}" stroke="${ring}" stroke-width="${selected ? 2.5 : 2}"/>
      <rect x="-6" y="-7" width="12" height="12" rx="2.5" fill="#fff"/>
      <rect x="-4.5" y="-5.5" width="9" height="4.5" rx="1" fill="${color}"/>
      <circle cx="-3" cy="2.3" r="1.1" fill="${color}"/>
      <circle cx="3" cy="2.3" r="1.1" fill="${color}"/>
      <rect x="-5" y="5" width="2.4" height="2.2" rx="0.6" fill="#fff"/>
      <rect x="2.6" y="5" width="2.4" height="2.2" rx="0.6" fill="#fff"/>
    </svg><span class="bus-label">${vehicleId}</span>`,
  });

  cache.set(key, icon);
  return icon;
}
