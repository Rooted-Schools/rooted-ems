"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { IconChevronDown } from "@/components/ui/icons";
import type { CampusIdentity } from "@/lib/campus-identity";

export interface CampusLensSwitcherOption {
  id: string;
  identity: CampusIdentity;
}

interface CampusLensSwitcherProps {
  options: CampusLensSwitcherOption[];
  /** null = "All campuses" */
  activeCampusId: string | null;
  setCampusLens: (campusId: string | null) => Promise<void>;
}

/**
 * Multi-campus / network staff only — app/staff/layout.tsx renders this when
 * accessibleIds.length === 0 (org-wide, e.g. Steven) or > 1 (staff assigned
 * to more than one campus). Single-campus staff (Tim at Cleveland, Lalah at
 * C.R. Neal) never see it: their lens is forced to their one campus
 * regardless of this cookie (see lib/campus-lens.ts).
 *
 * Picking an option calls the setCampusLens server action (sets/clears the
 * staff-campus-lens cookie, revalidates the staff shell) then
 * router.refresh() — the same startTransition + refresh pairing every other
 * staff mutation in this app uses when a server action is invoked directly
 * from a client handler rather than a <form action>, e.g.
 * app/staff/pipeline/pipeline-client.tsx's bulk actions.
 */
export function CampusLensSwitcher({ options, activeCampusId, setCampusLens }: CampusLensSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const active = options.find((o) => o.id === activeCampusId);
  const label = active ? active.identity.displayName : "All campuses";

  function select(campusId: string | null) {
    setOpen(false);
    startTransition(async () => {
      await setCampusLens(campusId);
      router.refresh();
    });
  }

  return (
    <div ref={containerRef} className="relative px-2 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full min-h-[44px] items-center gap-2 rounded-[6px] border border-line bg-white px-3 text-sm text-ink transition-colors hover:border-rooted-green/40 disabled:opacity-60"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: active ? active.identity.theme.accent : "#A8A29E" }}
          aria-hidden="true"
        />
        <span className="flex-1 truncate text-left font-medium">{label}</span>
        <IconChevronDown size={16} className={cn("shrink-0 text-stone transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Campus lens"
          className="absolute left-2 right-2 z-20 mt-1 rounded-[6px] border border-line bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={activeCampusId === null}
            onClick={() => select(null)}
            className={cn(
              "flex w-full min-h-[44px] items-center gap-2 px-3 text-sm transition-colors",
              activeCampusId === null
                ? "bg-rooted-green/10 text-deep-green font-medium"
                : "text-ink hover:bg-rooted-gray-light"
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-stone/40" aria-hidden="true" />
            All campuses
          </button>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={activeCampusId === option.id}
              onClick={() => select(option.id)}
              className={cn(
                "flex w-full min-h-[44px] items-center gap-2 px-3 text-sm transition-colors",
                activeCampusId === option.id
                  ? "bg-rooted-green/10 text-deep-green font-medium"
                  : "text-ink hover:bg-rooted-gray-light"
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: option.identity.theme.accent }}
                aria-hidden="true"
              />
              {option.identity.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
