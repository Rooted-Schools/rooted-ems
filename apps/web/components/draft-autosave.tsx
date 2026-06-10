"use client";

/**
 * Shared draft auto-save machinery for the family application forms.
 *
 * - `useDraftAutosave` debounce-saves a serializable form value (~2s after the
 *   last change) through a caller-provided server action. The caller is
 *   responsible for routing the save through an ownership-checked mutation
 *   (familyUpdateApplication → updateApplication).
 * - `SaveIndicator` renders the translated "Saving… / Saved / couldn't save"
 *   status with aria-live so screen readers announce save state changes.
 *
 * Failure handling is deliberately non-blocking: a failed save flips the
 * status to "error" but the user keeps typing — the next change (or the next
 * step navigation, which calls `flush`) retries automatically.
 */

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/locale-context";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseDraftAutosaveOptions<T> {
  /** Saves only run while enabled (e.g. once a draft row exists). */
  enabled: boolean;
  /** Current form value. Compared via JSON.stringify to skip no-op saves. */
  value: T;
  /** Server-action wrapper. Must keep auth + ownership checks server-side. */
  onSave: (value: T) => Promise<{ error: string | null }>;
  /** Debounce delay in ms after the last change. */
  delayMs?: number;
}

export function useDraftAutosave<T>({
  enabled,
  value,
  onSave,
  delayMs = 2000,
}: UseDraftAutosaveOptions<T>): { status: SaveStatus; flush: () => Promise<void> } {
  const [status, setStatus] = useState<SaveStatus>("idle");

  const serialized = JSON.stringify(value);

  // Refs so flush() always sees the latest value/handler without re-binding.
  const valueRef = useRef(value);
  valueRef.current = value;
  const serializedRef = useRef(serialized);
  serializedRef.current = serialized;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  /** Last successfully-persisted snapshot. null = nothing tracked yet. */
  const lastSavedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  // When autosave becomes enabled, treat the current value as already
  // persisted: the new form enables this right after the draft row is
  // created, and the edit form mounts with the draft's saved values.
  if (enabled && lastSavedRef.current === null) {
    lastSavedRef.current = serialized;
  }

  const flush = useCallback(async (): Promise<void> => {
    if (!enabledRef.current || inFlightRef.current) return;
    const snapshot = serializedRef.current;
    if (snapshot === lastSavedRef.current) return;

    inFlightRef.current = true;
    setStatus("saving");
    let succeeded = false;
    try {
      const result = await onSaveRef.current(valueRef.current);
      succeeded = !result.error;
    } catch {
      succeeded = false;
    }
    inFlightRef.current = false;

    if (succeeded) {
      lastSavedRef.current = snapshot;
      setStatus("saved");
      // The value may have changed while the save was in flight — chase it.
      if (serializedRef.current !== lastSavedRef.current) {
        void flush();
      }
    } else {
      // Non-blocking: leave lastSavedRef untouched so the next change (or
      // explicit flush on step navigation) retries this save.
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      void flush();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [serialized, enabled, delayMs, flush]);

  return { status, flush };
}

/** Subtle save-state indicator for the form header area. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const { t } = useLocale();
  return (
    <span aria-live="polite" role="status" className="text-xs whitespace-nowrap">
      {status === "saving" && <span className="text-stone">{t("appForm.autosave.saving")}</span>}
      {status === "saved" && (
        <span className="text-rooted-green">
          {t("appForm.autosave.saved")} <span aria-hidden="true">✓</span>
        </span>
      )}
      {status === "error" && <span className="text-amber-600">{t("appForm.autosave.error")}</span>}
    </span>
  );
}
