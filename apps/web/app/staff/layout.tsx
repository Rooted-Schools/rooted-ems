import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { getSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
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

  return (
    <div className="flex min-h-screen bg-rooted-gray">
      <StaffSidebar />
      <div className="flex-1 flex flex-col">
        <StaffHeader
          userEmail={session?.email}
          campuses={headerCampuses}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
