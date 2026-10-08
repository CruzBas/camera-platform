export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

/** Mismos colores que `EtiquetaEstado` de la app InnoBus. */
const TONES: Record<StatusTone, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-black/5 text-black/55",
};

/** Pastilla de estado: en línea, sin señal, activo, tipo de fuente… */
export function StatusPill({ text, tone = "neutral" }: { text: string; tone?: StatusTone }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {text}
    </span>
  );
}
