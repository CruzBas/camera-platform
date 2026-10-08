#!/usr/bin/env bash
# Crea .env a partir de .env.example con secretos aleatorios. No sobrescribe un .env existente.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env ya existe; no se modifica." >&2
  exit 0
fi

secret() { openssl rand -hex "$1"; }
admin_password="Cam-$(secret 8)-$(secret 4 | tr a-f A-F)"

sed -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${admin_password}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret 24)|" \
    -e "s|^MEDIAMTX_API_PASSWORD=.*|MEDIAMTX_API_PASSWORD=$(secret 24)|" \
    -e "s|^VISION_API_KEY=.*|VISION_API_KEY=$(secret 24)|" \
    .env.example > .env
chmod 600 .env

echo ".env creado. Acceso al dashboard:"
echo "  usuario:    $(grep '^ADMIN_EMAIL=' .env | cut -d= -f2-)"
echo "  contraseña: ${admin_password}"
