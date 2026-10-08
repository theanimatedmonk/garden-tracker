import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Matches the toast-out animation delay in global.css.
const TOAST_MS = 4000;

type ToastState = { message: ReactNode; key: number } | null;

const ToastContext = createContext<((message: ReactNode) => void) | null>(null);

/**
 * One toast at a time, shown at the top of the app (inside the phone frame on desktop).
 * A new toast replaces the current one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: ReactNode) => {
    setToast({ message, key: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast &&
        createPortal(
          <div key={toast.key} className="toast" role="status">
            {toast.message}
          </div>,
          document.querySelector(".app") ?? document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: ReactNode) => void {
  const show = useContext(ToastContext);
  if (!show) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return show;
}
