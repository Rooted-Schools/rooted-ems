export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";

interface PipelineStudent {
  id: string;
  student_name: string;
  campus_name: string;
  grade: string;
  status: string;
  updated_at: string;
  initials: string;
}

const PIPELINE_COLUMNS = [
  { key: "draft", label: "Draft", color: "bg-gray-100 border-gray-300", textColor: "text-gray-700" },
  { key: "submitted", label: "Submitted", color: "bg-blue-50 border-blue-300", textColor: "text-blue-700" },
  { key: "needs_info", label: "Needs Info", color: "bg-amber-50 border-amber-300", textColor: "text-amber-700" },
  { key: "verified", label: "Verified", color: "bg-green-50 border-green-300", textColor: "text-green-700" },
  { key: "lottery_assigned", label: "Lottery", color: "bg-purple-50 border-purple-300", textColor: "text-purple-700" },
  { key: "offered", label: "Offered", color: "bg-indigo-50 border-indigo-300", textColor: "text-indigo-700" },
  { key: "accepted", label: "Accepted", color: "bg-emerald-50 border-emerald-300", textColor: "text-emerald-700" },
  { key: "registered", label: "Registered", color: "bg-rooted-green/10 border-rooted-green", textColor: "text-rooted-green-dark" },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;
  const supabase = await createServerClient();

  let appQuery = supabase
    .from("application")
    .select(
      `
      id, status, updated_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `
    )
    .order("updated_at", { ascending: false });

  if (scopedCampusIds.length > 0) {
    appQuery = appQuery.in("campus_id", scopedCampusIds);
  }

  const { data: apps } = await appQuery;

  const allApps: PipelineStudent[] = (apps ?? []).map(
    (row: Record<string, unknown>) => {
      const student = row.student as Record<string, string> | null;
      const campus = row.campus as Record<string, string> | null;
      const grade = row.grade_level as Record<string, string> | null;
      const firstName = student?.first_name ?? "";
      const lastName = student?.last_name ?? "";

      return {
        id: row.id as string,
        student_name: `${firstName} ${lastName}`.trim() || "Unknown",
        campus_name: campus?.name ?? "",
        grade: grade?.grade ?? "",
        status: row.status as string,
        updated_at: new Date(row.updated_at as string).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric" }
        ),
        initials: `${firstName[0] ?? ""}${lastName[0] ?? ""}`,
      };
    }
  );

  const columnData = PIPELINE_COLUMNS.map((col) => ({
    ...col,
    students: allApps.filter((a) => a.status === col.key),
  }));

  // Also collect declined/withdrawn/expired into a separate bucket
  const closedStatuses = ["declined", "withdrawn", "expired"];
  const closedApps = allApps.filter((a) => closedStatuses.includes(a.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Admissions Pipeline
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {allApps.length} total applications across the enrollment funnel
          </p>
        </div>
      </div>

      {/* Application Flow Diagram */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Application Flow</CardTitle>
          <CardDescription>
            Visual progression through the enrollment pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {columnData.map((col, i) => (
              <div key={col.key} className="flex items-center">
                <div
                  className={`px-3 py-2 rounded-lg border ${col.color} min-w-[90px] text-center`}
                >
                  <p className={`text-xs font-semibold ${col.textColor}`}>
                    {col.label}
                  </p>
                  <p className={`text-lg font-bold ${col.textColor}`}>
                    {col.students.length}
                  </p>
                </div>
                {i < columnData.length - 1 && (
                  <svg
                    className="w-5 h-5 text-gray-300 shrink-0 mx-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columnData.map((col) => (
          <Card key={col.key} className={`border-t-2 ${col.color.split(" ")[1]}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{col.label}</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {col.students.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {col.students.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  No applications
                </p>
              ) : (
                col.students.slice(0, 10).map((student) => (
                  <Link
                    key={student.id}
                    href={`/staff/applications/${student.id}`}
                    className="block no-underline"
                  >
                    <div className="p-2.5 rounded-lg border border-gray-200 bg-white hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-rooted-green/10 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-rooted-green">
                            {student.initials}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {student.student_name}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">
                            Grade {student.grade} &middot; {student.campus_name}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
              {col.students.length > 10 && (
                <p className="text-xs text-gray-400 text-center pt-1">
                  +{col.students.length - 10} more
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Closed/Inactive Applications */}
      {closedApps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                Closed Applications
              </CardTitle>
              <Badge variant="secondary">{closedApps.length}</Badge>
            </div>
            <CardDescription>
              Declined, withdrawn, or expired applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {closedApps.map((app) => (
                <Link
                  key={app.id}
                  href={`/staff/applications/${app.id}`}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 no-underline"
                >
                  <span className="text-xs font-medium text-gray-600">
                    {app.student_name}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {app.status}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
