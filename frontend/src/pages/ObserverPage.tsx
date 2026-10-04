import { useCallback, useEffect, useState } from "react";
import { api, apiUrl, formatTime, type WildlifeEvent } from "../api/client";
import { DetectionHistoryList } from "../components/DetectionHistoryList";

export function ObserverPage() {
  const [listening, setListening] = useState(true);
  const [activeEvent, setActiveEvent] = useState<WildlifeEvent | null>(null);
  const [lastVisitor, setLastVisitor] = useState<WildlifeEvent | null>(null);
  const [mode, setMode] = useState("…");

  const showEvent = useCallback((event: WildlifeEvent) => {
    if (!event.surface) {
      return;
    }
    const present = async () => {
      let enriched = event;
      if (!event.image_url) {
        try {
          const { detections } = await api.detections();
          const match =
            detections.find((d) => d.id === event.detection_id) ??
            detections.find((d) => d.species === event.species);
          if (match?.image_url) {
            enriched = { ...event, image_url: match.image_url };
          }
        } catch {
          /* keep event without photo */
        }
      }
      setListening(false);
      setActiveEvent(enriched);
      setLastVisitor(enriched);
      window.setTimeout(() => {
        setActiveEvent(null);
        setListening(true);
      }, 12000);
    };
    void present();
  }, []);

  useEffect(() => {
    api.status().then((s) => setMode(s.birdnet_mode)).catch(() => setMode("offline"));

    api.events().then(({ events }) => {
      const latest = events.find((e) => e.surface);
      if (latest) {
        showEvent(latest);
      }
    });

    const source = new EventSource(apiUrl("/api/events/stream"));
    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as WildlifeEvent & { type?: string };
        if (data.type === "connected") {
          return;
        }
        if (data.type === "detection") {
          return;
        }
        if (data.type === "event") {
          const { type: _t, ...event } = data;
          showEvent(event as WildlifeEvent);
        } else {
          showEvent(data);
        }
      } catch {
        /* ignore */
      }
    };
    return () => source.close();
  }, [showEvent]);

  return (
    <section className="observer">
      <p className="eyebrow">BirdNET · {mode} · Bengaluru · log is saved on your Mac</p>

      <div className="observer-stage">
        {activeEvent ? (
          <div className="notice-state">
            <p className="spark">✦</p>
            <p className="notice-label">A new visitor.</p>
            {activeEvent.image_url ? (
              <img src={activeEvent.image_url} alt="" className="visitor-photo" />
            ) : (
              <div className="visitor-photo visitor-photo-placeholder" aria-hidden>
                🐦
              </div>
            )}
            <h2>{activeEvent.species}</h2>
            <p className="meta">
              Heard at {formatTime(activeEvent.timestamp)} · {(activeEvent.confidence * 100).toFixed(0)}% confidence
            </p>
            <audio controls src={apiUrl(`/api/recordings/${activeEvent.detection_id}`)} className="audio-player">
              Your browser does not support audio playback.
            </audio>
          </div>
        ) : (
          <div className="calm-state">
            <div className="pulse-ring" aria-hidden />
            <h1>{listening ? "Listening…" : "…"}</h1>
            {lastVisitor ? (
              <div className="last-visitor">
                {lastVisitor.image_url && (
                  <img src={lastVisitor.image_url} alt="" className="visitor-photo visitor-photo-sm" />
                )}
                <p className="meta">
                  Last heard: <strong>{lastVisitor.species}</strong> at {formatTime(lastVisitor.timestamp)}
                </p>
              </div>
            ) : (
              <p>New visitors show here · full log below</p>
            )}
          </div>
        )}
      </div>

      <DetectionHistoryList compact limit={200} />
    </section>
  );
}
