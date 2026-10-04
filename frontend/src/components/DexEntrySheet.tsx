import { formatDate, formatTime } from "../api/client";
import { firstHeard, formatDexNo, type SpeciesGroup } from "../utils/detections";
import { BottomSheet } from "./BottomSheet";
import { SpeciesSprite, StatBar, TypeBadges } from "./DexParts";
import { SpeciesTimeline } from "./SpeciesTimeline";

type Props = {
  group: SpeciesGroup | null;
  dexNo: number | undefined;
  onClose: () => void;
};

export function DexEntrySheet({ group, dexNo, onClose }: Props) {
  const avg = group
    ? group.detections.reduce((sum, d) => sum + d.confidence, 0) / group.detections.length
    : 0;

  return (
    <BottomSheet
      open={group !== null}
      eyebrow={formatDexNo(dexNo)}
      title={group?.species ?? "Entry"}
      onClose={onClose}
    >
      {group && (
        <>
          <div className="entry-hero">
            <SpeciesSprite src={group.image_url} className="entry-sprite" />
            <div className="entry-id">
              {group.scientific_name && <p className="sci">{group.scientific_name}</p>}
              <TypeBadges group={group} />
              <dl className="entry-facts">
                <div>
                  <dt>First heard</dt>
                  <dd>{formatDate(firstHeard(group))}</dd>
                </div>
                <div>
                  <dt>Last heard</dt>
                  <dd>
                    {formatDate(group.lastHeard)} {formatTime(group.lastHeard)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="stat-block">
            <StatBar
              label="Best"
              fraction={group.bestDetection.confidence}
              display={`${(group.bestDetection.confidence * 100).toFixed(0)}%`}
            />
            <StatBar label="Avg" fraction={avg} display={`${(avg * 100).toFixed(0)}%`} tone="spd" />
            <StatBar
              label="Calls"
              fraction={Math.min(1, group.detections.length / 50)}
              display={String(group.detections.length)}
              tone="atk"
            />
          </div>

          <h3 className="entry-subhead">Call log</h3>
          <SpeciesTimeline detections={group.detections} />
        </>
      )}
    </BottomSheet>
  );
}
