import { useEffect, useMemo, useState } from "react";
import { api, apiUrl, formatDate, formatTime } from "../api/client";
import { BottomSheet } from "../components/BottomSheet";
import { SpeciesTimeline } from "../components/SpeciesTimeline";
import { groupDetectionsBySpecies, type SpeciesGroup } from "../utils/detections";

export function ObserverPage() {
  const [groups, setGroups] = useState<SpeciesGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetGroup, setSheetGroup] = useState<SpeciesGroup | null>(null);

  const load = () =>
    api
      .detections(500)
      .then(({ detections }) => {
        setGroups(groupDetectionsBySpecies(detections));
        setLoaded(true);
        setError(null);
      })
      .catch((err: Error) => {
        setLoaded(true);
        setError(err.message);
      });

  useEffect(() => {
    load();
    const poll = window.setInterval(load, 5000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/events/stream"));
    source.onmessage = () => {
      load();
    };
    return () => source.close();
  }, []);

  const cards = useMemo(() => groups, [groups]);

  return (
    <section className="observer-mobile">
      {error && <p className="mobile-banner error">{error}</p>}

      <div className="reels-scroll">
        {!loaded && (
          <article className="reel-card">
            <p className="empty center">Loading your window…</p>
          </article>
        )}
        {loaded && cards.length === 0 && !error && (
          <article className="reel-card reel-card-empty">
            <div className="pulse-ring" aria-hidden />
            <h1>Listening…</h1>
            <p className="empty">Bird matches appear here as full-screen cards.</p>
          </article>
        )}
        {cards.map((g) => (
          <article key={g.species} className="reel-card">
            <div className="reel-photo-wrap">
              {g.image_url ? (
                <img src={g.image_url} alt="" className="reel-photo" />
              ) : (
                <div className="reel-photo reel-photo-fallback">🐦</div>
              )}
              <div className="reel-gradient" />
            </div>
            <div className="reel-content">
              {g.hasSurfaced && <span className="badge reel-badge">Noticed</span>}
              <h1 className="reel-title">{g.species}</h1>
              {g.scientific_name && <p className="reel-sci">{g.scientific_name}</p>}
              <p className="reel-when">
                Last heard {formatDate(g.lastHeard)} · {formatTime(g.lastHeard)}
              </p>
              <p className="reel-meta">
                Best clip · {(g.bestDetection.confidence * 100).toFixed(0)}% · {g.detections.length}{" "}
                {g.detections.length === 1 ? "visit" : "visits"}
              </p>
              <audio
                controls
                preload="none"
                src={apiUrl(g.bestDetection.audio_url)}
                className="reel-audio"
              />
              <button type="button" className="btn-secondary" onClick={() => setSheetGroup(g)}>
                See details
              </button>
            </div>
          </article>
        ))}
      </div>

      <BottomSheet
        open={sheetGroup !== null}
        title={sheetGroup?.species ?? "Timeline"}
        onClose={() => setSheetGroup(null)}
      >
        {sheetGroup && <SpeciesTimeline detections={sheetGroup.detections} />}
      </BottomSheet>
    </section>
  );
}
