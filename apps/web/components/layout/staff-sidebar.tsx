"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

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
type IconName =
  | "today"
  | "pipeline"
  | "seats-lottery"
  | "recruitment"
  | "messages"
  | "insights"
  | "settings"
  | "team";

/** Which live badge (if any) a nav item can carry. Badges only render when the
 *  corresponding count prop is passed in — no badge is invented without real data. */
type BadgeKey = "today" | "messages";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Minimum role required to see this item (default: compliance_auditor = everyone) */
  minRole?: MinRole;
  badgeKey?: BadgeKey;
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
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Today", href: "/staff/dashboard", icon: "today", badgeKey: "today" },
      { label: "Pipeline", href: "/staff/applications", icon: "pipeline" },
      {
        label: "Seats & Lottery",
        href: "/staff/lottery",
        icon: "seats-lottery",
        minRole: "enrollment_manager",
      },
      { label: "Recruitment", href: "/staff/recruitment", icon: "recruitment" },
      { label: "Messages", href: "/staff/messages", icon: "messages", badgeKey: "messages" },
      { label: "Insights", href: "/staff/reports", icon: "insights" },
    ],
  },
];

/** Settings + Team stay pinned at the bottom of the rail, visually separated. */
export const PINNED_NAV_ITEMS: NavItem[] = [
  { label: "Team", href: "/staff/team", icon: "team", minRole: "system_admin" },
  { label: "Settings", href: "/staff/settings", icon: "settings", minRole: "enrollment_manager" },
];

/* ------------------------------------------------------------------ */
/*  Icons — inline 2px-stroke SVGs, 20px, stroke=currentColor          */
/* ------------------------------------------------------------------ */
function NavIcon({ name }: { name: IconName }) {
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
}

export function StaffSidebar({
  highestRole = "compliance_auditor",
  todayCount,
  messagesUnreadCount,
}: StaffSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Preserve campus selection across navigation
  const campusParam = searchParams.get("campus");
  function buildHref(base: string) {
    return campusParam ? `${base}?campus=${campusParam}` : base;
  }

  const userLevel = ROLE_LEVEL[highestRole] ?? 1;

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
    const isActive =
      pathname === item.href ||
      (item.href !== "/staff/dashboard" && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={buildHref(item.href)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
          isActive
            ? "bg-rooted-green/10 text-deep-green border border-rooted-green/20"
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
      {/* Brand */}
      <div className="p-4 border-b border-stone/20">
        <Link
          href={buildHref("/staff/dashboard")}
          className="inline-flex items-center gap-2.5 no-underline hover:opacity-90 transition-opacity"
        >
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
              <div className="px-2 space-y-0.5">{visibleItems.map(renderLink)}</div>
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
