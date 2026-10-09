import logging
import threading

from .camera_worker import CameraWorker
from .config import Settings
from .detector import PersonDetector
from .platform_client import PlatformClient
from .rfdetr_detector import RfDetrDetector

log = logging.getLogger("vision.supervisor")

REFRESH_INTERVAL_S = 10


class Supervisor:
    """Mantiene un CameraWorker por cada cámara registrada en la plataforma."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = PlatformClient(settings.platform_api_url, settings.api_key)
        if settings.detector == "rfdetr":
            log.info("Iniciando detector RF-DETR ONNX desde %s", settings.rfdetr_model_path)
            self._detector = RfDetrDetector(settings.rfdetr_model_path, settings.confidence)
        else:
            log.info("Iniciando detector YOLO desde %s", settings.model)
            self._detector = PersonDetector(settings.model, settings.confidence)
        self._workers: dict[str, CameraWorker] = {}
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="supervisor", daemon=True)
        self.platform_reachable = False

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join()
        for worker in list(self._workers.values()):
            worker.stop()
        self._client.close()

    def status(self) -> dict:
        return {
            "platformReachable": self.platform_reachable,
            "analysisFps": self._settings.analysis_fps,
            "cameras": [w.status() for w in list(self._workers.values())],
        }

    def _run(self) -> None:
        while not self._stop.is_set():
            self._sync()
            self._stop.wait(REFRESH_INTERVAL_S)

    def _sync(self) -> None:
        try:
            cameras = self._client.list_cameras()
        except Exception as ex:  # noqa: BLE001 — la API puede estar arrancando; se reintenta
            if self.platform_reachable:
                log.warning("No se pudo obtener la lista de cámaras: %s", ex)
            self.platform_reachable = False
            return
        self.platform_reachable = True

        for camera_id in set(self._workers) - set(cameras):
            log.info("Deteniendo análisis de %s", self._workers[camera_id].stream_key)
            self._workers.pop(camera_id).stop()

        for camera_id, stream_key in cameras.items():
            if camera_id in self._workers:
                continue
            log.info("Iniciando análisis de %s", stream_key)
            worker = CameraWorker(camera_id, stream_key, f"{self._settings.stream_base_url}/{stream_key}",
                                  self._detector, self._client, self._settings.analysis_fps)
            worker.start()
            self._workers[camera_id] = worker
