# Architecture

How a bird call outside the window becomes a card on the phone.

```text
 bird call
    │
    ▼
 INMP441 mic ──I²S──▶ ESP32 ──Wi‑Fi, ~1 s PCM chunks──▶ Backend (FastAPI, on the Mac)
                                                          │
                                   3 s buffer ─▶ WAV ─▶ BirdNET ─▶ detections log
                                                          │
                                                          ▼
                                     event rules ─▶ JEV ─▶ surfaced event
                                                          │
                                                 REST + live stream (SSE)
                                                          │
                                                          ▼
                                     React app on the phone: Scan · Radar · Logbook
```

Each stage has one job: the ESP32 only listens, BirdNET only names, JEV only decides what deserves attention, and the app only shows.

---

## 1. Hardware input — ESP32 + INMP441

An **INMP441** MEMS microphone feeds an **ESP32 DevKit** over I²S.

| INMP441 | ESP32 |
|---------|-------|
| VDD | 3V3 (never 5 V) |
| GND | GND |
| SCK (bit clock) | GPIO 26 |
| WS (word select) | GPIO 25 |
| SD (data) | GPIO 33 |
| L/R | GND (left channel = mono) |

The firmware (`src/`, `include/`):

- samples **16 kHz, 16‑bit mono**;
- POSTs every **~1 s** of raw PCM to `http://<BACKEND_HOST>:8000/api/ingest/audio`, tagged with `X-Device-Id: esp32-observer-1`;
- sends a heartbeat (mic / Wi‑Fi OK) every 30 s and reconnects when Wi‑Fi drops.

It does no recognition and stores nothing. Pins, sample rate and `BACKEND_HOST` (the Mac's LAN IP) live in `include/config.h`; Wi‑Fi credentials go in `include/secrets.h` (gitignored — never in `secrets.example.h`). Flash with `pio run -t upload`; reflash only for Wi‑Fi, host, pin or audio changes.

If recordings are silent: check L/R is tied to GND, SD is on GPIO 33, and power is 3.3 V; the serial monitor prints `peak` / `rms` per chunk, which should jump when you play a sound near the mic.

## 2. Reaching the backend — ingest

`backend/app/main.py` collects the chunks per device until it has **3 s** of audio (`ANALYSIS_WINDOW_SECONDS`, BirdNET's native window). Each full segment is saved as a WAV (16 kHz, plus a 48 kHz copy for BirdNET) and analysed off the request path, so the ESP32 is never kept waiting.

## 3. Naming the bird — BirdNET

`birdnet_runner.py` runs **BirdNET** on the segment, geo-filtered to species that occur near `BIRDNET_LAT` / `BIRDNET_LON` (Bengaluru).

- Anything scoring at least **`BIRDNET_MIN_CONF` (0.20)** is **logged**: up to the top 5 species go to `detections.jsonl`, and the WAV is kept for playback.
- If nothing reaches 0.20, the segment's WAVs are **deleted**. Noise never piles up on disk.

BirdNET has the final say on *which* bird it was.

## 4. Deciding what matters — event rules + JEV

Logging is quiet; only some detections should interrupt the app. `event_processor.py` takes the segment's best prediction and:

1. drops it if it scores under **`MIN_CONFIDENCE` (0.35)**;
2. drops it if the same species surfaced in the last **5 minutes** (`EVENT_COOLDOWN_SECONDS`);
3. otherwise asks **JEV**.

**JEV** (`jev_client.py`) is the judgment layer. With `JEV_MODE=llm` it sends TypeSafe Jev the context — species, confidence, whether it's a first-ever species, how often it has been heard — and surfaces the event if Jev's "worth interrupting" probability is at least **`JEV_SURFACE_THRESHOLD` (0.55)**. If the API fails, simple rules decide instead. JEV never changes the species; it only decides whether this moment is worth a "Bird found!".

A surfaced event is saved to `events.jsonl` with Jev's reason.

## 5. Photos

BirdNET has no pictures. `species_images.py` takes each species' **Wikipedia** thumbnail, falling back to **iNaturalist** (reusable Creative Commons licences only), and caches the URL with its photo credit. Lookups happen in the background, so nothing waits on the network.

## 6. Reaching the UI — API and live stream

| Endpoint | Used for |
|----------|----------|
| `GET /api/detections` | The history, newest first, each with its photo and credit |
| `GET /api/events/stream` | Live push (SSE): a `detection` message per logged call, an `event` message per surfaced one |
| `GET /api/recordings/{id}` | The call's WAV for playback |
| `GET /api/status` | Health, thresholds, the last segment's levels |

## 7. The app — React + Rive

`frontend/` is a mobile web app, opened on the phone at `http://<mac-lan-ip>:5173` (on a laptop it shows inside a phone frame). One shared feed polls `/api/detections` every 5 s and listens to the stream, so every screen updates live.

- **Scan** — a card per species, newest first. The card is a **Rive** animation: a Madhubani print of the bird on the back, its photo and names on the front (tap to flip), each bird with its own fixed colour scheme. A pill plays the best call and opens the bird's call history. The top pill pulses "Listening…" and says "Heard a …!" on each detection.
- **Radar** — calls per hour for a chosen day.
- **Logbook** — every species collected, with search, sorting, a call-quality filter and dates.
- A **surfaced event** shows a "Bird found!" toast.

The app never shows BirdNET's score. Each call gets a label instead:

| Label | BirdNET score | What it tells the user | Colour in the app |
|-------|---------------|------------------------|-------------------|
| **Clear Call** | **≥ 0.85** | Loud and unmistakable | mint |
| **Likely** | **0.60 to under 0.85** | Probably this bird | yellow |
| **Faint** | **under 0.60** (down to the logging floor) | Distant or partly masked — could be a lookalike | grey |

These only change what the app shows (set in `frontend/src/utils/detections.ts`); what gets logged and surfaced is still decided by the 0.20 and 0.35 thresholds above.

---

## Where things live

| Change | Where |
|--------|-------|
| Pins, sample rate, backend address | `include/config.h` (reflash) |
| Wi‑Fi credentials | `include/secrets.h` (reflash) |
| Logging / surfacing thresholds, JEV mode and key, location | `backend/.env` (restart the backend) |
| Call labels in the app | `frontend/src/utils/detections.ts` |
| The animal card | Rive CLI project `~/Documents/rive-cli/animal-card` → `frontend/public/rive/animal-card.riv` |
| History on disk | `backend/data/history/` (`detections.jsonl`, `events.jsonl`, `image_cache.json`) and `backend/data/recordings/` — gitignored |

More detail: [README.md](README.md) (thresholds and a worked example), [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md).
