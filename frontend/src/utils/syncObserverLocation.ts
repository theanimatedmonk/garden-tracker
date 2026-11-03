import { api } from "../api/client";
import {
  locationBlockMessage,
  requestDeviceLocation,
  type DeviceLocationResult,
  type LocationBlockReason,
} from "./deviceLocation";

export type SyncLocationResult =
  | { ok: true }
  | { ok: false; reason: LocationBlockReason; message: string };

/** User gesture → browser permission prompt → BirdNET geo on the backend. */
export async function syncObserverLocationFromDevice(): Promise<SyncLocationResult> {
  const result: DeviceLocationResult = await requestDeviceLocation();
  if (!result.ok) {
    return { ok: false, reason: result.reason, message: locationBlockMessage(result.reason) };
  }
  await api.setObserverLocation({
    lat: result.location.lat,
    lon: result.location.lon,
    name: result.location.name,
  });
  return { ok: true };
}
