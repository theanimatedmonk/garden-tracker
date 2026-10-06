import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, formatWhen } from "../api/client";
import { useStopAudio } from "../audio/AudioProvider";
import {
  defaultTierFilter,
  matchesTier,
  TIER_FILTERS,
  type SpeciesGroup,
  type TierFilter,
} from "../utils/detections";
import { BottomSheet } from "./BottomSheet";
import { CallButton } from "./CallButton";
import { CallLog } from "./CallLog";
import { BirdGlyph } from "./Icons";

type Props = {
  group: SpeciesGroup | null;
  onClose: () => void;
};

export function SpeciesSheet({ group, onClose }: Props) {
  const stopAudio = useStopAudio();
  const [tier, setTier] = useState<TierFilter>("all");

  // Each species opens on its best calls. Only on opening: calls arriving while the sheet is
  // open don't override a chip the user picked.
  const species = group?.species;
  const detections = group?.detections;
  const detectionsRef = useRef(detections);
  detectionsRef.current = detections;
  useEffect(() => setTier(defaultTierFilter(detectionsRef.current ?? [])), [species]);

  const close = useCallback(() => {
    stopAudio();
    onClose();
  }, [stopAudio, onClose]);

  // Only tiers this species actually has. With a single tier, "All" says the same thing, so no chips.
  const tierChips = group
    ? TIER_FILTERS.map((f) => ({ ...f, count: group.detections.filter((d) => matchesTier(d, f.id)).length })).filter(
        (f) => f.count > 0,
      )
    : [];

  return (
    <BottomSheet open={group !== null} label={group?.species ?? "Species"} onClose={close}>
      {group && (
        <div className="species-sheet">
          <div className="sheet-portrait">
            {group.image_url ? <img src={group.image_url} alt="" /> : <BirdGlyph />}
          </div>
          <h2 className="sheet-name">{group.species}</h2>
          {group.scientific_name && <p className="sheet-sci">{group.scientific_name}</p>}
          <p className="sheet-last">Last heard {formatWhen(group.lastHeard)}</p>

          <div className="sheet-tiles">
            <div className="tile">
              <span className="tile-label">Best Call</span>
              <CallButton
                src={apiUrl(group.bestDetection.audio_url)}
                confidence={group.bestDetection.confidence}
                label="best call"
              />
            </div>
            <div className="tile">
              <span className="tile-label">Calls</span>
              <strong className="tile-value">{group.detections.length}</strong>
            </div>
          </div>

          <h3 className="sheet-subhead">Call log</h3>
          {tierChips.length > 2 && (
            <div className="chip-row sheet-tier-chips" role="group" aria-label="Filter calls">
              {tierChips.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="chip"
                  aria-pressed={tier === f.id}
                  onClick={() => setTier(f.id)}
                >
                  {f.label}
                  <span className="chip-count">{f.count}</span>
                </button>
              ))}
            </div>
          )}
          <CallLog species={group.species} detections={group.detections.filter((d) => matchesTier(d, tier))} />

          {group.image_credit && (
            <p className="photo-credit">
              {group.image_credit.text ? `Photo ${group.image_credit.text} · ` : "Photo via "}
              {group.image_credit.url ? (
                <a href={group.image_credit.url} target="_blank" rel="noreferrer">
                  {group.image_credit.source}
                </a>
              ) : (
                group.image_credit.source
              )}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
