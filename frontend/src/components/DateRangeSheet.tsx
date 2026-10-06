import { useEffect, useState } from "react";
import { toDateInputValue } from "../utils/detections";
import { BottomSheet } from "./BottomSheet";

type Props = {
  open: boolean;
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
};

/** From / To pickers in a bottom sheet; nothing changes until Apply. */
export function DateRangeSheet({ open, from, to, onApply, onClose }: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const today = toDateInputValue(new Date());

  useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
    }
  }, [open, from, to]);

  const inverted = Boolean(draftFrom && draftTo && draftFrom > draftTo);

  return (
    <BottomSheet open={open} label="Filter by date" onClose={onClose}>
      <div className="date-sheet">
        <h2 className="date-sheet-title">Filter by date</h2>
        <div className="date-row">
          <label>
            <span>From</span>
            <input
              type="date"
              className="input"
              value={draftFrom}
              max={draftTo || today}
              onChange={(e) => setDraftFrom(e.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              className="input"
              value={draftTo}
              min={draftFrom || undefined}
              max={today}
              onChange={(e) => setDraftTo(e.target.value)}
            />
          </label>
        </div>
        {inverted && <p className="form-error">“From” has to be on or before “To”.</p>}
        <button
          type="button"
          className="btn-primary"
          disabled={inverted}
          onClick={() => {
            onApply(draftFrom, draftTo);
            onClose();
          }}
        >
          Apply
        </button>
        {(from || to) && (
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              onApply("", "");
              onClose();
            }}
          >
            Clear dates
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
