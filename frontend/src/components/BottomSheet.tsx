import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

const DISMISS_DRAG_PX = 90;

export function BottomSheet({ open, label, onClose, children }: Props) {
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDragY(0);
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

  const endDrag = () => {
    if (dragStart.current === null) {
      return;
    }
    dragStart.current = null;
    if (dragY > DISMISS_DRAG_PX) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  return (
    <div className="sheet-root" role="presentation">
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div
        className={dragStart.current === null ? "sheet-panel" : "sheet-panel is-dragging"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="sheet-grab"
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStart.current !== null) {
              setDragY(Math.max(0, e.clientY - dragStart.current));
            }
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="sheet-handle" aria-hidden />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
