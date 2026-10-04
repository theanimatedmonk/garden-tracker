import { useEffect, useMemo, useState } from "react";
import { api, type Detection } from "../api/client";
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
  const [detections, setDetections] = useState<Detection[]>([]);
  const [day, setDay] = useState(() => toDateInputValue(new Date()));

  useEffect(() => {
    const load = () => api.detections(500).then(({ detections: list }) => setDetections(list));
    load();
    const id = window.setInterval(load, 10000);
    return () => window.clearInterval(id);
  }, []);

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
      const hour = new Date(d.timestamp).getHours();
      const bucket = hours[hour];
      bucket.detections.push(d);
      const prev = bucket.species.get(d.species);
      bucket.species.set(d.species, {
        image: d.image_url ?? prev?.image ?? null,
        count: (prev?.count ?? 0) + 1,
      });
    }
    return hours;
  }, [dayDetections]);

  const maxCount = Math.max(1, ...buckets.map((b) => b.detections.length));
  const uniqueSpecies = groupDetectionsBySpecies(dayDetections).length;

  return (
    <section className="mobile-page soundscape-page">
      <header className="page-header">
        <h1>Soundscape</h1>
        <p className="lede">
          {uniqueSpecies} species · {dayDetections.length} detections
        </p>
      </header>

      <label className="field-label">
        Day
        <input
          type="date"
          className="field-input"
          value={day}
          max={toDateInputValue(new Date())}
          onChange={(e) => setDay(e.target.value)}
        />
      </label>

      <div className="soundscape-graph" role="img" aria-label="Hourly bird activity">
        <div className="graph-bars">
          {buckets.map((b) => {
            const height = b.detections.length ? Math.max(12, (b.detections.length / maxCount) * 100) : 4;
            return (
              <div key={b.hour} className="graph-col">
                <div className="graph-avatars">
                  {[...b.species.entries()].slice(0, 4).map(([name, info]) => (
                    <span
                      key={name}
                      className="graph-avatar"
                      title={`${name} (${info.count})`}
                      style={
                        info.image
                          ? { backgroundImage: `url(${info.image})` }
                          : undefined
                      }
                    >
                      {!info.image && "🐦"}
                    </span>
                  ))}
                </div>
                <div className="graph-bar" style={{ height: `${height}%` }} />
                <span className="graph-hour">{String(b.hour).padStart(2, "0")}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="soundscape-legend">
        {groupDetectionsBySpecies(dayDetections).slice(0, 12).map((g) => (
          <li key={g.species}>
            {g.image_url ? (
              <img src={g.image_url} alt="" className="legend-avatar" />
            ) : (
              <span className="legend-avatar legend-fallback">🐦</span>
            )}
            <span>{g.species}</span>
            <span className="legend-count">{g.detections.length}</span>
          </li>
        ))}
        {dayDetections.length === 0 && <li className="empty">No detections on this day.</li>}
      </ul>
    </section>
  );
}
