# Wildlife Observer — backend

Receives PCM audio from the ESP32, saves WAV segments, runs BirdNET (or mock mode for testing), and exposes a JSON/SSE API for the React frontend.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy environment defaults:

```bash
cp .env.example .env
```

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Find your laptop LAN IP (`ipconfig getifaddr en0` on macOS) and set `BACKEND_HOST` in `include/config.h` on the ESP32 to that IP.

## BirdNET

**Test mode (default):** `USE_BIRDNET=false` and `MOCK_BIRDNET=true` in `.env`. The backend saves real WAV files from the mic and occasionally emits plausible mock species when audio energy is present.

**Real BirdNET:**

```bash
pip install -r requirements.txt
```

BirdNET does **not** return photos. The backend attaches **`image_url`** per species using [Wikipedia](https://www.mediawiki.org/wiki/API:REST_API) thumbnails (cached on disk). Some obscure species may have no image.

Analysis uses **`ANALYSIS_WINDOW_SECONDS=3`** (BirdNET’s native chunk size) so phone tests align faster than 10 s buffers.

Set in `.env`:

```
BIRDNET_MIN_CONF=0.18
MIN_CONFIDENCE=0.35
ANALYSIS_WINDOW_SECONDS=3
```

Adjust `BIRDNET_LAT` / `BIRDNET_LON` to your location so BirdNET filters to species that occur near you. First startup downloads model weights (may take a few minutes).

Phone playback of non-local species (e.g. a European owl clip) may score in BirdNET but **won’t** appear when `BIRDNET_USE_GEO=true` — real window birds will.

Segments with **no BirdNET match** delete their `.wav` and `_48k.wav` files automatically (no disk clutter).

## JEV (judgment / “what to surface”)

Rule-based JEV runs when `JEV_MODE=rules`. With **`JEV_MODE=llm`**, surfacing uses [TypeSafe Jev](https://www.jevtypesafeai.com/how-to-use) (`POST https://api.typesafe.ai/v1/systemone`) — BirdNET still picks the species; Jev only answers whether to interrupt the UI.

Put secrets in **`backend/.env`**:

```env
JEV_MODE=llm
JEV_SURFACE_THRESHOLD=0.55
TYPESAFE_API_KEY=paste-your-key-here
JEV_BASE_URL=
JEV_MODEL=jev-latest
```

`jv_live_…` keys can use the hosted gateway automatically; official keys use `api.typesafe.ai`. On API errors the backend **falls back to rule-based** surfacing. `GET /api/status` shows `jev_active: true` when LLM JEV is enabled.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ingest/audio` | Raw PCM from ESP32 |
| POST | `/api/ingest/heartbeat` | Device health |
| GET | `/api/events` | Surfaced wildlife events |
| GET | `/api/detections` | Raw detections |
| GET | `/api/species` | Aggregated species list |
| GET | `/api/events/stream` | SSE for live UI |
| GET | `/api/status` | Health, thresholds, `last_segment` diagnostics |

Recordings land in `backend/data/recordings/`.

## Supabase

Not wired yet — data lives in memory plus WAV files on disk. Schema from `plan.md` will map here in a later phase.
