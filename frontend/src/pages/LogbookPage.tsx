import { useEffect, useMemo, useState } from "react";
import { api, formatDate, formatTime, type Detection } from "../api/client";
import { BottomSheet } from "../components/BottomSheet";
import { SpeciesTimeline } from "../components/SpeciesTimeline";
import {
  filterDetectionsByDateRange,
  groupDetectionsBySpecies,
  parseDateInput,
  type SpeciesGroup,
} from "../utils/detections";

export function LogbookPage() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sheetGroup, setSheetGroup] = useState<SpeciesGroup | null>(null);

  useEffect(() => {
    const load = () => api.detections(500).then(({ detections: list }) => setDetections(list));
    load();
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    let list = detections;
    if (fromDate) {
      list = filterDetectionsByDateRange(list, parseDateInput(fromDate), null);
    }
    if (toDate) {
      list = filterDetectionsByDateRange(list, null, parseDateInput(toDate));
    }
    return list;
  }, [detections, fromDate, toDate]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = groupDetectionsBySpecies(filtered);
    if (q) {
      list = list.filter(
        (g) =>
          g.species.toLowerCase().includes(q) ||
          (g.scientific_name?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [filtered, query]);

  return (
    <section className="mobile-page logbook-page">
      <header className="page-header">
        <h1>Logbook</h1>
        <p className="lede">{groups.length} species</p>
      </header>

      <div className="filter-stack">
        <label className="field-label">
          Search
          <input
            type="search"
            className="field-input"
            placeholder="Species name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="filter-row">
          <label className="field-label">
            From
            <input
              type="date"
              className="field-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="field-label">
            To
            <input
              type="date"
              className="field-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
        </div>
        {(fromDate || toDate || query) && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setQuery("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <ul className="logbook-list">
        {groups.map((g) => (
          <li key={g.species}>
            <button type="button" className="logbook-row" onClick={() => setSheetGroup(g)}>
              {g.image_url ? (
                <img src={g.image_url} alt="" className="logbook-thumb" />
              ) : (
                <span className="logbook-thumb logbook-fallback">🐦</span>
              )}
              <div className="logbook-body">
                <strong>{g.species}</strong>
                {g.scientific_name && <span className="sci">{g.scientific_name}</span>}
                <span className="logbook-meta">
                  {g.detections.length} visits · last {formatDate(g.lastHeard)}{" "}
                  {formatTime(g.lastHeard)}
                </span>
              </div>
              {g.hasSurfaced && <span className="badge">Noticed</span>}
            </button>
          </li>
        ))}
        {groups.length === 0 && <li className="empty">No species match your filters.</li>}
      </ul>

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
