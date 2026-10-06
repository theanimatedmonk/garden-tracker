import type { Detection, ImageCredit } from "../api/client";

export type SpeciesGroup = {
  species: string;
  scientific_name: string | null;
  image_url: string | null;
  image_credit: ImageCredit | null;
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
    const withImage = list.find((d) => d.image_url);
    groups.push({
      species,
      scientific_name: list[0].scientific_name,
      image_url: withImage?.image_url ?? null,
      image_credit: withImage?.image_credit ?? null,
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


export type ConfidenceTier = {
  label: string;
  hint: string;
  tone: "clear" | "likely" | "faint";
};

/** Plain-language stand-in for BirdNET's confidence score; users never see the number. */
export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) {
    return { label: "Clear Call", hint: "Loud and unmistakable", tone: "clear" };
  }
  if (confidence >= 0.6) {
    return { label: "Likely", hint: "Probably this bird", tone: "likely" };
  }
  return { label: "Faint", hint: "Distant or partly masked — could be a lookalike", tone: "faint" };
}

export type TierFilter = "all" | ConfidenceTier["tone"];

export const TIER_FILTERS: Array<{ id: TierFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "clear", label: "Clear Call" },
  { id: "likely", label: "Likely" },
  { id: "faint", label: "Faint" },
];

export function matchesTier(detection: Detection, filter: TierFilter): boolean {
  return filter === "all" || confidenceTier(detection.confidence).tone === filter;
}

/** Open a call log on its best calls: Clear Call if there is one, else Likely, else everything. */
export function defaultTierFilter(detections: Detection[]): TierFilter {
  if (detections.some((d) => matchesTier(d, "clear"))) {
    return "clear";
  }
  if (detections.some((d) => matchesTier(d, "likely"))) {
    return "likely";
  }
  return "all";
}
