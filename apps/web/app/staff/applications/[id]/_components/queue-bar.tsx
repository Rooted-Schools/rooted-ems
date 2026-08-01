"use client";

import type { ReactNode } from "react";

/**
 * QueueBar — full-width ink bar shown only when the page was reached with a
 * `queue` search param (see the orchestrator). Purely presentational; all
 * handlers are passed in from the orchestrator, which also owns the
 * keyboard shortcuts this bar documents.
 */
export interface QueueBarProps {
  position: number; // 1-based
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onVerify: () => void;
  onRequestInfo: () => void;
  onExit: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

function KeyChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-[4px] border border-white/30 bg-white/10 px-1.5 text-[11px] font-semibold text-white">
      {children}
    </span>
  );
}

export function QueueBar({ position, total, onPrev, onNext, onVerify, onRequestInfo, onExit, hasPrev, hasNext }: QueueBarProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-2 flex flex-wrap items-center gap-3 bg-ink px-4 py-2.5 text-white sm:-mx-6 sm:px-6">
      <span className="font-display text-sm font-medium uppercase tracking-[0.08em] whitespace-nowrap">
        Review queue · {position} of {total}
      </span>
      <span className="hidden h-4 w-px bg-white/20 sm:block" aria-hidden="true" />
      <div className="flex items-center gap-1.5 text-xs text-white/80">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous in queue"
          className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 hover:bg-white/10 disabled:opacity-40"
        >
          <KeyChip>K</KeyChip>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next in queue"
          className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 hover:bg-white/10 disabled:opacity-40"
        >
          <KeyChip>J</KeyChip>
        </button>
        <span>move</span>
        <span className="mx-1 text-white/40" aria-hidden="true">
          ·
        </span>
        <button type="button" onClick={onVerify} className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 hover:bg-white/10">
          <KeyChip>V</KeyChip>
          <span>verify</span>
        </button>
        <span className="mx-1 text-white/40" aria-hidden="true">
          ·
        </span>
        <button type="button" onClick={onRequestInfo} className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 hover:bg-white/10">
          <KeyChip>R</KeyChip>
          <span>request info</span>
        </button>
      </div>
      <button
        type="button"
        onClick={onExit}
        className="ml-auto inline-flex min-h-[36px] items-center justify-center rounded-[6px] border border-white/30 px-3 text-xs font-medium text-white hover:bg-white/10"
      >
        Exit queue
      </button>
    </div>
  );
}
