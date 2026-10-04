import { apiUrl, formatDate, formatTime, type Detection } from "../api/client";

type Props = {
  detections: Detection[];
};

export function SpeciesTimeline({ detections }: Props) {
  const sorted = [...detections].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <ul className="sheet-timeline">
      {sorted.map((d) => (
        <li key={d.id} className="sheet-timeline-row">
          <div className="sheet-timeline-meta">
            <span>
              {formatDate(d.timestamp)} · {formatTime(d.timestamp)}
            </span>
            <span className="sheet-timeline-conf">{(d.confidence * 100).toFixed(0)}%</span>
            {d.surfaced && <span className="badge">Noticed</span>}
          </div>
          <audio controls preload="none" src={apiUrl(d.audio_url)} className="history-audio" />
        </li>
      ))}
    </ul>
  );
}
