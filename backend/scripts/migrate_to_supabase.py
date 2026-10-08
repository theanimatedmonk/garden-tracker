"""Copy the local history (JSONL) and its clips into Supabase.

Run from backend/ after supabase/schema.sql has been applied and SUPABASE_URL /
SUPABASE_SECRET_KEY are set in .env:

    .venv/bin/python -m scripts.migrate_to_supabase --dry-run   # see what would happen
    .venv/bin/python -m scripts.migrate_to_supabase

Safe to re-run: clips and rows are upserted, nothing is duplicated. After a successful run the
JSONL files are renamed to *.migrated-<date>.jsonl, so a later run only pushes rows a Supabase
write failed for (the backend falls back to the JSONL then) and can't bring back birds you removed
in the app. Nothing is deleted; remove backend/data/recordings yourself once the app looks right.
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from app.audio_utils import encode_mp3
from app.config import settings
from app.store import Detection, WildlifeEvent
from app.supabase_client import SupabaseClient, in_list

BATCH = 500
UPLOAD_WORKERS = 6


def read_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="report what would be uploaded, change nothing")
    args = parser.parse_args()

    if not settings.supabase_enabled:
        print("Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env first.")
        return 1
    client = SupabaseClient(settings.supabase_url, settings.supabase_secret_key, settings.supabase_bucket)

    history = Path(settings.data_dir) / "history"
    detections = [Detection.from_dict(row) for row in read_jsonl(history / "detections.jsonl")]
    events = [WildlifeEvent.from_dict(row) for row in read_jsonl(history / "events.jsonl")]
    print(f"Local history: {len(detections)} detections, {len(events)} events")

    # One clip per segment, shared by every species found in it; key it by the segment's date.
    first_seen: dict[str, Detection] = {}
    for d in detections:
        if d.audio_path.endswith(".wav") and (
            d.audio_path not in first_seen or d.timestamp < first_seen[d.audio_path].timestamp
        ):
            first_seen[d.audio_path] = d
    clips = {path: f"{d.timestamp:%Y/%m/%d}/{Path(path).stem}.mp3" for path, d in first_seen.items()}
    missing = [path for path in clips if not Path(path).is_file()]
    to_upload = {path: key for path, key in clips.items() if path not in missing}
    print(f"Clips: {len(to_upload)} to upload as MP3, {len(missing)} missing on disk (rows keep their old path)")

    if args.dry_run:
        print("Dry run — nothing changed.")
        return 0

    def upload(item: tuple[str, str]) -> str:
        path, key = item
        client.upload(key, encode_mp3(Path(path)), "audio/mpeg")
        return key

    done = 0
    with ThreadPoolExecutor(UPLOAD_WORKERS) as pool:
        for _ in pool.map(upload, to_upload.items()):
            done += 1
            if done % 50 == 0 or done == len(to_upload):
                print(f"  uploaded {done}/{len(to_upload)}")

    rows = []
    for d in detections:
        row = d.to_row()
        row["audio_path"] = to_upload.get(d.audio_path, d.audio_path)
        rows.append(row)
    for i in range(0, len(rows), BATCH):
        client.insert("detections", rows[i : i + BATCH], upsert=True)
    print(f"Upserted {len(rows)} detections")

    # An event's detection may be in the JSONL or already in Supabase (if only the event's write failed).
    known = {d.id for d in detections}
    elsewhere = sorted({e.detection_id for e in events} - known)
    if elsewhere:
        known |= {row["id"] for row in client.select("detections", {"select": "id", "id": in_list(elsewhere)})}
    event_rows = [e.to_dict() for e in events if e.detection_id in known]
    for i in range(0, len(event_rows), BATCH):
        client.insert("events", event_rows[i : i + BATCH], upsert=True)
    skipped = len(events) - len(event_rows)
    print(f"Upserted {len(event_rows)} events" + (f" ({skipped} skipped: their detection is gone)" if skipped else ""))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    for name in ("detections", "events"):
        path = history / f"{name}.jsonl"
        if path.is_file():
            path.rename(history / f"{name}.migrated-{stamp}.jsonl")
    print(f"Done. Local JSONL set aside as *.migrated-{stamp}.jsonl; clips in data/recordings are untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
