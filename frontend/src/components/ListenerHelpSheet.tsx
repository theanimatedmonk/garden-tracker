import { API_BASE, formatListenDay, formatTime, formatWhen } from "../api/client";
import { BottomSheet } from "./BottomSheet";

export type ListenIssue = "backend" | "device_offline" | "device_stale" | "connecting";

type Props = {
  open: boolean;
  onClose: () => void;
  issue: ListenIssue | null;
  lastListenedAt: string | null;
  backendError: string | null;
  onRecheck: () => void;
  rechecking: boolean;
};

function titleFor(issue: ListenIssue | null): string {
  switch (issue) {
    case "backend":
      return "Can't reach the listener";
    case "device_offline":
      return "Listener offline";
    case "device_stale":
      return "Not listening";
    case "connecting":
      return "Still connecting";
    default:
      return "Listener status";
  }
}

function stepsFor(issue: ListenIssue | null): string[] {
  switch (issue) {
    case "backend":
      return [
        `Start the backend on this network (default ${API_BASE || "http://127.0.0.1:8000"}).`,
        "From the project: cd backend, activate the venv, run uvicorn app.main:app --host 0.0.0.0 --port 8000.",
        "If the UI is on another device, set VITE_API_BASE to your Mac's LAN address before npm run build, or open the app on the same machine as the backend.",
        "Allow port 8000 through the firewall and stay on the same Wi‑Fi as the ESP32.",
      ];
    case "device_offline":
      return [
        "Power the ESP32 (USB or LiPo). Brownouts on weak chargers often look like random drop‑outs.",
        "Confirm Wi‑Fi in include/secrets.h matches your network.",
        "Set BACKEND_HOST in include/config.h to your Mac's current LAN IP (it changes when DHCP assigns a new address).",
        "Reflash after changing BACKEND_HOST, then open Serial Monitor — you should see heartbeats and Sent 16000 samples when uploads work.",
      ];
    case "device_stale":
      return [
        "The field unit has not checked in for about a minute and a half. Treat it like a dropped link, not a quiet garden.",
        "Check power and charger — LiPo sag is a common cause.",
        "Verify the Mac/backend IP has not changed; update BACKEND_HOST and reflash if it did.",
        "On Serial Monitor, look for Upload failed or Connection reset — that usually means the wrong backend address.",
        "When healthy, GET /api/status shows a recent last_seen for your device and the chip returns to Listening….",
      ];
    case "connecting":
      return [
        "The app is loading history and checking /api/status.",
        "If this stays more than a few seconds, tap Check again or open this sheet once the chip shows an error.",
      ];
    default:
      return [];
  }
}

export function ListenerHelpSheet({
  open,
  onClose,
  issue,
  lastListenedAt,
  backendError,
  onRecheck,
  rechecking,
}: Props) {
  const title = titleFor(issue);
  const steps = stepsFor(issue);

  return (
    <BottomSheet open={open && issue !== null} label={title} onClose={onClose}>
      <div className="help-sheet">
        <h2 className="help-sheet-title">{title}</h2>
        {issue === "device_stale" && lastListenedAt && (
          <p className="help-sheet-meta">
            Last activity {formatListenDay(lastListenedAt)}, {formatTime(lastListenedAt)} ({formatWhen(lastListenedAt)})
          </p>
        )}
        {issue === "backend" && backendError && <p className="help-sheet-meta">{backendError}</p>}
        <p className="help-sheet-lead">Try these steps:</p>
        <ol className="help-sheet-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <button type="button" className="btn-primary" disabled={rechecking} onClick={onRecheck}>
          {rechecking ? "Checking…" : "Check again"}
        </button>
      </div>
    </BottomSheet>
  );
}
