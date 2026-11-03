/** No heartbeat from the ESP32 for this long → show "Last listened" instead of live pulse. */
export const LISTENER_STALE_MS = 90_000;

export function latestIsoTimestamps(isoList: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const iso of isoList) {
    if (!iso) {
      continue;
    }
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

export function isListenerLive(lastSeenIso: string | null, nowMs: number): boolean {
  if (!lastSeenIso) {
    return false;
  }
  const seen = new Date(lastSeenIso).getTime();
  if (!Number.isFinite(seen)) {
    return false;
  }
  return nowMs - seen < LISTENER_STALE_MS;
}

export function maxDetectionTimestamp(detections: { timestamp: string }[]): string | null {
  return latestIsoTimestamps(detections.map((d) => d.timestamp));
}
