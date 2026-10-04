# Hardware setup — ESP32 + INMP441 (Robocraze)

This module captures environmental audio on the ESP32 and streams it to your computer over Wi‑Fi. Wire it once, flash the firmware, then run the backend on your laptop.

## Parts

| Part | Notes |
|------|--------|
| ESP32 dev board | Generic `esp32dev` (30‑pin DevKit) |
| INMP441 MEMS mic | Robocraze (or any INMP441 breakout) |
| Breadboard + jumper wires | Short wires; keep I²S runs tidy |
| USB cable | Power + serial monitor |

## INMP441 pin labels

Most breakouts use these names (same pins, different silkscreen):

| Breakout label | Also called | Purpose |
|----------------|-------------|---------|
| VDD | VCC, 3V3 | Power **3.3 V only** (not 5 V) |
| GND | GND | Ground |
| SD | DOUT, DATA | I²S data from mic |
| WS | LRCLK, WS | Word select / left‑right clock |
| SCK | BCLK, SCK | Bit clock |
| L/R | SEL, CH | Channel select |

## Wiring (default firmware pins)

Connect **ESP32 → INMP441**:

| ESP32 GPIO | INMP441 pin | Wire color (suggested) |
|------------|-------------|-------------------------|
| **3V3** | VDD | Red |
| **GND** | GND | Black |
| **GPIO 26** | SCK (BCLK) | Yellow |
| **GPIO 25** | WS (LRCLK) | Green |
| **GPIO 33** | SD (DOUT) | Blue |
| **GND** | L/R (SEL) | Black (same as GND rail) |

Tie **L/R to GND** so the module outputs the **left** channel only (required for mono capture).

```
        ESP32 DevKit                    INMP441
      ┌─────────────┐                 ┌──────────┐
 3V3 ─┤ 3V3         ├─────────────────┤ VDD      │
 GND ─┤ GND         ├───────┬─────────┤ GND      │
      │             │       └─────────┤ L/R      │
GPIO26─┤ D26         ├─────────────────┤ SCK      │
GPIO25─┤ D25         ├─────────────────┤ WS       │
GPIO33─┤ D33         ├─────────────────┤ SD       │
      └─────────────┘                 └──────────┘
```

### Pin choice notes

- **Do not** power the INMP441 from **5 V** on `VIN` — use **3.3 V** only.
- GPIO **26 / 25 / 33** match `include/config.h`. You can change them there and reflash.
- Avoid strapping pins (e.g. **GPIO 0**, **12**, **15**) for I²S if your board uses them for boot/flash.

## Physical placement

- Point the mic hole toward the window or garden; avoid rubbing the cable.
- Keep the module away from the ESP32 switching regulator if you hear whine — a few cm helps.
- First tests: laptop on the same Wi‑Fi as the ESP32, device near a window with bird activity.

## Software before first power‑on

1. Copy Wi‑Fi credentials:
   ```bash
   cp include/secrets.example.h include/secrets.h
   ```
   Edit `include/secrets.h` with your SSID and password.

2. Edit `include/config.h`:
   - Set `BACKEND_HOST` to your computer’s **LAN IP** (e.g. `192.168.1.42`).
   - Keep `BACKEND_PORT` as `8000` unless you change the backend.

3. Build and upload (PlatformIO):
   ```bash
   pio run -t upload
   pio device monitor
   ```

4. On your computer, start the backend (see `backend/README.md`), then open the React app (`frontend/README.md`).

## Verify audio (no BirdNET yet)

1. Serial monitor should show Wi‑Fi connected and periodic `Audio chunk sent`.
2. Backend logs should show incoming bytes and WAV segments saved under `backend/data/recordings/`.
3. Play a saved `.wav` in that folder — you should hear room/window sound.

## Verify the mic is really working

Getting `.wav` files only means the **ESP32 → Wi‑Fi → backend** path works. The mic is working when the **numbers and sound** change when you make noise.

### 1. Phone test (good idea)

1. Open a **bird call** or music clip on your phone (moderate volume).
2. Hold the **phone speaker ~10–20 cm** from the INMP441 hole (not touching the board).
3. Watch the **serial monitor** after reflash — each second you should see something like:
   ```text
   Sent 16000 samples  peak=800  rms=120
   ```
   - **Quiet room:** peak often **50–500**, rms **20–150** (varies).
   - **Phone playing loudly nearby:** peak should jump to **2000–15000+**, rms **300+**.
   - If **peak and rms stay near 0** every second, the mic is not delivering data (wiring / channel select).

4. After ~10 s of louder audio, open the newest `.wav` in `backend/data/recordings/` (not the `_48k` file) — you should **hear** what played.

### 2. Quick check on saved WAVs (Mac)

From `backend/data/recordings/`:

```bash
python3 - <<'PY'
import wave, struct, math, glob, os
paths = [p for p in glob.glob("*.wav") if "_48k" not in p]
path = max(paths, key=os.path.getmtime)
with wave.open(path) as wf:
    raw = wf.readframes(wf.getnframes())
samples = struct.unpack("<" + "h" * (len(raw)//2), raw)
peak = max(abs(s) for s in samples)
rms = math.sqrt(sum(s*s for s in samples)/len(samples))
print(path, "peak", peak, "rms", round(rms, 1))
PY
```

Play the same file in QuickTime — you should hear the test sound if peak/rms are well above zero.

### 3. If still silent

| Try | Action |
|-----|--------|
| L/R channel | In `config.h` set `I2S_MIC_RIGHT_CHANNEL` to **1**, wire **L/R → 3V3**, reflash |
| Swap clocks | Exchange **WS ↔ SCK** wires (labels wrong on some boards) |
| Power | Confirm **VDD → 3V3**, not 5 V |
| SD data | Confirm **SD → GPIO 33** |

---

## Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| All zeros / silence | L/R tied to GND; SD on GPIO 33; 3.3 V power |
| Crackling / slow audio | Wrong sample rate in config; loose WS/SCK |
| Wi‑Fi fails | 2.4 GHz network only (ESP32); credentials in `secrets.h` |
| Backend never receives | `BACKEND_HOST` is LAN IP not `localhost`; firewall allows port 8000 |
| Upload fails | Hold BOOT if needed; correct USB port in PlatformIO |

## Next steps

Once WAV files sound correct, enable BirdNET in the backend (`USE_BIRDNET=true`). Supabase comes later; the app uses in‑memory storage until you connect a database.
