import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function MicIcon() {
  return (
    <svg {...base}>
      <rect x="8.5" y="2" width="7" height="12.5" rx="3.5" fill="currentColor" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
    </svg>
  );
}

export function RadarIcon() {
  return (
    <svg {...base}>
      <path d="M20.5 12a8.5 8.5 0 1 1-4.3-7.4" />
      <path d="M16.2 12a4.2 4.2 0 1 1-2.1-3.6" />
      <path d="M12 12l7-7" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg {...base}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M12 3v6.5l2-1.5 2 1.5V3" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg {...base} stroke="none">
      <path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z" fill="currentColor" />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg {...base}>
      <path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg {...base}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg {...base}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...base}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function KebabIcon() {
  return (
    <svg {...base} stroke="none">
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
  );
}

export function BirdGlyph() {
  return (
    <svg {...base} viewBox="0 0 64 64" width={56} height={56} strokeWidth={2.5}>
      <path d="M14 40c6 8 20 10 30 4 6-4 8-12 8-18l6-4-7-1c-2-5-7-7-12-5-5 2-7 8-6 13-6-1-13-3-19-8 0 8 3 13 8 15-4 1-6 1-8 0z" />
      <circle cx="44" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function Waveform({ live }: { live: boolean }) {
  return (
    <span className={live ? "wave is-live" : "wave"} aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
