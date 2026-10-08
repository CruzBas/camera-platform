# Dashboard (Next.js)

Interfaz de la plataforma: login, flota en vivo, cámaras, detalle con video y detecciones, eventos.
La descripción completa, el arranque y la arquitectura están en el [README principal](../../README.md).

```bash
npm install
npm run dev     # http://localhost:3000 (requiere la API y MediaMTX: docker compose up -d)
npm run lint
```

- `lib/api.ts`: cliente de la API (`/api/*`, reenviado a la API por `next.config.ts`).
- `lib/realtime.tsx`: conexión SignalR (`/hubs/events`).
- `components/whep-player.tsx`: reproductor WebRTC (WHEP) con reconexión.
- `NEXT_PUBLIC_WEBRTC_URL` (`.env.development`): señalización WebRTC de MediaMTX.
