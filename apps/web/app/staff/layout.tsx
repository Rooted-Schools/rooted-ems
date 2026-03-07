import { Suspense } from "react";
import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { getSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { getCampuses } from "@/lib/queries";

export const metadata = {
  title: "Staff Console | Rooted EMS",
};

/* Role hierarchy — must match staff-sidebar.tsx */
const ROLE_LEVEL: Record<string, number> = {
  compliance_auditor: 1,
  enrollment_staff: 2,
  enrollment_manager: 3,
  system_admin: 4,
};

function computeHighestRole(campusRoles: Record<string, string[]>): string {
  let best = "compliance_auditor";
  let bestLevel = 1;
  for (const roles of Object.values(campusRoles)) {
    for (const r of roles) {
      const lvl = ROLE_LEVEL[r] ?? 0;
      if (lvl > bestLevel) {
        best = r;
        bestLevel = lvl;
      }
    }
  }
  return best;
}

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
  const highestRole = session?.campus_roles
    ? computeHighestRole(session.campus_roles as Record<string, string[]>)
    : "compliance_auditor";

  return (
    <div className="flex min-h-screen bg-rooted-gray">
      <Suspense fallback={<aside className="w-64 bg-white border-r border-gray-200 min-h-screen" />}>
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
