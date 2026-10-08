import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Centered confirmation popup for destructive actions, shown above any sheet. */
export function ConfirmDialog({ open, title, children, confirmLabel, busy, error, onConfirm, onCancel }: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onCancel();
      }
    };
    // Capture, so Escape closes this dialog rather than the sheet underneath.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  // Rendered at the app root: the sheet underneath slides in with a transform, which would
  // otherwise become this dialog's frame. The .app element keeps it inside the desktop phone frame.
  return createPortal(
    <div className="dialog-root" role="presentation">
      <button type="button" className="dialog-backdrop" aria-label="Cancel" onClick={busy ? undefined : onCancel} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn-danger" disabled={busy} onClick={onConfirm}>
            {busy ? "Removing…" : confirmLabel}
          </button>
          <button type="button" className="btn-text" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.querySelector(".app") ?? document.body,
  );
}
