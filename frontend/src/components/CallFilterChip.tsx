import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TIER_FILTERS, type TierFilter } from "../utils/detections";
import { CheckIcon, ChevronDownIcon } from "./Icons";

const MENU_WIDTH = 190;

type Props = {
  value: TierFilter;
  onChange: (value: TierFilter) => void;
};

/**
 * "Call" chip with a small menu of call tiers. The menu is portalled and fixed-positioned
 * so the horizontally scrolling chip row can't clip it.
 */
export function CallFilterChip({ value, onChange }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = position !== null;
  const selected = TIER_FILTERS.find((f) => f.id === value);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = () => setPosition(null);
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !(target as Element).closest?.(".chip-menu")) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    if (open || !buttonRef.current) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    // Keep the menu inside the app: the viewport on a phone, the phone frame on desktop.
    const bounds = buttonRef.current.closest(".app")?.getBoundingClientRect() ?? {
      left: 0,
      right: window.innerWidth,
    };
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(bounds.left + 12, Math.min(rect.left, bounds.right - MENU_WIDTH - 12)),
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="chip chip-select"
        aria-pressed={value !== "all"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        {value === "all" ? "Call" : selected?.label}
        <ChevronDownIcon />
      </button>
      {position &&
        createPortal(
          <div className="chip-menu" role="menu" style={{ top: position.top, left: position.left, width: MENU_WIDTH }}>
            {TIER_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitemradio"
                aria-checked={f.id === value}
                onClick={() => {
                  onChange(f.id);
                  setPosition(null);
                }}
              >
                <span>{f.label}</span>
                {f.id === value && <CheckIcon />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
