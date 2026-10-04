# Personal Wildlife Observer

## 0. The idea

A small physical observer that quietly listens to the environment around me.

Instead of asking me to actively identify wildlife, it discovers what's already happening around me throughout the day.

> **The environment makes the first move.**

Initially:

* 🐦 Birds
* 🐸 Frogs
* 🦗 Insects

Later:

* Other animals
* Different sound events
* Weather/environmental events

The output isn't just a database of detections.

It's a **living personal record of the wildlife around me.**

---

# 1. What I'm building

### Physical layer

**ESP32 + I²S MEMS microphone**

Continuously captures short chunks of environmental audio and sends them over Wi-Fi.

### Intelligence layer

Audio → species recognition → confidence/filtering → event creation → JEV judgment

### Experience layer

React web application showing:

* What's happening now
* Recently detected species
* Personal wildlife collection
* Soundscape over time
* Audio recordings
* Rive animations

### Display

**Phase 1:** Browser / laptop screen

**Phase 2:** My phone as a dedicated display

**Phase 3:** Potentially a custom physical display/object

Don't build Phase 3 yet.

---

# 2. Core experience

The device should mostly be **quiet**.

I'm not building a dashboard that constantly screams:

> BIRD DETECTED
> BIRD DETECTED
> BIRD DETECTED

Instead, the environment is continuously observed and the interface occasionally comes alive.

Example:

### 7:42 AM

A bird call is detected.

The recognition system identifies:

**Oriental Magpie-Robin**

High confidence.

The web experience wakes up.

A Rive animation plays.

> **A new visitor.**
>
> Oriental Magpie-Robin
> Heard at 7:42 AM

The recording is playable.

Then the interface settles back down.

---

# 3. Architecture

```text
                    PHYSICAL WORLD
                          │
                          ▼
                ┌──────────────────┐
                │  I²S Microphone  │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │      ESP32       │
                │ Audio capture    │
                │ Wi-Fi streaming  │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │ Audio Processing │
                │ / Backend        │
                └────────┬─────────┘
                         │
                ┌────────┴─────────┐
                ▼                  ▼
        ┌──────────────┐   ┌──────────────┐
        │ Species      │   │ Audio        │
        │ Recognition  │   │ Recording    │
        └──────┬───────┘   └──────┬───────┘
               │                  │
               └────────┬─────────┘
                        ▼
                ┌──────────────────┐
                │ Event Processor  │
                │ confidence       │
                │ deduplication    │
                │ novelty          │
                └────────┬─────────┘
                         │
                         ▼
                     ┌───────┐
                     │  JEV  │
                     └───┬───┘
                         │
                         ▼
                ┌──────────────────┐
                │ Wildlife Events  │
                │ Database         │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │ React + Rive     │
                │ Web Experience   │
                └────────┬─────────┘
                         │
                         ▼
                  PHONE / WEB SCREEN
```

---

# 4. Phase 1 — Get the microphone working

**Current status: microphone ordered.**

Do NOT build the full product yet.

First milestone:

> Get real environmental audio from the microphone into my computer.

### Tasks

* [ ] Identify exact ESP32 board
* [ ] Connect I²S microphone
* [ ] Configure I²S
* [ ] Capture PCM audio
* [ ] Confirm sample rate / bit depth
* [ ] Stream audio over Wi-Fi
* [ ] Receive stream on computer
* [ ] Save audio as WAV
* [ ] Play the recorded audio back

### Success condition

I can sit near a window for a while and produce an actual recording that contains environmental sound captured by the ESP32.

---

# 5. Phase 2 — Make the ESP32 a reliable sensor

The ESP32 should stay deliberately dumb.

Its job:

```text
listen
   ↓
capture
   ↓
send
```

It should NOT be responsible for:

* BirdNET inference
* LLM calls
* JEV
* database logic
* UI
* image generation

That keeps the hardware simple and makes the system replaceable.

### ESP32 responsibilities

* Wi-Fi connection
* microphone initialization
* audio buffering
* streaming
* reconnecting when Wi-Fi drops
* basic health/status reporting

Eventually:

```text
ESP32
  ├── microphone status
  ├── Wi-Fi status
  ├── audio stream
  └── device ID
```

---

# 6. Phase 3 — Bird recognition

Start with **birds only**.

Don't try to solve birds + insects + frogs simultaneously.

The first question is:

> Can this thing reliably tell me that a bird was around?

Use an existing bioacoustic model rather than training one.

Candidate:

**BirdNET**

Pipeline:

```text
audio
  ↓
10 sec-ish analysis window
  ↓
BirdNET
  ↓
species + confidence
```

Store the raw prediction.

Example:

```json
{
  "species": "Oriental Magpie-Robin",
  "confidence": 0.91,
  "timestamp": "...",
  "audio_url": "...",
  "source": "esp32"
}
```

---

# 7. Phase 4 — Event processing

This is where a raw model prediction becomes a **wildlife event**.

Don't send every model prediction directly into the UI.

Example:

```text
BirdNET

08:31  Oriental Magpie-Robin  0.88
08:32  Oriental Magpie-Robin  0.91
08:33  Oriental Magpie-Robin  0.87
08:34  Oriental Magpie-Robin  0.93
```

The product should probably interpret that as:

> Oriental Magpie-Robin visiting

rather than four separate discoveries.

### Deterministic logic first

Handle:

* confidence threshold
* duplicate predictions
* repeated detections
* cooldown windows
* minimum audio quality
* missing/invalid recordings

This shouldn't depend on an LLM.

---

# 8. Phase 5 — JEV

JEV sits **after recognition**, not before it.

Its job is judgment, not identification.

### Bad architecture

```text
audio → JEV → "probably a bird"
```

### Better architecture

```text
audio
 ↓
bioacoustic model
 ↓
structured predictions
 ↓
event processor
 ↓
JEV
 ↓
"Is this worth surfacing?"
```

JEV can consider:

* Is this a new species for me?
* Is this an unusually confident detection?
* Has this already been detected repeatedly today?
* Is this a meaningful change in my soundscape?
* Is this event worth interrupting the otherwise quiet interface?

Example:

```text
Prediction:
Oriental Magpie-Robin
confidence: 0.93

History:
first seen today
12 previous sightings this month

JEV:
surface = true
reason = "new species today"
```

Important:

**JEV must never upgrade an uncertain classification into a confirmed species.**

The classifier establishes what was detected.

JEV decides what deserves attention.

---

# 9. Phase 6 — Database

Start simple.

Supabase/Postgres is a good fit.

### `detections`

```text
id
species
confidence
timestamp
audio_url
source_device
latitude/area [optional later]
model
```

### `events`

```text
id
detection_id
event_type
surface
jev_reason
created_at
```

### `species`

```text
id
name
scientific_name
image_url
first_seen
last_seen
sighting_count
```

Don't over-design the schema before real data exists.

---

# 10. Phase 7 — Web experience

Stack:

```text
React
TypeScript
Vite
Rive
Supabase
```

The web app is the first "physical display."

No native app yet.

No special display hardware yet.

---

## Screen 1 — The Observer

This is the main screen.

Mostly empty / calm.

When nothing interesting is happening:

> Listening…

When something happens:

**A small animated creature appears.**

Example:

```text
        ✦

      [ RIVE ]
     bird animation

  Oriental Magpie-Robin

       7:42 AM

     ▶ Listen
```

The animation should feel like the system **noticed something**, not like a generic loading animation.

---

# 11. Rive interaction direction

Rive becomes the personality layer.

Don't make it:

> Bird PNG + fade in

Instead, give the creature states.

Example:

```text
IDLE
  ↓
LISTENING
  ↓
NOTICE
  ↓
EXCITED
  ↓
OBSERVING
  ↓
REST
```

The state machine could react to:

* new detection
* confidence
* species
* repeated sighting
* time of day
* user interaction

Eventually:

```text
Morning
→ energetic

Rare species
→ curious

Repeated detection
→ barely reacts

Night
→ sleepy
```

That's where the project starts becoming an **interaction system**, rather than an IoT dashboard.

---

# 12. Screen 2 — My Wildlife

A collection of everything observed.

```text
MY WILDLIFE

🐦 12 species
🦗 4 species
🐸 2 species

──────────────

Oriental Magpie-Robin
First seen: Oct 2
Seen: 18 times

Common Tailorbird
First seen: Sep 28
Seen: 11 times
```

Each species can have:

* image
* Rive animation
* recordings
* first/last detected
* frequency
* time-of-day pattern

---

# 13. Screen 3 — Soundscape

This could become the most interesting data visualization.

Instead of a traditional analytics dashboard:

```text
06 AM     🐦
07 AM     🐦 🐦
08 AM     🐦 🦗
09 AM     🦗
...
06 PM     🐦 🐸
```

Over days/weeks:

> **What does my neighbourhood sound like?**

You could eventually discover:

* species that only appear in the morning
* species that appear after rain
* seasonal changes
* quiet periods
* recurring visitors

---

# 14. Phone phase

Once the web version works:

**Turn your own phone into the dedicated display.**

The phone can simply open:

```text
wildlife.yourdomain.com/display
```

Then:

* fullscreen
* screen stays awake
* notifications disabled
* landscape/portrait depending on composition
* automatic realtime updates

The phone doesn't need to know anything about audio.

It's simply the **visual endpoint**.

```text
ESP32
   ↓
Backend
   ↓
Database / realtime
   ↓
Phone
```

This means the physical observer can eventually be sitting somewhere else in the room while the phone becomes the "face" of it.

---

# 15. Phase 3 — Expand beyond birds

Only after the bird pipeline works.

### Frogs

Add a frog/bioacoustic model and event type.

### Insects

Explore insect-specific acoustic recognition.

This will likely be harder than birds because of:

* quieter signals
* overlapping sounds
* frequency differences
* environmental noise
* species similarity

Treat this as a separate model problem rather than assuming BirdNET will solve everything.

---

# 16. What I should NOT build yet

Avoid these for now:

* ❌ Custom PCB
* ❌ Custom enclosure
* ❌ Dedicated LCD
* ❌ Native mobile app
* ❌ Training my own ML model
* ❌ Bird + frog + insect recognition simultaneously
* ❌ Complex analytics
* ❌ Authentication
* ❌ Multi-user support
* ❌ Cloud architecture perfection
* ❌ Fancy JEV orchestration

The first goal is much smaller.

---

# 17. Milestones

### M0 — Hardware arrives

**ESP32 + microphone**

↓

### M1 — Audio

I can capture and save environmental audio.

↓

### M2 — Live stream

ESP32 → computer over Wi-Fi.

↓

### M3 — Recognition

Real bird call → species + confidence.

↓

### M4 — Events

Raw predictions → meaningful wildlife events.

↓

### M5 — Web

Real events appear in React.

↓

### M6 — Rive

New discoveries trigger expressive animation.

↓

### M7 — JEV

JEV decides what deserves attention.

↓

### M8 — Personal history

Collection + soundscape timeline.

↓

### M9 — Phone

Phone becomes the dedicated physical display.

↓

### M10 — Expand

Frogs → insects → broader environmental intelligence.

---

# 18. The first weekend goal

Don't think about the whole product.

Just achieve this:

```text
        REAL WORLD
             ↓
        🎙️ microphone
             ↓
           ESP32
             ↓
          Wi-Fi
             ↓
         COMPUTER
             ↓
       saved WAV file
             ↓
       "I can hear what
        the device heard"
```

If that works, the project is alive.

Then we add intelligence.

Then interaction.

Then personality.

---

# 19. North Star

The interesting version of this isn't:

> "An AI bird detector."

It's:

> **A little machine that helps me notice the living world around me.**

The software should gradually build a memory of the place it lives in.

And the physical display shouldn't behave like a dashboard.

It should feel like **another little observer living alongside me.**
