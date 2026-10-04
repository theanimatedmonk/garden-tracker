import { useEffect, useState } from "react";
import { api, formatDate, type SpeciesSummary } from "../api/client";
import { DetectionHistoryList } from "../components/DetectionHistoryList";

export function WildlifePage() {
  const [species, setSpecies] = useState<SpeciesSummary[]>([]);

  useEffect(() => {
    const load = () => api.species().then(({ species: list }) => setSpecies(list));
    load();
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="panel">
      <h1>My Wildlife</h1>
      <p className="lede">{species.length} species in your log</p>
      <DetectionHistoryList limit={200} />
      <h2 className="section-subhead">Species summary</h2>
      <ul className="species-list">
        {species.map((s) => (
          <li key={s.name}>
            <div>
              <strong>{s.name}</strong>
              {s.scientific_name && <span className="sci">{s.scientific_name}</span>}
            </div>
            <div className="species-meta">
              First seen: {s.first_seen ? formatDate(s.first_seen) : "—"} · Seen: {s.sighting_count} times
            </div>
          </li>
        ))}
        {species.length === 0 && <li className="empty">Nothing recorded yet — keep the ESP32 streaming.</li>}
      </ul>
    </section>
  );
}
