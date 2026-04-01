"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Role hierarchy — higher number = more access                      */
/* ------------------------------------------------------------------ */
const ROLE_LEVEL: Record<string, number> = {
  compliance_auditor: 1,
  enrollment_staff: 2,
  enrollment_manager: 3,
  system_admin: 4,
};

type MinRole = "compliance_auditor" | "enrollment_staff" | "enrollment_manager" | "system_admin";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** Minimum role required to see this item (default: compliance_auditor = everyone) */
  minRole?: MinRole;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/staff/dashboard", icon: "📊" },
    ],
  },
  {
    title: "Admissions",
    items: [
      { label: "Inquiries", href: "/staff/inquiries", icon: "💬", minRole: "enrollment_staff" },
      { label: "Applications", href: "/staff/applications", icon: "📋" },
      { label: "Documents", href: "/staff/documents", icon: "📄", minRole: "enrollment_staff" },
      { label: "Students", href: "/staff/students", icon: "👤" },
      { label: "Lottery", href: "/staff/lottery", icon: "🎲", minRole: "enrollment_manager" },
      { label: "Offers & Waitlist", href: "/staff/offers", icon: "✉️", minRole: "enrollment_manager" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Enrollment", href: "/staff/enrollment", icon: "✅", minRole: "enrollment_staff" },
      { label: "Seat Management", href: "/staff/seats", icon: "🪑", minRole: "enrollment_manager" },
      { label: "Communications", href: "/staff/communications", icon: "📬", minRole: "enrollment_staff" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "/staff/reports", icon: "📈" },
      { label: "Equity & Demographics", href: "/staff/equity", icon: "📊", minRole: "enrollment_manager" },
      { label: "Audit Trail", href: "/staff/audit", icon: "🔒" },
    ],
  },
  {
    items: [
      { label: "Team", href: "/staff/team", icon: "👥", minRole: "system_admin" },
      { label: "Settings", href: "/staff/settings", icon: "⚙️", minRole: "enrollment_manager" },
    ],
  },
];

interface StaffSidebarProps {
  /** The user's highest role across all campuses (drives nav filtering) */
  highestRole?: string;
}

export function StaffSidebar({ highestRole = "compliance_auditor" }: StaffSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Preserve campus selection across navigation
  const campusParam = searchParams.get("campus");
  function buildHref(base: string) {
    return campusParam ? `${base}?campus=${campusParam}` : base;
  }

  const userLevel = ROLE_LEVEL[highestRole] ?? 1;

  return (
    <aside className="w-64 bg-white border-r border-stone/20 min-h-screen flex flex-col">
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
              <div className="px-2 space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/staff/dashboard" &&
                      pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={buildHref(item.href)}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                        isActive
                          ? "bg-rooted-green/10 text-deep-green border border-rooted-green/20"
                          : "text-ink/60 hover:bg-rooted-gray-light hover:text-ink border border-transparent"
                      )}
                    >
                      <span className="text-sm" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              {section.title && sIdx < NAV_SECTIONS.length - 1 && (
                <div className="mx-4 mt-2 border-b border-stone/10" />
              )}
            </div>
          );
        })}
      </nav>

      {/* Version footer */}
      <div className="p-3 border-t border-stone/10">
        <span className="text-[10px] text-stone/50 block text-center">
          Rooted EMS v1.0
        </span>
      </div>
    </aside>
  );
}
