"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/staff/dashboard", icon: "📊" },
      { label: "Inbox", href: "/staff/inbox", icon: "📥" },
    ],
  },
  {
    title: "Admissions",
    items: [
      { label: "Applications", href: "/staff/applications", icon: "📋" },
      { label: "Students", href: "/staff/students", icon: "👤" },
      { label: "Pipeline", href: "/staff/pipeline", icon: "🔄" },
      { label: "Lottery", href: "/staff/lottery", icon: "🎲" },
      { label: "Offers", href: "/staff/offers", icon: "✉️" },
      { label: "Waitlist", href: "/staff/waitlist", icon: "📝" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Enrollment", href: "/staff/enrollment", icon: "✅" },
      { label: "Seat Management", href: "/staff/seats", icon: "🪑" },
      { label: "Communications", href: "/staff/communications", icon: "💬" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Equity Dashboard", href: "/staff/equity", icon: "⚖️" },
      { label: "Reports", href: "/staff/reports", icon: "📈" },
    ],
  },
  {
    items: [
      { label: "Settings", href: "/staff/settings", icon: "⚙️" },
    ],
  },
];

export function StaffSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Brand */}
      <div className="p-4 border-b border-gray-200">
        <Link
          href="/staff/dashboard"
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
            <span className="text-sm font-semibold text-gray-900 leading-tight">
              Rooted EMS
            </span>
            <span className="text-[10px] text-gray-400 tracking-wide">
              Enrollment Management
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx} className={cn(sIdx > 0 && "mt-2")}>
            {section.title && (
              <div className="px-4 py-1.5">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {section.title}
                </span>
              </div>
            )}
            <div className="px-2 space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/staff/dashboard" &&
                    pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-rooted-green/10 text-rooted-green-dark border border-rooted-green/20"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
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
              <div className="mx-4 mt-2 border-b border-gray-100" />
            )}
          </div>
        ))}
      </nav>

      {/* Version footer */}
      <div className="p-3 border-t border-gray-100">
        <span className="text-[10px] text-gray-300 block text-center">
          Rooted EMS v1.0
        </span>
      </div>
    </aside>
  );
}
