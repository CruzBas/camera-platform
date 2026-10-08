"use client";

import { useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, type Camera, type CameraInput, type SourceType } from "@/lib/api";

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "rtsp", label: "Cámara IP (RTSP) — TENVIS" },
  { value: "push", label: "Video publicado (push) — webcam de la Mac" },
];

type Props = {
  /** Si se pasa, el diálogo edita esa cámara; si no, crea una nueva. */
  camera?: Camera;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "default" | "sm";
  onSaved: (camera: Camera) => void;
};

export function CameraFormDialog({
  camera,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "default",
  onSaved,
}: Props) {
  const editing = camera !== undefined;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [streamKeyTouched, setStreamKeyTouched] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("rtsp");
  const [sourceUrl, setSourceUrl] = useState("");
  const [route, setRoute] = useState("");
  const [capacity, setCapacity] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setName(camera?.name ?? "");
      setStreamKey(camera?.streamKey ?? "");
      setStreamKeyTouched(editing);
      setSourceType(camera?.sourceType ?? "rtsp");
      setSourceUrl("");
      setRoute(camera?.route ?? "");
      setCapacity(camera?.capacity?.toString() ?? "");
      setErrors({});
      setFormError(null);
    }
    setOpen(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    const body: CameraInput = {
      name,
      sourceType,
      sourceUrl: sourceType === "rtsp" ? sourceUrl.trim() || null : null,
      route: route.trim() || null,
      capacity: capacity ? Number(capacity) : null,
      ...(editing ? {} : { streamKey }),
    };
    try {
      const saved = await api<Camera>(editing ? `/api/cameras/${camera.id}` : "/api/cameras", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setOpen(false);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
      else setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const keepsStoredUrl = editing && camera.sourceType === "rtsp" && sourceType === "rtsp";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cámara" : "Agregar cámara"}</DialogTitle>
            <DialogDescription>
              La plataforma configura el gateway de video automáticamente al guardar.
            </DialogDescription>
          </DialogHeader>

          <Field id="name" label="Nombre" errors={errors.name}>
            <Input
              id="name"
              value={name}
              required
              maxLength={100}
              onChange={(e) => {
                setName(e.target.value);
                if (!streamKeyTouched) setStreamKey(slugify(e.target.value));
              }}
            />
          </Field>

          <Field
            id="streamKey"
            label="Clave de stream"
            hint={editing ? "No se puede cambiar." : "Minúsculas, números y guiones. Identifica el video en el gateway."}
            errors={errors.streamKey}
          >
            <Input
              id="streamKey"
              value={streamKey}
              disabled={editing}
              required
              maxLength={40}
              pattern="[a-z0-9][a-z0-9\-]*"
              onChange={(e) => {
                setStreamKey(e.target.value);
                setStreamKeyTouched(true);
              }}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field id="route" label="Ruta del bus" hint="Opcional." errors={errors.route}>
              <Input
                id="route"
                value={route}
                maxLength={100}
                placeholder="San José – Guadalupe"
                onChange={(e) => setRoute(e.target.value)}
              />
            </Field>
            <Field id="capacity" label="Capacidad" hint="Pasajeros que ve la cámara." errors={errors.capacity}>
              <Input
                id="capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={300}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
          </div>

          <Field id="sourceType" label="Fuente de video" errors={errors.sourceType}>
            <Select items={SOURCE_TYPES} value={sourceType} onValueChange={(v) => v && setSourceType(v as SourceType)}>
              <SelectTrigger id="sourceType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {sourceType === "rtsp" ? (
            <Field
              id="sourceUrl"
              label="URL RTSP"
              hint={
                keepsStoredUrl
                  ? `Actual: ${camera.sourceUrlMasked}. Déjalo vacío para conservarla.`
                  : "Ej.: rtsp://usuario:contraseña@192.168.1.50:554/11. Se guarda cifrada."
              }
              errors={errors.sourceUrl}
            >
              <Input
                id="sourceUrl"
                value={sourceUrl}
                required={!keepsStoredUrl}
                autoComplete="off"
                spellCheck={false}
                placeholder="rtsp://"
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </Field>
          ) : (
            <p className="rounded-lg bg-black/5 p-3 text-sm text-black/45">
              Después de guardar, publica la webcam desde la Mac con:
              <code className="mt-1 block font-mono text-black">
                scripts/mac-camera.sh {streamKey || "<clave>"}
              </code>
            </p>
          )}

          {formError && <p className="text-sm text-red-700">{formError}</p>}

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-black/45">{hint}</p>}
      {errors?.map((message) => (
        <p key={message} className="text-xs text-red-700">
          {message}
        </p>
      ))}
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
