import { Suspense } from "react";
import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { requireStaffSession, getAccessibleCampusIds, getHighestRole } from "@/lib/auth/get-session";
import {
  getCampuses,
  getFamilyMessages,
  getExpiringOffers,
  getStaffPendingDocuments,
  getStalledRegistrations,
  getReleasableSeats,
  getDuplicateSuspects,
} from "@/lib/queries";
import { createServiceRoleClient } from "@rooted-ems/database/server";
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
  const db = createServiceRoleClient();
  const [
    unreadResult,
    recentNotifications,
    expiringOffers,
    { rows: pendingDocuments },
    stalled,
    releasableSeatGroups,
    duplicateSuspects,
  ] = await Promise.all([
    db
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user_id)
      .eq("is_read", false),
    getFamilyMessages(session.user_id, 10),
    getExpiringOffers(120, scopedCampusIds),
    getStaffPendingDocuments(scopedCampusIds),
    getStalledRegistrations(5, scopedCampusIds),
    getReleasableSeats(scopedCampusIds),
    getDuplicateSuspects(scopedCampusIds),
  ]);
  const unreadNotificationCount = (unreadResult as { count: number | null }).count ?? 0;

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

  return (
    <ToastProvider>
    <div className="flex min-h-screen bg-rooted-gray">
      <Suspense fallback={<aside className="hidden md:block w-64 bg-white border-r border-stone/20 min-h-screen" />}>
        <StaffSidebar highestRole={highestRole} todayCount={todayCount} messagesUnreadCount={unreadNotificationCount} />
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
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
    </ToastProvider>
  );
}
