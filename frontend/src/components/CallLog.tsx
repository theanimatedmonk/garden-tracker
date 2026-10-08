import { useEffect, useState } from "react";
import { apiUrl, formatWhen, type Detection } from "../api/client";
import { useStopAudio } from "../audio/AudioProvider";
import { useDetections } from "../data/DetectionsProvider";
import { confidenceTier } from "../utils/detections";
import { shareClip } from "../utils/shareClip";
import { CallButton } from "./CallButton";
import { KebabIcon } from "./Icons";
import { useToast } from "./Toast";

type Props = {
  species: string;
  scientificName: string | null;
  imageUrl: string | null;
  detections: Detection[];
};

// Room the menu needs below its button; with less, it opens upward instead.
const MENU_HEIGHT = 200;

export function CallLog({ species, scientificName, imageUrl, detections }: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);

  const toggleMenu = (id: string, button: HTMLElement) => {
    if (menuFor === id) {
      setMenuFor(null);
      return;
    }
    // Measure against the app (the phone frame on desktop), not just the window.
    const bottom = button.closest(".app")?.getBoundingClientRect().bottom ?? window.innerHeight;
    setMenuUp(button.getBoundingClientRect().bottom + MENU_HEIGHT > bottom);
    setMenuFor(id);
  };
  const { removeCall, location } = useDetections();
  const showToast = useToast();
  const stopAudio = useStopAudio();

  const notThisBird = (id: string) => {
    setMenuFor(null);
    setRemoveError(null);
    stopAudio();
    removeCall(id)
      .then(() => showToast("Call removed"))
      .catch(() => setRemoveError("Couldn't remove that call. Is the backend running?"));
  };
  // Photo, names and creator link to the clipboard; the WAV is saved alongside (no audio on clipboards).
  const share = (d: Detection, url: string) => {
    setMenuFor(null);
    shareClip({ species, scientificName, imageUrl, audioUrl: url, timestamp: d.timestamp, location }).then(
      ({ copied, audioSaved }) => {
        if (copied && audioSaved) {
          showToast(
            <>
              Copied <strong>{species}</strong> · audio saved
            </>,
          );
        } else if (copied) {
          showToast(
            <>
              Copied <strong>{species}</strong> · couldn&apos;t save the audio
            </>,
          );
        } else if (audioSaved) {
          showToast("Couldn't copy · audio saved");
        } else {
          showToast("Couldn't share this clip. Is the backend running?");
        }
      },
    );
  };

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
    <>
      {removeError && <p className="form-error call-log-error">{removeError}</p>}
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
                  onClick={(e) => toggleMenu(d.id, e.currentTarget)}
                >
                  <KebabIcon />
                </button>
                {menuFor === d.id && (
                  <div className={menuUp ? "call-menu up" : "call-menu"} role="menu" aria-label={tier.hint}>
                    <p className="call-menu-hint">{tier.hint}</p>
                    <a role="menuitem" href={url} target="_blank" rel="noreferrer" onClick={() => setMenuFor(null)}>
                      Download clip
                    </a>
                    <button type="button" role="menuitem" onClick={() => share(d, url)}>
                      Share clip
                    </button>
                    <button type="button" role="menuitem" className="menu-danger" onClick={() => notThisBird(d.id)}>
                      I don&apos;t trust this sound
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
