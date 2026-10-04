# Wildlife Observer

A personal balcony/window **wildlife listener**: ESP32 + INMP441 mic streams audio over Wi‑Fi to your Mac, **BirdNET** identifies birds, **JEV** decides what deserves the big “visitor” moment, and a **React** UI shows a calm observer screen plus a saved bird log.

Hardware wiring and flash steps: **[module.md](module.md)**.

---

## Architecture

```text
  REAL WORLD (birds, traffic, room noise)
           │
           ▼
    ┌──────────────┐
    │   ESP32      │  I2S mic, 16 kHz mono, ~1 s HTTP chunks
    │  + INMP441   │  Wi‑Fi only (USB = power / flash / serial)
    └──────┬───────┘
           │  POST /api/ingest/audio  (+ heartbeat)
           ▼
    ┌──────────────┐
    │   Backend    │  Buffer 3 s → WAV → BirdNET → history + JEV
    │   (FastAPI)  │  JSONL on disk, SSE to UI
    └──────┬───────┘
           │  REST + EventSource
           ▼
    ┌──────────────┐
    │   Frontend   │  Observer hero, grouped bird log, history pages
    │   (Vite)     │
    └──────────────┘
```

```mermaid
flowchart LR
  Mic[INMP441] --> ESP[ESP32 firmware]
  ESP -->|Wi-Fi PCM| Ingest[Ingest + 3s buffer]
  Ingest --> BN[BirdNET]
  BN --> Log[Detections log]
  BN --> JEV[JEV surfacing]
  JEV --> UI[React UI]
  Log --> UI
```

---

## What each part does

| Part | Location | Responsibility |
|------|----------|----------------|
| **INMP441** | Hardware | Digital MEMS mic; I²S to ESP32 (see [module.md](module.md)). |
| **ESP32 firmware** | `src/`, `include/` | Wi‑Fi, read mic at **16 kHz mono**, send **~1 s** PCM chunks to the backend, periodic heartbeat. Does **not** run BirdNET or store birds. |
| **Ingest** | `backend/app/main.py` | Accepts PCM; accumulates until **3 s** of audio per device. |
| **Segment WAV** | `backend/data/recordings/` | Saves `{uuid}.wav` (16 kHz) and `{uuid}_48k.wav` for analysis. |
| **BirdNET** | `backend/app/birdnet_runner.py` | Species + confidence on each 3 s window; geo filter (Bengaluru by default). |
| **Event processor** | `backend/app/event_processor.py` | Writes **detections** to history; optionally creates a **surfaced event** for the hero. |
| **JEV** | `backend/app/jev_client.py` | When enabled, asks TypeSafe **Jev** whether to interrupt the UI (species already fixed by BirdNET). |
| **Store** | `backend/app/store.py` | In-memory + `detections.jsonl` / `events.jsonl`; species summaries. |
| **Frontend** | `frontend/` | Observer (hero + log), My Wildlife, History, Soundscape. |

BirdNET **identifies**; JEV **judges attention**. JEV never changes the species label.

---

## Thresholds (the important tables)

Settings live in **`backend/.env`** (copy from [`backend/.env.example`](backend/.env.example)). Restart **uvicorn** after changes.

### Logging threshold — what gets saved

Controls which BirdNET hits become **detections** (bird log cards + JSONL). Also controls **WAV retention**.

| Env variable | Default (project) | Meaning |
|--------------|-------------------|---------|
| **`BIRDNET_MIN_CONF`** | **0.18** | Minimum BirdNET confidence to accept a species for this segment. Below → **no detection**, **WAVs deleted**. |
| **`BIRDNET_USE_GEO`** | `true` | Drop species unlikely near `BIRDNET_LAT` / `BIRDNET_LON`. |
| **`ANALYSIS_WINDOW_SECONDS`** | **3** | Seconds of audio buffered before one BirdNET run (BirdNET-friendly; fast UI). |

**WAV files:** For each 3 s segment, both `.wav` and `_48k.wav` are removed automatically if BirdNET returns **no** species above `BIRDNET_MIN_CONF`. If anything is logged, those files are **kept** for playback on the card (hero thresholds do not delete them).

### Hero / “Noticed” threshold — what interrupts the UI

Logging and surfacing are **separate**. Many detections can exist without the big visitor animation.

| Env variable | Default (project) | Meaning |
|--------------|-------------------|---------|
| **`MIN_CONFIDENCE`** | **0.40** | Hard floor before hero/JEV is considered. Below → no surfaced event (log may still have the row if ≥ `BIRDNET_MIN_CONF`). |
| **`EVENT_COOLDOWN_SECONDS`** | **300** | Same species cannot surface again within 5 minutes. |
| **`JEV_MODE`** | **`llm`** | `rules` = simple heuristics; `llm` = TypeSafe Jev API (needs key). |
| **`JEV_SURFACE_THRESHOLD`** | **0.55** | In LLM mode: Jev “yes” probability must be ≥ this (and not classified as a routine repeat). |
| **`TYPESAFE_API_KEY`** | (your `.env`) | Jev API key; see [backend/README.md](backend/README.md). |

On Jev API failure, surfacing **falls back** to rule-based behavior for that segment.

### Quick reference — what each threshold affects

| Threshold | Bird log | Hero / SSE | WAV kept |
|-----------|----------|------------|----------|
| `BIRDNET_MIN_CONF` | ✅ | — | ✅ if logged |
| `MIN_CONFIDENCE` | — | ✅ | — |
| `JEV_*` (LLM mode) | — | ✅ | — |
| `EVENT_COOLDOWN_SECONDS` | — | ✅ | — |

---

## Continued example: one afternoon on the balcony

**Setup:** ESP32 on the sill, Mac on the same Wi‑Fi running backend (`0.0.0.0:8000`) and frontend (`npm run dev`). `BACKEND_HOST` in `include/config.h` points at the Mac’s LAN IP.

**08:00 — Quiet room**

- ESP32 sends ~1 s of PCM every second. Backend fills a **3 s** buffer.
- BirdNET hears mostly room tone; nothing ≥ **0.18** → **no log row**, **WAVs deleted**. UI stays on “Listening…”.

**08:04 — House Crow calls outside (strong)**

1. Buffer fills; backend saves `abc123.wav` + `abc123_48k.wav`.
2. BirdNET: *House Crow* **0.52** (above **0.18**) → up to 5 top species rows appended to **`detections.jsonl`**; WAVs **kept**.
3. **0.52 ≥ MIN_CONFIDENCE (0.40)** and cooldown clear → **JEV** gets context: species, confidence, past crow count, etc.
4. Jev returns high “surface” score → **WildlifeEvent** with `jev_reason` like `jev: confident detection (p=0.72)`.
5. UI: **12 s hero** (photo, name, clip) + card in **Your bird log** under *House Crow*.

**08:06 — Same crow, weaker slice**

- BirdNET: *House Crow* **0.22** → **logged** (≥ **0.18**), WAVs kept.
- **0.22 < MIN_CONFIDENCE (0.40)** → **no hero**; JEV is not asked for surfacing.
- The species card can still gain another line under **See more**.

**08:07 — Another strong crow (within 5 minutes)**

- **0.48**, logged, passes **0.40**, but **within 5 min** of last surface → **cooldown** blocks hero. Still logged.

**08:12 — First time Rose-ringed Parakeet flies past**

- BirdNET **0.53**, logged. First species in your log → JEV often surfaces with `new species for you`.
- Hero plays again; log shows one card for *Parakeet* (single detection) or grouped later.

**08:15 — Phone plays a European owl clip**

- BirdNET might score *Tawny Owl* high on audio alone, but **`BIRDNET_USE_GEO`** drops non-local species → **no prediction** → **WAVs deleted**, nothing in log.

**09:00 — You open History**

- Grouped cards: *House Crow* → “12 detections · See more” with timestamps and confidence; *Parakeet* with one clip.

That loop runs 24/7 while the ESP32 streams and the backend stays up.

---

## ESP32 — what it does and does not do

| Does | Does not |
|------|----------|
| Connect to **2.4 GHz** Wi‑Fi (`include/secrets.h`) | Run BirdNET or JEV |
| Sample mic **16 kHz**, mono | Store detection history |
| POST raw PCM to `http://<BACKEND_HOST>:8000/api/ingest/audio` | Use USB for audio (USB = power / flash only) |
| Send **heartbeat** (mic/Wi‑Fi OK) | Need reflashing when you change thresholds (backend only) |

Chunk size: **~1 s** of samples per upload (`SAMPLES_PER_CHUNK` in `include/config.h`). The backend, not the ESP32, decides the **3 s** analysis window.

---

## Data on disk (gitignored)

| Path | Contents |
|------|----------|
| `backend/data/history/detections.jsonl` | Every logged detection |
| `backend/data/history/events.jsonl` | Surfaced “visitor” events |
| `backend/data/history/image_cache.json` | Wikipedia thumbnail URLs |
| `backend/data/recordings/*.wav` | Clips for logged segments only (orphans auto-deleted) |

---

## Run locally

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit Wi‑Fi/BirdNET/JEV as needed
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**. The UI talks to **http://127.0.0.1:8000** (or your LAN IP from another device).

**ESP32:** [module.md](module.md) — set `BACKEND_HOST`, copy `secrets.example.h` → `secrets.h`, `pio run -t upload`.

**Health check**

```bash
curl -s http://127.0.0.1:8000/api/status | python3 -m json.tool
```

Shows BirdNET mode, analysis window, thresholds, and `jev_active`.

---

## Repo layout

| Path | Purpose |
|------|---------|
| `src/`, `include/`, `platformio.ini` | ESP32 firmware |
| `backend/` | FastAPI + BirdNET + JEV |
| `frontend/` | React UI |
| `module.md` | Hardware setup |
| `plan.md` | Product roadmap |

---

## Tuning tips

- **Too many log lines:** raise `BIRDNET_MIN_CONF` (e.g. 0.20).
- **Too many heroes:** raise `MIN_CONFIDENCE` and/or `JEV_SURFACE_THRESHOLD`; keep `JEV_MODE=llm`.
- **Too slow to react:** keep `ANALYSIS_WINDOW_SECONDS=3` (project default).
- **Old WAV clutter:** only new segments auto-delete; prune `backend/data/recordings/` manually once if needed.

More backend detail: **[backend/README.md](backend/README.md)**.
