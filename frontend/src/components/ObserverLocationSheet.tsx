import type { DeviceLocation } from "../api/client";
import { locationBlockMessage } from "../utils/deviceLocation";
import { BottomSheet } from "./BottomSheet";

type Props = {
  open: boolean;
  onClose: () => void;
  location: DeviceLocation | undefined;
  locationSource: string | null | undefined;
  loaded: boolean;
  locBusy: boolean;
  locHint: string | null;
  onUseMyLocation: () => void;
};

function formatCoords(lat: number, lon: number): string {
  const latH = lat >= 0 ? "N" : "S";
  const lonH = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latH}, ${Math.abs(lon).toFixed(4)}° ${lonH}`;
}

function sourceLabel(source: string | null | undefined): string {
  if (source === "device") {
    return "From this device";
  }
  if (source === "manual") {
    return "Set manually";
  }
  if (source === "env") {
    return "Server default";
  }
  return "Server default";
}

export function ObserverLocationSheet({
  open,
  onClose,
  location,
  locationSource,
  loaded,
  locBusy,
  locHint,
  onUseMyLocation,
}: Props) {
  const insecure =
    typeof window !== "undefined" && open && !window.isSecureContext ? locationBlockMessage("insecure") : null;
  const hint = locHint ?? insecure;

  return (
    <BottomSheet open={open} label="Observer location" onClose={onClose}>
      <div className="loc-sheet">
        <h2 className="loc-sheet-title">Observer location</h2>
        <p className="loc-sheet-lead">BirdNET uses this place to pick species for your area.</p>

        {!loaded ? (
          <p className="loc-sheet-muted">Loading…</p>
        ) : location ? (
          <>
            <p className="loc-sheet-place">{location.name}</p>
            <p className="loc-sheet-coords">{formatCoords(location.lat, location.lon)}</p>
            <p className="loc-sheet-source">{sourceLabel(locationSource)}</p>
          </>
        ) : (
          <p className="loc-sheet-muted">No location set on the server yet.</p>
        )}

        {hint && <p className="loc-sheet-hint">{hint}</p>}

        <button type="button" className="btn-primary" disabled={locBusy} onClick={onUseMyLocation}>
          {locBusy ? "Locating… (may take ~30s)" : "Use my location"}
        </button>
      </div>
    </BottomSheet>
  );
}
