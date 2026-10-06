# Wildlife Observer — frontend

Mobile-first React app for the observer: a swipeable deck of **Rive animal cards** for every bird heard, an hourly **Radar**, and a **Logbook** of everything collected. It runs on a phone browser on the same Wi‑Fi as the backend, and inside a phone frame on a laptop.

Stack: **React 19**, **TypeScript**, **Vite 6**, **react-router 7**, **`@rive-app/webgl2`** (2.44).

## Run

Start the backend first ([`../backend/README.md`](../backend/README.md)), then:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, also on your LAN IP (host: true)
npm run build      # type-checked production build in dist/
```

Open it on your phone at `http://<mac-lan-ip>:5173`. The API is found automatically: the same host as the page, port **8000** (override with `VITE_API_BASE`).

## Screens

| Tab | Route | What it shows |
|-----|-------|---------------|
| **Scan** | `/` | One full-screen reel per species, newest first. Each reel is the Rive animal card plus a frosted pill: play the best call, when it was last heard, and an expand icon that opens the species sheet. A status pill at the top pulses while listening and says "Heard a …!" when a call arrives. |
| **Radar** | `/soundscape` | Calls per hour for a chosen day, with species avatars on the bars and a list of what was heard. |
| **Logbook** | `/logbook` | Grid of every species collected. Search, sort (Recent / Most heard / A–Z), a **Call** menu to filter by call quality, and a calendar button that opens a From/To date sheet. |

**Species sheet** (from Scan or Logbook): photo, names, "Last heard Today, 16:24", the best call, call count, and the full call log with ⋮ menus (download, share). Chips filter the log by call quality: only types the bird actually has are shown, it opens on the best available (Clear Call, then Likely, then All), and the chips are hidden when every call is the same type. The photo credit sits at the bottom.

A surfaced (hero) event shows a "Bird found! It's a …" toast on every tab and is spoken aloud (`utils/heroVoice.ts`).

## Call quality instead of confidence

Users never see BirdNET's score. Each call gets a plain label, defined in `utils/detections.ts` (`confidenceTier`):

| Label | Score | Hint | Colour |
|-------|-------|------|--------|
| **Clear Call** | ≥ 0.85 | Loud and unmistakable | mint |
| **Likely** | 0.60 to under 0.85 | Probably this bird | yellow |
| **Faint** | under 0.60 | Distant or partly masked — could be a lookalike | grey |

The call button's playing state (bars + progress ring) takes the same colour.

## The Rive animal card

`public/rive/animal-card.riv` is built from the Rive CLI project at `~/Documents/rive-cli/animal-card/rive` (editor file 2629223). `components/RiveCard.tsx` drives it:

- **Artboard `AnimalCard`, state machine `Card`.** The artboard is phone-shaped (610×1082, 9:16) with the 358.5×508.5 card at (305, 440). The canvas covers the whole reel with `Fit.Cover` + `TopCenter`, so the card's aura runs off the screen edges. `utils/cardLayout.ts` mirrors that geometry so the pill sits under the card — **keep it in sync if the artboard changes.**
- **View model `front`:** `photo` (the species image, downloaded as soon as the card mounts), `birdName` and `scientificName` (from BirdNET), and `harmony` 0–4, the colour scheme of the Madhubani print. Harmony is a hash of the species name, like contact avatars: random-looking, but the same for a bird on every load and device.
- **Back first.** Cards open on the Madhubani print; a tap fires the `flip` trigger. The app listens to that trigger and remembers per species (in `localStorage`) when a card was left on the front, restoring it on remount or reload.
- **Performance.** Only the reel on screen and its neighbours mount a canvas; off-screen and hidden-tab cards are paused. A new card keeps running, hidden, for 1 s after its photo is set so the back print is rebuilt before it is seen.
- **Failure-safe.** Rive teardown errors are contained, and an error boundary falls back to a plain photo card (`SpeciesCard`).
- The runtime's `.wasm` is bundled and served by the app (no CDN), so the card works on a LAN without internet.

### Updating the card

```bash
cd ~/Documents/rive-cli/animal-card
rive pull rive --yes            # bring down editor changes (safe: the editor has the current layout)
rive rive --publish             # signed build → rive/build/rive.riv
cp rive/build/rive.riv <repo>/frontend/public/rive/animal-card.riv
rive push rive                  # after local edits, so the editor stays the source of truth
```

## How data flows

- `data/DetectionsProvider.tsx` owns **one** detections poll (every 5 s, latest 500) and **one** `EventSource` on `/api/events/stream`; every tab reads from it, and new `detection` / `event` messages trigger a refresh. Components subscribe to stream messages with `useStream`.
- Tabs mount on first visit and then stay mounted (hidden while inactive), so switching is instant and each tab keeps its scroll position.
- `audio/AudioProvider.tsx` is a single shared `<audio>` element: only one call plays at a time, and every `CallButton` shows its progress.
- Photos and credits come from the backend on each detection (`image_url`, `image_credit`).

## Layout

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Providers, kept-alive tabs, tab bar, hero toast |
| `src/pages/ObserverPage.tsx` | Scan reels, status pill, play pill |
| `src/pages/SoundscapePage.tsx` | Radar |
| `src/pages/LogbookPage.tsx` | Logbook grid and filters |
| `src/components/RiveCard.tsx` | Rive card binding, flip memory, pause/warm-up |
| `src/components/SpeciesSheet.tsx`, `CallLog.tsx`, `CallButton.tsx` | Species sheet, call log, play button |
| `src/components/CallFilterChip.tsx`, `DateRangeSheet.tsx`, `BottomSheet.tsx` | Logbook filters and the shared bottom sheet |
| `src/utils/detections.ts` | Grouping, date filters, call tiers and tier filters |
| `src/styles/global.css` | All styles, including the desktop phone frame at the end |

`HistoryPage`, `WildlifePage` and `DetectionHistoryList` are earlier screens that are no longer routed.

## Desktop

On screens at least 600×640 the app renders inside a phone frame (bezel, Dynamic Island, home indicator, simulated safe areas). The frame is the containing block for fixed elements, so sheets, the toast and the tab bar stay inside the phone. On a real phone the app is full-screen.
