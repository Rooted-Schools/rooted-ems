"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/staff/dashboard", icon: "📊" },
  { label: "Applications", href: "/staff/applications", icon: "📋" },
  { label: "Lottery", href: "/staff/lottery", icon: "🎲" },
  { label: "Offers", href: "/staff/offers", icon: "✉️" },
  { label: "Waitlist", href: "/staff/waitlist", icon: "📝" },
  { label: "Enrollment", href: "/staff/enrollment", icon: "✅" },
  { label: "Communications", href: "/staff/communications", icon: "💬" },
  { label: "Reports", href: "/staff/reports", icon: "📈" },
  { label: "Settings", href: "/staff/settings", icon: "⚙️" },
];

export function StaffSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <Link href="/staff/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-rooted-green flex items-center justify-center text-white font-bold text-sm">
            R
          </div>
          <span className="font-semibold text-gray-900">Rooted EMS</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-rooted-green/10 text-rooted-green-dark"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <span className="text-base" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
