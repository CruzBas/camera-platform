"use client";

import { StatusPill } from "@/components/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Camera, type CameraStatus, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const REFRESH_MS = 3000;

export function CameraStatusCard({ camera }: { camera: Camera }) {
  const { data: status, error } = useApi<CameraStatus>(`/api/cameras/${camera.id}/status`, REFRESH_MS);
  const stream = status?.stream;
  const analysis = status?.analysis;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {error && <p className="text-red-700">No se pudo obtener el estado: {error.message}</p>}

        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium">Video</span>
            {stream && (
              <StatusPill
                text={stream.online ? "En línea" : stream.configured ? "Sin señal" : "Configurando"}
                tone={stream.online ? "success" : stream.configured ? "error" : "warning"}
              />
            )}
          </div>
          {stream && !stream.online && (
            <p className="text-black/45">{offlineHint(camera, stream.configured)}</p>
          )}
          {stream?.online && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-black/45">
              <dt>Codec</dt>
              <dd>{stream.codec ?? "—"}</dd>
              <dt>Resolución</dt>
              <dd>{stream.width ? `${stream.width}×${stream.height}` : "—"}</dd>
              <dt>Espectadores</dt>
              <dd>{stream.viewers}</dd>
              <dt>En línea desde</dt>
              <dd>{stream.onlineSince ? formatDateTime(stream.onlineSince) : "—"}</dd>
            </dl>
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium">Análisis (YOLO)</span>
            {analysis && (
              <StatusPill text={analysis.active ? "Activo" : "Inactivo"} tone={analysis.active ? "info" : "neutral"} />
            )}
          </div>
          {analysis?.active ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-black/45">
              <dt>Frames analizados</dt>
              <dd>{analysis.fps?.toFixed(1)} por segundo</dd>
              <dt>Inferencia</dt>
              <dd>{analysis.inferenceMs?.toFixed(0)} ms</dd>
            </dl>
          ) : (
            analysis && (
              <p className="text-black/45">
                {analysis.lastFrameAt
                  ? `Último frame analizado: ${formatDateTime(analysis.lastFrameAt)}`
                  : "Aún no se ha analizado ningún frame."}
              </p>
            )
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function offlineHint(camera: Camera, configured: boolean) {
  if (!configured) return "El gateway todavía no tiene este stream; se configura en unos segundos.";
  return camera.sourceType === "push"
    ? `Esperando video. Publica la webcam con: scripts/mac-camera.sh ${camera.streamKey}`
    : "El gateway reintenta conectarse a la cámara. Revisa IP, usuario, contraseña y ruta RTSP.";
}
