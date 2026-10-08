from __future__ import annotations

import io
import wave
from pathlib import Path

import numpy as np
from scipy import signal

from app.config import settings


def pcm_to_wav(pcm: bytes, sample_rate: int, bits: int = 16, channels: int = 1) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(bits // 8)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buffer.getvalue()


def encode_mp3(wav_path: Path) -> bytes:
    """Compress a clip for storage: MP3 is ~7x smaller than WAV and plays in every browser."""
    import soundfile as sf

    data, sample_rate = sf.read(str(wav_path), dtype="float32")
    buffer = io.BytesIO()
    sf.write(buffer, data, sample_rate, format="MP3", subtype="MPEG_LAYER_III")
    return buffer.getvalue()


def save_wav(path: Path, pcm: bytes, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pcm_to_wav(pcm, sample_rate))


def pcm_stats(pcm: bytes) -> tuple[int, float]:
    samples = np.frombuffer(pcm, dtype=np.int16)
    if samples.size == 0:
        return 0, 0.0
    peak = int(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))
    return peak, rms


def resample_pcm_int16(pcm: bytes, from_rate: int, to_rate: int) -> bytes:
    if from_rate == to_rate:
        return pcm
    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    if samples.size == 0:
        return pcm
    count = int(samples.size * to_rate / from_rate)
    resampled = signal.resample(samples, count)
    resampled = np.clip(resampled, -32768, 32767).astype(np.int16)
    return resampled.tobytes()


class AudioSegmentBuffer:
    """Accumulates PCM until analysis window is full."""

    def __init__(self, window_seconds: float, sample_rate: int) -> None:
        self.sample_rate = sample_rate
        self.target_bytes = int(window_seconds * sample_rate * 2)
        self._buffer = bytearray()

    def append(self, chunk: bytes) -> bytes | None:
        self._buffer.extend(chunk)
        if len(self._buffer) < self.target_bytes:
            return None
        segment = bytes(self._buffer[: self.target_bytes])
        del self._buffer[: self.target_bytes]
        return segment
