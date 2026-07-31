"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/locale-context";

interface FamilyTabBarProps {
  unreadMessageCount?: number;
}

/** 2px-stroke line icons, hand-inlined (Lucide-equivalent) — no new dependency. */
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5L12 4l9 7.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 10v9a1 1 0 001 1H9a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h2.5a1 1 0 001-1v-9" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5.5a1.5 1.5 0 011.5-1.5h13A1.5 1.5 0 0120 5.5v9a1.5 1.5 0 01-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 014 14.5v-9z"
      />
    </svg>
  );
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="3.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20c0-3.6 3.36-6.5 7.5-6.5s7.5 2.9 7.5 6.5" />
    </svg>
  );
}

/**
 * Fixed bottom tab bar — the phone-first nav for the family portal
 * (UX Phase 1A / 1.2). Replaces the hamburger on phone; the desktop header
 * nav (components/layout/family-header.tsx) covers md+ and this bar hides
 * there. Pair with `pb-[72px]` on the family <main> so content clears it.
 */
export function FamilyTabBar({ unreadMessageCount = 0 }: FamilyTabBarProps) {
  const pathname = usePathname();
  const { t } = useLocale();

  const tabs = [
    { href: "/family/dashboard", label: t("nav.home"), Icon: HomeIcon, hasUnread: false },
    { href: "/family/messages", label: t("nav.messages"), Icon: MessageIcon, hasUnread: unreadMessageCount > 0 },
    { href: "/family/account", label: t("nav.account"), Icon: AccountIcon, hasUnread: false },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-line flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("nav.home")}
    >
      {tabs.map(({ href, label, Icon, hasUnread }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex-1 min-h-[58px] flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive ? "text-deep-green" : "text-stone"
            }`}
          >
            <span className="relative">
              <Icon className="w-5 h-5" />
              {hasUnread && (
                <span
                  className="absolute -top-0.5 -right-1 w-2 h-2 bg-error rounded-full"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
