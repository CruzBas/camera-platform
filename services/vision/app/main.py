import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import Settings
from .supervisor import Supervisor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx registra cada petición (varias por segundo por cámara); solo interesan los problemas.
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    supervisor = Supervisor(Settings.from_env())
    supervisor.start()
    app.state.supervisor = supervisor
    yield
    supervisor.stop()


app = FastAPI(title="Vision service", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/status")
def status() -> dict:
    """Estado por cámara: conexión al stream, FPS leídos, frames analizados y tiempo de inferencia."""
    return app.state.supervisor.status()
