/**
 * "Share clip": puts the sighting on the clipboard as rich text (photo, names, when, where and the
 * creator link) plus plain text, and saves the call's audio. Browsers can't put audio on the
 * clipboard, so the clip (MP3 from Supabase, or a local WAV) is downloaded alongside.
 *
 * "Where" is this device's own location (GPS on a phone, Wi‑Fi positioning on a Mac), named via
 * OpenStreetMap's reverse geocoder. Browsers only allow location on HTTPS or localhost, so on the
 * plain-http LAN, or if it is denied or slow, the backend's configured location is used instead.
 */

import type { DeviceLocation } from "../api/client";

export const CREATOR_URL = "https://x.com/deanimatedmonk/status/2107674781898174787?s=20";

export type ClipInfo = {
  species: string;
  scientificName: string | null;
  imageUrl: string | null;
  audioUrl: string;
  timestamp: string;
  /** The backend's configured location: the fallback when this device's location is unavailable. */
  location: DeviceLocation | null;
};

type Place = DeviceLocation & { accuracy?: number; fromDevice: boolean };

const LOCATE_TIMEOUT_MS = 8000;
const GEOCODE_TIMEOUT_MS = 4000;

function currentPosition(): Promise<GeolocationPosition | null> {
  if (!window.isSecureContext || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: LOCATE_TIMEOUT_MS,
      maximumAge: 60_000,
    }),
  );
}

/** A short place name ("Cubbon Park, Sampangi Rama Nagar, Bengaluru, Karnataka") from OpenStreetMap. */
async function placeName(lat: number, lon: number): Promise<string | null> {
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

async function resolvePlace(fallback: DeviceLocation | null): Promise<Place | null> {
  const position = await currentPosition();
  if (!position) {
    return fallback ? { ...fallback, fromDevice: false } : null;
  }
  const { latitude: lat, longitude: lon, accuracy } = position.coords;
  return { name: (await placeName(lat, lon)) ?? "Current location", lat, lon, accuracy, fromDevice: true };
}

function heardAt(info: ClipInfo): string {
  return new Date(info.timestamp).toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** 12.97633° N, 77.59245° E (±20 m) — five decimals (about a metre) for a device fix. */
function coordinates(place: Place): string {
  const digits = place.fromDevice ? 5 : 4;
  const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(digits)}° ${v >= 0 ? pos : neg}`;
  const accuracy = place.accuracy ? ` (±${Math.round(place.accuracy)} m)` : "";
  return `${fmt(place.lat, "N", "S")}, ${fmt(place.lon, "E", "W")}${accuracy}`;
}

function mapUrl(place: Place): string {
  const zoom = place.fromDevice ? 17 : 15;
  const lat = place.lat.toFixed(5);
  const lon = place.lon.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function clipText(info: ClipInfo, place: Place | null): string {
  const name = info.scientificName ? `${info.species} (${info.scientificName})` : info.species;
  const lines = [name, `Heard: ${heardAt(info)}`];
  if (place) {
    lines.push(`Location: ${place.name} — ${coordinates(place)}`, `Map: ${mapUrl(place)}`);
  }
  lines.push(`Creator: ${CREATOR_URL}`);
  return lines.join("\n");
}

function clipHtml(info: ClipInfo, place: Place | null): string {
  const image = info.imageUrl
    ? `<p><img src="${escapeHtml(info.imageUrl)}" alt="${escapeHtml(info.species)}" width="320"></p>`
    : "";
  const sci = info.scientificName ? `<br><em>${escapeHtml(info.scientificName)}</em>` : "";
  const where = place
    ? `<br>Location: ${escapeHtml(place.name)} · ` +
      `<a href="${escapeHtml(mapUrl(place))}">${escapeHtml(coordinates(place))}</a>`
    : "";
  return (
    `${image}<p><strong>${escapeHtml(info.species)}</strong>${sci}</p>` +
    `<p>Heard: ${escapeHtml(heardAt(info))}${where}</p>` +
    `<p>Creator: <a href="${CREATOR_URL}">${CREATOR_URL}</a></p>`
  );
}

function audioFileName(info: ClipInfo, type: string): string {
  const d = new Date(info.timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
  // Clips in Supabase Storage are MP3; local ones are WAV.
  const ext = type.includes("mpeg") ? "mp3" : "wav";
  return `${info.species} ${stamp}.${ext}`;
}

/** Rich copy without the Clipboard API (plain-http LAN): select an off-screen copy of the HTML. */
function copyHtmlBySelection(html: string): boolean {
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.innerHTML = html;
  Object.assign(holder.style, { position: "fixed", left: "-9999px", top: "0", opacity: "0" });
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const ok = document.execCommand("copy");
  selection?.removeAllRanges();
  holder.remove();
  return ok;
}

async function copyToClipboard(info: ClipInfo): Promise<void> {
  // Text only (rich + plain). A separate image/png makes most apps paste just the picture and drop
  // the text; rich-text apps still get the photo from the <img> in the HTML.
  if (window.isSecureContext && navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    // The write starts inside the tap (as browsers require); its contents resolve once the
    // device location (and its place name) arrive.
    const place = resolvePlace(info.location);
    const html = place.then((p) => new Blob([clipHtml(info, p)], { type: "text/html" }));
    const text = place.then((p) => new Blob([clipText(info, p)], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/html": html, "text/plain": text })]);
    return;
  }
  // Plain-http LAN: no device location or Clipboard API here; copy synchronously with the
  // configured location.
  const configured = info.location ? { ...info.location, fromDevice: false } : null;
  if (!copyHtmlBySelection(clipHtml(info, configured))) {
    throw new Error("Copy failed");
  }
}

async function downloadAudio(info: ClipInfo): Promise<void> {
  const res = await fetch(info.audioUrl);
  if (!res.ok) {
    throw new Error(`Audio ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = audioFileName(info, blob.type);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Call from the tap handler itself (the copy must start inside the user's gesture). */
export async function shareClip(info: ClipInfo): Promise<{ copied: boolean; audioSaved: boolean }> {
  const copy = copyToClipboard(info).then(
    () => true,
    () => false,
  );
  const audio = downloadAudio(info).then(
    () => true,
    () => false,
  );
  const [copied, audioSaved] = await Promise.all([copy, audio]);
  return { copied, audioSaved };
}
