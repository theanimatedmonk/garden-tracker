import type { Detection } from "../api/client";

export type SpeciesGroup = {
  species: string;
  scientific_name: string | null;
  image_url: string | null;
  detections: Detection[];
  lastHeard: string;
  bestDetection: Detection;
  hasSurfaced: boolean;
};

export function groupDetectionsBySpecies(detections: Detection[]): SpeciesGroup[] {
  const map = new Map<string, Detection[]>();
  for (const d of detections) {
    const list = map.get(d.species) ?? [];
    list.push(d);
    map.set(d.species, list);
  }

  const groups: SpeciesGroup[] = [];
  for (const [species, list] of map) {
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const bestDetection = [...list].sort((a, b) => b.confidence - a.confidence)[0];
    groups.push({
      species,
      scientific_name: list[0].scientific_name,
      image_url: list.find((d) => d.image_url)?.image_url ?? list[0].image_url,
      detections: list,
      lastHeard: list[0].timestamp,
      bestDetection,
      hasSurfaced: list.some((d) => d.surfaced),
    });
  }

  groups.sort((a, b) => new Date(b.lastHeard).getTime() - new Date(a.lastHeard).getTime());
  return groups;
}

export function filterDetectionsByDateRange(
  detections: Detection[],
  start: Date | null,
  end: Date | null,
): Detection[] {
  return detections.filter((d) => {
    const t = new Date(d.timestamp);
    if (start && t < startOfDay(start)) {
      return false;
    }
    if (end && t > endOfDay(end)) {
      return false;
    }
    return true;
  });
}

export function filterDetectionsByDay(detections: Detection[], day: Date): Detection[] {
  const start = startOfDay(day);
  const end = endOfDay(day);
  return detections.filter((d) => {
    const t = new Date(d.timestamp);
    return t >= start && t <= end;
  });
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Dex numbers in discovery order: the first species ever heard is #001. */
export function assignDexNumbers(detections: Detection[]): Map<string, number> {
  const firstHeard = new Map<string, number>();
  for (const d of detections) {
    const t = new Date(d.timestamp).getTime();
    const prev = firstHeard.get(d.species);
    if (prev === undefined || t < prev) {
      firstHeard.set(d.species, t);
    }
  }
  const ordered = [...firstHeard.entries()].sort((a, b) => a[1] - b[1]);
  return new Map(ordered.map(([species], i) => [species, i + 1]));
}

export function formatDexNo(n: number | undefined): string {
  return n ? `#${String(n).padStart(3, "0")}` : "#???";
}

export type ConfidenceTier = { label: string; tone: "clear" | "likely" | "faint" };

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) {
    return { label: "Clear call", tone: "clear" };
  }
  if (confidence >= 0.6) {
    return { label: "Likely", tone: "likely" };
  }
  return { label: "Faint", tone: "faint" };
}

export function firstHeard(group: SpeciesGroup): string {
  return group.detections[group.detections.length - 1].timestamp;
}

export function isFirstHeardToday(group: SpeciesGroup): boolean {
  return startOfDay(new Date(firstHeard(group))).getTime() === startOfDay(new Date()).getTime();
}
