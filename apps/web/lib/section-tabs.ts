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
  // Policy sits last because it is read far less often than it is relied on:
  // the rules a lottery runs under, versioned and board-adopted.
  { label: "Policy", href: "/staff/policy" },
];

export const INSIGHTS_TABS: SectionTab[] = [
  { label: "Insights", href: "/staff/reports" },
  // Funnel sits first among the analytical tabs because it is the frame the
  // playbook is organised around; Equity then asks who is falling out of it.
  { label: "Funnel", href: "/staff/funnel" },
  { label: "Equity", href: "/staff/equity" },
  { label: "Audit Trail", href: "/staff/audit" },
];
