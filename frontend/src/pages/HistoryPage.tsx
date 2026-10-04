import { DetectionHistoryList } from "../components/DetectionHistoryList";

export function HistoryPage() {
  return (
    <section className="panel">
      <h1>Detection history</h1>
      <p className="lede">All BirdNET matches — stored in backend/data/history/ on your Mac.</p>
      <DetectionHistoryList limit={200} />
    </section>
  );
}
