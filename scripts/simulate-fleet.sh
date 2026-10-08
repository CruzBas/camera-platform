#!/usr/bin/env bash
# Simulación guiada de flota: 3 buses con cámara, pasajeros que suben y bajan en cada parada.
#
# Usa el pipeline real: cada bus publica video en el gateway, YOLO cuenta a las personas y el
# dashboard muestra imagen, pasajeros y ocupación en tiempo real. Mientras corre, el script narra
# qué mirar en http://localhost:3000.
#
#   scripts/simulate-fleet.sh                 → simulación guiada (Ctrl+C para terminar)
#   STOP_SECONDS=30 scripts/simulate-fleet.sh → paradas más largas (por defecto 20 s)
#   KEEP=1 scripts/simulate-fleet.sh          → al salir conserva las unidades y sus eventos
#
# Requiere la plataforma corriendo (docker compose up -d) y el dashboard (cd apps/web && npm run dev).
set -euo pipefail
cd "$(dirname "$0")/.."

API=http://localhost:5080
NETWORK=camera-platform_default
FFMPEG_IMAGE=linuxserver/ffmpeg:latest
STOP_SECONDS=${STOP_SECONDS:-20}
SOURCE_IMAGE_URL=https://ultralytics.com/images/bus.jpg

# Unidades y rutas de la flota de InnoBus (frontend/src/data/respaldo/flota.json).
# clave | placa | ruta | capacidad | personas en cada parada (escenas: 0, 1, 2, 3 o 5)
BUSES=(
  "sim-sjb-18600|SJB-18600|Ruta 142 · Coronado – San José centro|6|0 2 3 5 3 1"
  "sim-sjb-12437|SJB-12437|Ramal Patalillo|6|1 3 5 5 2 0"
  "sim-sjb-8927|SJB-8927|Ramal Dulce Nombre|6|3 5 2 1 0 2"
)
HINTS=(
  "Abre http://localhost:3000 → «Flota en vivo». La lista muestra cada bus con su ruta, pasajeros (conteo de YOLO), ocupación y transmisión."
  "Suben pasajeros: el conteo de cada bus y «Pasajeros a bordo» cambian en 1–2 s, sin recargar la página."
  "SJB-12437 llega a 5 de 6: «Alta ocupación» en rojo, y el indicador «Con ocupación alta» sube."
  "Toca un bus de la lista: se abre su cámara con una caja sobre cada persona y los datos de la transmisión. Tócalo de nuevo para cerrarla."
  "Ve a «Eventos»: cada vez que una unidad pasa de vacía a tener pasajeros queda un episodio con hora, duración y máximo de personas."
  "Bajan pasajeros. SJB-12437 termina vacía y su ocupación vuelve a «Baja»."
)

work=$(mktemp -d)
jar="$work/cookies"
camera_ids=()

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
env_value() { grep -E "^$1=" .env | cut -d= -f2-; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
ffmpeg_run() { docker run --rm -v "$work:/w" -w /w "$FFMPEG_IMAGE" -hide_banner -loglevel error -y "$@"; }

cleanup() {
  trap - EXIT INT TERM
  echo
  echo "Deteniendo la simulación…"
  for bus in "${BUSES[@]}"; do docker rm -f "${bus%%|*}" >/dev/null 2>&1 || true; done
  if [ "${KEEP:-0}" != 1 ]; then
    for id in "${camera_ids[@]}"; do curl -s -b "$jar" -X DELETE "$API/api/cameras/$id" >/dev/null || true; done
    echo "Unidades simuladas eliminadas (KEEP=1 para conservarlas)."
  fi
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

occupancy_text() { # personas capacidad
  local pct=$(( $1 * 100 / $2 ))
  if (( pct >= 70 )); then echo "$pct %, Alta ocupación"
  elif (( pct >= 40 )); then echo "$pct %, Ocupación media"
  else echo "$pct %, Baja ocupación"; fi
}

# ── 1. Plataforma ────────────────────────────────────────────────────────────────────────────
curl -sf "$API/health" >/dev/null || { echo "La API no responde. Levántala con: docker compose up -d" >&2; exit 1; }
curl -sf -c "$jar" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$(env_value ADMIN_EMAIL)\",\"password\":\"$(env_value ADMIN_PASSWORD)\"}" \
  "$API/api/auth/login" >/dev/null || { echo "No se pudo iniciar sesión con las credenciales de .env" >&2; exit 1; }

# ── 2. Escenas: personas reales en una parada, recortadas para tener 0, 1, 2, 3 y 5 ─────────────
echo "Preparando escenas…"
curl -sfL -o "$work/source.jpg" "$SOURCE_IMAGE_URL"
# setsar=1: el relleno cambia la proporción del píxel y las escenas deben coincidir para unirse.
fit="scale=-2:360,pad=640:360:(ow-iw)/2:0:color=0x0b2866,setsar=1"
ffmpeg_run -i source.jpg -vf "crop=300:700:360:300,$fit" -frames:v 1 scene-0.png
ffmpeg_run -i source.jpg -vf "crop=450:700:360:300,$fit" -frames:v 1 scene-1.png
ffmpeg_run -i source.jpg -vf "crop=288:700:62:300,$fit" -frames:v 1 scene-2.png
ffmpeg_run -i source.jpg -vf "crop=765:700:45:300,$fit" -frames:v 1 scene-3.png
ffmpeg_run -i source.jpg -filter_complex \
  "[0]crop=765:700:45:300,scale=-2:360[a];[0]crop=288:700:62:300,scale=-2:360[b];[a][b]hstack,pad=640:360:(ow-iw)/2:0:color=0x0b2866,setsar=1" \
  -frames:v 1 scene-5.png

# ── 3. Unidades: registro en la plataforma y video de su recorrido ──────────────────────────────
existing=$(curl -s -b "$jar" "$API/api/cameras")
for bus in "${BUSES[@]}"; do
  IFS='|' read -r key name route capacity stops <<<"$bus"
  echo "Preparando $name ($route)…"

  body="{\"name\":\"$name\",\"streamKey\":\"$key\",\"sourceType\":\"push\",\"route\":\"$route\",\"capacity\":$capacity}"
  id=$(echo "$existing" | json "next((c['id'] for c in d if c['streamKey'] == '$key'), '')")
  if [ -n "$id" ]; then
    curl -sf -b "$jar" -X PUT -H 'Content-Type: application/json' -d "$body" "$API/api/cameras/$id" >/dev/null
  else
    id=$(curl -sf -b "$jar" -H 'Content-Type: application/json' -d "$body" "$API/api/cameras" | json 'd["id"]')
  fi
  camera_ids+=("$id")

  # Un clip con una escena por parada; se publica en bucle sin recodificar.
  inputs=() filters="" n=0
  for people in $stops; do
    inputs+=(-loop 1 -framerate 10 -t "$STOP_SECONDS" -i "scene-$people.png")
    filters+="[$n:v]"; n=$((n + 1))
  done
  ffmpeg_run "${inputs[@]}" -filter_complex "${filters}concat=n=$n:v=1:a=0,format=yuv420p" \
    -c:v libx264 -preset veryfast -profile:v baseline -g 10 -r 10 "$key.mp4"
done

# El servicio de visión descubre cámaras nuevas cada 10 s.
echo "Esperando a que el servicio de visión tome las unidades…"
for _ in $(seq 1 30); do
  ready=$(curl -s localhost:8000/status | json "sum(1 for c in d['cameras'] if c['streamKey'].startswith('sim-'))" 2>/dev/null || echo 0)
  [ "$ready" -ge "${#BUSES[@]}" ] && break
  sleep 1
done

for bus in "${BUSES[@]}"; do
  key=${bus%%|*}
  docker rm -f "$key" >/dev/null 2>&1 || true
  docker run -d --name "$key" --network "$NETWORK" -v "$work:/w:ro" "$FFMPEG_IMAGE" \
    -hide_banner -loglevel error -re -stream_loop -1 -i "/w/$key.mp4" -c copy \
    -f rtsp -rtsp_transport tcp "rtsp://streaming:8554/$key" >/dev/null
done
sleep 3

# ── 4. Recorrido guiado ─────────────────────────────────────────────────────────────────────────
echo
bold "Simulación de flota InnoBusTL"
echo "Tres unidades con cámara recorren su ruta; en cada parada suben o bajan pasajeros."
echo "La capacidad (6) es la de la zona que ve cada cámara. Ctrl+C para terminar."

round=1
while true; do
  for stop in "${!HINTS[@]}"; do
    echo
    bold "Parada $((stop + 1)) de ${#HINTS[@]}$([ $round -gt 1 ] && echo " · vuelta $round")"
    for bus in "${BUSES[@]}"; do
      IFS='|' read -r _ name route capacity stops <<<"$bus"
      read -r -a counts <<<"$stops"
      people=${counts[$stop]}
      noun=$([ "$people" -eq 1 ] && echo pasajero || echo pasajeros)
      printf '  %-10s %d %s (%s) · %s\n' "$name" "$people" "$noun" "$(occupancy_text "$people" "$capacity")" "$route"
    done
    [ $round -eq 1 ] && echo "  → ${HINTS[$stop]}"
    sleep "$STOP_SECONDS"
  done
  round=$((round + 1))
done
