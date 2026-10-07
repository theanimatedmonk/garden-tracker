import { useEffect, useState } from "react";

function clock(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
}

/**
 * Mock iOS status bar for the desktop phone frame (hidden on real phones, see the
 * "Phone frame" CSS): a live clock, signal, Wi‑Fi and a battery icon.
 */
export function MockStatusBar() {
  const [time, setTime] = useState(clock);

  useEffect(() => {
    const id = window.setInterval(() => setTime(clock()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mock-status-bar" aria-hidden>
      <span className="mock-status-time">{time}</span>
      <span className="mock-status-icons">
        <svg viewBox="0 0 18 12" width="18" height="12">
          <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
          <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
          <rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 16 12" width="16" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1.5 4.6a9.4 9.4 0 0 1 13 0" />
          <path d="M4.2 7.4a5.6 5.6 0 0 1 7.6 0" />
          <circle cx="8" cy="10.2" r="1.3" fill="currentColor" stroke="none" />
        </svg>
        <svg viewBox="0 0 27 13" width="27" height="13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="16" height="9" rx="2" fill="currentColor" />
          <path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </span>
    </div>
  );
}
