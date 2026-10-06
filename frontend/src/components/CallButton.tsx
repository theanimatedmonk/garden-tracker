import type { CSSProperties } from "react";
import { useCall } from "../audio/AudioProvider";
import { confidenceTier } from "../utils/detections";
import { PlayIcon, Waveform } from "./Icons";

type Props = {
  src: string;
  /** BirdNET confidence of this call; tints the playing state by tier (clear / likely / faint). */
  confidence: number;
  size?: "sm" | "md" | "lg";
  label?: string;
};

/** White play button that turns into a live waveform with a progress ring while the call plays. */
export function CallButton({ src, confidence, size = "md", label = "call" }: Props) {
  const { playing, progress, toggle } = useCall(src);
  const style = { "--progress": progress } as CSSProperties;

  return (
    <button
      type="button"
      className={`call-btn call-${size} call-tone-${confidenceTier(confidence).tone}${playing ? " is-playing" : ""}`}
      style={style}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      aria-pressed={playing}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
    >
      {playing ? <Waveform live /> : <PlayIcon />}
    </button>
  );
}
