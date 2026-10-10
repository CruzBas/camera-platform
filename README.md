# InnoBusTL — Video + Computer Vision

Video en tiempo real de cámaras IP en el navegador, con detección de personas (YOLO) y eventos en vivo.

## Qué hace

Plataforma para monitorear las cámaras de una flota de buses. Un administrador:

- **Registra cámaras** (cámara IP por RTSP o video publicado, como la webcam de la Mac), con su ruta y
  capacidad de pasajeros.
- **Ve el video en vivo** de cada unidad en el navegador, con baja latencia (WebRTC).
- **Ve cuántos pasajeros hay** en cada unidad: las personas detectadas se dibujan sobre el video y se
  calcula la ocupación respecto de la capacidad.
- **Recibe eventos** cuando aparecen personas frente a una cámara, en vivo y con historial.
- **Ve el estado** de cada cámara: si transmite, códec, resolución, espectadores, y si el análisis está
  activo (FPS analizados, tiempo de inferencia).

```
                     ┌──────────────── WebRTC (WHEP) ───────────────┐
Cámara ──RTSP──▶ MediaMTX (streaming)                               ▼
  (TENVIS: MediaMTX la lee; │                                   Dashboard (Next.js, apps/web)
   Mac: se publica a él)    └─RTSP─▶ Visión (YOLO) ─detecciones─▶ API (ASP.NET Core) ─SignalR─┘
                                                                    │
                                                                PostgreSQL
```

- **La plataforma es dueña de las cámaras.** Al registrar una cámara en el dashboard, la API la guarda
  (con la URL RTSP cifrada) y configura MediaMTX por su API de control. Cada 10 s reconcilia: si
  MediaMTX se reinicia, vuelve a crear los streams.
- **Nadie más habla con la cámara.** El navegador y el servicio de visión leen siempre desde MediaMTX:
  la cámara atiende una sola conexión y sus credenciales solo las conoce la API.
- **Eventos por episodio.** Una persona frente a la cámara 5 minutos genera un solo evento (con
  duración, confianza máxima y cantidad máxima de personas), no uno por frame.

## Cómo funciona

### 1. Alta de una cámara

1. El dashboard envía `POST /api/cameras` con nombre, `streamKey` (el identificador del stream, inmutable),
   tipo de fuente y, si es RTSP, la URL con credenciales.
2. El dominio (`Camera`) valida los datos; la API guarda la cámara con la URL cifrada (ASP.NET Data
   Protection) y crea el path `streamKey` en MediaMTX por su API de control (puerto 9997, interno).
   - **RTSP:** MediaMTX se conecta a la cámara y lee el video.
   - **Push:** el path queda esperando a que alguien publique (`scripts/mac-camera.sh`).
   - Además crea `<streamKey>_web`, el path que lee el navegador. Cuando la cámara entra en línea,
     MediaMTX ejecuta `services/streaming/web-stream.sh`: copia el video si ya es H.264 y si no (p. ej.
     H.265, que los navegadores no reproducen por WebRTC) lo transcodifica a H.264.
3. `StreamingSyncWorker` corre `StreamingReconciler` cada 10 s: compara las cámaras de la base con los
   paths de MediaMTX, crea o corrige los que faltan y elimina los huérfanos. Así sobrevive a reinicios
   de MediaMTX (que no persiste los paths creados por API) y a cambios que fallaron en su momento.

### 2. Video en el navegador

El componente `WhepPlayer` negocia WebRTC con MediaMTX por WHEP
(`http://localhost:8889/<streamKey>_web/whep`) y reconecta solo si el stream se corta. El video nunca pasa por la API.

### 3. Análisis con YOLO (`services/vision`)

1. El `Supervisor` pide a la API la lista de cámaras (`GET /internal/cameras`, con `X-Api-Key`) cada 10 s y
   mantiene un `CameraWorker` por cámara.
2. Cada worker tiene dos hilos: uno **lee** el RTSP de MediaMTX y conserva solo el último frame (sin
   acumular atraso); otro **analiza** ese frame a `ANALYSIS_FPS`, descartando frames de más de 2 s.
3. Un único modelo YOLO se comparte entre todas las cámaras; la inferencia se serializa por turnos
   (`FairLock`) para que, si la CPU no alcanza, todas las cámaras bajen parejo.
4. Cada frame analizado se envía a `POST /internal/cameras/{id}/detections` con las cajas normalizadas
   (0–1), la confianza y el tiempo de inferencia.

### 4. Eventos y tiempo real

Por cada frame recibido, `DetectionService`:

1. Registra el ritmo y la latencia del análisis en memoria (`AnalysisMonitor`), base del estado «Análisis».
2. Reenvía las detecciones por SignalR (`detections`) solo a quienes están mirando esa cámara: el
   dashboard dibuja las cajas sobre el video y cuenta pasajeros.
3. Si hay personas, extiende el evento abierto de esa cámara o, si no se vieron personas en los últimos
   10 s, abre uno nuevo y lo anuncia a todos (`eventStarted`). Los tiempos usan el reloj del servidor.

### Páginas del dashboard

| Página | Contenido |
|--------|-----------|
| `/login` | Inicio de sesión (cookie HttpOnly) |
| `/` | «Flota en vivo»: mapa interactivo de la red de Coronado + cámara de cabina siempre visible |
| `/cameras` | Alta, edición y baja de cámaras, con su estado |
| `/cameras/[id]` | Video con detecciones, estado del stream y del análisis, eventos de la cámara |
| `/events` | Historial de eventos de todas las cámaras, actualizado en vivo |
| `/rentabilidad` | «Rentabilidad operativa»: matriz ruta × hora, dial de equilibrio, tiempo por ocupación |

En desarrollo, Next.js reenvía `/api` y `/hubs` a la API (`next.config.ts`), así la cookie de sesión
funciona sin CORS.

## Estado respecto del roadmap

| Fase | Contenido | Estado |
|------|-----------|--------|
| 0 | Validar la cámara | Scripts listos (`discover-onvif.py`, `probe-camera.sh`); falta correrlos con la TENVIS |
| 1 | RTSP → WebRTC, reproductor con reconexión | Hecho |
| 2 | API Clean Architecture, PostgreSQL, CRUD de cámaras, estado | Hecho |
| 3 | Dashboard: login, dashboard, cámaras, detalle, eventos | Hecho (sin páginas de grabaciones ni configuración de reglas) |
| 4 | Servicio de visión: OpenCV + YOLO, detección de personas | Hecho |
| 5 | Eventos en tiempo real con SignalR | Hecho |
| 6–11 | Tracking, zonas/reglas, grabaciones, multi-cámara a escala, endurecimiento, observabilidad | Pendiente |

## Requisitos

Docker Desktop, Node.js 20 o superior y, para la webcam de la Mac, FFmpeg (`brew install ffmpeg`).

## Arranque

```bash
scripts/setup-env.sh          # crea .env con secretos aleatorios y muestra el usuario y la contraseña del dashboard
docker compose up -d --build  # gateway, PostgreSQL, API y visión (la primera vez tarda unos minutos)
cd apps/web && npm install && npm run dev
```

Abre http://localhost:3000 e inicia sesión con las credenciales que mostró `setup-env.sh` (también
están en `.env`: `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## Usar la cámara de la Mac

Docker en macOS no puede acceder a la cámara, así que la webcam se publica en el gateway con FFmpeg.

1. En el dashboard: **Cámaras → Agregar cámara**, fuente «Video publicado (push)», clave `mac`.
2. En una terminal: `scripts/mac-camera.sh mac`. La primera vez, macOS pide permiso de cámara para
   la terminal. Ctrl+C detiene la publicación y apaga la cámara.

## Simulación guiada de flota

Muestra el caso de uso final: un administrador ve la imagen de cada bus y sus pasajeros en tiempo
real. Con la plataforma y el dashboard corriendo:

```bash
scripts/simulate-fleet.sh
```

Registra tres unidades de la flota de InnoBus (SJB-18600 en la Ruta 142, SJB-12437 en el Ramal
Patalillo y SJB-8927 en el Ramal Dulce Nombre). Cada una publica un video en el que suben y bajan
pasajeros en 6 paradas de 20 s. Todo pasa por el pipeline real: gateway, YOLO, API y SignalR.

En la terminal, el script narra en cada parada cuántos pasajeros debería mostrar cada unidad y qué
mirar en http://localhost:3000 («Flota en vivo», detalle de una unidad, eventos). Ctrl+C la detiene
y elimina las unidades simuladas; con `KEEP=1` se conservan junto con sus eventos. `STOP_SECONDS=30`
alarga las paradas.

La **capacidad** de cada cámara es la cantidad de pasajeros que cubre su imagen; la ocupación usa
los mismos niveles que la app InnoBus (alta desde 70 %, media desde 40 %).

## Conectar la TENVIS

1. **Misma red.** La Mac tiene que estar en la misma red que la cámara. Reserva la IP de la cámara
   en el router (DHCP reservation).
2. **Encontrarla:** `python3 scripts/discover-onvif.py` lista las cámaras ONVIF y sus IPs.
3. **Validar el RTSP:** pon la URL en `TENVIS_RTSP_URL` dentro de `.env` y corre
   `scripts/probe-camera.sh`, que muestra el codec, la resolución y los FPS. Para la prueba de
   estabilidad de la Fase 0: `scripts/probe-camera.sh 600`.
   - Rutas habituales: `/11` (principal), `/12` (secundario); modelos antiguos: `/live/ch0`.
   - Si la contraseña tiene caracteres especiales, codifícalos: `@` → `%40`, `#` → `%23`.
   - El códec debe ser **H.264**. Si es H.265, cámbialo en la configuración web de la cámara: los
     navegadores no lo reproducen bien por WebRTC.
4. **Registrarla:** en **Cámaras → Agregar cámara**, fuente «Cámara IP (RTSP)», pega la URL.
   En unos segundos el estado pasa a «En línea» y el análisis a «Activo».
5. **Si queda «Sin señal»:** `docker compose logs -f streaming` muestra el motivo, por ejemplo
   `401 (Unauthorized)` si la contraseña es incorrecta o un timeout si la IP es incorrecta. Corrige
   la URL con **Editar**.

## Pruebas

```bash
cd apps/api && dotnet test             # dominio y casos de uso (eventos, validación, sincronización con el gateway)
scripts/test-camera-recovery.sh        # con la plataforma corriendo: caída de cámara, reconexión y reinicio del gateway
```

## Características integradas (Hackathon Demo)

### 1. Mapa de flota y Simulador con failover automático
- **Mapa interactivo:** En la página principal (`/`), el mapa Leaflet carga el trazado real de rutas de Coronado (`public/routes/coronado-routes-osm.geojson`) y muestra la telemetría en tiempo real de 43 unidades con rumbo y nivel de ocupación.
- **Failover automático (alta disponibilidad en vivo):** El proxy `/occupancy/*` en Next.js consulta prioritariamente la API remota en la nube (`https://lg0618pp-002-site2.htempurl.com`). Si la conexión a Internet falla o tiene alta latencia (> 2,5 s), conmuta transparentemente y sin intervención al contenedor local de simulación (`services/occupancy` en el puerto 5190).

### 2. Selector de fuente de video (En vivo ↔ Demo grabado)
En el visor de la cámara, el usuario puede alternar entre:
- **En vivo (WHEP):** El stream WebRTC en tiempo real de la cámara IP / webcam con detección en tiempo real.
- **Demo grabado (RF-DETR):** Reproduce el clip pregrabado (`la_bus_highlights.mp4`) sincronizado con el reloj Unix y con las cajas delimitadoras de pasajeros sentados y de pie decodificadas de su análisis. Si la cámara en vivo no tiene señal, el reproductor muestra una sugerencia rápida para cambiar a la grabación.

### 3. Selector de detector de visión (YOLO ↔ RF-DETR)
El servicio de visión (`services/vision`) permite alternar el modelo de detección mediante la variable de entorno `DETECTOR` en `.env`:
- `DETECTOR=yolo` (por defecto): Inferencia con Ultralytics YOLO (`person`).
- `DETECTOR=rfdetr`: Inferencia ONNX con RF-DETR distinguiendo `sitting` (sentados) y `standing` (de pie). Coloca el modelo ONNX en `./models/bus-passengers-rfdetr-s-v1.onnx` (montado en el contenedor).
- Ambos modelos notifican conteos compatibles al backend (`person`, `sitting` y `standing` computan como pasajeros).

### 4. Módulo de Rentabilidad Operativa
Ubicado en `/rentabilidad` en la barra lateral:
- Aplica las tarifas oficiales de la ARESEP (Resolución RE-0115-IT-2026: ₡460 para R142 y ₡400 para ramales).
- Calcula ingresos estimados, costo de operación por hora-bus (₡12 950 por defecto) y pérdidas bajo el punto de equilibrio.
- Permite ajustar los supuestos en vivo mediante el diálogo de "Supuestos de cálculo".
- Gráficos integrados: dial de abordajes por hora-bus, gráfico horario, mapa de calor ruta × hora y desglose de tiempo por nivel de ocupación.

## Servicios y puertos (solo en 127.0.0.1)

| Servicio | Puerto | Uso |
|----------|--------|-----|
| Dashboard (`npm run dev`) | 3000 | Interfaz; reenvía `/api`, `/hubs` y `/occupancy` |
| API | 5080 | REST, login, SignalR (`/hubs/events`), `/health` |
| MediaMTX | 8554 / 8889 / 8189 | RTSP / señalización WebRTC / media WebRTC |
| Visión | 8000 | `/health`, `/status` (detección YOLO o RF-DETR) |
| Occupancy Simulator | 5190 | Simulador de flota local (respaldo offline automático) |
| PostgreSQL | 5433 | Base de datos (5433 para no chocar con un PostgreSQL local) |

Ajustes del análisis en `.env`: `ANALYSIS_FPS` (frames analizados por segundo y por cámara),
`INFERENCE_THREADS` (hilos de inferencia) y `DETECTOR=yolo|rfdetr`.


## API

Rutas `/api/*` y `/hubs/*` requieren la sesión del dashboard (salvo el login); `/internal/*` requiere
`X-Api-Key`.

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/auth/login`, `/api/auth/logout` | Iniciar y cerrar sesión |
| GET | `/api/auth/me` | Usuario actual |
| GET / POST | `/api/cameras` | Listar / registrar cámaras |
| GET / PUT / DELETE | `/api/cameras/{id}` | Ver / editar / eliminar una cámara |
| GET | `/api/cameras/status` | Estado de stream y análisis de todas las cámaras |
| GET | `/api/cameras/{id}/status` | Estado de una cámara |
| GET | `/api/cameras/{id}/events?limit=` | Eventos de una cámara (por defecto 50, máximo 200) |
| GET | `/api/events?limit=` | Eventos de todas las cámaras |
| WS | `/hubs/events` | SignalR: `WatchCamera(id)` / `UnwatchCamera(id)`; recibe `detections` y `eventStarted` |
| GET | `/internal/cameras` | Cámaras a analizar (servicio de visión) |
| POST | `/internal/cameras/{id}/detections` | Resultado de un frame analizado (servicio de visión) |
| GET | `/health` | Salud de la API |

## Seguridad

- **Secretos:** solo en `.env`, que está en `.gitignore` y se crea con permisos 600.
- **Credenciales de las cámaras:** se cifran con ASP.NET Data Protection antes de guardarse. Las
  claves de cifrado viven en un volumen aparte de la base de datos. La API nunca devuelve la
  contraseña: muestra `rtsp://usuario:***@…`.
- **Sesión del dashboard:** cookie HttpOnly. La cuenta se bloquea tras 5 intentos fallidos.
- **Servicio de visión:** se autentica ante la API con una clave compartida (`X-Api-Key`).
- **Puertos:** todos se publican solo en `127.0.0.1`. Nunca abras el puerto 554 de la cámara a
  Internet.

## Limitaciones conocidas

- **Video sin autenticación.** El video WebRTC no exige sesión: cualquiera con acceso a
  `localhost:8889` puede verlo. Pasa a ser necesario antes de exponer la plataforma (Fase 9, con
  `authHTTPAddress` de MediaMTX validando contra la API).
- **Un solo nivel de acceso.** Todos los usuarios ven todas las cámaras; todavía no hay
  organizaciones ni roles.
- **Visión solo con CPU dentro de Docker.** Detecta personas a 2 fps por cámara con unos 130–200 ms
  de inferencia. Con varias cámaras, conviene correr visión fuera de Docker o en un equipo con GPU.
- **Dashboard fuera de Docker Compose.** Por ahora se ejecuta con `npm run dev`.

## Estructura

```
apps/api/            ASP.NET Core 10 (Domain / Application / Infrastructure / Api + tests)
apps/web/            Next.js 16 + shadcn/ui: dashboard, reproductor WHEP, SignalR
services/vision/     Python: FastAPI + OpenCV + YOLO
services/streaming/  Configuración de MediaMTX
scripts/             setup-env, mac-camera, simulate-fleet, discover-onvif, probe-camera, test-camera-recovery
docker-compose.yml
```
