"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircleIcon, XIcon } from "lucide-react";
import { helpTopic, type HelpKey } from "@/lib/help";
import type { Assumptions } from "@/lib/operator-settings";

interface HelpButtonProps {
  topic: HelpKey;
  assumptions: Assumptions;
  className?: string;
}

const WIDTH = 320;
const MARGIN = 10;

export function HelpButton({ topic, assumptions, className = "" }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        close();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !popoverRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const height = popoverRef.current.offsetHeight;

    // Alinear a la derecha del botón o ajustar a la pantalla
    let left = anchor.right - WIDTH;
    if (left < MARGIN) left = MARGIN;
    if (left + WIDTH > window.innerWidth - MARGIN) {
      left = window.innerWidth - WIDTH - MARGIN;
    }

    const below = anchor.bottom + 6;
    const top =
      below + height > window.innerHeight - MARGIN
        ? Math.max(MARGIN, anchor.top - height - 6)
        : below;

    setPosition({ top, left });
  }, [open]);

  const info = helpTopic(topic, assumptions);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPosition(null);
          setOpen((prev) => !prev);
        }}
        aria-label={`Ayuda: ${info.title}`}
        aria-expanded={open}
        className={`inline-flex items-center justify-center rounded-full p-0.5 text-black/35 hover:bg-black/5 hover:text-black/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1d7fe0] ${className}`}
      >
        <HelpCircleIcon className="size-3.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={info.title}
            style={{
              width: WIDTH,
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
            }}
            className="fixed z-50 rounded-xl border border-black/10 bg-white p-3.5 shadow-xl text-black animate-in fade-in-0 zoom-in-95 duration-100"
          >
            <div className="flex items-start justify-between gap-2 border-b border-black/5 pb-2">
              <h3 className="text-xs font-bold text-black">{info.title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-0.5 text-black/40 hover:bg-black/5 hover:text-black"
                aria-label="Cerrar ayuda"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>

            <p className="mt-2 text-[11.5px] leading-relaxed text-black/75">
              {info.what}
            </p>

            <div className="mt-2.5">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-black/45">
                Cómo se calcula
              </h4>
              <ul className="mt-1 space-y-1 text-[11px] leading-normal text-black/70">
                {info.how.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="mt-1 size-1 shrink-0 rounded-full bg-[#1d7fe0]" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            {info.note && (
              <p className="mt-2.5 border-t border-black/5 pt-2 text-[10px] text-black/40 italic">
                {info.note}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
