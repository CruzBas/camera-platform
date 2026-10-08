#!/usr/bin/env bash
# Prueba de recuperación ante caída de cámara (Definition of Done del MVP).
#
# Con la plataforma corriendo (docker compose up -d), levanta una cámara RTSP simulada, la registra
# por la API y comprueba que la plataforma:
#   1. la ve en línea y la analiza;
#   2. detecta cuando se cae;
#   3. se reconecta sola cuando vuelve;
#   4. recrea los streams si el gateway (MediaMTX) se reinicia.
# Al terminar elimina la cámara y los contenedores de prueba. Sale con código ≠ 0 si algo falla.
set -euo pipefail
cd "$(dirname "$0")/.."

API=http://localhost:5080
NETWORK=camera-platform_default
CAM=recovery-test-cam
FEED=recovery-test-feed
jar=$(mktemp)
camera_id=""

env_value() { grep -E "^$1=" .env | cut -d= -f2-; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

cleanup() {
  [ -n "$camera_id" ] && curl -s -b "$jar" -X DELETE "$API/api/cameras/$camera_id" >/dev/null || true
  docker rm -f "$CAM" "$FEED" >/dev/null 2>&1 || true
  rm -f "$jar"
}
trap cleanup EXIT

status() {
  curl -s -b "$jar" "$API/api/cameras/$camera_id/status" \
    | json '"online=%s analysis=%s" % (d["stream"]["online"], d["analysis"]["active"])'
}

expect() { # expect <texto> <segundos> <descripción>
  local start=$SECONDS current
  while (( SECONDS - start < $2 )); do
    current=$(status)
    if [[ "$current" == *"$1"* ]]; then
      echo "  ✓ $3 (${current}, $((SECONDS - start)) s)"
      return
    fi
    sleep 1
  done
  echo "  ✗ $3: se esperaba '$1' y el estado es '$(status)'" >&2
  exit 1
}

echo "Levantando cámara simulada…"
docker run -d --name "$CAM" --network "$NETWORK" bluenviron/mediamtx:1.21.1 >/dev/null
sleep 1
start_feed() {
  docker run -d --name "$FEED" --network "$NETWORK" linuxserver/ffmpeg:latest \
    -hide_banner -loglevel error -re -f lavfi -i testsrc2=size=1280x720:rate=15 \
    -c:v libx264 -preset veryfast -tune zerolatency -g 15 -pix_fmt yuv420p \
    -f rtsp -rtsp_transport tcp "rtsp://$CAM:8554/11" >/dev/null
}
start_feed

echo "Registrando la cámara en la plataforma…"
curl -sf -c "$jar" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$(env_value ADMIN_EMAIL)\",\"password\":\"$(env_value ADMIN_PASSWORD)\"}" \
  "$API/api/auth/login" >/dev/null
camera_id=$(curl -sf -b "$jar" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Prueba de recuperación\",\"streamKey\":\"recovery-test\",\"sourceType\":\"rtsp\",\"sourceUrl\":\"rtsp://$CAM:8554/11\"}" \
  "$API/api/cameras" | json 'd["id"]')

echo "1. Cámara en línea"
expect "online=True analysis=True" 60 "video en línea y análisis activo"

echo "2. Caída de la cámara"
docker rm -f "$FEED" >/dev/null
expect "online=False" 30 "la plataforma detecta la caída"

echo "3. La cámara vuelve"
start_feed
expect "online=True analysis=True" 60 "reconexión automática"

echo "4. Reinicio del gateway"
docker compose restart streaming >/dev/null 2>&1
expect "online=True analysis=True" 60 "streams recreados y análisis reanudado"

echo "OK: la plataforma se recupera de caídas de cámara y de reinicios del gateway."
