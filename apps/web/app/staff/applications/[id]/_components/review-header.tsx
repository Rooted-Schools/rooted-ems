"use client";

/**
 * ReviewHeader — student header for the staff application detail page.
 *
 * Extracted verbatim (behavior-preserving) from the original detail-client.tsx
 * header block: initials tile (new), name, status pill, meta line, and the
 * top-right decision buttons driven by `getAvailableActions(status)`.
 *
 * No new server action is introduced. `onAction` forwards to the same
 * `handleStatusChange` the orchestrator already had; `onWithdraw` forwards to
 * the same `staffWithdrawApplication` flow. The one addition — "Reject
 * application" — calls the *same* generic `changeApplicationStatus` action
 * the rest of this file already uses (via `onReject`, wired by the
 * orchestrator to `handleStatusChange("rejected", ...)`), just surfacing an
 * existing, already-generic status transition through the UI. No new
 * mutation, no new signature.
 */
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import { IconMoreHorizontal } from "@/components/ui/icons";
import { cn, displayClass } from "@/lib/utils";
import type { ApplicationDetail } from "@/lib/queries";

export interface HeaderAction {
  label: string;
  variant: "default" | "outline" | "destructive";
  targetStatus: string;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ReviewHeaderProps {
  detail: ApplicationDetail;
  actions: HeaderAction[];
  pendingDocCount: number;
  isPending: boolean;
  canWithdraw: boolean;
  canReject: boolean;
  onAction: (targetStatus: string) => void;
  onWithdraw: () => void;
  onReject: () => void;
}

export function ReviewHeader({
  detail,
  actions,
  pendingDocCount,
  isPending,
  canWithdraw,
  canReject,
  onAction,
  onWithdraw,
  onReject,
}: ReviewHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const statusCfg = getStatusConfig(detail.status);
  const isReviewStage = detail.status === "submitted" || detail.status === "needs_info";
  const pillLabel =
    isReviewStage && pendingDocCount > 0
      ? `Needs ${pendingDocCount} thing${pendingDocCount === 1 ? "" : "s"}`
      : statusCfg.label;
  const pillVariant = isReviewStage && pendingDocCount > 0 ? "warning" : statusCfg.variant;

  // Short, real, non-fabricated app reference — the actual record id,
  // shortened. There is no formatted "RSV-0248"-style application number
  // anywhere in the schema, so we do not invent one (see final report).
  const shortAppId = detail.id.slice(0, 8).toUpperCase();

  const metaParts = [
    getGradeLabel(detail.grade),
    detail.campus_name,
    detail.submitted_at ? `Applied ${formatDate(detail.submitted_at)}` : null,
    detail.has_sibling_enrolled ? "Sibling priority" : null,
    `App #${shortAppId}`,
  ].filter(Boolean);

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[22%] bg-rooted-green/15 text-sm font-semibold text-deep-green"
          aria-hidden="true"
        >
          {initialsFor(detail.student_name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-xl font-bold uppercase tracking-wide text-ink">{detail.student_name}</h1>
            <Badge variant={pillVariant}>{pillLabel}</Badge>
          </div>
          <p className="text-sm text-stone mt-1">{metaParts.join(" · ")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions.map((action) => (
          <Button
            key={action.targetStatus}
            variant={action.variant === "default" ? "default" : "outline"}
            size="sm"
            disabled={isPending}
            onClick={() => onAction(action.targetStatus)}
            className={cn(
              displayClass,
              action.targetStatus === "verified" ? "rounded-[6px] bg-deep-green hover:bg-rooted-green-700" : "rounded-[6px]"
            )}
          >
            {action.targetStatus === "verified" ? "Verify" : action.targetStatus === "needs_info" ? "Request info" : action.label}
          </Button>
        ))}

        {(canWithdraw || canReject) && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-9 min-h-[44px] items-center justify-center gap-1.5 rounded-[6px] border border-line bg-white px-2.5 text-stone hover:bg-sunken hover:text-ink"
            >
              <IconMoreHorizontal size={18} aria-hidden="true" />
              <span className="text-xs font-medium">More</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-48 rounded-[8px] border border-line bg-white py-1 shadow-lg"
              >
                {canReject && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isPending}
                    onClick={() => {
                      setMenuOpen(false);
                      onReject();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-sunken disabled:opacity-50"
                  >
                    Reject application
                  </button>
                )}
                {canWithdraw && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isPending}
                    onClick={() => {
                      setMenuOpen(false);
                      onWithdraw();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-sunken disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
