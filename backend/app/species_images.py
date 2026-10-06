"""Species photos for the UI. BirdNET does not ship photos, so look them up:
Wikipedia's article thumbnail first (simple, small, quick to load), iNaturalist as a
fallback for species whose article has no image (community-curated, CC-licensed).

Results are cached per species in a JSON file, together with the credit line the
photo's licence asks for.
"""

from __future__ import annotations

import json
import logging
import queue
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, TypedDict

logger = logging.getLogger(__name__)

USER_AGENT = "WildlifeObserver/0.1 (personal project)"
# Bump when the lookup order or sources change, so cached photos are looked up again.
CACHE_VERSION = 2
INAT_API = "https://api.inaturalist.org/v1"
INAT_MIN_INTERVAL_S = 1.1  # iNaturalist asks clients to stay around 1 request/second
# Card art is portrait; prefer a curated photo at least this tall for its width.
MAX_PORTRAIT_ASPECT = 1.0
# Photos we may show. "All rights reserved" photos are excluded, and so are no-derivatives (ND)
# licences, because the Rive card restyles the photo (foil, Madhubani print).
ALLOWED_INAT_LICENSES = {"cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa"}


class SpeciesImage(TypedDict):
    url: str
    credit: str  # attribution line the licence asks for; empty when the source has none to give
    source: str
    source_url: str | None


class _NetworkError(Exception):
    """The lookup could not complete, so the result must not be cached as 'no photo'."""


_cache: dict[str, SpeciesImage | None] = {}
_cache_path: Path | None = None
_cache_lock = threading.Lock()

_inat_lock = threading.Lock()
_inat_last_call = 0.0

_pending: set[str] = set()
_pending_lock = threading.Lock()
_work: queue.Queue[tuple[str, str | None]] = queue.Queue()
_worker: threading.Thread | None = None


def configure_cache(path: Path) -> None:
    global _cache_path
    _cache_path = path
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.is_file():
        return
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning("Could not load image cache from %s", path)
        return
    if not isinstance(loaded, dict) or loaded.get("_version") != CACHE_VERSION:
        logger.info("Image cache at %s is from an older lookup; rebuilding it", path)
        return
    with _cache_lock:
        for key, value in loaded.get("species", {}).items():
            if value is None or (isinstance(value, dict) and value.get("url")):
                _cache[key] = value


def _cache_key(common_name: str, scientific_name: str | None) -> str:
    return (scientific_name or common_name).strip().lower()


def _persist_cache() -> None:
    if _cache_path is None:
        return
    try:
        with _cache_lock:
            payload = json.dumps({"_version": CACHE_VERSION, "species": _cache}, ensure_ascii=False, indent=1)
        _cache_path.write_text(payload, encoding="utf-8")
    except OSError:
        logger.warning("Could not write image cache")


def _get_json(url: str) -> dict[str, Any] | None:
    """None for 'not found'; raises _NetworkError when the answer is unknown."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise _NetworkError(str(exc)) from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise _NetworkError(str(exc)) from exc


def _inat_get(path: str) -> dict[str, Any] | None:
    global _inat_last_call
    with _inat_lock:
        wait = INAT_MIN_INTERVAL_S - (time.monotonic() - _inat_last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            return _get_json(f"{INAT_API}{path}")
        finally:
            _inat_last_call = time.monotonic()


def _inat_find_taxon(common_name: str, scientific_name: str | None) -> dict[str, Any] | None:
    """Only accept an exact name match, so a near miss never shows the wrong bird."""
    queries: list[tuple[str, str]] = []
    if scientific_name:
        queries.append((scientific_name, "name"))
    queries.append((common_name, "preferred_common_name"))

    for term, field in queries:
        data = _inat_get(
            f"/taxa?q={urllib.parse.quote(term)}&rank=species&iconic_taxa=Aves&per_page=10"
        )
        wanted = term.strip().lower()
        for taxon in (data or {}).get("results", []):
            names = {str(taxon.get(field) or "").lower(), str(taxon.get("matched_term") or "").lower()}
            if wanted in names:
                return taxon
    return None


def _inat_photo_url(url: str) -> str:
    """Taxon photos come as square thumbnails; ask for the 1024px rendition."""
    return re.sub(r"/(square|thumb|small|medium|original)\.", "/large.", url)


def _pick_inat_photo(taxon: dict[str, Any]) -> dict[str, Any] | None:
    detail = _inat_get(f"/taxa/{taxon['id']}")
    results = (detail or {}).get("results") or [taxon]
    candidates = [tp["photo"] for tp in results[0].get("taxon_photos", []) if tp.get("photo")]
    if taxon.get("default_photo"):
        candidates.append(taxon["default_photo"])
    photos = [p for p in candidates if (p.get("license_code") or "").lower() in ALLOWED_INAT_LICENSES]
    for photo in photos:
        dims = photo.get("original_dimensions") or {}
        width, height = dims.get("width"), dims.get("height")
        if width and height and width / height <= MAX_PORTRAIT_ASPECT:
            return photo
    return photos[0] if photos else None


def _from_inaturalist(common_name: str, scientific_name: str | None) -> SpeciesImage | None:
    taxon = _inat_find_taxon(common_name, scientific_name)
    if not taxon:
        return None
    photo = _pick_inat_photo(taxon)
    if not photo or not photo.get("url"):
        return None
    return {
        "url": _inat_photo_url(photo["url"]),
        "credit": photo.get("attribution") or "iNaturalist contributor",
        "source": "iNaturalist",
        "source_url": f"https://www.inaturalist.org/photos/{photo['id']}" if photo.get("id") else None,
    }


def _from_wikipedia(common_name: str, scientific_name: str | None) -> SpeciesImage | None:
    titles = [t for t in (scientific_name, common_name) if t]
    for title in titles:
        encoded = urllib.parse.quote(title.replace(" ", "_"))
        data = _get_json(f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}")
        thumb = (data or {}).get("thumbnail") or {}
        if not thumb.get("source"):
            continue
        url = str(thumb["source"])
        page = ((data or {}).get("content_urls") or {}).get("desktop", {}).get("page")
        return {"url": url, "credit": "", "source": "Wikipedia", "source_url": page}
    return None


def species_image(
    common_name: str,
    scientific_name: str | None = None,
    *,
    allow_network: bool = True,
) -> SpeciesImage | None:
    key = _cache_key(common_name, scientific_name)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    if not allow_network:
        return None

    image: SpeciesImage | None = None
    complete = True
    for lookup in (_from_wikipedia, _from_inaturalist):
        try:
            image = lookup(common_name, scientific_name)
        except _NetworkError as exc:
            logger.info("%s image lookup for %s failed: %s", lookup.__name__, key, exc)
            complete = False
            continue
        if image:
            break

    if image or complete:
        with _cache_lock:
            _cache[key] = image
        _persist_cache()
    return image


def species_image_url(
    common_name: str,
    scientific_name: str | None = None,
    *,
    allow_network: bool = True,
) -> str | None:
    image = species_image(common_name, scientific_name, allow_network=allow_network)
    return image["url"] if image else None


def _drain() -> None:
    while True:
        common_name, scientific_name = _work.get()
        key = _cache_key(common_name, scientific_name)
        try:
            species_image(common_name, scientific_name)
        except Exception:
            logger.exception("Image lookup for %s crashed", key)
        finally:
            with _pending_lock:
                _pending.discard(key)


def request_species_image(common_name: str, scientific_name: str | None = None) -> None:
    """Look a species up in the background if it isn't cached yet (never blocks a request)."""
    global _worker
    key = _cache_key(common_name, scientific_name)
    with _cache_lock:
        if key in _cache:
            return
    with _pending_lock:
        if key in _pending:
            return
        _pending.add(key)
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_drain, name="species-images", daemon=True)
            _worker.start()
    _work.put((common_name, scientific_name))


def attach_image(detection: dict[str, Any]) -> dict[str, Any]:
    """Point a detection at its species' current cached photo and credit, queueing a lookup if needed."""
    image = species_image(detection["species"], detection.get("scientific_name"), allow_network=False)
    if image:
        detection["image_url"] = image["url"]
        detection["image_credit"] = {
            "text": image["credit"],
            "source": image["source"],
            "url": image["source_url"],
        }
    else:
        request_species_image(detection["species"], detection.get("scientific_name"))
    return detection
