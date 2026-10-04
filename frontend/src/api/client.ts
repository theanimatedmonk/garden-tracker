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
};

export type SpeciesSummary = {
  name: string;
  scientific_name: string | null;
  first_seen: string | null;
  last_seen: string | null;
  sighting_count: number;
};

export type StatusResponse = {
  ok: boolean;
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

export const api = {
  status: () => fetchJson<StatusResponse>("/api/status"),
  events: () => fetchJson<{ events: WildlifeEvent[] }>("/api/events"),
  detections: (limit = 200) =>
    fetchJson<{ detections: Detection[] }>(`/api/detections?limit=${limit}`),
  species: () => fetchJson<{ species: SpeciesSummary[] }>("/api/species"),
};

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
