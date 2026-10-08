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

Analysis uses **`ANALYSIS_WINDOW_SECONDS=3`** (BirdNET’s native chunk size) so phone tests align faster than 10 s buffers.

Set in `.env`:

```
BIRDNET_MIN_CONF=0.20
MIN_CONFIDENCE=0.35
ANALYSIS_WINDOW_SECONDS=3
```

Adjust `BIRDNET_LAT` / `BIRDNET_LON` to your location so BirdNET filters to species that occur near you, and set `LOCATION_NAME` to the place (e.g. `Bengaluru, Karnataka, India`). The ESP32 has no GPS, so these are the only location the system knows; `/api/status` returns them as `location`, and the app includes them when a clip is shared. First startup downloads model weights (may take a few minutes).

Phone playback of non-local species (e.g. a European owl clip) may score in BirdNET but **won’t** appear when `BIRDNET_USE_GEO=true` — real window birds will.

Segments with **no BirdNET match** delete their `.wav` and `_48k.wav` files automatically (no disk clutter).

## Species photos

BirdNET does **not** return photos, so `app/species_images.py` finds one per species:

1. **Wikipedia** article thumbnail (scientific name first, then common name) — small and quick to load.
2. **iNaturalist** as a fallback when the article has no image: exact name match only, a portrait photo preferred, 1024 px. Only licences that allow reuse **and** restyling are accepted (CC0, CC BY, BY-SA, BY-NC, BY-NC-SA); "all rights reserved" and no-derivatives photos are skipped, because the app's card restyles the photo.

Results are cached in `data/history/image_cache.json` with the credit line each licence asks for. The cache is versioned (`CACHE_VERSION`): changing the lookup order or sources rebuilds it automatically. `/api/detections` and the live stream attach each species' current photo as `image_url` plus `image_credit` (`text`, `source`, `url`), so old detections pick up new photos too. Species not cached yet are looked up by a background worker (about 1 request/second, iNaturalist's limit) — requests never wait on the network — and every logged species is queued at startup.

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
| GET | `/api/detections?limit=` | Detections, newest first, with `image_url` and `image_credit` |
| GET | `/api/species` | Aggregated species list |
| GET | `/api/events/stream` | SSE for live UI (`detection` and `event` messages) |
| GET | `/api/recordings/{detection_id}` | WAV clip for a detection |
| GET | `/api/status` | Health, thresholds, `last_segment` diagnostics |

Recordings land in `backend/data/recordings/`.

## Supabase (history + clips in the cloud)

With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set, detections and events live in Supabase Postgres and each logged clip is compressed to **MP3** (~13 KB for 3 s, about 7x smaller than WAV) and stored in a private **`recordings`** Storage bucket. Without them, history stays in `data/history/*.jsonl` and clips as local WAVs, exactly as before.

Setup (free tier is plenty: ~190 clips/day ≈ 2.5 MB/day, so the 1 GB of Storage lasts over a year):

1. Supabase dashboard → **SQL Editor** → paste and run [`../supabase/schema.sql`](../supabase/schema.sql). It creates `detections`, `events`, a `species_summary` view and the private `recordings` bucket, with row-level security on and no policies (the public anon key can't read anything).
2. **Project Settings → API**: copy the project URL and the **secret** (service-role) key into `backend/.env` as `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Never put the secret key in the frontend.
3. Move the existing history across (safe to re-run; nothing is deleted):

   ```bash
   .venv/bin/python -m scripts.migrate_to_supabase --dry-run
   .venv/bin/python -m scripts.migrate_to_supabase
   ```

   After a successful run the JSONL files are renamed to `*.migrated-<date>.jsonl`. Delete `data/recordings` yourself once the app looks right.
4. Restart the backend. `GET /api/status` shows `"storage": "supabase"`.

How it runs: the backend keeps the latest 1,000 detections in memory and reads species totals from the `species_summary` view. New detections are written to Supabase; if a write fails (e.g. offline), the row goes to the local JSONL instead and the migration script pushes it next time. Playback (`/api/recordings/{id}`) redirects to a one-hour signed Storage URL. Removing a call or species deletes the rows (events cascade) and any clip no remaining detection uses. The species photo cache stays local in `data/history/image_cache.json`; it rebuilds itself.
