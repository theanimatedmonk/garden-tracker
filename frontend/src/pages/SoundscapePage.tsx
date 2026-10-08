import { useMemo, useState } from "react";
import type { Detection } from "../api/client";
import { SpeciesSheet } from "../components/SpeciesSheet";
import { useDetections } from "../data/DetectionsProvider";
import {
  filterDetectionsByDay,
  groupDetectionsBySpecies,
  parseDateInput,
  toDateInputValue,
} from "../utils/detections";

type HourBucket = {
  hour: number;
  detections: Detection[];
  species: Map<string, { image: string | null; count: number }>;
};

export function SoundscapePage() {
  const { detections, loaded } = useDetections();
  const [day, setDay] = useState(() => toDateInputValue(new Date()));
  const [sheetSpecies, setSheetSpecies] = useState<string | null>(null);

  const dayDetections = useMemo(
    () => filterDetectionsByDay(detections, parseDateInput(day)),
    [detections, day],
  );

  const buckets = useMemo(() => {
    const hours: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      detections: [],
      species: new Map(),
    }));
    for (const d of dayDetections) {
      const bucket = hours[new Date(d.timestamp).getHours()];
      bucket.detections.push(d);
      const prev = bucket.species.get(d.species);
      bucket.species.set(d.species, {
        image: d.image_url ?? prev?.image ?? null,
        count: (prev?.count ?? 0) + 1,
      });
    }
    return hours;
  }, [dayDetections]);

  const daySpecies = useMemo(() => groupDetectionsBySpecies(dayDetections), [dayDetections]);
  // The sheet shows the bird's whole history (not just this day), looked up live.
  const sheetGroup = useMemo(
    () => (sheetSpecies ? (groupDetectionsBySpecies(detections).find((g) => g.species === sheetSpecies) ?? null) : null),
    [detections, sheetSpecies],
  );
  const maxCount = Math.max(1, ...buckets.map((b) => b.detections.length));
  const busiest = buckets.reduce((a, b) => (b.detections.length > a.detections.length ? b : a));

  return (
    <section className="page">
      <header className="page-header">
        <h1>Radar</h1>
        <p>
          {daySpecies.length} species · {dayDetections.length} calls
          {busiest.detections.length > 0 && ` · busiest around ${String(busiest.hour).padStart(2, "0")}:00`}
        </p>
      </header>

      <input
        type="date"
        className="input day-input"
        aria-label="Day"
        value={day}
        max={toDateInputValue(new Date())}
        onChange={(e) => setDay(e.target.value)}
      />

      <div className="radar-chart" role="img" aria-label="Bird calls per hour">
        <div className="radar-bars">
          {buckets.map((b) => {
            const height = b.detections.length ? Math.max(10, (b.detections.length / maxCount) * 100) : 3;
            return (
              <div key={b.hour} className="radar-col">
                <div className="radar-track">
                  <div className={b.detections.length ? "radar-bar" : "radar-bar idle"} style={{ height: `${height}%` }}>
                    <div className="radar-avatars">
                      {[...b.species.entries()].slice(0, 3).map(([name, info]) => (
                        <span
                          key={name}
                          className="radar-avatar"
                          title={`${name} (${info.count})`}
                          style={info.image ? { backgroundImage: `url(${info.image})` } : undefined}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <span className="radar-hour">{b.hour % 6 === 0 ? String(b.hour).padStart(2, "0") : ""}</span>
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="section-title">Heard this day</h2>
      <ul className="species-rows">
        {daySpecies.map((g) => (
          <li key={g.species}>
            <button type="button" className="species-row" onClick={() => setSheetSpecies(g.species)}>
              <span
                className="species-row-avatar"
                style={g.image_url ? { backgroundImage: `url(${g.image_url})` } : undefined}
              />
              <span className="species-row-name">{g.species}</span>
              <span className="count-pill">{g.detections.length}</span>
            </button>
          </li>
        ))}
        {loaded && dayDetections.length === 0 && <li className="empty-note">No birds heard on this day.</li>}
      </ul>

      <SpeciesSheet group={sheetGroup} onClose={() => setSheetSpecies(null)} />
    </section>
  );
}
