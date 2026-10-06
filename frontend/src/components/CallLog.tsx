import { useEffect, useState } from "react";
import { apiUrl, formatWhen, type Detection } from "../api/client";
import { confidenceTier } from "../utils/detections";
import { CallButton } from "./CallButton";
import { KebabIcon } from "./Icons";

type Props = {
  species: string;
  detections: Detection[];
};

const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

export function CallLog({ species, detections }: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const sorted = [...detections].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  useEffect(() => {
    if (!menuFor) {
      return;
    }
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".call-more")) {
        setMenuFor(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuFor]);

  return (
    <ul className="call-log">
      {sorted.map((d) => {
        const tier = confidenceTier(d.confidence);
        const url = apiUrl(d.audio_url);
        return (
          <li key={d.id} className="call-row">
            <div className={`call-chip tone-${tier.tone}`} title={tier.hint}>
              <CallButton src={url} confidence={d.confidence} size="sm" label={`${tier.label.toLowerCase()} from ${formatWhen(d.timestamp)}`} />
              <span className="call-chip-label">{tier.label}</span>
            </div>
            <time className="call-when" dateTime={d.timestamp}>
              {formatWhen(d.timestamp)}
            </time>
            <div className="call-more">
              <button
                type="button"
                className="kebab"
                aria-label="More options"
                aria-expanded={menuFor === d.id}
                onClick={() => setMenuFor((cur) => (cur === d.id ? null : d.id))}
              >
                <KebabIcon />
              </button>
              {menuFor === d.id && (
                <div className="call-menu" role="menu">
                  <a role="menuitem" href={url} target="_blank" rel="noreferrer" onClick={() => setMenuFor(null)}>
                    Download clip
                  </a>
                  {canShare && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuFor(null);
                        navigator.share({ title: `${species} call`, url }).catch(() => {});
                      }}
                    >
                      Share
                    </button>
                  )}
                  <p className="call-menu-hint">{tier.hint}</p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
