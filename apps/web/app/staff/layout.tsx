import { Suspense } from "react";
import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { getSession, getAccessibleCampusIds, getHighestRole } from "@/lib/auth/get-session";
import { getCampuses } from "@/lib/queries";

export const metadata = {
  title: "Staff Console | Rooted EMS",
};

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, allCampuses] = await Promise.all([
    getSession(),
    getCampuses(),
  ]);

  // Scope campus list to what the user can access
  const accessibleIds = session ? getAccessibleCampusIds(session) : [];
  const campuses = accessibleIds.length > 0
    ? allCampuses.filter((c) => accessibleIds.includes(c.id))
    : allCampuses;

  const headerCampuses = campuses.map((c) => ({ id: c.id, name: c.name }));

  // Compute the user's highest role across all campuses for nav filtering
  const highestRole = session ? getHighestRole(session) : "compliance_auditor";

  return (
    <div className="flex min-h-screen bg-rooted-gray">
      <Suspense fallback={<aside className="w-64 bg-white border-r border-stone/20 min-h-screen" />}>
        <StaffSidebar highestRole={highestRole} />
      </Suspense>
      <div className="flex-1 flex flex-col">
        <Suspense fallback={<div className="h-[5.5rem]" />}>
          <StaffHeader
            userEmail={session?.email}
            campuses={headerCampuses}
          />
        </Suspense>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
