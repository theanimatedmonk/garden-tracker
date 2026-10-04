from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_OFFICIAL_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_HOSTED_URL = "https://jevtypesafeai.com/api/v1/decide"


@dataclass
class JevSurfaceDecision:
    surface: bool
    noul: float
    reason_key: str
    reason_label: str
    model: str | None = None


def _endpoint_url() -> str:
    custom = settings.typesafe_pai_base_url.strip()
    if custom:
        return custom.rstrip("/")
    key = settings.typesafe_pai_api_key.strip()
    if key.startswith("jv_live_"):
        return DEFAULT_HOSTED_URL
    return DEFAULT_OFFICIAL_URL


def _reason_labels() -> dict[str, str]:
    return {
        "new_species": "new species for you",
        "confident": "confident detection",
        "soundscape": "meaningful soundscape change",
        "repeat": "routine repeat",
    }


def build_wildlife_state(
    *,
    species: str,
    scientific_name: str | None,
    confidence: float,
    is_first_species: bool,
    sighting_count: int,
    sightings_last_hour: int,
    seconds_since_last_surface: int | None,
    other_predictions: list[dict[str, Any]],
    location_label: str,
) -> dict[str, Any]:
    return {
        "app": "Wildlife Observer",
        "location": location_label,
        "birdnet_top": {
            "species": species,
            "scientific_name": scientific_name,
            "confidence": round(confidence, 4),
        },
        "user_history": {
            "first_time_this_species": is_first_species,
            "total_sightings_this_species": sighting_count,
            "sightings_last_hour_this_species": sightings_last_hour,
            "seconds_since_last_ui_surface_this_species": seconds_since_last_surface,
        },
        "other_predictions_this_segment": other_predictions[:4],
        "policy": (
            "BirdNET already chose the species. JEV only decides whether to interrupt "
            "a quiet home observer UI. Do not invent a different species."
        ),
    }


def decide_surface(state: dict[str, Any]) -> JevSurfaceDecision | None:
    api_key = settings.typesafe_pai_api_key.strip()
    if not api_key:
        return None

    labels = _reason_labels()
    payload = {
        "model": settings.jev_model,
        "state": state,
        "questions": {
            "surface": {
                "type": "noul",
                "instructions": (
                    "Should this bird detection interrupt the user's quiet wildlife "
                    "observer screen? Say yes for a first sighting, a clearly meaningful "
                    "visit, or an unusually notable moment. Say no for noisy repeats "
                    "and low-value duplicates within a short window."
                ),
            },
            "why": {
                "type": "choice",
                "instructions": "Best reason label if surfacing would be appropriate.",
                "criteria": labels,
            },
        },
    }

    url = _endpoint_url()
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        logger.warning("JEV HTTP %s: %s", exc.code, detail)
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("JEV request failed: %s", exc)
        return None

    answers = raw.get("answers") or {}
    surface_answer = answers.get("surface") or {}
    noul = float(surface_answer.get("noul", 0.0))
    why = answers.get("why") or {}
    reason_key = str(why.get("choice") or "confident")
    if reason_key not in labels:
        reason_key = "confident"

    threshold = settings.jev_surface_threshold
    surface = noul >= threshold and reason_key != "repeat"

    return JevSurfaceDecision(
        surface=surface,
        noul=noul,
        reason_key=reason_key,
        reason_label=labels[reason_key],
        model=raw.get("model"),
    )
