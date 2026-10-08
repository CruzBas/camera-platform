"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { CameraFormDialog } from "@/components/camera-form-dialog";
import { CameraLive } from "@/components/camera-live";
import { CameraStatusCard } from "@/components/camera-status";
import { DeleteCameraDialog } from "@/components/delete-camera-dialog";
import { EventsList } from "@/components/events-list";
import { StatusPill } from "@/components/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Camera, useApi } from "@/lib/api";

export default function CameraPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: camera, error, setData } = useApi<Camera>(`/api/cameras/${id}`);

  if (error?.status === 404) {
    return (
      <p className="text-black/45">
        La cámara no existe.{" "}
        <Link className="underline" href="/cameras">
          Volver a cámaras
        </Link>
      </p>
    );
  }
  if (error) return <p className="text-red-700">No se pudo cargar la cámara: {error.message}</p>;
  if (!camera) return null;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold">{camera.name}</h1>
          {camera.route && <p className="text-[15px] text-black/45">{camera.route}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-black/45">
            <StatusPill text={camera.sourceType === "rtsp" ? "RTSP" : "Push"} />
            {camera.capacity && <StatusPill text={`Capacidad ${camera.capacity}`} tone="info" />}
            <span className="font-mono">{camera.sourceUrlMasked ?? `stream: ${camera.streamKey}`}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <CameraFormDialog camera={camera} triggerLabel="Editar" triggerVariant="outline" onSaved={setData} />
          <DeleteCameraDialog camera={camera} onDeleted={() => router.push("/cameras")} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CameraLive camera={camera} />
        </div>
        <CameraStatusCard camera={camera} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos de esta cámara</CardTitle>
        </CardHeader>
        <CardContent>
          <EventsList cameraId={camera.id} limit={50} />
        </CardContent>
      </Card>
    </>
  );
}
