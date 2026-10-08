from datetime import datetime, timezone

import httpx

from .detector import Detection


class PlatformClient:
    """Endpoints internos de la API de la plataforma (autenticados con X-Api-Key)."""

    def __init__(self, base_url: str, api_key: str):
        self._http = httpx.Client(base_url=base_url, headers={"X-Api-Key": api_key}, timeout=5)

    def list_cameras(self) -> dict[str, str]:
        """{camera_id: stream_key}"""
        res = self._http.get("/internal/cameras")
        res.raise_for_status()
        return {c["id"]: c["streamKey"] for c in res.json()}

    def send_detections(self, camera_id: str, width: int, height: int, inference_ms: float,
                        detections: list[Detection]) -> None:
        res = self._http.post(f"/internal/cameras/{camera_id}/detections", json={
            "capturedAt": datetime.now(timezone.utc).isoformat(),
            "width": width,
            "height": height,
            "inferenceMs": round(inference_ms, 1),
            "detections": [{"label": d.label, "confidence": d.confidence, "box": d.box} for d in detections],
        })
        res.raise_for_status()

    def close(self) -> None:
        self._http.close()
