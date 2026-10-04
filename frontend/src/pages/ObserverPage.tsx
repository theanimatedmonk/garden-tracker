import { useEffect, useMemo, useState } from "react";
import { api, apiUrl, formatDate, formatTime, type Detection } from "../api/client";
import { DexEntrySheet } from "../components/DexEntrySheet";
import { SpeciesSprite, StatBar, TypeBadges } from "../components/DexParts";
import {
  assignDexNumbers,
  formatDexNo,
  groupDetectionsBySpecies,
  type SpeciesGroup,
} from "../utils/detections";

export function ObserverPage() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetGroup, setSheetGroup] = useState<SpeciesGroup | null>(null);

  const load = () =>
    api
      .detections(500)
      .then(({ detections: list }) => {
        setDetections(list);
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

  const groups = useMemo(() => groupDetectionsBySpecies(detections), [detections]);
  const dexNos = useMemo(() => assignDexNumbers(detections), [detections]);
  const maxVisits = Math.max(1, ...groups.map((g) => g.detections.length));

  return (
    <section className="observer-mobile">
      {error && <p className="mobile-banner error">Link error · {error}</p>}

      <div className="reels-scroll">
        {!loaded && (
          <article className="reel-card reel-card-empty">
            <p className="pixel blink-text">Booting dex…</p>
          </article>
        )}
        {loaded && groups.length === 0 && !error && (
          <article className="reel-card reel-card-empty">
            <div className="radar-sweep" aria-hidden />
            <h1 className="pixel">Scanning…</h1>
            <p className="empty">No birds encountered yet. Calls will appear here as dex cards.</p>
          </article>
        )}
        {groups.map((g) => (
          <article key={g.species} className="reel-card">
            <div className="reel-photo-wrap">
              <SpeciesSprite src={g.image_url} className="reel-photo" />
              <div className="reel-gradient" />
              <span className="reel-reticle" aria-hidden />
              <span className="reel-dexno pixel">{formatDexNo(dexNos.get(g.species))}</span>
            </div>
            <div className="reel-content">
              <TypeBadges group={g} />
              <h1 className="reel-title">{g.species}</h1>
              {g.scientific_name && <p className="reel-sci">{g.scientific_name}</p>}

              <div className="stat-block">
                <StatBar
                  label="Conf"
                  fraction={g.bestDetection.confidence}
                  display={`${(g.bestDetection.confidence * 100).toFixed(0)}%`}
                />
                <StatBar
                  label="Visits"
                  fraction={g.detections.length / maxVisits}
                  display={String(g.detections.length)}
                  tone="atk"
                />
              </div>
              <p className="reel-when">
                Last heard {formatDate(g.lastHeard)} · {formatTime(g.lastHeard)}
              </p>

              <audio
                controls
                preload="none"
                src={apiUrl(g.bestDetection.audio_url)}
                className="reel-audio"
              />
              <button type="button" className="btn-dex" onClick={() => setSheetGroup(g)}>
                Open dex entry
              </button>
            </div>
          </article>
        ))}
      </div>

      <DexEntrySheet
        group={sheetGroup}
        dexNo={sheetGroup ? dexNos.get(sheetGroup.species) : undefined}
        onClose={() => setSheetGroup(null)}
      />
    </section>
  );
}
