"use client";

/**
 * Fixed bottom tab bar for staff on phones — the sidebar in staff-sidebar.tsx
 * is `hidden md:flex`, so below md staff had NO navigation at all until this
 * existed. Event check-in staff are on phones constantly, so this isn't a
 * nice-to-have. Mirrors components/layout/family-tabbar.tsx's pattern (fixed,
 * safe-area padding, active-state coloring); wired into app/staff/layout.tsx
 * alongside matching bottom padding on <main> so content clears the bar.
 *
 * Five slots: Today, Recruitment, Pipeline, Search, More. The first three are
 * pulled straight from NAV_SECTIONS (same funnel order, same active-path
 * rules) so this bar and the desktop rail can never silently drift apart.
 * Search opens the exact same global-search palette the header owns, via the
 * OPEN_STAFF_SEARCH_EVENT window event (see staff-header.tsx) rather than a
 * second GlobalSearch instance. More opens a role-filtered sheet listing
 * every other destination (Seats & Lottery, Insights, Notifications, Pilot
 * feedback, Team, Settings) using the same ROLE_LEVEL gate as the sidebar.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  NAV_SECTIONS,
  PINNED_NAV_ITEMS,
  ROLE_LEVEL,
  NavIcon,
  type NavItem,
} from "@/components/layout/staff-sidebar";
import { OPEN_STAFF_SEARCH_EVENT } from "@/components/layout/staff-header";
import { IconSearch, IconMoreHorizontal, IconX } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const PRIMARY_TAB_LABELS = ["Today", "Recruitment", "Pipeline"] as const;

interface StaffMobileNavProps {
  /** The user's highest role across all campuses — same gate as the sidebar. */
  highestRole?: string;
  /** Real "Today" exception count, mirrors the sidebar badge. Omitted = no badge. */
  todayCount?: number;
}

export function StaffMobileNav({ highestRole = "none", todayCount }: StaffMobileNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);

  const campusParam = searchParams.get("campus");
  function buildHref(base: string) {
    return campusParam ? `${base}?campus=${campusParam}` : base;
  }

  const userLevel = ROLE_LEVEL[highestRole] ?? 0;
  function isVisible(item: NavItem) {
    const required = ROLE_LEVEL[item.minRole ?? "compliance_auditor"] ?? 1;
    return userLevel >= required;
  }

  const allMainItems = NAV_SECTIONS.flatMap((section) => section.items);
  const primaryItems = PRIMARY_TAB_LABELS.map((label) =>
    allMainItems.find((item) => item.label === label)
  ).filter((item): item is NavItem => item !== undefined && isVisible(item));

  // Everything NOT pulled onto the tab bar itself, role-filtered, lands in
  // the More sheet — main-nav overflow (Seats & Lottery, Insights) first,
  // then the pinned items (Notifications, Pilot feedback, Team, Settings).
  const moreItems = [
    ...allMainItems.filter((item) => !(PRIMARY_TAB_LABELS as readonly string[]).includes(item.label)),
    ...PINNED_NAV_ITEMS,
  ].filter(isVisible);

  function isActive(item: NavItem) {
    const ownedPaths = [item.href, ...(item.activePaths ?? [])];
    return (
      pathname === item.href ||
      ownedPaths.some((path) => path !== "/staff/today" && pathname.startsWith(path))
    );
  }

  // Close the sheet on Escape, matching staff-header's mobile-menu pattern.
  useEffect(() => {
    if (!moreOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  function openSearch() {
    window.dispatchEvent(new Event(OPEN_STAFF_SEARCH_EVENT));
  }

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone/20 flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Staff navigation"
      >
        {primaryItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={buildHref(item.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex-1 min-h-[58px] flex flex-col items-center justify-center gap-1 transition-colors",
                active ? "text-deep-green" : "text-stone"
              )}
            >
              <span className="relative">
                <NavIcon name={item.icon} />
                {item.badgeKey === "today" && todayCount !== undefined && todayCount > 0 && (
                  <span
                    className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-[3px] inline-flex items-center justify-center rounded-full bg-rooted-green text-white text-[9px] font-semibold leading-none"
                    aria-hidden="true"
                  >
                    {todayCount > 99 ? "99+" : todayCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={openSearch}
          className="flex-1 min-h-[58px] flex flex-col items-center justify-center gap-1 text-stone transition-colors"
        >
          <IconSearch size={20} />
          <span className="text-[10px] font-semibold uppercase tracking-wide">Search</span>
        </button>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="staff-mobile-more-sheet"
          className={cn(
            "flex-1 min-h-[58px] flex flex-col items-center justify-center gap-1 transition-colors",
            moreOpen ? "text-deep-green" : "text-stone"
          )}
        >
          <IconMoreHorizontal size={20} />
          <span className="text-[10px] font-semibold uppercase tracking-wide">More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="fixed inset-0 bg-black/50 animate-in fade-in-0"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            id="staff-mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More destinations"
            className="relative z-50 w-full rounded-t-[6px] bg-white shadow-lg animate-in fade-in-0 slide-in-from-bottom-4"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone/20">
              <span className="text-sm font-semibold text-ink">More</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex items-center justify-center w-11 h-11 -mr-2 text-ink/60 hover:text-ink"
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="px-2 py-2 space-y-0.5 max-h-[70vh] overflow-y-auto">
              {moreItems.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={buildHref(item.href)}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 min-h-[44px] px-3 rounded-[6px] text-sm font-medium transition-colors",
                      active
                        ? "bg-rooted-green/10 text-deep-green"
                        : "text-ink/70 hover:bg-rooted-gray-light hover:text-ink"
                    )}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
