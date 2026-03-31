export const runtime = "edge";
export const dynamic = "force-dynamic";

import { requireMinRole } from "@/lib/auth/get-session";
import { getStaffUsers, type StaffUserRow } from "@/lib/queries/staff";
import { getCampuses } from "@/lib/queries";
import { TeamClient } from "./team-client";

export const metadata = {
  title: "Team | Rooted EMS",
};

export interface TeamMember {
  user_id: string;
  full_name: string;
  email: string;
  initials: string;
  campusRoles: {
    row_id: string;
    campus_id: string;
    campus_name: string;
    role: string;
  }[];
}

function groupIntoMembers(rows: StaffUserRow[]): TeamMember[] {
  const map = new Map<string, TeamMember>();

  for (const row of rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, {
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        initials: row.initials,
        campusRoles: [],
      });
    }
    map.get(row.user_id)!.campusRoles.push({
      row_id: row.id,
      campus_id: row.campus_id,
      campus_name: row.campus_name,
      role: row.role,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.full_name.localeCompare(b.full_name)
  );
}

export default async function TeamPage() {
  await requireMinRole("system_admin");

  const [staffRows, allCampuses] = await Promise.all([
    getStaffUsers(),
    getCampuses(),
  ]);

  const members = groupIntoMembers(staffRows);

  return (
    <TeamClient
      members={members}
      campuses={allCampuses.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
