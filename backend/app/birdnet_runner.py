from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RawPrediction:
    species: str
    scientific_name: str | None
    confidence: float


MOCK_SPECIES = [
    RawPrediction("Oriental Magpie-Robin", "Copsychus saularis", 0.91),
    RawPrediction("Common Tailorbird", "Orthotomus sutorius", 0.84),
    RawPrediction("Rose-ringed Parakeet", "Psittacula krameri", 0.78),
    RawPrediction("Asian Koel", "Eudynamys scolopaceus", 0.88),
    RawPrediction("Purple Sunbird", "Cinnyris asiaticus", 0.72),
]


def _parse_detection(det: object) -> RawPrediction:
    if isinstance(det, dict):
        return RawPrediction(
            species=str(det["common_name"]),
            scientific_name=det.get("scientific_name"),
            confidence=float(det["confidence"]),
        )
    return RawPrediction(
        species=str(det.common_name),
        scientific_name=getattr(det, "scientific_name", None),
        confidence=float(det.confidence),
    )


class BirdNetRunner:
    def __init__(self) -> None:
        self.mode = "mock"
        self._analyzer = None
        self._Recording = None
        self._init_error: str | None = None

        if not settings.use_birdnet:
            return

        try:
            from birdnetlib import Recording
            from birdnetlib.analyzer import Analyzer

            logger.info("Loading BirdNET model (first run may download weights)...")
            self._analyzer = Analyzer()
            self._Recording = Recording
            self.mode = "birdnet"
            logger.info("BirdNET ready")
        except Exception as exc:  # noqa: BLE001
            self._init_error = str(exc)
            self.mode = "mock"
            logger.exception("BirdNET init failed; falling back to mock mode")

    def analyze_wav(self, wav_path: Path) -> list[RawPrediction]:
        if self.mode == "birdnet" and self._analyzer is not None and self._Recording is not None:
            return self._analyze_birdnet(wav_path)
        if settings.mock_birdnet:
            return self._analyze_mock(wav_path)
        return []

    def _analyze_birdnet(self, wav_path: Path) -> list[RawPrediction]:
        kwargs: dict = {"min_conf": settings.birdnet_min_conf}
        if settings.birdnet_use_geo:
            kwargs["lat"] = settings.birdnet_lat
            kwargs["lon"] = settings.birdnet_lon

        recording = self._Recording(self._analyzer, str(wav_path), **kwargs)
        recording.analyze()

        out: list[RawPrediction] = []
        for det in recording.detections:
            out.append(_parse_detection(det))
        out.sort(key=lambda p: p.confidence, reverse=True)

        if out:
            top = out[0]
            logger.info(
                "BirdNET %s → %s (%.2f) +%d more",
                wav_path.name,
                top.species,
                top.confidence,
                max(0, len(out) - 1),
            )
        else:
            logger.debug("BirdNET %s → no species above threshold", wav_path.name)

        return out

    def peek_top(self, wav_path: Path) -> RawPrediction | None:
        """Best match at very low threshold, no geo filter — diagnostics only."""
        if self.mode != "birdnet" or self._analyzer is None or self._Recording is None:
            return None
        recording = self._Recording(self._analyzer, str(wav_path), min_conf=0.01)
        recording.analyze()
        best: RawPrediction | None = None
        for det in recording.detections:
            pred = _parse_detection(det)
            if best is None or pred.confidence > best.confidence:
                best = pred
        return best

    def _analyze_mock(self, wav_path: Path) -> list[RawPrediction]:
        try:
            import wave

            with wave.open(str(wav_path), "rb") as wf:
                frames = wf.readframes(wf.getnframes())
            if len(frames) < 1000:
                return []
            import numpy as np

            samples = np.frombuffer(frames, dtype=np.int16)
            rms = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))
            if rms < 80.0:
                return []
        except (OSError, ValueError):
            return []

        if random.random() > 0.35:
            return []

        pick = random.choice(MOCK_SPECIES)
        jitter = random.uniform(-0.08, 0.05)
        confidence = min(0.99, max(0.5, pick.confidence + jitter))
        return [RawPrediction(pick.species, pick.scientific_name, confidence)]


birdnet_runner = BirdNetRunner()
