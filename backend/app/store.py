from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Detection:
    id: str
    species: str
    scientific_name: str | None
    confidence: float
    timestamp: datetime
    audio_path: str
    source_device: str
    model: str
    surfaced: bool = False
    image_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "species": self.species,
            "scientific_name": self.scientific_name,
            "confidence": self.confidence,
            "timestamp": self.timestamp.isoformat(),
            "audio_url": f"/api/recordings/{self.id}",
            "source_device": self.source_device,
            "model": self.model,
            "surfaced": self.surfaced,
            "image_url": self.image_url,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Detection:
        return cls(
            id=data["id"],
            species=data["species"],
            scientific_name=data.get("scientific_name"),
            confidence=float(data["confidence"]),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            audio_path=data["audio_path"],
            source_device=data.get("source_device", "unknown"),
            model=data.get("model", "birdnet"),
            surfaced=bool(data.get("surfaced", False)),
            image_url=data.get("image_url"),
        )


@dataclass
class WildlifeEvent:
    id: str
    detection_id: str
    species: str
    confidence: float
    timestamp: datetime
    event_type: str
    surface: bool
    jev_reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "detection_id": self.detection_id,
            "species": self.species,
            "confidence": self.confidence,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type,
            "surface": self.surface,
            "jev_reason": self.jev_reason,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> WildlifeEvent:
        return cls(
            id=data["id"],
            detection_id=data["detection_id"],
            species=data["species"],
            confidence=float(data["confidence"]),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            event_type=data.get("event_type", "visit"),
            surface=bool(data.get("surface", True)),
            jev_reason=data.get("jev_reason", ""),
        )


@dataclass
class SpeciesSummary:
    name: str
    scientific_name: str | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    sighting_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "scientific_name": self.scientific_name,
            "first_seen": self.first_seen.isoformat() if self.first_seen else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "sighting_count": self.sighting_count,
        }


@dataclass
class DeviceStatus:
    device_id: str
    last_seen: datetime
    mic_ok: bool
    wifi_ok: bool


class InMemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.detections: list[Detection] = []
        self.events: list[WildlifeEvent] = []
        self.species: dict[str, SpeciesSummary] = {}
        self.devices: dict[str, DeviceStatus] = {}
        self.recording_paths: dict[str, str] = {}
        self._detections_path: Path | None = None
        self._events_path: Path | None = None
        self._history_limit = 1000

    def configure_persistence(
        self,
        detections_path: Path,
        events_path: Path,
        *,
        history_limit: int = 1000,
    ) -> None:
        self._detections_path = detections_path
        self._events_path = events_path
        self._history_limit = history_limit
        detections_path.parent.mkdir(parents=True, exist_ok=True)
        self.load_history()

    def load_history(self) -> None:
        if self._detections_path is None:
            return
        with self._lock:
            self.detections.clear()
            self.events.clear()
            self.species.clear()
            self.recording_paths.clear()
            if self._detections_path.is_file():
                for line in self._detections_path.read_text(encoding="utf-8").splitlines():
                    if not line.strip():
                        continue
                    self._ingest_detection(Detection.from_dict(json.loads(line)), persist=False)
            if self._events_path and self._events_path.is_file():
                for line in self._events_path.read_text(encoding="utf-8").splitlines():
                    if not line.strip():
                        continue
                    self.events.insert(0, WildlifeEvent.from_dict(json.loads(line)))

    def _append_line(self, path: Path | None, payload: dict[str, Any]) -> None:
        if path is None:
            return
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def _ingest_detection(self, detection: Detection, *, persist: bool) -> None:
        self.detections.insert(0, detection)
        self.recording_paths[detection.id] = detection.audio_path
        key = detection.species
        summary = self.species.get(key)
        if summary is None:
            self.species[key] = SpeciesSummary(
                name=detection.species,
                scientific_name=detection.scientific_name,
                first_seen=detection.timestamp,
                last_seen=detection.timestamp,
                sighting_count=1,
            )
        else:
            summary.sighting_count += 1
            summary.last_seen = detection.timestamp
            if detection.scientific_name and not summary.scientific_name:
                summary.scientific_name = detection.scientific_name
        if persist:
            row = detection.to_dict()
            row["audio_path"] = detection.audio_path
            self._append_line(self._detections_path, row)
        if len(self.detections) > self._history_limit:
            self.detections = self.detections[: self._history_limit]

    def add_detection(self, detection: Detection) -> Detection:
        with self._lock:
            self._ingest_detection(detection, persist=True)
        return detection

    def mark_detection_surfaced(self, detection_id: str) -> None:
        with self._lock:
            for d in self.detections:
                if d.id == detection_id:
                    d.surfaced = True
                    break

    def add_event(self, event: WildlifeEvent) -> None:
        with self._lock:
            self.events.insert(0, event)
            row = event.to_dict()
            self._append_line(self._events_path, row)
            if len(self.events) > self._history_limit:
                self.events = self.events[: self._history_limit]

    def update_device(self, device_id: str, mic_ok: bool, wifi_ok: bool) -> None:
        with self._lock:
            self.devices[device_id] = DeviceStatus(
                device_id=device_id,
                last_seen=utc_now(),
                mic_ok=mic_ok,
                wifi_ok=wifi_ok,
            )

    def list_detections(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            return [d.to_dict() for d in self.detections[:limit]]

    def count_detections_for_species_since(self, species: str, since: datetime) -> int:
        with self._lock:
            return sum(1 for d in self.detections if d.species == species and d.timestamp >= since)

    def get_species_summary(self, species: str) -> SpeciesSummary | None:
        with self._lock:
            return self.species.get(species)

    def list_events(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            return [e.to_dict() for e in self.events[:limit]]

    def list_species(self) -> list[dict[str, Any]]:
        with self._lock:
            items = sorted(self.species.values(), key=lambda s: s.sighting_count, reverse=True)
            return [s.to_dict() for s in items]

    def device_status(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                {
                    "device_id": d.device_id,
                    "last_seen": d.last_seen.isoformat(),
                    "mic_ok": d.mic_ok,
                    "wifi_ok": d.wifi_ok,
                }
                for d in self.devices.values()
            ]

    def get_recording_path(self, detection_id: str) -> str | None:
        with self._lock:
            return self.recording_paths.get(detection_id)


store = InMemoryStore()
