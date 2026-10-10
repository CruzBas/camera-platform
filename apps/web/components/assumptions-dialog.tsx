"use client";

import { Settings2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  defaultAssumptions,
  fareSource,
  fares,
  thresholds,
  type Assumptions,
} from "@/lib/operator-settings";
import { breakEven, formatColones, formatOne } from "@/lib/kpis";

interface AssumptionsDialogProps {
  assumptions: Assumptions;
  onChange: (assumptions: Assumptions) => void;
  onReset: () => void;
  isDefault: boolean;
}

export function AssumptionsDialog({
  assumptions,
  onChange,
  onReset,
  isDefault,
}: AssumptionsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-black/10 bg-white text-black/70 hover:bg-black/5 hover:text-black"
          />
        }
      >
        <Settings2Icon className="size-4" />
        Supuestos de cálculo
        {!isDefault && (
          <span
            className="size-2 rounded-full bg-[#1d7fe0]"
            title="Valores personalizados"
          />
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Supuestos de rentabilidad operativa</DialogTitle>
          <DialogDescription>
            Tarifas oficiales y estimaciones de costo aplicadas al cálculo de ingresos y pérdidas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="costPerBusHour">Costo por hora-bus (₡)</Label>
              <Input
                id="costPerBusHour"
                type="number"
                min={1000}
                step={100}
                value={assumptions.costPerBusHour}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > 0) onChange({ ...assumptions, costPerBusHour: val });
                }}
              />
              <span className="text-[11px] text-black/45">
                {assumptions.costPerBusHour === defaultAssumptions.costPerBusHour
                  ? "Estimación del equipo (₡10 500–16 550)."
                  : "Valor personalizado en este navegador."}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seniorShare">Adultos mayores (% gratis)</Label>
              <Input
                id="seniorShare"
                type="number"
                min={0}
                max={50}
                step={1}
                value={Math.round(assumptions.seniorShare * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 0 && val < 100)
                    onChange({ ...assumptions, seniorShare: val / 100 });
                }}
              />
              <span className="text-[11px] text-black/45">
                {assumptions.seniorShare === defaultAssumptions.seniorShare
                  ? "Supuesto preliminar de exoneración (12%)."
                  : "Valor personalizado en este navegador."}
              </span>
            </div>
          </div>

          {!isDefault && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="text-xs text-[#1d7fe0] hover:text-[#1d7fe0]/80"
              >
                Restablecer a valores por defecto
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-black/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 text-xs">Tarifa</TableHead>
                  <TableHead className="py-2 text-xs">Rutas / Ramales</TableHead>
                  <TableHead className="py-2 text-xs text-right">
                    Equilibrio (abordajes/h-bus)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...new Set(Object.values(fares))]
                  .sort((a, b) => b - a)
                  .map((fare) => (
                    <TableRow key={fare}>
                      <TableCell className="py-1.5 font-medium text-xs">
                        {formatColones(fare)}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-black/60">
                        {Object.entries(fares)
                          .filter(([, f]) => f === fare)
                          .map(([id]) => id)
                          .join(", ")}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs font-semibold tabular-nums text-right">
                        {formatOne(breakEven(fare, assumptions))}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg bg-black/[0.03] p-3 text-xs text-black/60 flex flex-col gap-1">
            <p>• {fareSource}.</p>
            <p>• Equilibrio = costo por hora-bus ÷ (tarifa × (1 − adultos mayores)).</p>
            <p>
              • Umbrales: Saturado ≥ {thresholds.crowdedPercent} %, Casi vacío &lt;{" "}
              {thresholds.nearlyEmptyPercent} %.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
