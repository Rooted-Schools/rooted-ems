export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireMinRole, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionTabs } from "@/components/layout/section-tabs";
import { INSIGHTS_TABS } from "@/lib/section-tabs";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: "Created", color: "bg-green-100 text-green-800" },
  update: { label: "Updated", color: "bg-blue-100 text-blue-800" },
  delete: { label: "Deleted", color: "bg-red-100 text-red-800" },
  status_change: { label: "Status Change", color: "bg-purple-100 text-purple-800" },
  login: { label: "Login", color: "bg-rooted-gray text-ink" },
  export: { label: "Export", color: "bg-amber-100 text-amber-800" },
};

const TABLE_LABELS: Record<string, string> = {
  application: "Application",
  offer: "Offer",
  enrollment: "Enrollment",
  lottery_run: "Lottery Run",
  capacity_plan: "Capacity",
  user_profile: "User Profile",
  verification_item: "Verification",
  registration_item: "Registration",
  task: "Task",
  transfer: "Transfer",
  withdrawal: "Withdrawal",
  registration_packet: "Reg. Packet",
};

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: { campus?: string; table?: string; action?: string; page?: string };
}) {
  // This page reads audit_event through the service-role client, which bypasses
  // RLS — so the audit_select policy (system_admin, or enrollment_manager on the
  // campus) is not a backstop here and has to be enforced in the route. Audit
  // rows carry old_data/new_data blobs of applications and documents, i.e.
  // student PII, so the gate matches the policy rather than merely is_staff.
  const session = await requireMinRole("enrollment_manager");
  const supabase = createServiceRoleClient();
  const accessibleCampusIds = getAccessibleCampusIds(session);

  const parsedPage = Number.parseInt(searchParams.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  // Validate campus param against user's accessible campuses
  const requestedCampus = searchParams.campus;
  const validCampus =
    requestedCampus && accessibleCampusIds.includes(requestedCampus)
      ? requestedCampus
      : undefined;

  let query = supabase
    .from("audit_event")
    .select(`
      id, table_name, record_id, action, old_data, new_data,
      ip_address, user_agent, created_at,
      actor:actor_id (first_name, last_name, email),
      campus:campus_id (name, timezone)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (validCampus) {
    query = query.eq("campus_id", validCampus);
  } else if (accessibleCampusIds.length > 0) {
    // Scope to the campuses this manager actually holds a role on. This used
    // to skip the filter for anyone with 3+ campuses, which silently turned
    // "assigned to all three live campuses" into org-wide audit access.
    query = query.in("campus_id", accessibleCampusIds);
  }
  // No campus rows at all = org-wide admin (see resolveActiveCampus): no filter.
  if (searchParams.table) {
    query = query.eq("table_name", searchParams.table);
  }
  if (searchParams.action) {
    query = query.eq("action", searchParams.action);
  }

  const { data: events, count } = await query;

  // Use known table names from the TABLE_LABELS config instead of a separate query
  const tables = Object.keys(TABLE_LABELS);
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div className="space-y-6">
      <SectionTabs
        tabs={INSIGHTS_TABS}
        activeHref="/staff/audit"
        campusParam={searchParams.campus}
      />
      <div>
        <h1 className="text-2xl font-bold text-ink">Audit Trail</h1>
        <p className="text-sm text-stone mt-1">
          {count ?? 0} audit event{(count ?? 0) !== 1 ? "s" : ""} recorded
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <form className="flex items-center gap-3 flex-wrap">
            {validCampus && (
              <input type="hidden" name="campus" value={validCampus} />
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-stone">Table:</label>
              <select
                name="table"
                defaultValue={searchParams.table ?? ""}
                className="text-sm border border-stone/30 rounded-md px-2 py-1 bg-white"
              >
                <option value="">All Tables</option>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {TABLE_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-stone">Action:</label>
              <select
                name="action"
                defaultValue={searchParams.action ?? ""}
                className="text-sm border border-stone/30 rounded-md px-2 py-1 bg-white"
              >
                <option value="">All Actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="status_change">Status Change</option>
              </select>
            </div>
            <button
              type="submit"
              className="text-sm bg-rooted-green text-white px-3 py-1 rounded-md hover:bg-rooted-green-dark"
            >
              Filter
            </button>
            {(searchParams.table || searchParams.action) && (
              <a
                href={`/staff/audit${validCampus ? `?campus=${validCampus}` : ""}`}
                className="text-xs text-stone hover:text-ink/70 no-underline"
              >
                Clear filters
              </a>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-rooted-gray-light">
                  <th className="text-left py-2 px-4 font-medium text-stone text-xs">Time</th>
                  <th className="text-left py-2 px-4 font-medium text-stone text-xs">Actor</th>
                  <th className="text-left py-2 px-4 font-medium text-stone text-xs">Action</th>
                  <th className="text-left py-2 px-4 font-medium text-stone text-xs">Table</th>
                  <th className="text-left py-2 px-4 font-medium text-stone text-xs">Campus</th>
                  <th className="text-left py-2 px-4 font-medium text-stone text-xs">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rooted-gray">
                {(!events || events.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-stone">
                      No audit events found
                    </td>
                  </tr>
                ) : (
                  (events as Record<string, unknown>[]).map((event) => {
                    const actor = event.actor as Record<string, string> | null;
                    const campus = event.campus as Record<string, string> | null;
                    const action = event.action as string;
                    const actionCfg = ACTION_LABELS[action] ?? {
                      label: action,
                      color: "bg-rooted-gray text-ink",
                    };
                    const oldData = event.old_data as Record<string, unknown> | null;
                    const newData = event.new_data as Record<string, unknown> | null;

                    // Build a summary of changes
                    let changeSummary = "";
                    if (action === "status_change" && oldData?.status && newData?.status) {
                      changeSummary = `${oldData.status} → ${newData.status}`;
                    } else if (action === "update" && oldData && newData) {
                      const changedKeys = Object.keys(newData).filter(
                        (k) =>
                          k !== "updated_at" &&
                          JSON.stringify(newData[k]) !== JSON.stringify(oldData[k])
                      );
                      changeSummary =
                        changedKeys.length > 0
                          ? changedKeys.slice(0, 3).join(", ") +
                            (changedKeys.length > 3
                              ? ` +${changedKeys.length - 3} more`
                              : "")
                          : "";
                    }

                    return (
                      <tr key={event.id as string} className="hover:bg-rooted-gray-light">
                        <td className="py-2 px-4 text-xs text-stone whitespace-nowrap">
                          {new Date(event.created_at as string).toLocaleString(
                            "en-US",
                            {
                              timeZone: campus?.timezone ?? "UTC",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZoneName: "short",
                            }
                          )}
                        </td>
                        <td className="py-2 px-4 text-xs">
                          {actor
                            ? `${actor.first_name} ${actor.last_name}`
                            : "System"}
                        </td>
                        <td className="py-2 px-4">
                          <Badge className={`text-[10px] ${actionCfg.color}`}>
                            {actionCfg.label}
                          </Badge>
                        </td>
                        <td className="py-2 px-4 text-xs text-ink/60">
                          {TABLE_LABELS[event.table_name as string] ??
                            (event.table_name as string)}
                        </td>
                        <td className="py-2 px-4 text-xs text-stone">
                          {campus?.name ?? "—"}
                        </td>
                        <td className="py-2 px-4 text-xs text-stone max-w-xs truncate">
                          {changeSummary || (
                            <span className="text-stone/50 font-mono text-[10px]">
                              {(event.record_id as string)?.slice(0, 8)}...
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/staff/audit?page=${page - 1}${validCampus ? `&campus=${validCampus}` : ""}${searchParams.table ? `&table=${searchParams.table}` : ""}${searchParams.action ? `&action=${searchParams.action}` : ""}`}
                className="text-sm px-3 py-1 border border-stone/30 rounded-md hover:bg-rooted-gray-light no-underline text-ink/70"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/staff/audit?page=${page + 1}${validCampus ? `&campus=${validCampus}` : ""}${searchParams.table ? `&table=${searchParams.table}` : ""}${searchParams.action ? `&action=${searchParams.action}` : ""}`}
                className="text-sm px-3 py-1 border border-stone/30 rounded-md hover:bg-rooted-gray-light no-underline text-ink/70"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
