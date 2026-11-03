import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, apiUrl, type Detection, type DeviceLocation } from "../api/client";
import { syncObserverLocationFromDevice, type SyncLocationResult } from "../utils/syncObserverLocation";

const POLL_MS = 5000;
const LIMIT = 500;

export type StreamMessage = {
  type?: string;
  species?: string;
  surface?: boolean;
};

type DetectionsState = {
  detections: Detection[];
  loaded: boolean;
  error: string | null;
  /** Where the listener is, from /api/status; null until known. */
  location: DeviceLocation | null;
  locationSource: string | null;
  /** Newest ESP32 heartbeat from /api/status. */
  deviceLastSeen: string | null;
  /** Tap to trigger the browser location prompt (required on most browsers). */
  syncLocationFromDevice: () => Promise<SyncLocationResult>;
  subscribe: (listener: (message: StreamMessage) => void) => () => void;
  /** Remove one call the user says isn't this bird. */
  removeCall: (id: string) => Promise<void>;
  /** Remove every call of a species the user doesn't trust. */
  removeSpecies: (species: string) => Promise<void>;
  /** Poll detections and /api/status again (e.g. after fixing the backend or ESP32). */
  recheckConnection: () => void;
};

const DetectionsContext = createContext<DetectionsState | null>(null);

/**
 * One detections feed for every tab: a single poll and a single event stream,
 * so switching tabs shows data at once and the browser's per-host connection
 * limit isn't eaten by several open streams.
 */
export function DetectionsProvider({ children }: { children: ReactNode }) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [locationSource, setLocationSource] = useState<string | null>(null);
  const [deviceLastSeen, setDeviceLastSeen] = useState<string | null>(null);
  const listeners = useRef(new Set<(message: StreamMessage) => void>());
  const inFlight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(() => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    api
      .detections(LIMIT)
      .then(({ detections: list }) => {
        setDetections(list);
        setError(null);
      })
      .catch((err: Error) => setError(err.message || "Backend unreachable"))
      .finally(() => {
        setLoaded(true);
        inFlight.current = false;
        if (again.current) {
          again.current = false;
          refresh();
        }
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const refreshStatus = useCallback(() => {
    api
      .status()
      .then((s) => {
        if (s.location) {
          setLocation(s.location);
        }
        if (s.location_source) {
          setLocationSource(s.location_source);
        }
        const devices = s.devices ?? [];
        const newest = devices.reduce<string | null>((max, d) => {
          if (!d.last_seen) {
            return max;
          }
          if (!max || d.last_seen > max) {
            return d.last_seen;
          }
          return max;
        }, null);
        setDeviceLastSeen(newest);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = window.setInterval(refreshStatus, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshStatus]);

  const syncLocationFromDevice = useCallback(async (): Promise<SyncLocationResult> => {
    const result = await syncObserverLocationFromDevice();
    if (result.ok) {
      refreshStatus();
    }
    return result;
  }, [refreshStatus]);

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/events/stream"));
    source.onmessage = (msg) => {
      let message: StreamMessage;
      try {
        message = JSON.parse(msg.data) as StreamMessage;
      } catch {
        return;
      }
      if (message.type === "detection" || message.type === "event" || message.type === "removed") {
        refresh();
      }
      listeners.current.forEach((listener) => listener(message));
    };
    return () => source.close();
  }, [refresh]);

  const subscribe = useCallback((listener: (message: StreamMessage) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const removeCall = useCallback(
    async (id: string) => {
      await api.removeDetection(id);
      setDetections((list) => list.filter((d) => d.id !== id));
      refresh();
    },
    [refresh],
  );

  const removeSpecies = useCallback(
    async (species: string) => {
      await api.removeSpecies(species);
      setDetections((list) => list.filter((d) => d.species !== species));
      refresh();
    },
    [refresh],
  );

  const recheckConnection = useCallback(() => {
    refresh();
    refreshStatus();
  }, [refresh, refreshStatus]);

  const value = useMemo(
    () => ({
      detections,
      loaded,
      error,
      location,
      locationSource,
      deviceLastSeen,
      syncLocationFromDevice,
      subscribe,
      removeCall,
      removeSpecies,
      recheckConnection,
    }),
    [
      detections,
      loaded,
      error,
      location,
      locationSource,
      deviceLastSeen,
      syncLocationFromDevice,
      subscribe,
      removeCall,
      removeSpecies,
      recheckConnection,
    ],
  );
  return <DetectionsContext.Provider value={value}>{children}</DetectionsContext.Provider>;
}

export function useDetections(): DetectionsState {
  const ctx = useContext(DetectionsContext);
  if (!ctx) {
    throw new Error("useDetections must be used inside <DetectionsProvider>");
  }
  return ctx;
}

/** Run `listener` for every message on the live event stream. */
export function useStream(listener: (message: StreamMessage) => void) {
  const { subscribe } = useDetections();
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => subscribe((message) => latest.current(message)), [subscribe]);
}
