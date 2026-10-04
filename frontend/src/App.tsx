import { NavLink, Route, Routes } from "react-router-dom";
import { LogbookPage } from "./pages/LogbookPage";
import { ObserverPage } from "./pages/ObserverPage";
import { SoundscapePage } from "./pages/SoundscapePage";

export default function App() {
  return (
    <div className="app-shell app-mobile">
      <main className="main main-mobile">
        <Routes>
          <Route path="/" element={<ObserverPage />} />
          <Route path="/soundscape" element={<SoundscapePage />} />
          <Route path="/logbook" element={<LogbookPage />} />
        </Routes>
      </main>
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "bottom-link active" : "bottom-link")}>
          <span className="bottom-icon" aria-hidden>
            ◉
          </span>
          Observer
        </NavLink>
        <NavLink
          to="/soundscape"
          className={({ isActive }) => (isActive ? "bottom-link active" : "bottom-link")}
        >
          <span className="bottom-icon" aria-hidden>
            ◐
          </span>
          Soundscape
        </NavLink>
        <NavLink
          to="/logbook"
          className={({ isActive }) => (isActive ? "bottom-link active" : "bottom-link")}
        >
          <span className="bottom-icon" aria-hidden>
            ☰
          </span>
          Logbook
        </NavLink>
      </nav>
    </div>
  );
}
