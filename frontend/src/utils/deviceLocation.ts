import type { DeviceLocation } from "../api/client";

const GEOCODE_TIMEOUT_MS = 4000;

/** Wi‑Fi / network fix first (works on MacBooks); GPS only if that fails. */
const LOCATE_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: false, timeout: 20_000, maximumAge: 300_000 },
  { enableHighAccuracy: true, timeout: 25_000, maximumAge: 120_000 },
];

export type LocationBlockReason = "insecure" | "unsupported" | "denied" | "unavailable" | "timeout";

export type DeviceLocationResult =
  | { ok: true; location: DeviceLocation }
  | { ok: false; reason: LocationBlockReason };

function geolocationErrorReason(code: number): LocationBlockReason {
  if (code === 1) {
    return "denied";
  }
  if (code === 2) {
    return "unavailable";
  }
  return "timeout";
}

function locateOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function resolvePlace(position: GeolocationPosition): Promise<DeviceLocation> {
  const { latitude: lat, longitude: lon } = position.coords;
  const name = (await placeName(lat, lon)) ?? "Current location";
  return { lat, lon, name };
}

export function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof window === "undefined" || !window.isSecureContext || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return locateOnce(LOCATE_ATTEMPTS[0]).catch(() => locateOnce(LOCATE_ATTEMPTS[1]).catch(() => null));
}

/** Call from a button tap — browsers often skip the permission popup on automatic page load. */
export async function requestDeviceLocation(): Promise<DeviceLocationResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }
  if (!window.isSecureContext) {
    return Promise.resolve({ ok: false, reason: "insecure" });
  }
  if (!navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }

  let lastReason: LocationBlockReason = "timeout";
  for (const options of LOCATE_ATTEMPTS) {
    try {
      const position = await locateOnce(options);
      return { ok: true, location: await resolvePlace(position) };
    } catch (err) {
      const code = (err as GeolocationPositionError).code ?? 3;
      lastReason = geolocationErrorReason(code);
      if (code === 1) {
        break;
      }
    }
  }
  return { ok: false, reason: lastReason };
}

/** Short place name from OpenStreetMap (same as share clip). */
export async function placeName(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lon}`,
      { signal: controller.signal, headers: { "Accept-Language": navigator.language } },
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { name?: string; display_name?: string; address?: Record<string, string> };
    const a = data.address ?? {};
    const parts = [
      data.name,
      a.suburb ?? a.neighbourhood ?? a.quarter,
      a.city ?? a.town ?? a.village ?? a.county,
      a.state,
    ].filter((p): p is string => Boolean(p));
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    return unique.length ? unique.join(", ") : (data.display_name ?? null);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function readDeviceLocation(): Promise<DeviceLocation | null> {
  const result = await requestDeviceLocation();
  return result.ok ? result.location : null;
}

export function locationBlockMessage(reason: LocationBlockReason): string {
  switch (reason) {
    case "insecure":
      return "Open http://localhost:5173 on this Mac (not the 192.168… address), then tap Use my location again.";
    case "denied":
      return "Location is blocked for this site. Allow it in the browser site settings, then try again.";
    case "timeout":
      return "Could not get a fix in time. On Mac: System Settings → Privacy & Security → Location Services (on), allow your browser, Wi‑Fi on, then try again.";
    case "unavailable":
      return "Location unavailable. Turn on Location Services for your browser and keep Wi‑Fi on, then try again.";
    default:
      return "This browser does not support location here.";
  }
}
