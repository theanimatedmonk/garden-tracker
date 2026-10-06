import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, apiUrl, type Detection } from "../api/client";

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
  subscribe: (listener: (message: StreamMessage) => void) => () => void;
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

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/events/stream"));
    source.onmessage = (msg) => {
      let message: StreamMessage;
      try {
        message = JSON.parse(msg.data) as StreamMessage;
      } catch {
        return;
      }
      if (message.type === "detection" || message.type === "event") {
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

  const value = useMemo(
    () => ({ detections, loaded, error, subscribe }),
    [detections, loaded, error, subscribe],
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
