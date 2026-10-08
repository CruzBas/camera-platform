#!/bin/sh
# Republica el video de una cámara en un path que el navegador puede reproducir por WebRTC.
# Los navegadores no garantizan H.265 en WebRTC: lo que no sea H.264 se transcodifica (cuesta CPU y
# agrega algo de latencia); si ya es H.264 solo se copia. El audio se descarta: el dashboard lo
# reproduce silenciado.
#
# MediaMTX lo ejecuta (runOnAvailable) cuando la cámara entra en línea, lo reinicia si termina y lo detiene
# cuando la cámara se cae. La visión sigue leyendo el path original, sin pasar por aquí.
#
# Uso: web-stream.sh <path de la cámara> <path para el navegador>
set -eu

src="rtsp://127.0.0.1:${RTSP_PORT:-8554}/$1"
dst="rtsp://127.0.0.1:${RTSP_PORT:-8554}/$2"

codec=$(ffprobe -v error -rtsp_transport tcp -select_streams v:0 \
  -show_entries stream=codec_name -of csv=p=0 "$src")

if [ "$codec" = h264 ]; then
  exec ffmpeg -hide_banner -loglevel warning -rtsp_transport tcp -i "$src" \
    -map 0:v:0 -c:v copy -an -f rtsp -rtsp_transport tcp "$dst"
fi

# Baseline sin B-frames: lo decodifica cualquier navegador. Keyframe cada 2 s para que un
# espectador nuevo vea imagen enseguida.
exec ffmpeg -hide_banner -loglevel warning -rtsp_transport tcp -i "$src" \
  -map 0:v:0 -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -pix_fmt yuv420p \
  -force_key_frames 'expr:gte(t,n_forced*2)' -an -f rtsp -rtsp_transport tcp "$dst"
