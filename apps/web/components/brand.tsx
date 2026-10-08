import { BusFrontIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Logo de InnoBus: círculo con el bus. `onDark` es la versión del fondo azul (círculo blanco, bus
 * azul marino); sobre fondo blanco se invierte para que el círculo no desaparezca.
 */
export function BrandLogo({ size, onDark = false }: { size: "sm" | "lg"; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        onDark ? "bg-white text-[#1e3a8a]" : "bg-[#1e3a8a] text-white",
        size === "lg" ? "size-20" : "size-9",
      )}
    >
      <BusFrontIcon className={size === "lg" ? "size-11" : "size-5"} aria-hidden />
    </span>
  );
}

/** Nombre de marca: primera parte en negrita, como «GAMMovil» en la app InnoBus. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("tracking-tight", className)}>
      <span className="font-bold">InnoBus</span>
      <span className="font-normal">TL</span>
    </span>
  );
}
