"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastOptions {
  title: string;
  description?: string;
  variant: ToastVariant;
  /**
   * Accessible label for this toast's dismiss button. Defaults to English
   * because this component is shared with the staff console; family-facing
   * callers pass a translated string (t("common.dismiss") or similar) so
   * the label follows the family's chosen language — mirrors closeLabel on
   * components/ui/dialog.tsx's DialogContent.
   */
  dismissLabel?: string;
}

interface ToastItem extends ToastOptions {
  id: number;
  /** false while playing the exit transition */
  open: boolean;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DURATION_MS = 5000;
const ERROR_DURATION_MS = 8000;
const EXIT_MS = 200;

const variantAccent: Record<ToastVariant, string> = {
  success: "border-rooted-green/40",
  error: "border-red-200",
  info: "border-stone/30",
};

const variantIconStyle: Record<ToastVariant, string> = {
  success: "bg-rooted-green/15 text-deep-green",
  error: "bg-red-50 text-red-600",
  info: "bg-rooted-gray-light text-ink/60",
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        variantIconStyle[variant]
      )}
    >
      {variant === "success" && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 6.5L4.5 9L10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {variant === "error" && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 2.5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="6" cy="9.5" r="1" fill="currentColor" />
        </svg>
      )}
      {variant === "info" && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="2.5" r="1" fill="currentColor" />
          <path d="M6 5V9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  // Start hidden, then flip on the next frame so the enter transition plays
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const visible = entered && item.open;

  return (
    <div
      role={item.variant === "error" ? "alert" : "status"}
      aria-live={item.variant === "error" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto relative w-full max-w-sm rounded-lg border bg-white p-4 pr-9 shadow-lg transition-all duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        variantAccent[item.variant]
      )}
    >
      <div className="flex items-start gap-3">
        <ToastIcon variant={item.variant} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{item.title}</p>
          {item.description && (
            <p className="mt-0.5 text-sm text-stone break-words">{item.description}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => onDismiss(item.id)}
        className="absolute right-2.5 top-2.5 rounded-sm p-0.5 text-ink/50 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rooted-green"
        aria-label={item.dismissLabel ?? "Dismiss"}
      >
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timersRef = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const idRef = React.useRef(0);

  const removeToast = React.useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissToast = React.useCallback(
    (id: number) => {
      // Play the exit transition, then drop the toast from state
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, open: false } : t))
      );
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      timersRef.current.set(id, setTimeout(() => removeToast(id), EXIT_MS));
    },
    [removeToast]
  );

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = ++idRef.current;
      setToasts((prev) => {
        const next = [...prev, { ...options, id, open: true }];
        // Cap the stack — drop the oldest when over the limit
        return next.slice(Math.max(0, next.length - MAX_VISIBLE));
      });
      const duration =
        options.variant === "error" ? ERROR_DURATION_MS : DURATION_MS;
      timersRef.current.set(id, setTimeout(() => dismissToast(id), duration));
    },
    [dismissToast]
  );

  // Clear any outstanding timers on unmount
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end sm:px-0">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export { ToastProvider, useToast };
export type { ToastOptions, ToastVariant };
