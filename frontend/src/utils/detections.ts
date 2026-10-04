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
