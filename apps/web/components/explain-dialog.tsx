"use client";

import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { periodLabels, type Period, type UsageRow } from "@/lib/kpis";
import { buildNarrative } from "@/lib/narrative";
import type { Assumptions } from "@/lib/operator-settings";

interface ExplainDialogProps {
  rows: UsageRow[];
  routeName: string | null;
  period: Period;
  dayLabel?: "hoy" | "ayer";
  assumptions: Assumptions;
}

export function ExplainDialog({
  rows,
  routeName,
  period,
  dayLabel = "hoy",
  assumptions,
}: ExplainDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const scopeLabel = `${routeName ?? "Toda la flota"} · ${dayLabel} · ${periodLabels[period].toLowerCase()}`;

  const paragraphs = useMemo(() => {
    return buildNarrative({
      rows,
      routeName,
      period,
      dayLabel,
      assumptions,
    });
  }, [rows, routeName, period, dayLabel, assumptions]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        `Rentabilidad operativa — ${scopeLabel}\n\n${paragraphs.join("\n\n")}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback si el portapapeles está bloqueado
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-[#1d7fe0]/30 text-[#1d7fe0] hover:bg-[#1d7fe0]/5 hover:text-[#1d7fe0] text-xs font-semibold"
          />
        }
      >
        <SparklesIcon className="size-3.5 text-[#1d7fe0]" />
        Explicar resultado
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#1d7fe0]/10 text-[#1d7fe0]">
              <SparklesIcon className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-black">
                Explicación de rentabilidad
              </DialogTitle>
              <DialogDescription className="text-xs text-black/50">
                {scopeLabel}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="my-2 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-[13px] leading-relaxed text-black/80">
          {paragraphs.map((p, index) => {
            const isLast = index === paragraphs.length - 1;
            return (
              <p
                key={index}
                className={
                  isLast
                    ? "rounded-lg border border-black/5 bg-black/[0.02] p-2.5 text-[11.5px] text-black/50 italic"
                    : index === 0
                    ? "font-medium text-black"
                    : ""
                }
              >
                {p}
              </p>
            );
          })}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5 text-xs"
          >
            {copied ? (
              <>
                <CheckIcon className="size-3.5 text-emerald-600" />
                <span>Copiado al portapapeles</span>
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" />
                <span>Copiar texto</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setOpen(false)}
            className="bg-[#1d7fe0] text-xs hover:bg-[#1a73c9]"
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
