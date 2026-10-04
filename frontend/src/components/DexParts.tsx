import { confidenceTier, isFirstHeardToday, type SpeciesGroup } from "../utils/detections";

type StatBarProps = {
  label: string;
  /** 0..1 fill */
  fraction: number;
  display: string;
  tone?: "hp" | "atk" | "spd";
};

export function StatBar({ label, fraction, display, tone = "hp" }: StatBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-track" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className={`stat-fill stat-${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="stat-value">{display}</span>
    </div>
  );
}

export function TypeBadges({ group }: { group: SpeciesGroup }) {
  const tier = confidenceTier(group.bestDetection.confidence);
  return (
    <div className="type-row">
      <span className={`type type-${tier.tone}`}>{tier.label}</span>
      {group.hasSurfaced && <span className="type type-noticed">Noticed</span>}
      {isFirstHeardToday(group) && <span className="type type-new">New</span>}
    </div>
  );
}

export function SpeciesSprite({ src, className }: { src: string | null; className: string }) {
  return src ? (
    <img src={src} alt="" className={className} loading="lazy" />
  ) : (
    <span className={`${className} sprite-fallback`} aria-hidden>
      ?
    </span>
  );
}
