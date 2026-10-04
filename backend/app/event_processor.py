from __future__ import annotations

import logging
from datetime import datetime, timedelta
from uuid import uuid4

from app.birdnet_runner import RawPrediction
from app.config import settings
from app.jev_client import build_wildlife_state, decide_surface
from app.species_images import species_image_url
from app.store import Detection, WildlifeEvent, store, utc_now

logger = logging.getLogger(__name__)


class EventProcessor:
    def __init__(self) -> None:
        self._last_event_by_species: dict[str, datetime] = {}

    def process(
        self,
        predictions: list[RawPrediction],
        *,
        audio_path: str,
        source_device: str,
        model: str,
    ) -> tuple[list[Detection], WildlifeEvent | None]:
        if not predictions:
            return [], None

        ranked = sorted(predictions, key=lambda p: p.confidence, reverse=True)
        top_per_segment = ranked[: settings.history_predictions_per_segment]

        now = utc_now()
        best = ranked[0]
        is_first_species = best.species not in store.species
        saved: list[Detection] = []
        for rank, pred in enumerate(top_per_segment):
            detection = Detection(
                id=str(uuid4()),
                species=pred.species,
                scientific_name=pred.scientific_name,
                confidence=pred.confidence,
                timestamp=now,
                audio_path=audio_path,
                source_device=source_device,
                model=model,
                surfaced=False,
                image_url=species_image_url(pred.species, pred.scientific_name)
                if rank == 0
                else None,
            )
            saved.append(store.add_detection(detection))

        event = self._maybe_surface(best, ranked, saved[0], now, is_first_species)
        return saved, event

    def _maybe_surface(
        self,
        best: RawPrediction,
        ranked: list[RawPrediction],
        primary: Detection,
        now: datetime,
        is_first_species: bool,
    ) -> WildlifeEvent | None:
        if best.confidence < settings.min_confidence:
            return None

        last = self._last_event_by_species.get(best.species)
        if last and now - last < timedelta(seconds=settings.event_cooldown_seconds):
            return None

        mode = settings.jev_mode.strip().lower()
        use_jev = mode in {"llm", "jev", "hybrid"} and settings.typesafe_pai_api_key.strip()

        if use_jev:
            decision = self._jev_surface(best, ranked, now, is_first_species, last)
            if decision is None:
                logger.info("JEV unavailable; falling back to rules for %s", best.species)
                return self._surface_rules(best, primary, now, is_first_species)
            if not decision.surface:
                logger.info(
                    "JEV suppress surface %s (noul=%.2f, why=%s)",
                    best.species,
                    decision.noul,
                    decision.reason_key,
                )
                return None
            reason = f"jev: {decision.reason_label} (p={decision.noul:.2f})"
            return self._emit_surface(best, primary, now, reason)

        return self._surface_rules(best, primary, now, is_first_species)

    def _jev_surface(
        self,
        best: RawPrediction,
        ranked: list[RawPrediction],
        now: datetime,
        is_first_species: bool,
        last_surface: datetime | None,
    ):
        summary = store.get_species_summary(best.species)
        sighting_count = summary.sighting_count if summary else 1
        hour_ago = now - timedelta(hours=1)
        sightings_last_hour = store.count_detections_for_species_since(best.species, hour_ago)
        seconds_since = None
        if last_surface is not None:
            seconds_since = int((now - last_surface).total_seconds())

        other = [
            {
                "species": p.species,
                "confidence": round(p.confidence, 4),
            }
            for p in ranked[1:5]
        ]
        state = build_wildlife_state(
            species=best.species,
            scientific_name=best.scientific_name,
            confidence=best.confidence,
            is_first_species=is_first_species,
            sighting_count=sighting_count,
            sightings_last_hour=sightings_last_hour,
            seconds_since_last_surface=seconds_since,
            other_predictions=other,
            location_label=f"Bengaluru ({settings.birdnet_lat}, {settings.birdnet_lon})",
        )
        return decide_surface(state)

    def _surface_rules(
        self,
        best: RawPrediction,
        primary: Detection,
        now: datetime,
        is_first_species: bool,
    ) -> WildlifeEvent | None:
        reason = "new species today" if is_first_species else "confident detection"
        return self._emit_surface(best, primary, now, reason)

    def _emit_surface(
        self,
        best: RawPrediction,
        primary: Detection,
        now: datetime,
        reason: str,
    ) -> WildlifeEvent:
        store.mark_detection_surfaced(primary.id)
        event = WildlifeEvent(
            id=str(uuid4()),
            detection_id=primary.id,
            species=best.species,
            confidence=best.confidence,
            timestamp=now,
            event_type="visit",
            surface=True,
            jev_reason=reason,
        )
        store.add_event(event)
        self._last_event_by_species[best.species] = now
        return event


event_processor = EventProcessor()
