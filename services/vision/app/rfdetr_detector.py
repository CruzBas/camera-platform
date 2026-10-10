import math
import time
import numpy as np
import onnxruntime as ort

from .detector import Detection, FairLock

MODEL_SIZE = 640
INPUT_NAME = "input"
BOXES_OUTPUT = "dets"
LABELS_OUTPUT = "labels"

MEANS = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
STDS = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)

CLASSES = {
    1: "sitting",
    2: "standing",
}


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


class RfDetrDetector:
    """
    Detector RF-DETR ONNX entrenado para pasajeros de autobús (clases sitting / standing).
    Utiliza onnxruntime y replica el preprocesamiento y decodificación de PassengerImageAnalyzer.cs.
    """

    def __init__(self, model_path: str, confidence: float):
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self._session = ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])
        self._confidence = confidence
        self._lock = FairLock()

    def detect(self, frame: np.ndarray) -> tuple[list[Detection], float]:
        """
        frame: array BGR uint8 (H, W, 3).
        Devuelve (detections, inference_ms).
        """
        import cv2

        # 1. Redimensionar a 640x640 y convertir a RGB
        resized = cv2.resize(frame, (MODEL_SIZE, MODEL_SIZE), interpolation=cv2.INTER_CUBIC)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        # 2. Normalización ImageNet: (pixel / 255 - mean) / std -> forma [1, 3, 640, 640]
        tensor = rgb.astype(np.float32) / 255.0
        tensor = np.transpose(tensor, (2, 0, 1))  # (3, 640, 640)
        tensor = np.expand_dims(tensor, axis=0)  # (1, 3, 640, 640)
        tensor = (tensor - MEANS) / STDS

        with self._lock:
            started = time.perf_counter()
            outputs = self._session.run(
                [BOXES_OUTPUT, LABELS_OUTPUT],
                {INPUT_NAME: tensor},
            )
            inference_ms = (time.perf_counter() - started) * 1000

        boxes_tensor, labels_tensor = outputs[0], outputs[1]
        # boxes_tensor: [1, 300, 4] -> cx, cy, w, h normalizados
        # labels_tensor: [1, 300, 3] -> logits de clasificación

        num_queries = boxes_tensor.shape[1]
        detections: list[Detection] = []

        for q in range(num_queries):
            best_class = None
            best_score = -1.0

            for col_idx, class_name in CLASSES.items():
                logit = float(labels_tensor[0, q, col_idx])
                score = _sigmoid(logit)
                if score > best_score:
                    best_score = score
                    best_class = class_name

            if best_class is None or best_score < self._confidence:
                continue

            cx = float(boxes_tensor[0, q, 0])
            cy = float(boxes_tensor[0, q, 1])
            w = float(boxes_tensor[0, q, 2])
            h = float(boxes_tensor[0, q, 3])

            x1 = round(min(max(cx - w / 2.0, 0.0), 1.0), 4)
            y1 = round(min(max(cy - h / 2.0, 0.0), 1.0), 4)
            x2 = round(min(max(cx + w / 2.0, 0.0), 1.0), 4)
            y2 = round(min(max(cy + h / 2.0, 0.0), 1.0), 4)

            detections.append(
                Detection(
                    label=best_class,
                    confidence=round(best_score, 3),
                    box=[x1, y1, x2, y2],
                )
            )

        detections.sort(key=lambda d: d.confidence, reverse=True)
        return detections, inference_ms
