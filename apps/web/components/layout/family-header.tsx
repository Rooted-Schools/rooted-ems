"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@rooted-ems/database";

interface FamilyHeaderProps {
  userEmail?: string | null;
  userPhone?: string | null;
}

const NAV_LINKS = [
  { href: "/family/dashboard", label: "Dashboard" },
  { href: "/family/applications", label: "Applications" },
  { href: "/family/documents", label: "Documents" },
  { href: "/family/messages", label: "Messages" },
  { href: "/family/registration", label: "Registration" },
];

export function FamilyHeader({ userEmail, userPhone }: FamilyHeaderProps) {
  const pathname = usePathname();
  const supabase = useMemo(() => createBrowserClient(), []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="h-14 border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto h-full flex items-center justify-between px-4">
        <Link
          href="/family/dashboard"
          className="flex items-center gap-2 no-underline hover:opacity-90 transition-opacity"
        >
          <span className="text-sm tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span><span className="text-ink font-medium">schools</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${isActive ? "text-rooted-green font-semibold" : "text-ink/70 hover:text-rooted-green"}`}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
            <span className="text-sm text-stone">
              {userEmail ?? userPhone ?? ""}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-stone hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
