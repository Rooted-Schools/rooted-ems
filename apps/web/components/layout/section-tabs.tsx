import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SectionTab {
  label: string;
  href: string;
}

/**
 * Sub-navigation for a consolidated sidebar destination (Seats & Lottery,
 * Insights). Mirrors the secondary-tab strip Pipeline uses so every shell
 * reads the same way: hairline underline, 6px-radius rectangular chips,
 * active chip in rooted-green.
 *
 * Server component on purpose: each page passes only the tabs the current
 * user's role can actually open (the page's own guard decides), so a chip
 * never advertises a destination that would bounce the user to /staff/today.
 */
export function SectionTabs({
  tabs,
  activeHref,
  campusParam,
}: {
  tabs: SectionTab[];
  activeHref: string;
  /** Preserve the campus selection across tab hops, same as the sidebar. */
  campusParam?: string;
}) {
  if (tabs.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b border-line pb-3">
      {tabs.map((tab) => {
        const isActive = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={campusParam ? `${tab.href}?campus=${campusParam}` : tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "border-rooted-green/30 bg-rooted-green/10 text-deep-green"
                : "border-line bg-white text-stone hover:bg-sunken hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
