import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AudioProvider } from "./audio/AudioProvider";
import { BookIcon, MicIcon, RadarIcon } from "./components/Icons";
import { MockStatusBar } from "./components/MockStatusBar";
import { DetectionsProvider, useStream } from "./data/DetectionsProvider";
import { LogbookPage } from "./pages/LogbookPage";
import { ObserverPage } from "./pages/ObserverPage";
import { SoundscapePage } from "./pages/SoundscapePage";

type TabDef = {
  path: string;
  label: string;
  icon: ReactNode;
  render: (active: boolean) => ReactNode;
};

const TABS: TabDef[] = [
  { path: "/", label: "Scan", icon: <MicIcon />, render: (active) => <ObserverPage active={active} /> },
  { path: "/soundscape", label: "Radar", icon: <RadarIcon />, render: () => <SoundscapePage /> },
  { path: "/logbook", label: "Logbook", icon: <BookIcon />, render: () => <LogbookPage /> },
];

/** Shows a toast for surfaced (hero) events, on every page. */
function useHeroFound() {
  const [found, setFound] = useState<{ species: string; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useStream((data) => {
    if (data.type === "event" && data.species && data.surface !== false) {
      setFound({ species: data.species, key: Date.now() });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setFound(null), 4000);
    }
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return found;
}

/**
 * Tabs mount on first visit and then stay mounted, hidden while inactive: switching back is
 * instant (no Rive reload, no refetch flash) and each tab keeps its own scroll position.
 */
function Shell() {
  const found = useHeroFound();
  const { pathname } = useLocation();
  const current = TABS.find((t) => t.path === pathname) ?? TABS[0];
  const [visited, setVisited] = useState<Set<string>>(() => new Set([current.path]));

  useEffect(() => {
    setVisited((prev) => (prev.has(current.path) ? prev : new Set(prev).add(current.path)));
  }, [current.path]);

  return (
    <div className="app">
      <MockStatusBar />
      <main className="app-main">
        {TABS.map((tab) =>
          tab === current || visited.has(tab.path) ? (
            <div key={tab.path} className="tab-page" hidden={tab !== current}>
              {tab.render(tab === current)}
            </div>
          ) : null,
        )}
      </main>

      {found && (
        <div key={found.key} className="toast" role="status">
          Bird found! It&apos;s a <strong>{found.species}</strong>
        </div>
      )}

      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <NavLink key={tab.path} to={tab.path} end className={tab === current ? "tab active" : "tab"}>
            {tab.icon}
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <DetectionsProvider>
      <AudioProvider>
        <Shell />
      </AudioProvider>
    </DetectionsProvider>
  );
}
