import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    platform_api_url: str
    api_key: str
    stream_base_url: str
    model: str
    analysis_fps: float
    confidence: float

    @staticmethod
    def from_env() -> "Settings":
        api_key = os.environ.get("VISION_API_KEY", "")
        if not api_key:
            raise RuntimeError("Falta VISION_API_KEY")
        return Settings(
            platform_api_url=os.environ.get("PLATFORM_API_URL", "http://api:8080"),
            api_key=api_key,
            # Se lee el video desde el gateway, nunca desde la cámara: la cámara atiende una sola
            # conexión y este servicio no necesita sus credenciales.
            stream_base_url=os.environ.get("STREAM_BASE_URL", "rtsp://streaming:8554"),
            model=os.environ.get("MODEL", "yolo26n.pt"),
            # Frames analizados por segundo, independiente de los FPS de la cámara.
            analysis_fps=float(os.environ.get("ANALYSIS_FPS", "2")),
            confidence=float(os.environ.get("CONFIDENCE", "0.5")),
        )
