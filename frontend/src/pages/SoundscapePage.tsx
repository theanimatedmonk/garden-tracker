import { useEffect, useMemo, useState } from "react";
import { api, formatTime, type Detection } from "../api/client";

export function SoundscapePage() {
  const [detections, setDetections] = useState<Detection[]>([]);

  useEffect(() => {
    const load = () => api.detections().then(({ detections: list }) => setDetections(list));
    load();
    const id = window.setInterval(load, 10000);
    return () => window.clearInterval(id);
  }, []);

  const byHour = useMemo(() => {
    const map = new Map<number, Detection[]>();
    for (const d of detections) {
      const hour = new Date(d.timestamp).getHours();
      const bucket = map.get(hour) ?? [];
      bucket.push(d);
      map.set(hour, bucket);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [detections]);

  return (
    <section className="panel">
      <h1>Soundscape</h1>
      <p className="lede">Today&apos;s acoustic footprint (from backend detections)</p>
      <div className="timeline">
        {byHour.map(([hour, items]) => (
          <div key={hour} className="timeline-row">
            <span className="hour">{String(hour).padStart(2, "0")}:00</span>
            <span className="marks">
              {items.map((d) => (
                <span key={d.id} title={`${d.species} · ${formatTime(d.timestamp)}`}>
                  🐦
                </span>
              ))}
            </span>
          </div>
        ))}
        {byHour.length === 0 && <p className="empty">Timeline fills in once BirdNET (or mock) returns species.</p>}
      </div>
    </section>
  );
}
