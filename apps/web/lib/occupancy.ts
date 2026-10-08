import type { StatusTone } from "@/components/status-pill";

/** Mismos niveles que `nivelOcupacion` de la app InnoBus: alta desde 70 %, media desde 40 %. */
export function occupancy(people: number, capacity: number) {
  const percent = Math.round((people / capacity) * 100);
  const level: { text: string; tone: StatusTone } =
    percent >= 70
      ? { text: "Alta ocupación", tone: "error" }
      : percent >= 40
        ? { text: "Ocupación media", tone: "warning" }
        : { text: "Baja ocupación", tone: "success" };
  return { percent, ...level };
}
