export const runtime = "edge";
export const dynamic = "force-dynamic";

import { requireMinRole, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { getStaffUsers, type StaffUserRow } from "@/lib/queries/staff";
import { getCampuses } from "@/lib/queries";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { TeamClient } from "./team-client";

export const metadata = {
  title: "Team | Rooted EMS",
};

export interface TeamMember {
  user_id: string;
  full_name: string;
  email: string;
  initials: string;
  /** True when the person has an invited auth account but has never signed in. */
  invited: boolean;
  campusRoles: {
    row_id: string;
    campus_id: string;
    campus_name: string;
    role: string;
  }[];
}

function groupIntoMembers(
  rows: StaffUserRow[],
  invitedIds: Set<string>
): TeamMember[] {
  const map = new Map<string, TeamMember>();

  for (const row of rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, {
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        initials: row.initials,
        invited: invitedIds.has(row.user_id),
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

/**
 * Which of these staff user ids have never signed in (last_sign_in_at is
 * null on their auth record) — drives the "Invited" hint on team rows.
 *
 * Uses getUserById per staff member rather than paging through
 * auth.admin.listUsers(): this scales with the size of the STAFF roster
 * (dozens, not the full family/guardian user base), so it stays cheap as
 * the app grows. Failures are swallowed to "not invited" — this is a
 * cosmetic hint, not a security signal, so it should never block the page.
 */
async function getNeverSignedInIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const supabase = createServiceRoleClient();
  const results = await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await supabase.auth.admin.getUserById(id);
        return { id, neverSignedIn: !!data?.user && !data.user.last_sign_in_at };
      } catch {
        return { id, neverSignedIn: false };
      }
    })
  );

  return new Set(results.filter((r) => r.neverSignedIn).map((r) => r.id));
}

export default async function TeamPage() {
  const session = await requireMinRole("system_admin");

  // requireMinRole only confirms system_admin SOMEWHERE, not everywhere — an
  // admin scoped to one (or a few) campuses must only see their own roster
  // and only be able to target their own campuses when adding someone. An
  // empty accessible list is the established signal for genuine CMO-level
  // access with no per-campus assignment row (same convention
  // resolveActiveCampus uses); everyone else is scoped down here too.
  const accessibleIds = getAccessibleCampusIds(session);
  const scopeToAccessible = accessibleIds.length > 0;

  const [allStaffRows, allCampuses] = await Promise.all([
    getStaffUsers(),
    getCampuses(),
  ]);

  const staffRows = scopeToAccessible
    ? allStaffRows.filter((r) => accessibleIds.includes(r.campus_id))
    : allStaffRows;
  const campuses = scopeToAccessible
    ? allCampuses.filter((c) => accessibleIds.includes(c.id))
    : allCampuses;

  const staffUserIds = Array.from(new Set(staffRows.map((r) => r.user_id)));
  const neverSignedInIds = await getNeverSignedInIds(staffUserIds);

  const members = groupIntoMembers(staffRows, neverSignedInIds);

  return (
    <TeamClient
      members={members}
      campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
