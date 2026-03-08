"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="border-b border-stone/20 bg-white">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        <Link
          href="/family/dashboard"
          className="flex items-center gap-2 no-underline hover:opacity-90 transition-opacity"
        >
          <span className="text-sm tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span><span className="text-ink font-medium">schools</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
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
          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-stone/20">
            <span className="text-sm text-stone truncate max-w-[140px]">
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

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 -mr-2 text-ink/70 hover:text-ink"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-stone/10 bg-white pb-3">
          <nav className="flex flex-col px-4 pt-2">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`py-2.5 text-sm border-b border-stone/10 last:border-0 transition-colors ${isActive ? "text-rooted-green font-semibold" : "text-ink/70 hover:text-rooted-green"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center justify-between px-4 pt-3 mt-1 border-t border-stone/10">
            <span className="text-xs text-stone truncate max-w-[200px]">
              {userEmail ?? userPhone ?? ""}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-stone hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
