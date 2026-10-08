"use client";

import Link from "next/link";

import { CameraFormDialog } from "@/components/camera-form-dialog";
import { DeleteCameraDialog } from "@/components/delete-camera-dialog";
import { StatusPill } from "@/components/status-pill";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type Camera, useApi } from "@/lib/api";

export default function CamerasPage() {
  const { data: cameras, error, reload } = useApi<Camera[]>("/api/cameras");

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Unidades</h1>
        <CameraFormDialog triggerLabel="Agregar cámara" onSaved={reload} />
      </header>

      {error && <p className="text-red-700">No se pudieron cargar las unidades: {error.message}</p>}

      {cameras && (
        <Card>
          <CardContent>
            {cameras.length === 0 ? (
              <p className="text-sm text-black/45">Todavía no hay unidades registradas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Capacidad</TableHead>
                    <TableHead>Fuente de video</TableHead>
                    <TableHead>Clave de stream</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cameras.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link className="font-bold underline-offset-4 hover:underline" href={`/cameras/${c.id}`}>
                          {c.name}
                        </Link>
                        <p className="text-[13px] text-black/45">{c.route ?? "Sin ruta asignada"}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.capacity ? `${c.capacity} pasajeros` : <span className="text-black/35">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusPill text={c.sourceType === "rtsp" ? "RTSP" : "Push"} />
                          {c.sourceUrlMasked && (
                            <span className="max-w-56 truncate font-mono text-xs text-black/45">
                              {c.sourceUrlMasked}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-black/60">{c.streamKey}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <CameraFormDialog
                            camera={c}
                            triggerLabel="Editar"
                            triggerVariant="outline"
                            triggerSize="sm"
                            onSaved={reload}
                          />
                          <DeleteCameraDialog camera={c} triggerSize="sm" onDeleted={reload} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
