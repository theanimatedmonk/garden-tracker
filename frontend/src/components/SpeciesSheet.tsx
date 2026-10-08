import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, formatWhen } from "../api/client";
import { useStopAudio } from "../audio/AudioProvider";
import { useDetections } from "../data/DetectionsProvider";
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
import { ConfirmDialog } from "./ConfirmDialog";
import { BirdGlyph, FlagIcon } from "./Icons";
import { useToast } from "./Toast";

type Props = {
  group: SpeciesGroup | null;
  onClose: () => void;
};

export function SpeciesSheet({ group, onClose }: Props) {
  const stopAudio = useStopAudio();
  const { removeSpecies } = useDetections();
  const showToast = useToast();
  const [tier, setTier] = useState<TierFilter>("all");
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Each species opens on its best calls. Only on opening: calls arriving while the sheet is
  // open don't override a chip the user picked.
  const species = group?.species;
  const detections = group?.detections;
  const detectionsRef = useRef(detections);
  detectionsRef.current = detections;
  useEffect(() => {
    setTier(defaultTierFilter(detectionsRef.current ?? []));
    setConfirming(false);
    setRemoveError(null);
  }, [species]);

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
  // If the selected type's last call was removed, fall back to everything.
  const activeTier = tierChips.some((f) => f.id === tier) ? tier : "all";

  const confirmRemove = async () => {
    if (!group) {
      return;
    }
    setRemoving(true);
    setRemoveError(null);
    try {
      stopAudio();
      await removeSpecies(group.species);
      showToast(
        <>
          <strong>{group.species}</strong> removed from your logbook
        </>,
      );
      setConfirming(false);
      // The species is gone from the feed, so the sheet closes with it.
      onClose();
    } catch {
      setRemoveError("Couldn't remove it. Is the backend running?");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <BottomSheet open={group !== null} label={group?.species ?? "Species"} onClose={close}>
      {group && (
        <div className="species-sheet">
          <div className="sheet-portrait-wrap">
            <div className="sheet-portrait">
              {group.image_url ? <img src={group.image_url} alt="" /> : <BirdGlyph />}
            </div>
            <button
              type="button"
              className="portrait-flag"
              aria-label="Not this bird? Remove it"
              title="Not this bird?"
              onClick={() => setConfirming(true)}
            >
              <FlagIcon />
            </button>
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
                  aria-pressed={activeTier === f.id}
                  onClick={() => setTier(f.id)}
                >
                  {f.label}
                  <span className="chip-count">{f.count}</span>
                </button>
              ))}
            </div>
          )}
          <CallLog
            species={group.species}
            scientificName={group.scientific_name}
            imageUrl={group.image_url}
            detections={group.detections.filter((d) => matchesTier(d, activeTier))}
          />

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
      <ConfirmDialog
        open={confirming && group !== null}
        title={group ? `Not a ${group.species}?` : "Not this bird?"}
        confirmLabel="Yes, remove this bird"
        busy={removing}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={() => setConfirming(false)}
      >
        {group && (
          <p>
            {group.detections.length === 1
              ? "Its call will be removed from your logbook."
              : `All ${group.detections.length} of its calls will be removed from your logbook.`}{" "}
            You can&apos;t undo this.
          </p>
        )}
      </ConfirmDialog>
    </BottomSheet>
  );
}
