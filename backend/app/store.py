from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from app.supabase_client import SupabaseClient

logger = logging.getLogger(__name__)

DETECTION_COLUMNS = (
    "id,species,scientific_name,confidence,timestamp,audio_path,source_device,model,surfaced,image_url"
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(value: str) -> datetime:
    """ISO timestamps from JSONL or Postgres. Python 3.9's fromisoformat needs exactly 3 or 6
    fractional digits and no "Z"; Postgres trims trailing zeros (e.g. 10:07:10.0348+00:00)."""
    text = value.replace("Z", "+00:00")
    text = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], text, count=1)
    return datetime.fromisoformat(text)


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

    def to_row(self) -> dict[str, Any]:
        """The stored form: as served, minus the derived audio_url, plus where the clip lives."""
        row = self.to_dict()
        row.pop("audio_url")
        row["audio_path"] = self.audio_path
        return row

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Detection:
        return cls(
            id=data["id"],
            species=data["species"],
            scientific_name=data.get("scientific_name"),
            confidence=float(data["confidence"]),
            timestamp=parse_ts(data["timestamp"]),
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
            timestamp=parse_ts(data["timestamp"]),
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
        # With Supabase configured, history lives in Postgres; the JSONL files then only catch
        # rows a Supabase write failed for, so scripts/migrate_to_supabase.py can push them later.
        self._remote: SupabaseClient | None = None

    @property
    def remote(self) -> SupabaseClient | None:
        return self._remote

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

    def use_supabase(self, client: SupabaseClient) -> None:
        """Keep history in Supabase instead of the JSONL files (which stay as a write-failure backup)."""
        self._remote = client
        self.load_history()

    def load_history(self) -> None:
        if self._detections_path is None:
            return
        with self._lock:
            self._load_history_unlocked()

    def _load_history_unlocked(self) -> None:
        if self._detections_path is None:
            return
        self.detections.clear()
        self.events.clear()
        self.species.clear()
        self.recording_paths.clear()
        if self._remote is not None:
            self._load_remote_unlocked(self._remote)
            return
        if self._detections_path.is_file():
            for line in self._detections_path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                self._ingest_detection(Detection.from_dict(json.loads(line)))
        if self._events_path and self._events_path.is_file():
            for line in self._events_path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                self.events.insert(0, WildlifeEvent.from_dict(json.loads(line)))

    def _load_remote_unlocked(self, remote: SupabaseClient) -> None:
        # Recent detections in memory (newest first); species totals over all history from the view.
        rows = remote.select(
            "detections",
            {"select": DETECTION_COLUMNS, "order": "timestamp.desc"},
            limit=self._history_limit,
        )
        for row in rows:
            detection = Detection.from_dict(row)
            self.detections.append(detection)
            self.recording_paths[detection.id] = detection.audio_path
        for row in remote.select("species_summary", {"select": "*"}):
            self.species[row["name"]] = SpeciesSummary(
                name=row["name"],
                scientific_name=row.get("scientific_name"),
                first_seen=parse_ts(row["first_seen"]) if row.get("first_seen") else None,
                last_seen=parse_ts(row["last_seen"]) if row.get("last_seen") else None,
                sighting_count=int(row["sighting_count"]),
            )
        for row in remote.select("events", {"select": "*", "order": "timestamp.desc"}, limit=self._history_limit):
            self.events.append(WildlifeEvent.from_dict(row))

    def _save(self, table: str, row: dict[str, Any], backup: Path | None) -> None:
        """Write a row to Supabase, or to the local JSONL if Supabase is off or the write fails."""
        if self._remote is not None:
            try:
                self._remote.insert(table, row)
                return
            except Exception:
                logger.exception("Supabase insert into %s failed; keeping the row in %s", table, backup)
        self._append_line(backup, row)

    def _append_line(self, path: Path | None, payload: dict[str, Any]) -> None:
        if path is None:
            return
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def _ingest_detection(self, detection: Detection) -> None:
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
        if len(self.detections) > self._history_limit:
            self.detections = self.detections[: self._history_limit]

    def add_detection(self, detection: Detection) -> Detection:
        with self._lock:
            self._ingest_detection(detection)
        # Network write outside the lock, so API reads aren't held up.
        self._save("detections", detection.to_row(), self._detections_path)
        return detection

    def mark_detection_surfaced(self, detection_id: str) -> None:
        with self._lock:
            for d in self.detections:
                if d.id == detection_id:
                    d.surfaced = True
                    break
        if self._remote is not None:
            try:
                self._remote.update("detections", {"id": f"eq.{detection_id}"}, {"surfaced": True})
            except Exception:
                logger.exception("Could not mark detection %s surfaced in Supabase", detection_id)

    def add_event(self, event: WildlifeEvent) -> None:
        with self._lock:
            self.events.insert(0, event)
            if len(self.events) > self._history_limit:
                self.events = self.events[: self._history_limit]
        self._save("events", event.to_dict(), self._events_path)

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

    def remove_detections(
        self, *, ids: list[str] | None = None, species: str | None = None
    ) -> tuple[list[str], list[str]]:
        """Delete detections by id or by species, with any surfaced events for them, from storage and
        memory. Returns (removed ids, clips no remaining detection uses).

        A 3 s clip is shared by every species BirdNET found in it, so a clip is only reported as
        orphaned once nothing else points at it.
        """
        if not ids and not species:
            return [], []
        if self._remote is not None:
            return self._remove_remote(ids=ids, species=species)

        def match(row: dict[str, Any]) -> bool:
            return (ids is not None and row.get("id") in ids) or (species is not None and row.get("species") == species)

        return self._remove_local(match)

    def _remove_remote(self, *, ids: list[str] | None, species: str | None) -> tuple[list[str], list[str]]:
        from app.supabase_client import in_list

        remote = self._remote
        assert remote is not None
        filters = {"id": in_list(ids)} if ids else {"species": f"eq.{species}"}
        # Events go with their detections (on delete cascade).
        removed = remote.delete("detections", {**filters, "select": "id,audio_path"})
        if not removed:
            return [], []
        clips = sorted({row["audio_path"] for row in removed if row.get("audio_path")})
        still_used = (
            {row["audio_path"] for row in remote.select("detections", {"select": "audio_path", "audio_path": in_list(clips)})}
            if clips
            else set()
        )
        with self._lock:
            self._load_history_unlocked()
        return [row["id"] for row in removed], [c for c in clips if c not in still_used]

    def _remove_local(self, match: Callable[[dict[str, Any]], bool]) -> tuple[list[str], list[str]]:
        with self._lock:
            if self._detections_path is None or not self._detections_path.is_file():
                return [], []
            kept: list[str] = []
            removed_ids: list[str] = []
            removed_audio: set[str] = set()
            still_used: set[str] = set()
            for line in self._detections_path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                row = json.loads(line)
                if match(row):
                    removed_ids.append(row["id"])
                    if row.get("audio_path"):
                        removed_audio.add(row["audio_path"])
                else:
                    kept.append(line)
                    if row.get("audio_path"):
                        still_used.add(row["audio_path"])
            if not removed_ids:
                return [], []
            self._rewrite(self._detections_path, kept)

            gone = set(removed_ids)
            if self._events_path and self._events_path.is_file():
                events = [
                    line
                    for line in self._events_path.read_text(encoding="utf-8").splitlines()
                    if line.strip() and json.loads(line).get("detection_id") not in gone
                ]
                self._rewrite(self._events_path, events)

            # Rebuild memory (detections, events, species counts) from the rewritten files.
            self._load_history_unlocked()
            return removed_ids, sorted(removed_audio - still_used)

    @staticmethod
    def _rewrite(path: Path, lines: list[str]) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text("".join(f"{line}\n" for line in lines), encoding="utf-8")
        tmp.replace(path)


store = InMemoryStore()
