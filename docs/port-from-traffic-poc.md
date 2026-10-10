# Handoff: port traffic-vision-poc features into camera-platform

Written 2026-10-08 for the AI that continues this work. Hackathon demo: **Friday 2026-10-10**.
Nothing below has been implemented yet. **Do not start coding without Guillermo's OK on the commit list.**

## Repos

| | Path | Notes |
|---|---|---|
| camera-platform (official, team repo) | `C:\Users\lg061\source\repos\camera-platform` | Branch `feature/dashboard-merge`. Team repo: small commits, PR to `main`. |
| traffic-vision-poc (source) | `C:\Users\lg061\source\repos\traffic-vision-poc` | Guillermo's POC. Read its `CLAUDE.md`. Read only; don't change it for this work. |

## Goal (decided by Guillermo)

camera-platform is the official dashboard. Port these POC features into it:

1. **Rentabilidad** as a new sidebar item in camera-platform. Clicking it opens the POC's Rentabilidad tab.
   The POC has its own route/ramal selector (`RouteRail`). Keep it **inside the page** as a secondary
   selector (tabs or chips); do not add a second sidebar.
2. **Live bus map** (simulator-fed) on the home page (`/`, "Flota en vivo"), **next to** their live
   camera. There is much less space than in the POC, so it must stay usable in a compact card.
3. **Video source picker** on the camera view. Default stays **live feed** (as now). Option: the
   recorded **LA bus video with model detections** (`la_bus_highlights.mp4` + `.result.json`).
4. **Detector toggle**: their stock YOLO (people only) ↔ Guillermo's RF-DETR ONNX model
   (sitting/standing). Must be switchable back and forth; YOLO stays the default.
5. **Keep camera-platform's look**: white background, accent `#1d7fe0`, shadcn/ui, Tailwind 4,
   lucide icons. Restyle every ported component to it; do not bring the POC's CSS/colors.

Runtime: everything runs on **the team lead's laptop** (not SmarterASP). He streams his own camera and
will add a Wi-Fi/5G camera in the building over RTSP. The selected detector must run on those live feeds.

## Stack comparison (verified against the code)

| | camera-platform | POC |
|---|---|---|
| Web | Next.js 16.4, React 19.3, shadcn, Tailwind 4, `apps/web` | 3 React + Vite apps; the one to port is `src/operator-dashboard-web` (React 19, leaflet + react-leaflet, hash routing) |
| API | ASP.NET Core 10, Clean Architecture, EF Core + PostgreSQL, cookie auth, SignalR | `src/Innova.Occupancy.Api`: .NET, **in-memory** simulated 43-bus fleet, no auth, CORS open, port 5189 |
| Vision | Python service `services/vision`: ultralytics YOLO (`yolo26n.pt`), CPU, class `person` only | `src/TrafficVision.Api` (C#, ONNX Runtime): RF-DETR `models/bus-passengers-rfdetr-s-v1.onnx` (Git-ignored), classes `sitting`/`standing`, plus a tracker |
| Video | RTSP → MediaMTX → WebRTC (WHEP) | Recorded clips in `data/demo/videos` with results in `data/demo/results` (both Git-ignored) |
| Start-up | `docker compose up` + `npm run dev`; bash scripts | `dotnet run` per project |

## Corrections to the earlier rough notes

- **Boarding/leaving isn't available.** The POC has `Tracking/PassengerTracker.cs` and
  `DoorEvents/DoorCrossingCounter.cs`, but `DoorEvents/README.md` says door counting waits on stable
  tracking. Only **sitting/standing** is real. Don't promise boarding/leaving for Friday.
- The model is RF-DETR exported to ONNX (opset 17). Input `input` float32 [1,3,640,640]. Outputs `dets`
  [1,300,4] and `labels` [1,300,3]: sigmoid logits, column 0 unused, 1 = sitting, 2 = standing.
  Reproduce the exact preprocessing/box decoding from `src/TrafficVision.Api/Services/PassengerImageAnalyzer.cs`.
- The POC frontend is not one app, and its deployment was SmarterASP/IIS. Both are irrelevant now: the target
  is the lead's laptop.

## Gaps and traps found in the code

1. **`"person"` is hard-coded in two places.** `apps/web/lib/realtime.tsx:158` (`peopleIn`) and
   `apps/api/.../Detections/DetectionService.cs:19` (`PersonLabel`). With RF-DETR labels
   (`sitting`/`standing`), the passenger count and events drop to **zero**. Fix: either the RF-DETR detector
   also sends a `person`-compatible label, or both places count any passenger label (`person|sitting|standing`).
   Showing a sitting/standing split in the UI is an extra.
2. **Windows line endings.** `core.autocrlf input` is now set locally, but the working tree was checked out
   before that: every `.sh`, `.py` and `mediamtx.yml` is CRLF on disk (`git ls-files --eol`). The CRLF
   `services/streaming/web-stream.sh` is mounted into the MediaMTX container and will fail there. Fix: add
   `.gitattributes` (`*.sh *.py *.yml text eol=lf`) and re-checkout. This only matters on Windows; the
   lead's laptop is probably a Mac, but **confirm it**.
3. **Mac-only scripts.** `scripts/mac-camera.sh` (avfoundation webcam), `simulate-fleet.sh` (uses `python3`
   and the Docker network `camera-platform_default`). On Windows they need Git Bash/WSL. They aren't needed
   on the lead's laptop if it's a Mac.
4. **The Occupancy API isn't in camera-platform.** The map and Rentabilidad need `/api/v1/vehicles` and
   `/api/v1/fleet/hourly` from the simulator. Options: (a) copy `Innova.Occupancy.Api` into
   `services/occupancy` with a Dockerfile in `docker-compose.yml` (self-contained on the laptop:
   **recommended**); (b) run it from the POC repo with `dotnet run`; (c) fall back to site2 over the internet.
   Make the URL an env var so the fallback is one change.
5. **Proxy and auth.** Next.js already rewrites `/api` and `/hubs` to the camera-platform API
   (`apps/web/next.config.ts`). Add a separate prefix (e.g. `/occupancy/:path*` → Occupancy API) so the
   browser needs no CORS. **Don't** use `/api`, because that would collide. Pages under `app/(app)/` already
   require login. The Occupancy API itself has no auth; that's fine for a local demo.
6. **DB schema.** The port needs no migration. Simulator data stays in the Occupancy API's memory. Cameras
   (`Camera` with route + capacity, migration `AddBusDetails`) are separate from simulated buses. Linking a
   camera to a simulated vehicle id (the POC links its camera to `SJB-10662`) is optional; skip it unless asked.
7. **Leaflet in Next.js.** react-leaflet needs `window`: load the map with `next/dynamic` and `ssr: false`,
   and import `leaflet/dist/leaflet.css`. Route shapes come from `data/routes/coronado-routes-osm.geojson`
   (copy to `apps/web/public/`).
8. **Recorded video files aren't in Git.** Copy `la_bus_highlights.mp4` and its `.result.json` from the POC's
   `data/demo/` into `apps/web/public/demo/` and Git-ignore that folder. The overlay logic is in the POC's
   `components/CameraPanel.tsx`; the paths are in `config/operatorSettings.ts` (`cameraDemo`).
9. **The Occupancy API contract must not change.** The InnoBus app reads it. Copying the API is fine;
   changing its responses isn't (additive only).
10. **Money assumptions.** Fares and cost per bus-hour live in the POC's `config/operatorSettings.ts`,
    documented in `docs/supuestos-dashboard-operador.md`. Port them unchanged, and keep the "datos simulados"
    notice in the UI.
11. **Detector toggle mechanism.** `services/vision/app/config.py` reads env vars (`MODEL`). Add
    `DETECTOR=yolo|rfdetr` (+ `RFDETR_MODEL_PATH`) and a second detector class with the same `detect()`
    signature as `PersonDetector` in `detector.py`, using `onnxruntime` (add it to `requirements.txt`). Mount
    the `.onnx` into the container (it's Git-ignored). Switching = change `.env` + `docker compose up -d vision`.
    A runtime UI switch is a stretch goal. Ask before building it.

## Proposed commits (small, in order; each one builds/runs on its own)

| # | Goal | Files |
|---|---|---|
| 0 | LF line endings for scripts and config, so the scripts run on Windows/containers | `.gitattributes` (+ re-checkout, no content change) |
| 1 | Run the simulator inside camera-platform | `services/occupancy/**` (copy of `Innova.Occupancy.Api`, incl. `MockData/`), `services/occupancy/Dockerfile`, `docker-compose.yml`, `.env.example` |
| 2 | Proxy the Occupancy API through Next.js | `apps/web/next.config.ts`, `apps/web/.env.development` |
| 3 | Typed client and polling hook for vehicles + hourly fleet | `apps/web/lib/occupancy-api.ts` (new), `apps/web/lib/use-polling.ts` (new) |
| 4 | Fleet map replaces the bus list on the home page; camera panel always visible | `apps/web/components/fleet-map.tsx` (new, dynamic import), `apps/web/app/(app)/page.tsx`, `apps/web/public/routes/coronado-routes-osm.geojson`, `apps/web/package.json` (leaflet, react-leaflet) |
| 5 | Rentabilidad sidebar item + page skeleton with the route/ramal selector | `apps/web/app/(app)/layout.tsx` (NAV), `apps/web/app/(app)/rentabilidad/page.tsx` (new), `apps/web/components/route-selector.tsx` (new) |
| 6 | Rentabilidad KPIs and assumptions (ported logic, unchanged numbers) | `apps/web/lib/kpis.ts`, `apps/web/lib/operator-settings.ts`, `apps/web/lib/use-assumptions.ts`, `apps/web/components/assumptions-dialog.tsx` |
| 7 | Rentabilidad charts: hourly chart, route × hour heatmap, time by occupancy level | `apps/web/components/hourly-chart.tsx`, `heatmap.tsx`, `load-stack.tsx`, `rentabilidad/page.tsx` |
| 8 | "Explicar resultado" panel | `apps/web/lib/narrative.ts`, `apps/web/components/explain-dialog.tsx` |
| 9 | Video source picker: live (default) ↔ recorded LA clip with detections | `apps/web/components/camera-live.tsx`, `apps/web/components/recorded-detections.tsx` (new), `apps/web/.gitignore` (`public/demo/`) |
| 10 | Count any passenger label, not only `person` | `apps/web/lib/realtime.tsx`, `apps/api/src/CameraPlatform.Application/Detections/DetectionService.cs`, `apps/api/tests/CameraPlatform.Tests/ApplicationTests.cs` |
| 11 | RF-DETR ONNX detector behind `DETECTOR=yolo\|rfdetr` (default yolo) | `services/vision/app/detector.py` (or `rfdetr_detector.py`), `services/vision/app/config.py`, `services/vision/app/main.py`, `services/vision/requirements.txt`, `docker-compose.yml` (model mount), `.env.example` |
| 12 | Optional: show the sitting/standing split when RF-DETR is on | `apps/web/components/camera-live.tsx`, `apps/web/app/(app)/cameras/[id]/page.tsx` |
| 13 | README: how to start the simulator, switch detector, pick the recorded video; Windows notes | `README.md` |

Priority if time runs out: 1–4 (map) → 5–7 (Rentabilidad) → 9 (recorded video) → 10–11 (detector). 0, 8, 12, 13 are extras (0 only matters on Windows).

## Decisions (Guillermo, 2026-10-08)

1. **The lead's laptop is a Mac. Don't break his setup.** Don't edit his scripts, compose services or
   MediaMTX config beyond what a commit lists. Commit 0 is **deferred** (it would only help Guillermo's
   Windows machine). Guillermo tests on Windows without a built-in camera: he uses his phone camera through
   Phone Link, or the recorded-video toggle. Windows camera tooling is out of scope for now.
2. **The map replaces the bus list on `/`.** The home page is sidebar | bus list | live camera. The bus list
   comes from `/api/cameras` + live detections, **not** the simulator. In commit 4 the fleet map takes the
   list's column. The list was also how a camera got opened (`selectedId` → `BusPanel`), so with the list gone
   the camera panel must **always show** (the first/only camera). KPIs and recent events stay.
3. **One camera only → the video source picker is one global switch** (commit 9), e.g. a toggle in the
   camera panel header that applies everywhere, remembered in `localStorage`. Keep it simple for a
   non-technical presenter.
4. **Copy the Occupancy API into camera-platform as its own isolated service** (`services/occupancy`, its
   own Dockerfile and compose service). Keep it separate from their Clean Architecture API: don't merge
   projects, share code or touch their `.slnx`.
