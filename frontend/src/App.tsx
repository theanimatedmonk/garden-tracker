import { NavLink, Route, Routes } from "react-router-dom";
import { ObserverPage } from "./pages/ObserverPage";
import { WildlifePage } from "./pages/WildlifePage";
import { SoundscapePage } from "./pages/SoundscapePage";
import { HistoryPage } from "./pages/HistoryPage";

export default function App() {
  return (
    <div className="app-shell">
      <nav className="nav">
        <span className="nav-brand">Wildlife Observer</span>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Observer
        </NavLink>
        <NavLink to="/wildlife" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          My Wildlife
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          History
        </NavLink>
        <NavLink to="/soundscape" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Soundscape
        </NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<ObserverPage />} />
          <Route path="/wildlife" element={<WildlifePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/soundscape" element={<SoundscapePage />} />
        </Routes>
      </main>
    </div>
  );
}
