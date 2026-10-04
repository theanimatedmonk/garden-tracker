from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

_cache: dict[str, str | None] = {}
_cache_path: Path | None = None


def configure_cache(path: Path) -> None:
    global _cache_path
    _cache_path = path
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                _cache.update({k: v for k, v in loaded.items()})
        except (json.JSONDecodeError, OSError):
            logger.warning("Could not load image cache from %s", path)


def _cache_key(common_name: str, scientific_name: str | None) -> str:
    if scientific_name:
        return scientific_name.strip().lower()
    return common_name.strip().lower()


def _persist_cache() -> None:
    if _cache_path is None:
        return
    try:
        _cache_path.write_text(json.dumps(_cache, ensure_ascii=False, indent=0), encoding="utf-8")
    except OSError:
        logger.warning("Could not write image cache")


def _fetch_wikipedia_thumbnail(title: str) -> str | None:
    encoded = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
    req = urllib.request.Request(url, headers={"User-Agent": "WildlifeObserver/0.1 (personal project)"})
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None
    thumb = data.get("thumbnail") or {}
    src = thumb.get("source")
    return str(src) if src else None


def species_image_url(
    common_name: str,
    scientific_name: str | None = None,
    *,
    allow_network: bool = True,
) -> str | None:
    """BirdNET does not ship photos — resolve a thumbnail via Wikipedia."""
    key = _cache_key(common_name, scientific_name)
    if key in _cache:
        return _cache[key]
    if not allow_network:
        return None
    if scientific_name:
        candidates.append(scientific_name)
    candidates.append(common_name.replace(" ", "_"))

    image: str | None = None
    for title in candidates:
        image = _fetch_wikipedia_thumbnail(title)
        if image:
            break

    _cache[key] = image
    _persist_cache()
    return image
