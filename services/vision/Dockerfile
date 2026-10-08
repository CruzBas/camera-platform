FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_CONFIG_DIR=/tmp/ultralytics

# OpenCV necesita estas librerías del sistema.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# PyTorch solo CPU: en Docker sobre Mac no hay GPU, y evita descargar ~2 GB de CUDA en x86.
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Los pesos del modelo quedan dentro de la imagen: el servicio arranca sin depender de Internet.
ARG MODEL=yolo26n.pt
ENV MODEL=/app/models/${MODEL}
RUN mkdir models && cd models && python -c "from ultralytics import YOLO; YOLO('${MODEL}')"

COPY app/ app/
RUN useradd --create-home vision
USER vision

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
