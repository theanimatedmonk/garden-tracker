import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="sheet-root" role="presentation">
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-handle" aria-hidden />
        <header className="sheet-header">
          <h2 id="sheet-title">{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            Done
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
