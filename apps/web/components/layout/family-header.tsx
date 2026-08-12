"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/locale-context";
import { type TranslationKey } from "@/lib/i18n/translations";
import { LanguageToggle } from "@/components/ui/language-toggle";
import type { CampusIdentity } from "@/lib/campus-identity";

interface FamilyHeaderProps {
  unreadMessageCount?: number;
  /**
   * The family's campus, resolved server-side (app/family/layout.tsx) from
   * their most recent application. When present, the header wears that
   * campus's logo and name instead of the generic network wordmark, with
   * the campus accent as a subtle top line. Undefined for a family with no
   * application yet (or an unrecognized short_code) — falls back to the
   * network wordmark.
   */
  campusIdentity?: CampusIdentity;
}

interface NavLink {
  href: string;
  label: string;
  hasUnread?: boolean;
}

/**
 * Family nav, cut from 7 destinations to 3 (UX Phase 1A / 1.2). Applications,
 * Offers, Documents, Registration, and Re-enrollment stay live routes —
 * reachable from the dashboard, email, and SMS — they just leave the nav.
 * On phone this row is redundant with the fixed bottom tab bar and is
 * hidden; the bottom bar (components/layout/family-tabbar.tsx) is the
 * phone-first nav.
 */
function buildNavLinks(unreadMessageCount: number, t: (key: TranslationKey) => string): NavLink[] {
  return [
    { href: "/family/dashboard", label: t("nav.home") },
    { href: "/family/messages", label: t("nav.messages"), hasUnread: unreadMessageCount > 0 },
    { href: "/family/account", label: t("nav.account") },
  ];
}

export function FamilyHeader({ unreadMessageCount = 0, campusIdentity }: FamilyHeaderProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const NAV_LINKS = useMemo(() => buildNavLinks(unreadMessageCount, t), [unreadMessageCount, t]);

  return (
    <header
      className={`border-b border-line bg-white${
        campusIdentity ? ` border-t-2 ${campusIdentity.accent.topBorder}` : ""
      }`}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        <Link
          href="/family/dashboard"
          className="flex items-center gap-2 no-underline hover:opacity-90 transition-opacity"
        >
          {campusIdentity ? (
            <span className="flex items-center gap-2">
              <span className="relative w-8 h-8 shrink-0">
                <Image
                  src={campusIdentity.logoPath}
                  alt=""
                  fill
                  className="object-contain"
                  sizes="32px"
                />
              </span>
              <span className="text-sm font-semibold text-ink leading-tight">
                {campusIdentity.displayName}
              </span>
            </span>
          ) : (
            <span className="text-sm tracking-wide">
              <span className="text-rooted-green font-bold">rooted</span><span className="text-ink font-medium">schools</span>
            </span>
          )}
        </Link>

        {/* Desktop nav — hidden on phone, where the fixed bottom tab bar owns navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative text-sm transition-colors ${isActive ? "text-rooted-green font-semibold" : "text-ink/70 hover:text-rooted-green"}`}
              >
                {link.label}
                {link.hasUnread && (
                  <span className="absolute -top-0.5 -right-2 w-2 h-2 bg-error rounded-full" aria-hidden="true" />
                )}
              </Link>
            );
          })}
          <div className="flex items-center ml-4 pl-4 border-l border-line">
            <LanguageToggle />
          </div>
        </nav>

        {/* Phone: brand + language toggle only — nav lives in the bottom tab bar */}
        <div className="md:hidden">
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
