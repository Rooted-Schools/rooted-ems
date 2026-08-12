import { Suspense } from "react";
import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { StaffMobileNav } from "@/components/layout/staff-mobile-nav";
import { requireStaffSession, getAccessibleCampusIds, getHighestRole } from "@/lib/auth/get-session";
import { getCampusIdentityByShortCode, NEUTRAL_LENS_THEME } from "@/lib/campus-identity";
import { getCampusLens } from "@/lib/campus-lens";
import { setCampusLens } from "@/app/staff/lens-actions";
import type { CampusLensSwitcherOption } from "@/components/layout/campus-lens-switcher";
import {
  getCampuses,
  getFamilyMessages,
  getUnreadNotificationCount,
  getExpiringOffers,
  getStaffPendingDocuments,
  getStalledRegistrations,
  getReleasableSeats,
  getDuplicateSuspects,
} from "@/lib/queries";
import { ToastProvider } from "@/components/ui/toast";

export const metadata = {
  title: "Staff Console | Rooted EMS",
};

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, allCampuses] = await Promise.all([
    requireStaffSession(),
    getCampuses(),
  ]);

  // Scope campus list to what the user can access
  const accessibleIds = getAccessibleCampusIds(session);
  const scopedCampusIds = accessibleIds.length > 0 ? accessibleIds : undefined;

  // Fetch unread notification count (bell badge), the most recent
  // notifications (bell dropdown preview), and the real "Today" exception
  // total (sidebar badge) — all scoped to this user / their campuses.
  // These reuse the exact same queries the Today page itself calls, so the
  // badge is never a fabricated number; if any query is slow to add later,
  // the badge can simply be left undefined (it already no-ops when unset).
  const [
    unreadNotificationCount,
    recentNotifications,
    expiringOffers,
    { rows: pendingDocuments },
    stalled,
    releasableSeatGroups,
    duplicateSuspects,
  ] = await Promise.all([
    // Staff context only: a dual-role user (staff who is also a guardian on
    // an application) must not get family-portal links in the staff bell.
    getUnreadNotificationCount(session.user_id, "staff"),
    getFamilyMessages(session.user_id, 10, "staff"),
    getExpiringOffers(120, scopedCampusIds),
    getStaffPendingDocuments(scopedCampusIds),
    getStalledRegistrations(5, scopedCampusIds),
    getReleasableSeats(scopedCampusIds),
    getDuplicateSuspects(scopedCampusIds),
  ]);

  const todayCount =
    expiringOffers.length +
    pendingDocuments.length +
    stalled.rows.length +
    releasableSeatGroups.reduce((sum, g) => sum + g.releasable, 0) +
    duplicateSuspects.length;

  const campuses = accessibleIds.length > 0
    ? allCampuses.filter((c) => accessibleIds.includes(c.id))
    : allCampuses;

  const headerCampuses = campuses.map((c) => ({ id: c.id, name: c.name }));

  // Compute the user's highest role across all campuses for nav filtering
  const highestRole = getHighestRole(session);

  // Campus lens (lib/campus-lens.ts): forced to the one accessible campus for
  // single-campus staff (Tim, Lalah); a multi-campus/org-wide viewer's own
  // switcher pick otherwise; null for "All campuses" (the neutral default).
  // Drives both the shell theme below and the sidebar brand block — a single
  // logo would misrepresent whose console this is when no lens is active.
  const lens = await getCampusLens(campuses);
  const lensTheme = lens?.identity.theme ?? NEUTRAL_LENS_THEME;

  // Switcher renders only for staff with more than one campus to choose
  // between — org-wide (empty accessible list) or explicitly multi-campus.
  const showCampusSwitcher = accessibleIds.length === 0 || accessibleIds.length > 1;
  const campusSwitcherOptions: CampusLensSwitcherOption[] = showCampusSwitcher
    ? campuses
        .map((c) => {
          const identity = getCampusIdentityByShortCode(c.short_code);
          return identity ? { id: c.id, identity } : null;
        })
        .filter((o): o is CampusLensSwitcherOption => o !== null)
    : [];

  // CSS custom properties consumed via Tailwind arbitrary values
  // (bg-[var(--lens-accent)], text-[var(--lens-accent-text)], ...) by the
  // sidebar, mobile nav, and the hairline bar below. Set once here so every
  // descendant can use the vars unconditionally instead of each branching on
  // whether a lens is active.
  const lensStyle = {
    "--lens-accent": lensTheme.accent,
    "--lens-accent-text": lensTheme.accentText,
    "--lens-accent-soft": lensTheme.accentSoft,
    "--lens-accent-border": lensTheme.accentBorder,
  } as React.CSSProperties;

  return (
    <ToastProvider>
    <div className="min-h-screen bg-rooted-gray" style={lensStyle}>
      {/* Campus lens hairline — 3px, always mounted (neutral = rooted-green
          default via NEUTRAL_LENS_THEME above, not conditionally rendered). */}
      <div className="h-[3px] w-full bg-[var(--lens-accent)]" aria-hidden="true" />
      <div className="flex">
        <Suspense fallback={<aside className="hidden md:block w-64 bg-white border-r border-stone/20 min-h-screen" />}>
          <StaffSidebar
            highestRole={highestRole}
            todayCount={todayCount}
            messagesUnreadCount={unreadNotificationCount}
            showNetwork={accessibleIds.length === 0}
            lensIdentity={lens?.identity}
            campusSwitcherOptions={campusSwitcherOptions}
            activeLensCampusId={lens?.campusId ?? null}
            setCampusLens={setCampusLens}
          />
        </Suspense>
        <div className="flex-1 flex flex-col">
          <Suspense fallback={<div className="h-[5.5rem]" />}>
            <StaffHeader
              userEmail={session.email}
              campuses={headerCampuses}
              unreadNotificationCount={unreadNotificationCount}
              recentNotifications={recentNotifications}
              highestRole={highestRole}
            />
          </Suspense>
          {/* pb-[72px] keeps content clear of the fixed phone bottom tab bar
              below md, same convention as app/family/layout.tsx's main. */}
          <main className="flex-1 p-6 pb-[72px] md:pb-6">{children}</main>
        </div>
        <Suspense fallback={null}>
          <StaffMobileNav highestRole={highestRole} todayCount={todayCount} />
        </Suspense>
      </div>
    </div>
    </ToastProvider>
  );
}
