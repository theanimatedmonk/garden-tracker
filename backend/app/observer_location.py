"""Runtime observer location for BirdNET geo filter (overrides .env when the app sends GPS)."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

_lock = Lock()
_path: Path | None = None
_state: ObserverLocation | None = None


@dataclass
class ObserverLocation:
    lat: float
    lon: float
    name: str
    source: str = "env"  # env | device | manual
    updated_at: str | None = None

    def as_api_dict(self) -> dict:
        return {"name": self.name, "lat": self.lat, "lon": self.lon}


def configure(path: Path, *, default_lat: float, default_lon: float, default_name: str) -> None:
    global _path, _state
    _path = path
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            _state = ObserverLocation(
                lat=float(raw["lat"]),
                lon=float(raw["lon"]),
                name=str(raw.get("name") or default_name),
                source=str(raw.get("source") or "device"),
                updated_at=raw.get("updated_at"),
            )
            logger.info(
                "Observer location from %s: %s (%.4f, %.4f)",
                path.name,
                _state.name,
                _state.lat,
                _state.lon,
            )
            return
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            logger.warning("Invalid %s; using .env defaults", path)
    _state = ObserverLocation(
        lat=default_lat,
        lon=default_lon,
        name=default_name,
        source="env",
    )


def current() -> ObserverLocation:
    with _lock:
        if _state is None:
            raise RuntimeError("observer_location.configure() was not called")
        return _state


def update(*, lat: float, lon: float, name: str | None = None, source: str = "device") -> ObserverLocation:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("lat/lon out of range")
    with _lock:
        if _state is None:
            raise RuntimeError("observer_location.configure() was not called")
        label = (name or _state.name).strip() or f"{lat:.4f}, {lon:.4f}"
        _state = ObserverLocation(
            lat=lat,
            lon=lon,
            name=label,
            source=source,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        if _path is not None:
            _path.parent.mkdir(parents=True, exist_ok=True)
            _path.write_text(json.dumps(asdict(_state), ensure_ascii=False), encoding="utf-8")
        logger.info("Observer location → %s (%.4f, %.4f) [%s]", label, lat, lon, source)
        return _state
