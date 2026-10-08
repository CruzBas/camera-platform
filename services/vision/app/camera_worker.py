import logging
import threading
import time

import cv2
import numpy as np

from .detector import PersonDetector
from .platform_client import PlatformClient

log = logging.getLogger("vision.camera")

RECONNECT_DELAY_S = 2
TIMEOUT_MS = 5000
# Un frame más viejo que esto no se analiza: el stream está detenido o atrasado.
MAX_FRAME_AGE_S = 2


class CameraWorker:
    """
    Analiza una cámara con dos hilos:
    - lector: consume el stream RTSP a su ritmo y conserva solo el último frame (sin acumular atraso);
    - analizador: toma ese frame a `analysis_fps`, corre YOLO y envía el resultado a la plataforma.
    """

    def __init__(self, camera_id: str, stream_key: str, stream_url: str, detector: PersonDetector,
                 client: PlatformClient, analysis_fps: float):
        self.camera_id = camera_id
        self.stream_key = stream_key
        self._stream_url = stream_url
        self._detector = detector
        self._client = client
        self._interval = 1 / analysis_fps
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._latest: tuple[np.ndarray, float] | None = None
        self._threads = [
            threading.Thread(target=self._read_loop, name=f"read-{stream_key}", daemon=True),
            threading.Thread(target=self._analyze_loop, name=f"analyze-{stream_key}", daemon=True),
        ]
        self.connected = False
        self.stream_fps: float | None = None
        self.analyzed_frames = 0
        self.last_inference_ms: float | None = None
        self.last_error: str | None = None

    def start(self) -> None:
        for t in self._threads:
            t.start()

    def stop(self) -> None:
        self._stop.set()
        for t in self._threads:
            t.join(timeout=TIMEOUT_MS / 1000 + 1)

    def status(self) -> dict:
        return {
            "cameraId": self.camera_id,
            "streamKey": self.stream_key,
            "connected": self.connected,
            "streamFps": round(self.stream_fps, 1) if self.stream_fps else None,
            "analyzedFrames": self.analyzed_frames,
            "lastInferenceMs": round(self.last_inference_ms, 1) if self.last_inference_ms else None,
            "lastError": self.last_error,
        }

    def _read_loop(self) -> None:
        while not self._stop.is_set():
            cap = cv2.VideoCapture(self._stream_url, cv2.CAP_FFMPEG, [
                cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, TIMEOUT_MS,
                cv2.CAP_PROP_READ_TIMEOUT_MSEC, TIMEOUT_MS,
            ])
            if cap.isOpened():
                self._set_connected(True)
                frames, window_start = 0, time.monotonic()
                while not self._stop.is_set():
                    ok, frame = cap.read()
                    if not ok:
                        break
                    with self._lock:
                        self._latest = (frame, time.monotonic())
                    frames += 1
                    elapsed = time.monotonic() - window_start
                    if elapsed >= 5:
                        self.stream_fps = frames / elapsed
                        frames, window_start = 0, time.monotonic()
            cap.release()
            self._set_connected(False)
            self._stop.wait(RECONNECT_DELAY_S)

    def _analyze_loop(self) -> None:
        last_analyzed_at = 0.0
        next_run = time.monotonic()
        # La espera descuenta lo que tardó la inferencia, para sostener `analysis_fps`.
        while not self._stop.wait(max(0.0, next_run - time.monotonic())):
            next_run = max(next_run + self._interval, time.monotonic())
            with self._lock:
                latest = self._latest
            if latest is None:
                continue
            frame, captured_at = latest
            if captured_at == last_analyzed_at or time.monotonic() - captured_at > MAX_FRAME_AGE_S:
                continue
            last_analyzed_at = captured_at

            try:
                detections, inference_ms = self._detector.detect(frame)
                height, width = frame.shape[:2]
                self._client.send_detections(self.camera_id, width, height, inference_ms, detections)
                self.analyzed_frames += 1
                self.last_inference_ms = inference_ms
                self._set_error(None)
            except Exception as ex:  # noqa: BLE001 — un fallo puntual no debe detener el análisis
                self._set_error(str(ex))

    def _set_connected(self, connected: bool) -> None:
        if connected != self.connected:
            log.info("[%s] stream %s", self.stream_key, "conectado" if connected else "desconectado")
        self.connected = connected
        if not connected:
            self.stream_fps = None

    def _set_error(self, error: str | None) -> None:
        if error and error != self.last_error:
            log.warning("[%s] %s", self.stream_key, error)
        self.last_error = error
