import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, apiUrl } from "./api/client";
import { LogbookPage } from "./pages/LogbookPage";
import { ObserverPage } from "./pages/ObserverPage";
import { SoundscapePage } from "./pages/SoundscapePage";

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "dex-btn active" : "dex-btn");

/** Device chrome: lens blinks and a toast pops on every live detection; green LED tracks backend health. */
function useDexSignals() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [encounter, setEncounter] = useState<{ species: string; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const check = () =>
      api
        .status()
        .then((s) => setOnline(s.ok))
        .catch(() => setOnline(false));
    check();
    const id = window.setInterval(check, 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/events/stream"));
    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as { type?: string; species?: string };
        if (data.type !== "detection" || !data.species) {
          return;
        }
        setEncounter({ species: data.species, key: Date.now() });
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setEncounter(null), 4000);
      } catch {
        /* ignore */
      }
    };
    return () => {
      source.close();
      window.clearTimeout(timer.current);
    };
  }, []);

  return { online, encounter };
}

export default function App() {
  const { online, encounter } = useDexSignals();
  const ledState = online === null ? "" : online ? "on" : "fault";

  return (
    <div className="dex">
      <header className="dex-top">
        <span className={encounter ? "dex-lens ping" : "dex-lens"} aria-hidden>
          <span className="dex-lens-glint" />
        </span>
        <span className="dex-leds" aria-hidden>
          <span className={`dex-led red ${ledState === "fault" ? "blink" : ""}`} />
          <span className={`dex-led yellow ${encounter ? "blink" : ""}`} />
          <span className={`dex-led green ${ledState === "on" ? "on" : ""}`} />
        </span>
        <span className="dex-brand">
          BIRD<span>DEX</span>
        </span>
      </header>

      <main className="dex-body">
        <div className="dex-bezel">
          <span className="bezel-dots" aria-hidden>
            <i />
            <i />
          </span>
          <div className="dex-screen">
            <Routes>
              <Route path="/" element={<ObserverPage />} />
              <Route path="/soundscape" element={<SoundscapePage />} />
              <Route path="/logbook" element={<LogbookPage />} />
            </Routes>
          </div>
          <span className="bezel-foot" aria-hidden>
            <i className="bezel-power" />
            <span className="bezel-grille">
              <i />
              <i />
              <i />
              <i />
            </span>
          </span>
        </div>
      </main>

      {encounter && (
        <div key={encounter.key} className="dex-toast" role="status">
          A wild <strong>{encounter.species}</strong> appeared!
        </div>
      )}

      <nav className="dex-nav" aria-label="Main">
        <NavLink to="/" end className={navClass}>
          <span className="dex-btn-icon" aria-hidden>
            ◉
          </span>
          Scan
        </NavLink>
        <NavLink to="/soundscape" className={navClass}>
          <span className="dex-btn-icon" aria-hidden>
            ◔
          </span>
          Radar
        </NavLink>
        <NavLink to="/logbook" className={navClass}>
          <span className="dex-btn-icon" aria-hidden>
            ▦
          </span>
          Dex
        </NavLink>
      </nav>
    </div>
  );
}
