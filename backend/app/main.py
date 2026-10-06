from __future__ import annotations

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.audio_utils import AudioSegmentBuffer, pcm_stats, resample_pcm_int16, save_wav
from app.birdnet_runner import birdnet_runner
from app.config import settings
from app.event_processor import event_processor
from app.species_images import attach_image, request_species_image
from app.species_images import configure_cache as configure_image_cache
from app.store import WildlifeEvent, store

import logging

logger = logging.getLogger(__name__)

app = FastAPI(title="Wildlife Observer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(settings.data_dir)
RECORDINGS_DIR = DATA_DIR / "recordings"
HISTORY_DIR = DATA_DIR / "history"
DETECTIONS_LOG = HISTORY_DIR / "detections.jsonl"
EVENTS_LOG = HISTORY_DIR / "events.jsonl"
IMAGE_CACHE = HISTORY_DIR / "image_cache.json"
segment_buffers: dict[str, AudioSegmentBuffer] = {}
event_subscribers: list[asyncio.Queue[str]] = []
analysis_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="birdnet")
last_segment_diagnostics: dict[str, object] = {}


class HeartbeatBody(BaseModel):
    device_id: str
    mic_ok: bool = True
    wifi_ok: bool = True


def get_buffer(device_id: str) -> AudioSegmentBuffer:
    if device_id not in segment_buffers:
        segment_buffers[device_id] = AudioSegmentBuffer(
            settings.analysis_window_seconds,
            settings.ingest_sample_rate,
        )
    return segment_buffers[device_id]


async def broadcast_message(payload: dict) -> None:
    message = json.dumps(payload)
    dead: list[asyncio.Queue[str]] = []
    for queue in event_subscribers:
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            dead.append(queue)
    for queue in dead:
        if queue in event_subscribers:
            event_subscribers.remove(queue)


def _delete_segment_files(wav_path: Path, birdnet_path: Path) -> None:
    for path in (wav_path, birdnet_path):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not delete unused recording %s", path)


def process_segment(pcm: bytes, device_id: str) -> tuple[list[dict], WildlifeEvent | None]:
    segment_id = str(uuid4())
    wav_path = RECORDINGS_DIR / f"{segment_id}.wav"
    save_wav(wav_path, pcm, settings.ingest_sample_rate)

    birdnet_pcm = resample_pcm_int16(
        pcm,
        settings.ingest_sample_rate,
        settings.birdnet_sample_rate,
    )
    birdnet_path = RECORDINGS_DIR / f"{segment_id}_48k.wav"
    save_wav(birdnet_path, birdnet_pcm, settings.birdnet_sample_rate)

    predictions = birdnet_runner.analyze_wav(birdnet_path)
    peak, rms = pcm_stats(pcm)
    if not predictions:
        peek = birdnet_runner.peek_top(birdnet_path)
        last_segment_diagnostics.update(
            {
                "peak": peak,
                "rms": round(rms, 1),
                "logged": False,
                "reason": "no_species_above_birdnet_min_conf",
                "birdnet_min_conf": settings.birdnet_min_conf,
                "peek_species": peek.species if peek else None,
                "peek_confidence": round(peek.confidence, 3) if peek else None,
            }
        )
        if rms < 150:
            logger.warning(
                "Segment very quiet (peak=%s rms=%.0f) — check mic aim at window",
                peak,
                rms,
            )
        elif peek and peek.confidence >= settings.birdnet_min_conf:
            logger.info(
                "Segment loud (rms=%.0f) but geo/threshold filtered; peek=%s %.2f",
                rms,
                peek.species,
                peek.confidence,
            )
        elif peek:
            logger.info(
                "Birds weak in clip (rms=%.0f) peek=%s %.2f below min %.2f",
                rms,
                peek.species,
                peek.confidence,
                settings.birdnet_min_conf,
            )
        _delete_segment_files(wav_path, birdnet_path)
        return [], None

    detections, event = event_processor.process(
        predictions,
        audio_path=str(wav_path),
        source_device=device_id,
        model=f"birdnet ({birdnet_runner.mode})",
    )
    if not detections:
        _delete_segment_files(wav_path, birdnet_path)
        return [], event
    last_segment_diagnostics.update(
        {
            "peak": peak,
            "rms": round(rms, 1),
            "logged": True,
            "top_species": detections[0].species,
            "top_confidence": round(detections[0].confidence, 3),
        }
    )
    return [d.to_dict() for d in detections], event


async def analyze_and_notify(segment: bytes, device_id: str) -> None:
    loop = asyncio.get_running_loop()
    try:
        new_detections, event = await loop.run_in_executor(
            analysis_executor,
            process_segment,
            segment,
            device_id,
        )
    except Exception:
        logger.exception("BirdNET segment processing failed")
        return

    for det in new_detections:
        await broadcast_message({"type": "detection", **attach_image(det)})
    if event is not None:
        ev_payload = event.to_dict()
        match = next((d for d in new_detections if d["id"] == event.detection_id), None)
        if match and match.get("image_url"):
            ev_payload["image_url"] = match["image_url"]
        await broadcast_message({"type": "event", **ev_payload})


@app.get("/api/status")
def status() -> dict:
    return {
        "ok": True,
        "birdnet_mode": birdnet_runner.mode,
        "birdnet_init_error": birdnet_runner._init_error,
        "use_birdnet": settings.use_birdnet,
        "birdnet_geo": settings.birdnet_use_geo,
        "birdnet_lat": settings.birdnet_lat,
        "birdnet_lon": settings.birdnet_lon,
        "analysis_window_seconds": settings.analysis_window_seconds,
        "birdnet_min_conf": settings.birdnet_min_conf,
        "min_confidence": settings.min_confidence,
        "storage": "jsonl history on disk (Supabase later)",
        "jev_mode": settings.jev_mode,
        "jev_llm_configured": bool(settings.typesafe_pai_api_key.strip()),
        "jev_model": settings.jev_model,
        "jev_surface_threshold": settings.jev_surface_threshold,
        "jev_active": settings.jev_mode.strip().lower() in {"llm", "jev", "hybrid"}
        and bool(settings.typesafe_pai_api_key.strip()),
        "devices": store.device_status(),
        "last_segment": last_segment_diagnostics,
    }


@app.get("/api/detections")
def list_detections(limit: int = 200) -> dict:
    return {"detections": [attach_image(d) for d in store.list_detections(limit)]}


@app.get("/api/events")
def list_events(limit: int = 20) -> dict:
    return {"events": store.list_events(limit)}


@app.get("/api/species")
def list_species() -> dict:
    return {"species": store.list_species()}


@app.get("/api/events/stream")
async def events_stream() -> StreamingResponse:
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=32)
    event_subscribers.append(queue)

    async def generator():
        try:
            yield "data: {\"type\":\"connected\"}\n\n"
            while True:
                message = await queue.get()
                yield f"data: {message}\n\n"
        finally:
            if queue in event_subscribers:
                event_subscribers.remove(queue)

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.get("/api/recordings/{detection_id}")
def get_recording(detection_id: str) -> FileResponse:
    path = store.get_recording_path(detection_id)
    if path is None or not Path(path).is_file():
        raise HTTPException(status_code=404, detail="Recording not found")
    return FileResponse(path, media_type="audio/wav")


@app.post("/api/ingest/heartbeat")
async def ingest_heartbeat(body: HeartbeatBody) -> dict:
    store.update_device(body.device_id, body.mic_ok, body.wifi_ok)
    return {"ok": True}


@app.post("/api/ingest/audio")
async def ingest_audio(
    request: Request,
    x_device_id: str = Header(default="unknown"),
    x_sample_rate: str = Header(default=str(settings.ingest_sample_rate)),
    x_bits_per_sample: str = Header(default="16"),
    x_channels: str = Header(default="1"),
) -> dict:
    if x_bits_per_sample != "16" or x_channels != "1":
        raise HTTPException(status_code=400, detail="Expected 16-bit mono PCM")

    try:
        sample_rate = int(x_sample_rate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid sample rate") from exc

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty body")

    buffer = get_buffer(x_device_id)
    if sample_rate != settings.ingest_sample_rate:
        # ESP32 config should match; still accept but log via response
        pass

    segment = buffer.append(body)
    queued = False
    if segment is not None:
        asyncio.create_task(analyze_and_notify(bytes(segment), x_device_id))
        queued = True

    return {
        "ok": True,
        "bytes_received": len(body),
        "segment_ready": segment is not None,
        "analysis_queued": queued,
    }


@app.on_event("startup")
def on_startup() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    store.configure_persistence(DETECTIONS_LOG, EVENTS_LOG)
    configure_image_cache(IMAGE_CACHE)
    for species in store.list_species():
        request_species_image(species["name"], species.get("scientific_name"))
