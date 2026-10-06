import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatWhen } from "../api/client";
import { CallFilterChip } from "../components/CallFilterChip";
import { DateRangeSheet } from "../components/DateRangeSheet";
import { CalendarIcon } from "../components/Icons";
import { SpeciesCard } from "../components/SpeciesCard";
import { SpeciesSheet } from "../components/SpeciesSheet";
import { useDetections } from "../data/DetectionsProvider";
import {
  filterDetectionsByDateRange,
  groupDetectionsBySpecies,
  matchesTier,
  parseDateInput,
  type TierFilter,
} from "../utils/detections";

type SortMode = "recent" | "calls" | "name";

const SORTS: Array<{ id: SortMode; label: string }> = [
  { id: "recent", label: "Recent" },
  { id: "calls", label: "Most heard" },
  { id: "name", label: "A–Z" },
];

/** Marks a horizontally scrolling row with `has-more` while content is hidden past its right edge. */
function useOverflowHint<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const update = () => el.classList.toggle("has-more", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    const resize = new ResizeObserver(update);
    resize.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      resize.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);
  return ref;
}

export function LogbookPage() {
  const { detections, loaded } = useDetections();
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [tier, setTier] = useState<TierFilter>("all");
  const [datesOpen, setDatesOpen] = useState(false);
  const [sheetSpecies, setSheetSpecies] = useState<string | null>(null);
  const chipRow = useOverflowHint<HTMLDivElement>();

  // The sheet always shows a species' whole history (it has its own call filter), kept live.
  const sheetGroup = useMemo(
    () => (sheetSpecies ? (groupDetectionsBySpecies(detections).find((g) => g.species === sheetSpecies) ?? null) : null),
    [detections, sheetSpecies],
  );

  const filtered = useMemo(() => {
    let list = detections.filter((d) => matchesTier(d, tier));
    if (fromDate) {
      list = filterDetectionsByDateRange(list, parseDateInput(fromDate), null);
    }
    if (toDate) {
      list = filterDetectionsByDateRange(list, null, parseDateInput(toDate));
    }
    return list;
  }, [detections, tier, fromDate, toDate]);

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
    if (sort === "calls") {
      list = [...list].sort((a, b) => b.detections.length - a.detections.length);
    } else if (sort === "name") {
      list = [...list].sort((a, b) => a.species.localeCompare(b.species));
    }
    return list;
  }, [filtered, query, sort]);

  const hasDates = Boolean(fromDate || toDate);
  const dayLabel = (value: string) => formatDate(parseDateInput(value).toISOString());
  const rangeLabel = hasDates
    ? `${fromDate ? dayLabel(fromDate) : "Start"} – ${toDate ? dayLabel(toDate) : "Today"}`
    : null;

  return (
    <section className="page">
      <header className="page-header">
        <h1>Logbook</h1>
        <p>
          {groups.length} species collected
          {rangeLabel && ` · ${rangeLabel}`}
        </p>
      </header>

      <div className="filters">
        <input
          type="search"
          className="input"
          aria-label="Search species"
          placeholder="Search species"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-bar">
          <div ref={chipRow} className="chip-scroll" role="group" aria-label="Sort and filter">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip"
                aria-pressed={sort === s.id}
                onClick={() => setSort(s.id)}
              >
                {s.label}
              </button>
            ))}
            <CallFilterChip value={tier} onChange={setTier} />
          </div>
          <button
            type="button"
            className="chip chip-icon"
            aria-label={rangeLabel ? `Dates: ${rangeLabel}` : "Filter by date"}
            aria-pressed={hasDates}
            onClick={() => setDatesOpen(true)}
          >
            <CalendarIcon />
          </button>
        </div>
      </div>

      <ul className="collection">
        {groups.map((g) => (
          <li key={g.species}>
            <button type="button" className="collection-item" onClick={() => setSheetSpecies(g.species)}>
              <SpeciesCard species={g.species} imageUrl={g.image_url} size="sm" />
              <strong>{g.species}</strong>
              <span>
                {g.detections.length} {g.detections.length === 1 ? "call" : "calls"} · {formatWhen(g.lastHeard)}
              </span>
            </button>
          </li>
        ))}
        {loaded && groups.length === 0 && <li className="empty-note">No species match your filters.</li>}
      </ul>

      <SpeciesSheet group={sheetGroup} onClose={() => setSheetSpecies(null)} />
      <DateRangeSheet
        open={datesOpen}
        from={fromDate}
        to={toDate}
        onApply={(from, to) => {
          setFromDate(from);
          setToDate(to);
        }}
        onClose={() => setDatesOpen(false)}
      />
    </section>
  );
}
