"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CampusIdentity } from "@/lib/campus-identity";

/* ------------------------------------------------------------------ */
/*  Role hierarchy — higher number = more access                      */
/* ------------------------------------------------------------------ */
export const ROLE_LEVEL: Record<string, number> = {
  compliance_auditor: 1,
  enrollment_staff: 2,
  enrollment_manager: 3,
  system_admin: 4,
};

type MinRole = "compliance_auditor" | "enrollment_staff" | "enrollment_manager" | "system_admin";

/** Icon keys — each maps to an inline 2px-stroke SVG in <NavIcon>. No emoji. */
export type IconName =
  | "today"
  | "pipeline"
  | "applications"
  | "seats-lottery"
  | "recruitment"
  | "messages"
  | "insights"
  | "network"
  | "settings"
  | "team"
  | "feedback";

/** Which live badge (if any) a nav item can carry. Badges only render when the
 *  corresponding count prop is passed in — no badge is invented without real data. */
type BadgeKey = "today" | "messages";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Minimum role required to see this item (default: compliance_auditor = every ranked staff role) */
  minRole?: MinRole;
  badgeKey?: BadgeKey;
  /**
   * Extra path prefixes that belong to this destination, so the rail stays lit
   * while the user is on a page absorbed into this section (e.g. /staff/seats
   * under "Seats & Lottery"). `href` is always treated as one of them.
   */
  activePaths?: string[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Primary rail: 6 consolidated destinations (down from ~17).
 * Each points at the best existing route today; the consolidated shell
 * pages with tabs (e.g. /staff/pipeline, /staff/seats-lottery, /staff/insights)
 * land in later phases. No route is removed — every absorbed page keeps
 * working and stays reachable by deep link.
 */
// Order follows the family journey on purpose, not alphabetical or
// role-based grouping: Today (the staff home base / daily work queue) comes
// first, then Recruitment -> Pipeline -> Seats & Lottery -> Insights walks
// the same path a family actually takes from first inquiry through
// enrollment, ending in the network-level strategy view. This is
// deliberate information architecture — do not reorder without re-checking
// this rationale still holds.
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Today", href: "/staff/today", icon: "today", badgeKey: "today" },
      { label: "Recruitment", href: "/staff/recruitment", icon: "recruitment" },
      {
        label: "Pipeline",
        href: "/staff/pipeline",
        icon: "pipeline",
        activePaths: ["/staff/documents", "/staff/students", "/staff/enrollment"],
      },
      {
        label: "Applications",
        href: "/staff/applications",
        icon: "applications",
      },
      {
        label: "Seats & Lottery",
        href: "/staff/lottery",
        icon: "seats-lottery",
        minRole: "enrollment_manager",
        activePaths: ["/staff/seats", "/staff/offers", "/staff/waitlist", "/staff/policy"],
      },
      {
        label: "Insights",
        href: "/staff/reports",
        icon: "insights",
        // Funnel lives here rather than beside Pipeline on purpose: Pipeline is
        // the daily work queue, Funnel is the strategy view.
        activePaths: ["/staff/equity", "/staff/audit", "/staff/funnel"],
      },
    ],
  },
];

/**
 * Notifications + Pilot feedback + Team + Settings stay pinned at the
 * bottom of the rail, visually separated from the funnel-order nav above.
 * Notifications lives here (not in the main section) because it's a cross-
 * cutting inbox rather than a stop on the family journey — same reasoning
 * that already applied to Settings/Team.
 */
export const PINNED_NAV_ITEMS: NavItem[] = [
  { label: "Notifications", href: "/staff/messages", icon: "messages", badgeKey: "messages" },
  { label: "Pilot feedback", href: "/staff/feedback", icon: "feedback" },
  { label: "Team", href: "/staff/team", icon: "team", minRole: "system_admin" },
  { label: "Settings", href: "/staff/settings", icon: "settings", minRole: "enrollment_manager" },
];

/* ------------------------------------------------------------------ */
/*  Icons — inline 2px-stroke SVGs, 20px, stroke=currentColor          */
/* ------------------------------------------------------------------ */
/** Exported so components/layout/staff-mobile-nav.tsx renders the exact same
 *  glyphs for the same destinations instead of duplicating the SVG set. */
export function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "shrink-0",
    "aria-hidden": true,
  };

  switch (name) {
    case "today":
      // Sun
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      );
    case "applications":
      // Document with lines (the full applications list, drafts included)
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      );
    case "pipeline":
      // Layers
      return (
        <svg {...common}>
          <polygon points="12 3 21 8 12 13 3 8" />
          <polyline points="3 13 12 18 21 13" />
          <polyline points="3 18 12 22.5 21 18" />
        </svg>
      );
    case "seats-lottery":
      // Grid
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "recruitment":
      // Sprout
      return (
        <svg {...common}>
          <path d="M12 22v-9" />
          <path d="M12 13c0-3.5-2.5-6-6-6-.5 3.5 2 6 6 6z" />
          <path d="M12 13c0-4 3-7 7-7 .5 4-3 7-7 7z" />
        </svg>
      );
    case "messages":
      // Message square
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "insights":
      // Bar chart
      return (
        <svg {...common}>
          <line x1="4" y1="21" x2="4" y2="12" />
          <line x1="12" y1="21" x2="12" y2="7" />
          <line x1="20" y1="21" x2="20" y2="15" />
          <line x1="3" y1="21" x2="21" y2="21" />
        </svg>
      );
    case "settings":
      // Gear
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3" />
          <path d="M12 19v3" />
          <path d="M4.2 4.2l2.1 2.1" />
          <path d="M17.7 17.7l2.1 2.1" />
          <path d="M2 12h3" />
          <path d="M19 12h3" />
          <path d="M4.2 19.8l2.1-2.1" />
          <path d="M17.7 6.3l2.1-2.1" />
        </svg>
      );
    case "team":
      // Users
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "network":
      // Globe — the CMO's cross-campus view
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "feedback":
      // Message square with a plus — pilot feedback
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M12 7v6" />
          <path d="M9 10h6" />
        </svg>
      );
    default:
      return null;
  }
}

interface StaffSidebarProps {
  /** The user's highest role across all campuses (drives nav filtering) */
  highestRole?: string;
  /** Total open work-queue count for the "Today" badge (light-green pill). Omitted when not available. */
  todayCount?: number;
  /** Unread count for the "Messages" badge (red pill). Omitted when not available. */
  messagesUnreadCount?: number;
  /**
   * Org-level accounts only (accessible campus list empty): shows the
   * cross-campus Network view. Role level can't express "org-scoped", so
   * the layout computes this and passes it down.
   */
  showNetwork?: boolean;
  /**
   * The active campus lens (app/staff/layout.tsx resolves this via
   * lib/campus-lens.ts — either the viewer's one accessible campus forced
   * for single-campus staff, or a multi-campus/org-wide viewer's pick in
   * the header campus select, which persists it as the lens cookie).
   * When present, the brand block shows that campus's logo and name
   * with "Rooted EMS" demoted to the subtitle line, plus a left ring in the
   * campus's accent. Undefined when no lens is active ("All campuses") —
   * brand block keeps the network mark.
   */
  lensIdentity?: CampusIdentity;
}

export function StaffSidebar({
  highestRole = "none",
  todayCount,
  messagesUnreadCount,
  showNetwork = false,
  lensIdentity,
}: StaffSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Preserve campus selection across navigation
  const campusParam = searchParams.get("campus");
  function buildHref(base: string) {
    return campusParam ? `${base}?campus=${campusParam}` : base;
  }

  // Unknown or absent role ⇒ level 0, below every nav item. Never fall back to
  // the compliance_auditor floor: an unranked role must not see a rail it was
  // never granted (see NO_ROLE in lib/auth/get-session.ts).
  const userLevel = ROLE_LEVEL[highestRole] ?? 0;

  // Org-level accounts get the cross-campus Network view at the end of the
  // funnel rail: the funnel ends, the network answers for it.
  const networkItem: NavItem | null = showNetwork
    ? { label: "Network", href: "/staff/network", icon: "network" }
    : null;

  const badgeCounts: Partial<Record<BadgeKey, number | undefined>> = {
    today: todayCount,
    messages: messagesUnreadCount,
  };

  function renderBadge(item: NavItem) {
    if (!item.badgeKey) return null;
    const count = badgeCounts[item.badgeKey];
    if (!count || count <= 0) return null;
    const isMessages = item.badgeKey === "messages";
    return (
      <span
        className={cn(
          "ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none",
          isMessages
            ? "bg-red-500 text-white"
            : "bg-rooted-green/20 text-deep-green"
        )}
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  }

  function renderLink(item: NavItem) {
    const ownedPaths = [item.href, ...(item.activePaths ?? [])];
    const isActive =
      pathname === item.href ||
      ownedPaths.some(
        (path) => path !== "/staff/today" && pathname.startsWith(path)
      );
    return (
      <Link
        key={item.href}
        href={buildHref(item.href)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
          isActive
            ? "bg-[var(--lens-accent-soft)] text-[var(--lens-accent-text)] border border-[var(--lens-accent-border)]"
            : "text-ink/60 hover:bg-rooted-gray-light hover:text-ink border border-transparent"
        )}
      >
        <NavIcon name={item.icon} />
        {item.label}
        {renderBadge(item)}
      </Link>
    );
  }

  const visiblePinnedItems = PINNED_NAV_ITEMS.filter((item) => {
    const required = ROLE_LEVEL[item.minRole ?? "compliance_auditor"] ?? 1;
    return userLevel >= required;
  });

  return (
    <aside className="hidden md:flex w-64 bg-white border-r border-stone/20 min-h-screen flex-col">
      {/* Brand — left ring in the lens accent when a campus lens is active */}
      <div
        className={cn(
          "p-4 border-b border-stone/20",
          lensIdentity && "border-l-[3px] border-l-[var(--lens-accent-border)]"
        )}
      >
        <Link
          href={buildHref("/staff/today")}
          className="inline-flex items-center gap-2.5 no-underline hover:opacity-90 transition-opacity"
        >
          {lensIdentity ? (
            <>
              <div className="relative w-8 h-8 shrink-0">
                <Image
                  src={lensIdentity.logoPath}
                  alt=""
                  fill
                  className="object-contain"
                  sizes="32px"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-ink leading-tight truncate">
                  {lensIdentity.displayName}
                </span>
                <span className="text-[10px] text-stone tracking-wide">
                  Rooted EMS
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Tree icon */}
              <div className="w-8 h-8 bg-rooted-green/10 rounded-lg flex items-center justify-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-rooted-green"
                >
                  <path
                    d="M12 2C8 2 4 6 4 10c0 2.5 1.5 4.5 3 6h2c-1.5-1.5-3-3.5-3-6 0-3 3-6 6-6s6 3 6 6c0 2.5-1.5 4.5-3 6h2c1.5-1.5 3-3.5 3-6 0-4-4-8-8-8z"
                    fill="currentColor"
                    opacity="0.6"
                  />
                  <path
                    d="M12 8c-2.2 0-4 2-4 4.5 0 1.5.8 2.8 1.5 3.5H11v6h2v-6h1.5c.7-.7 1.5-2 1.5-3.5 0-2.5-1.8-4.5-4-4.5z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-ink leading-tight">
                  Rooted EMS
                </span>
                <span className="text-[10px] text-stone tracking-wide">
                  Enrollment Management
                </span>
              </div>
            </>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_SECTIONS.map((section, sIdx) => {
          // Filter items by role
          const visibleItems = section.items.filter((item) => {
            const required = ROLE_LEVEL[item.minRole ?? "compliance_auditor"] ?? 1;
            return userLevel >= required;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className={cn(sIdx > 0 && "mt-2")}>
              {section.title && (
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold text-stone uppercase tracking-wider">
                    {section.title}
                  </span>
                </div>
              )}
              <div className="px-2 space-y-0.5">
                {visibleItems.map(renderLink)}
                {sIdx === NAV_SECTIONS.length - 1 && networkItem && renderLink(networkItem)}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Pinned: Settings + Team, visually separated at the bottom of the rail */}
      {visiblePinnedItems.length > 0 && (
        <div className="px-2 py-2 border-t border-stone/10 space-y-0.5">
          {visiblePinnedItems.map(renderLink)}
        </div>
      )}

      {/* Version footer */}
      <div className="p-3 border-t border-stone/10">
        <span className="text-[10px] text-stone/50 block text-center">
          Rooted EMS v1.0
        </span>
      </div>
    </aside>
  );
}
