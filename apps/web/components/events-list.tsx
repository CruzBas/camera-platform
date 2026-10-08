"use client";

import Link from "next/link";
import { useCallback } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DetectionEvent, useApi } from "@/lib/api";
import { eventLabel, formatDateTime, formatDuration, percent } from "@/lib/format";
import { useEventStarted } from "@/lib/realtime";

/** Eventos más recientes; los nuevos aparecen al instante por SignalR. */
export function EventsList({ cameraId, limit = 20 }: { cameraId?: string; limit?: number }) {
  const path = cameraId ? `/api/cameras/${cameraId}/events?limit=${limit}` : `/api/events?limit=${limit}`;
  const { data: events, error, setData } = useApi<DetectionEvent[]>(path);

  const onStarted = useCallback(
    (event: DetectionEvent) => {
      if (cameraId && event.cameraId !== cameraId) return;
      setData((current) => [event, ...(current ?? []).filter((e) => e.id !== event.id)].slice(0, limit));
    },
    [cameraId, limit, setData],
  );
  useEventStarted(onStarted);

  if (error) return <p className="text-sm text-red-700">No se pudieron cargar los eventos: {error.message}</p>;
  if (!events) return <p className="text-sm text-black/45">Cargando…</p>;
  if (events.length === 0) return <p className="text-sm text-black/45">Todavía no hay eventos.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Inicio</TableHead>
          <TableHead>Evento</TableHead>
          {!cameraId && <TableHead>Cámara</TableHead>}
          <TableHead className="text-right">Confianza</TableHead>
          <TableHead className="text-right">Personas</TableHead>
          <TableHead className="text-right">Duración</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="tabular-nums">{formatDateTime(e.startedAt)}</TableCell>
            <TableCell>{eventLabel(e.type)}</TableCell>
            {!cameraId && (
              <TableCell>
                <Link className="underline-offset-4 hover:underline" href={`/cameras/${e.cameraId}`}>
                  {e.cameraName}
                </Link>
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">{percent(e.maxConfidence)}</TableCell>
            <TableCell className="text-right tabular-nums">{e.maxCount}</TableCell>
            <TableCell className="text-right tabular-nums">{formatDuration(e.startedAt, e.lastSeenAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
