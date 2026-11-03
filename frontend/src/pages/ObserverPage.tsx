import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiUrl, formatListenDay, formatTime, formatWhen } from "../api/client";
import { CallButton } from "../components/CallButton";
import { CardErrorBoundary } from "../components/CardErrorBoundary";
import { ExpandIcon, LocationIcon } from "../components/Icons";
import { ListenerHelpSheet, type ListenIssue } from "../components/ListenerHelpSheet";
import { ObserverLocationSheet } from "../components/ObserverLocationSheet";
import { SpeciesCard } from "../components/SpeciesCard";
import { SpeciesSheet } from "../components/SpeciesSheet";
import { useDetections, useStream } from "../data/DetectionsProvider";
import { cardRectOnScreen } from "../utils/cardLayout";
import { groupDetectionsBySpecies } from "../utils/detections";
import { isListenerLive, maxDetectionTimestamp } from "../utils/listenerStatus";

const HEARD_BANNER_MS = 5000;
const LISTEN_CLOCK_MS = 30_000;

type ListenChipStatus =
  | { tone: "idle"; showOrb: true; text: string; issue: ListenIssue }
  | { tone: "off"; showOrb: true; text: string; issue: ListenIssue }
  | { tone: "heard"; showOrb: true; text: string; issue?: undefined }
  | { tone: "live"; showOrb: true; text: string; issue?: undefined }
  | { tone: "stale"; showOrb: false; day: string; time: string; aria: string; issue: ListenIssue };

// The Rive runtime is large; load it after first paint.
const RiveCard = lazy(() => import("../components/RiveCard").then((m) => ({ default: m.RiveCard })));

/**
 * A full-height reel whose card only mounts while the reel is on or next to the screen,
 * so swiping through many species keeps just a couple of WebGL contexts alive, and only
 * animates while it is the reel in view.
 * Publishes where the card lands on screen as CSS variables so the controls can sit under it.
 */
function ScanReel({
  renderCard,
  children,
}: {
  renderCard: (inView: boolean) => ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const place = () => {
      // Hidden tab: keep the last layout rather than collapsing to zero.
      if (el.clientHeight === 0) {
        return;
      }
      const r = cardRectOnScreen(el.clientWidth, el.clientHeight);
      el.style.setProperty("--card-left", `${r.left}px`);
      el.style.setProperty("--card-top", `${r.top}px`);
      el.style.setProperty("--card-w", `${r.width}px`);
      el.style.setProperty("--card-h", `${r.height}px`);
      el.style.setProperty("--card-bottom", `${r.top + r.height}px`);
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(el);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    // While the tab is hidden nothing intersects; keep cards as they were so coming back is instant.
    const watch = (onChange: (entry: IntersectionObserverEntry) => void, options: IntersectionObserverInit) => {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.rootBounds && entry.rootBounds.height > 0) {
          onChange(entry);
        }
      }, { root: el.parentElement, ...options });
      observer.observe(el);
      return observer;
    };
    const nearby = watch((e) => setNear(e.isIntersecting), { rootMargin: "50% 0px" });
    const visible = watch((e) => setInView(e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    return () => {
      nearby.disconnect();
      visible.disconnect();
    };
  }, []);

  return (
    <article ref={ref} className="scan-reel has-card">
      {near && <Suspense fallback={null}>{renderCard(inView)}</Suspense>}
      {children}
    </article>
  );
}

export function ObserverPage({ active }: { active: boolean }) {
  const { detections, loaded, error, location, locationSource, deviceLastSeen, syncLocationFromDevice, recheckConnection } =
    useDetections();
  const [heard, setHeard] = useState<string | null>(null);
  const [sheetSpecies, setSheetSpecies] = useState<string | null>(null);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [listenerHelpOpen, setListenerHelpOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [locHint, setLocHint] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const heardTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), LISTEN_CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
  }, [deviceLastSeen]);

  const onUseMyLocation = () => {
    setLocBusy(true);
    setLocHint(null);
    syncLocationFromDevice()
      .then((result) => {
        if (!result.ok) {
          setLocHint(result.message);
        } else {
          setLocHint("Location updated for BirdNET.");
        }
      })
      .finally(() => setLocBusy(false));
  };

  useStream((message) => {
    if (message.type === "detection" && message.species) {
      setHeard(message.species);
      window.clearTimeout(heardTimer.current);
      heardTimer.current = window.setTimeout(() => setHeard(null), HEARD_BANNER_MS);
    }
  });
  useEffect(() => () => window.clearTimeout(heardTimer.current), []);

  const groups = useMemo(() => groupDetectionsBySpecies(detections), [detections]);
  // Looked up live, so the sheet follows new calls and closes if the species is removed.
  const sheetGroup = groups.find((g) => g.species === sheetSpecies) ?? null;

  const lastListenedAt = useMemo(
    () => maxDetectionTimestamp(detections) ?? deviceLastSeen,
    [detections, deviceLastSeen],
  );
  const listenerLive = isListenerLive(deviceLastSeen, nowMs);

  const status: ListenChipStatus = useMemo(() => {
    if (!loaded) {
      return { tone: "idle", showOrb: true, text: "Tuning in…", issue: "connecting" };
    }
    if (error) {
      return { tone: "off", showOrb: true, text: "Can't reach the listener", issue: "backend" };
    }
    if (heard) {
      return { tone: "heard", showOrb: true, text: `Heard a ${heard}!` };
    }
    if (listenerLive) {
      return { tone: "live", showOrb: true, text: "Listening…" };
    }
    if (lastListenedAt) {
      const day = formatListenDay(lastListenedAt);
      const time = formatTime(lastListenedAt);
      return {
        tone: "stale",
        showOrb: false,
        day,
        time,
        aria: `Last listened ${day}, ${time}`,
        issue: "device_stale",
      };
    }
    return { tone: "off", showOrb: true, text: "Listener offline", issue: "device_offline" };
  }, [loaded, error, heard, listenerLive, lastListenedAt]);

  const listenIssue = status.issue ?? null;
  const chipInteractive = listenIssue !== null;

  const onListenChipClick = () => {
    if (chipInteractive) {
      setListenerHelpOpen(true);
    }
  };

  const onRecheckListener = () => {
    setRechecking(true);
    recheckConnection();
    window.setTimeout(() => setRechecking(false), 1200);
  };

  return (
    <section className="scan">
      <div className="scan-top">
        <button
          type="button"
          className="listen-loc-fab"
          aria-label="Observer location"
          onClick={() => setLocationSheetOpen(true)}
        >
          <LocationIcon />
        </button>
        {chipInteractive ? (
          <button
            type="button"
            className={`listen-status listen-status-btn is-${status.tone}`}
            aria-label={"aria" in status ? `${status.aria}. Show help` : `${status.text}. Show help`}
            onClick={onListenChipClick}
          >
            {status.showOrb && (
              <span className="listen-orb" aria-hidden>
                <i />
              </span>
            )}
            {status.tone === "stale" ? (
              <span className="listen-text listen-text-stale">
                Last listened {status.day}
                <span className="listen-time">{status.time}</span>
              </span>
            ) : (
              <span className="listen-text">{status.text}</span>
            )}
          </button>
        ) : (
          <header
            className={`listen-status is-${status.tone}`}
            role="status"
            aria-live="polite"
            aria-label={status.text}
          >
            <span className="listen-orb" aria-hidden>
              <i />
            </span>
            <span key={status.text} className="listen-text">
              {status.text}
            </span>
          </header>
        )}
      </div>

      <div className="scan-reels">
        {loaded && groups.length === 0 && (
          <article className="scan-reel">
            <div className="species-card species-card-lg is-placeholder">
              <p>Your first bird will appear here.</p>
            </div>
          </article>
        )}
        {groups.map((g) => (
          <ScanReel
            key={g.species}
            renderCard={(inView) => (
              <CardErrorBoundary
                fallback={
                  <div className="card-slot">
                    <SpeciesCard species={g.species} imageUrl={g.image_url} />
                  </div>
                }
              >
                <RiveCard
                  species={g.species}
                  scientificName={g.scientific_name}
                  imageUrl={g.image_url}
                  paused={!active || !inView}
                />
              </CardErrorBoundary>
            )}
          >
            <div className="scan-pill">
              <CallButton
                src={apiUrl(g.bestDetection.audio_url)}
                confidence={g.bestDetection.confidence}
                label={`${g.species} call`}
              />
              <span className="scan-pill-when">{formatWhen(g.lastHeard)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Open ${g.species} history`}
                onClick={() => setSheetSpecies(g.species)}
              >
                <ExpandIcon />
              </button>
            </div>
          </ScanReel>
        ))}
      </div>

      <SpeciesSheet group={sheetGroup} onClose={() => setSheetSpecies(null)} />
      <ObserverLocationSheet
        open={locationSheetOpen}
        onClose={() => setLocationSheetOpen(false)}
        location={location}
        locationSource={locationSource}
        loaded={loaded}
        locBusy={locBusy}
        locHint={locHint}
        onUseMyLocation={onUseMyLocation}
      />
      <ListenerHelpSheet
        open={listenerHelpOpen}
        onClose={() => setListenerHelpOpen(false)}
        issue={listenIssue}
        lastListenedAt={lastListenedAt}
        backendError={error}
        onRecheck={onRecheckListener}
        rechecking={rechecking}
      />
    </section>
  );
}
