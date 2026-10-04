import { useEffect, useMemo, useState } from "react";
import { api, type Detection } from "../api/client";
import { DexEntrySheet } from "../components/DexEntrySheet";
import { SpeciesSprite } from "../components/DexParts";
import {
  assignDexNumbers,
  filterDetectionsByDateRange,
  formatDexNo,
  groupDetectionsBySpecies,
  parseDateInput,
  type SpeciesGroup,
} from "../utils/detections";

type SortMode = "number" | "recent";

export function LogbookPage() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<SortMode>("number");
  const [sheetGroup, setSheetGroup] = useState<SpeciesGroup | null>(null);

  useEffect(() => {
    const load = () => api.detections(500).then(({ detections: list }) => setDetections(list));
    load();
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, []);

  // Numbers come from the unfiltered log so an entry keeps its number while filtering.
  const dexNos = useMemo(() => assignDexNumbers(detections), [detections]);

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
          (g.scientific_name?.toLowerCase().includes(q) ?? false) ||
          formatDexNo(dexNos.get(g.species)).includes(q),
      );
    }
    if (sort === "number") {
      list = [...list].sort((a, b) => (dexNos.get(a.species) ?? 0) - (dexNos.get(b.species) ?? 0));
    }
    return list;
  }, [filtered, query, sort, dexNos]);

  return (
    <section className="mobile-page logbook-page">
      <header className="page-header">
        <h1 className="pixel">Dex</h1>
        <p className="dex-counter">
          <span>Seen</span>
          <strong>{String(dexNos.size).padStart(3, "0")}</strong>
        </p>
      </header>

      <div className="filter-stack">
        <input
          type="search"
          className="field-input"
          aria-label="Search"
          placeholder="Search name or #no…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
        <div className="filter-bar">
          <div className="segmented" role="group" aria-label="Sort">
            <button type="button" aria-pressed={sort === "number"} onClick={() => setSort("number")}>
              No.
            </button>
            <button type="button" aria-pressed={sort === "recent"} onClick={() => setSort("recent")}>
              Recent
            </button>
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
      </div>

      <ul className="dex-grid">
        {groups.map((g) => (
          <li key={g.species}>
            <button
              type="button"
              className={g.hasSurfaced ? "dex-card noticed" : "dex-card"}
              onClick={() => setSheetGroup(g)}
            >
              <span className="dex-card-no pixel">{formatDexNo(dexNos.get(g.species))}</span>
              <SpeciesSprite src={g.image_url} className="dex-card-sprite" />
              <strong className="dex-card-name">{g.species}</strong>
              <span className="dex-card-meta">
                {g.detections.length} {g.detections.length === 1 ? "call" : "calls"}
              </span>
            </button>
          </li>
        ))}
        {groups.length === 0 && <li className="empty grid-empty">No entries match your filters.</li>}
      </ul>

      <DexEntrySheet
        group={sheetGroup}
        dexNo={sheetGroup ? dexNos.get(sheetGroup.species) : undefined}
        onClose={() => setSheetGroup(null)}
      />
    </section>
  );
}
