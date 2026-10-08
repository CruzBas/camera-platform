import threading
import time
from dataclasses import dataclass

import numpy as np
from ultralytics import YOLO

PERSON_CLASS = 0  # COCO


class FairLock:
    """
    Lock que atiende en orden de llegada. threading.Lock no garantiza orden y, con varias cámaras
    compartiendo el modelo, una puede acapararlo mientras las demás se quedan sin análisis.
    """

    def __init__(self):
        self._turn = threading.Condition()
        self._next_ticket = 0
        self._serving = 0

    def __enter__(self):
        with self._turn:
            ticket = self._next_ticket
            self._next_ticket += 1
            self._turn.wait_for(lambda: self._serving == ticket)

    def __exit__(self, *exc):
        with self._turn:
            self._serving += 1
            self._turn.notify_all()


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    box: list[float]  # [x1, y1, x2, y2] normalizado 0–1


class PersonDetector:
    """
    YOLO compartido por todas las cámaras. El modelo no es thread-safe, así que la inferencia se
    serializa por turnos: si la CPU no alcanza para el ritmo pedido, todas las cámaras bajan parejo.
    """

    def __init__(self, model_path: str, confidence: float):
        self._model = YOLO(model_path)
        self._confidence = confidence
        self._lock = FairLock()

    def detect(self, frame: np.ndarray) -> tuple[list[Detection], float]:
        """Devuelve las detecciones y el tiempo de inferencia en ms."""
        with self._lock:
            started = time.perf_counter()
            result = self._model.predict(frame, classes=[PERSON_CLASS], conf=self._confidence, verbose=False)[0]
            inference_ms = (time.perf_counter() - started) * 1000

        boxes = result.boxes
        detections = [
            Detection(
                label=result.names[int(cls)],
                confidence=round(float(conf), 3),
                box=[round(min(max(float(v), 0.0), 1.0), 4) for v in xyxyn],
            )
            for cls, conf, xyxyn in zip(boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxyn.tolist())
        ]
        return detections, inference_ms
