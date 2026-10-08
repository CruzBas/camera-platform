#!/usr/bin/env bash
# Paso 0.1 del roadmap: valida la URL RTSP de la cámara (definida en .env).
#   scripts/probe-camera.sh          → muestra codec, resolución, FPS y audio
#   scripts/probe-camera.sh 600      → además lee el stream 600 s para probar estabilidad
# Usa FFmpeg vía Docker, no requiere instalarlo en el sistema.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Falta .env: cp .env.example .env y completa TENVIS_RTSP_URL" >&2; exit 1; }
url=$(grep -E '^TENVIS_RTSP_URL=' .env | cut -d= -f2-)
[ -n "$url" ] || { echo "TENVIS_RTSP_URL está vacío en .env" >&2; exit 1; }

image=linuxserver/ffmpeg:latest

echo "== Streams de la cámara =="
docker run --rm --entrypoint ffprobe "$image" -v error -rtsp_transport tcp -timeout 10000000 \
  -show_entries stream=codec_type,codec_name,profile,width,height,avg_frame_rate,sample_rate \
  -of default=noprint_wrappers=1 "$url"

if [ -n "${1:-}" ]; then
  echo "== Leyendo el stream durante $1 s =="
  docker run --rm --entrypoint ffmpeg "$image" -hide_banner -loglevel warning -stats \
    -rtsp_transport tcp -timeout 10000000 -i "$url" -t "$1" -f null -
  echo "OK: stream estable durante $1 s"
fi
