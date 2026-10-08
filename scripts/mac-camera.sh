#!/usr/bin/env bash
# Publica la webcam de la Mac en el gateway como si fuera una cámara IP (H.264 por RTSP).
# Docker en macOS no puede acceder a la cámara, por eso esto corre fuera de Docker.
#
#   scripts/mac-camera.sh            → publica en el stream "mac"
#   scripts/mac-camera.sh otra-clave → publica en el stream "otra-clave"
#
# Antes, registra en el dashboard una cámara de tipo "Push" con la misma clave de stream.
# Requiere: brew install ffmpeg. La primera vez, macOS pedirá permiso de cámara para la terminal.
set -euo pipefail

stream_key=${1:-mac}
device=${MAC_CAMERA_DEVICE:-0}   # índice de: ffmpeg -f avfoundation -list_devices true -i ""
target="rtsp://127.0.0.1:8554/${stream_key}"

command -v ffmpeg >/dev/null || { echo "Falta FFmpeg: brew install ffmpeg" >&2; exit 1; }

echo "Publicando la cámara ${device} en ${target} (Ctrl+C para detener)"
while true; do
  # Codificador por hardware (VideoToolbox): deja la CPU libre para YOLO.
  # Baseline sin B-frames y keyframe cada segundo: requisito de WebRTC y arranque rápido del video.
  ffmpeg -hide_banner -loglevel warning \
    -f avfoundation -framerate 30 -video_size 1280x720 -pixel_format nv12 -i "${device}:none" \
    -c:v h264_videotoolbox -realtime 1 -profile:v baseline -bf 0 -pix_fmt yuv420p \
    -g 30 -b:v 2500k -maxrate 2500k -bufsize 2500k \
    -f rtsp -rtsp_transport tcp "${target}" || true
  echo "Conexión perdida (¿gateway apagado o stream no registrado?). Reintentando en 3 s…" >&2
  sleep 3
done
