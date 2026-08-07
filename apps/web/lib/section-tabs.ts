import type { SectionTab } from "@/components/layout/section-tabs";

/**
 * Sub-tabs for the two consolidated sidebar shells (Seats & Lottery,
 * Insights). Pages pass only the tabs the current user's role can open —
 * SectionTabs itself renders nothing when fewer than two tabs remain.
 */
export const SEATS_LOTTERY_TABS: SectionTab[] = [
  { label: "Lottery", href: "/staff/lottery" },
  { label: "Seats", href: "/staff/seats" },
  { label: "Offers & Waitlist", href: "/staff/offers" },
];

export const INSIGHTS_TABS: SectionTab[] = [
  { label: "Reports", href: "/staff/reports" },
  { label: "Equity", href: "/staff/equity" },
  { label: "Audit Trail", href: "/staff/audit" },
];
