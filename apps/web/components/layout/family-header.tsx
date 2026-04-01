"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@rooted-ems/database";
import { useLocale } from "@/lib/i18n/locale-context";
import { type TranslationKey } from "@/lib/i18n/translations";
import { LanguageToggle } from "@/components/ui/language-toggle";

interface FamilyHeaderProps {
  userEmail?: string | null;
  userPhone?: string | null;
  pendingOfferCount?: number;
  unreadNotificationCount?: number;
}

interface NavLink {
  href: string;
  label: string;
  badge?: number;
}

function buildNavLinks(
  pendingOfferCount = 0,
  t: (key: TranslationKey) => string
): NavLink[] {
  return [
    { href: "/family/dashboard",    label: t("nav.dashboard") },
    { href: "/family/applications", label: t("nav.applications") },
    {
      href: "/family/offers",
      label: t("nav.offers"),
      badge: pendingOfferCount > 0 ? pendingOfferCount : undefined,
    },
    { href: "/family/documents",    label: t("nav.documents") },
    { href: "/family/messages",     label: t("nav.messages") },
    { href: "/family/registration", label: t("nav.registration") },
    { href: "/family/reenrollment", label: t("nav.reenrollment") },
  ];
}

export function FamilyHeader({ userEmail, userPhone, pendingOfferCount = 0, unreadNotificationCount = 0 }: FamilyHeaderProps) {
  const pathname = usePathname();
  const supabase = useMemo(() => createBrowserClient(), []);
  const { t } = useLocale();
  const NAV_LINKS = useMemo(() => buildNavLinks(pendingOfferCount, t), [pendingOfferCount, t]);
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
                className={`relative text-sm transition-colors ${isActive ? "text-rooted-green font-semibold" : "text-ink/70 hover:text-rooted-green"}`}
              >
                {link.label}
                {link.badge != null && (
                  <span className="absolute -top-1.5 -right-3.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-stone/20">
            <LanguageToggle />
            {/* Notification bell */}
            <Link href="/family/messages" className="relative text-ink/50 hover:text-rooted-green transition-colors" aria-label="Notifications">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
            </Link>
            <span className="text-sm text-stone truncate max-w-[140px]">
              {userEmail ?? userPhone ?? ""}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-stone hover:text-ink transition-colors"
            >
              {t("nav.signOut")}
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
                  className={`py-2.5 text-sm border-b border-stone/10 last:border-0 transition-colors flex items-center justify-between ${isActive ? "text-rooted-green font-semibold" : "text-ink/70 hover:text-rooted-green"}`}
                >
                  {link.label}
                  {link.badge != null && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center justify-between px-4 pt-3 mt-1 border-t border-stone/10">
            <span className="text-xs text-stone truncate max-w-[140px]">
              {userEmail ?? userPhone ?? ""}
            </span>
            <div className="flex items-center gap-3">
              <LanguageToggle />
              <button
                onClick={handleLogout}
                className="text-sm text-stone hover:text-ink transition-colors"
              >
                {t("nav.signOut")}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
