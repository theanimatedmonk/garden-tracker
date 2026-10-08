export type WildlifeEvent = {
  id: string;
  detection_id: string;
  species: string;
  confidence: number;
  timestamp: string;
  event_type: string;
  surface: boolean;
  jev_reason: string;
  image_url?: string | null;
};

export type ImageCredit = {
  text: string;
  source: string;
  url: string | null;
};

export type Detection = {
  id: string;
  species: string;
  scientific_name: string | null;
  confidence: number;
  timestamp: string;
  audio_url: string;
  source_device: string;
  model: string;
  surfaced?: boolean;
  image_url?: string | null;
  image_credit?: ImageCredit | null;
};

export type SpeciesSummary = {
  name: string;
  scientific_name: string | null;
  first_seen: string | null;
  last_seen: string | null;
  sighting_count: number;
};

export type DeviceLocation = {
  name: string;
  lat: number;
  lon: number;
};

export type StatusResponse = {
  ok: boolean;
  /** Where the listener is: BirdNET's configured coordinates and a place name (no GPS on the ESP32). */
  location?: DeviceLocation;
  birdnet_mode: string;
  use_birdnet: boolean;
  storage: string;
  devices: Array<{
    device_id: string;
    last_seen: string;
    mic_ok: boolean;
    wifi_ok: boolean;
  }>;
};

/** Backend origin: env override, or same host as the UI on port 8000 (works with LAN + direct CORS). */
function inferApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window === "undefined") {
    return "";
  }
  const { hostname, protocol } = window.location;
  if (protocol === "file:") {
    return "http://127.0.0.1:8000";
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://127.0.0.1:8000";
  }
  return `http://${hostname}:8000`;
}

export const API_BASE = inferApiBase();

export function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

const json = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json() as Promise<T>;
};

function apiCandidates(path: string): string[] {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const urls = [apiUrl(normalized)];
  if (typeof window !== "undefined") {
    urls.push(`${window.location.origin}${normalized}`);
  }
  urls.push(`http://127.0.0.1:8000${normalized}`);
  return [...new Set(urls)];
}

async function fetchJson<T>(path: string): Promise<T> {
  let lastError: Error | null = null;
  for (const url of apiCandidates(path)) {
    try {
      return await json<T>(await fetch(url));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("Backend unreachable");
}

async function sendDelete(path: string): Promise<void> {
  let lastError: Error | null = null;
  for (const url of apiCandidates(path)) {
    let res: Response;
    try {
      res = await fetch(url, { method: "DELETE" });
    } catch (err) {
      // Unreachable at this address; try the next candidate.
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return;
  }
  throw lastError ?? new Error("Backend unreachable");
}

export const api = {
  status: () => fetchJson<StatusResponse>("/api/status"),
  events: () => fetchJson<{ events: WildlifeEvent[] }>("/api/events"),
  detections: (limit = 200) =>
    fetchJson<{ detections: Detection[] }>(`/api/detections?limit=${limit}`),
  species: () => fetchJson<{ species: SpeciesSummary[] }>("/api/species"),
  /** "I don't trust this sound": removes the detection (and its clip, if nothing else uses it). */
  removeDetection: (id: string) => sendDelete(`/api/detections/${encodeURIComponent(id)}`),
  /** "Not a <species>? Yes, remove this bird": removes every detection of the species. */
  removeSpecies: (species: string) => sendDelete(`/api/species/${encodeURIComponent(species)}`),
};

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** "Today, 22:10" / "Yesterday, 08:05" / "4 Oct, 22:10" */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((dayStart(new Date()) - dayStart(d)) / 86_400_000);
  const day = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : formatDate(iso);
  return `${day}, ${formatTime(iso)}`;
}
