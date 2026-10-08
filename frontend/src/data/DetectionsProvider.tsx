import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, apiUrl, type Detection, type DeviceLocation } from "../api/client";

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
  subscribe: (listener: (message: StreamMessage) => void) => () => void;
  /** Remove one call the user says isn't this bird. */
  removeCall: (id: string) => Promise<void>;
  /** Remove every call of a species the user doesn't trust. */
  removeSpecies: (species: string) => Promise<void>;
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

  // Fetched ahead of time so sharing never waits on the network (the copy must start inside the tap).
  useEffect(() => {
    if (location) {
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .status()
        .then((s) => {
          if (!cancelled && s.location) {
            setLocation(s.location);
          }
        })
        .catch(() => {});
    load();
    const retry = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(retry);
    };
  }, [location]);

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

  const value = useMemo(
    () => ({ detections, loaded, error, location, subscribe, removeCall, removeSpecies }),
    [detections, loaded, error, location, subscribe, removeCall, removeSpecies],
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
