import { useCallback, useEffect, useMemo, useState } from "react";
import { api, API_BASE, apiUrl, formatDate, formatTime, type Detection } from "../api/client";

type Props = {
  compact?: boolean;
  limit?: number;
};

type SpeciesGroup = {
  species: string;
  scientific_name: string | null;
  image_url: string | null;
  detections: Detection[];
  hasSurfaced: boolean;
  bestConfidence: number;
};

function groupBySpecies(items: Detection[]): SpeciesGroup[] {
  const map = new Map<string, Detection[]>();
  for (const d of items) {
    const list = map.get(d.species) ?? [];
    list.push(d);
    map.set(d.species, list);
  }

  const groups: SpeciesGroup[] = [];
  for (const [species, detections] of map) {
    detections.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const bestConfidence = Math.max(...detections.map((d) => d.confidence));
    groups.push({
      species,
      scientific_name: detections[0].scientific_name,
      image_url: detections.find((d) => d.image_url)?.image_url ?? detections[0].image_url,
      detections,
      hasSurfaced: detections.some((d) => d.surfaced),
      bestConfidence,
    });
  }

  groups.sort(
    (a, b) =>
      new Date(b.detections[0].timestamp).getTime() - new Date(a.detections[0].timestamp).getTime(),
  );
  return groups;
}

export function DetectionHistoryList({ compact = false, limit = 100 }: Props) {
  const [items, setItems] = useState<Detection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupBySpecies(items), [items]);

  const toggleExpanded = (species: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(species)) {
        next.delete(species);
      } else {
        next.add(species);
      }
      return next;
    });
  };

  const mergeDetections = useCallback(
    (detections: Detection[]) => {
      setItems(detections.slice(0, limit));
      setLoaded(true);
      setError(null);
    },
    [limit],
  );

  useEffect(() => {
    const load = () =>
      api
        .detections()
        .then(({ detections }) => mergeDetections(detections))
        .catch((err: Error) => {
          setLoaded(true);
          setError(err.message || "Could not load detections");
        });
    load();
    const poll = window.setInterval(load, 5000);
    return () => window.clearInterval(poll);
  }, [mergeDetections]);

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/events/stream"));
    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as Detection & { type?: string };
        if (data.type !== "detection") {
          return;
        }
        const { type: _t, ...detection } = data;
        setItems((prev) => {
          if (prev.some((d) => d.id === detection.id)) {
            return prev;
          }
          return [detection as Detection, ...prev].slice(0, limit);
        });
      } catch {
        /* ignore */
      }
    };
    return () => source.close();
  }, [limit]);

  return (
    <section className={compact ? "history-panel compact" : "history-panel"}>
      <div className="history-header">
        <h2>{compact ? "Your bird log" : "Detection history"}</h2>
        <span className="history-count">
          {groups.length} species · {items.length} detections
        </span>
      </div>
      {!loaded && <p className="empty">Loading saved detections…</p>}
      {error && (
        <p className="empty">
          Backend unreachable at {API_BASE || "port 8000"}. Start it:{" "}
          <code>cd backend && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000</code>
          , then refresh.
        </p>
      )}
      <ul className="history-list">
        {groups.map((g) => {
          const latest = g.detections[0];
          const isOpen = expanded.has(g.species);
          const multi = g.detections.length > 1;

          return (
            <li
              key={g.species}
              className={g.hasSurfaced ? "history-item surfaced" : "history-item"}
            >
              {g.image_url && (
                <img src={g.image_url} alt="" className="species-thumb" loading="lazy" />
              )}
              <div className="history-body">
                <div className="history-main">
                  <strong>{g.species}</strong>
                  {g.hasSurfaced && <span className="badge">Noticed</span>}
                  <span className="history-meta">
                    {multi
                      ? `${g.detections.length} detections · latest ${formatTime(latest.timestamp)} · best ${(g.bestConfidence * 100).toFixed(0)}%`
                      : `${formatTime(latest.timestamp)} · ${(latest.confidence * 100).toFixed(0)}%`}
                  </span>
                </div>

                {!multi && (
                  <audio controls preload="none" src={apiUrl(latest.audio_url)} className="history-audio" />
                )}

                {multi && (
                  <>
                    <button
                      type="button"
                      className="history-toggle"
                      aria-expanded={isOpen}
                      onClick={() => toggleExpanded(g.species)}
                    >
                      {isOpen ? "See less" : "See more"}
                    </button>
                    {isOpen && (
                      <ul className="history-timeline">
                        {g.detections.map((d) => (
                          <li key={d.id} className="history-timeline-row">
                            <div className="history-timeline-meta">
                              <span className="history-timeline-when">
                                {formatDate(d.timestamp)} · {formatTime(d.timestamp)}
                              </span>
                              <span className="history-timeline-conf">
                                {(d.confidence * 100).toFixed(0)}%
                              </span>
                              {d.surfaced && <span className="badge">Noticed</span>}
                            </div>
                            <audio
                              controls
                              preload="none"
                              src={apiUrl(d.audio_url)}
                              className="history-audio"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
        {loaded && items.length === 0 && !error && (
          <li className="empty">
            No BirdNET matches yet — or the UI is not talking to the backend. Run{" "}
            <code>cd frontend && npm run dev</code>, open{" "}
            <a href="http://127.0.0.1:5173/">127.0.0.1:5173</a>, then hard-refresh (Cmd+Shift+R).
          </li>
        )}
      </ul>
    </section>
  );
}
