export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  campus_name: string;
  status: string;
  application_id: string;
  guardian_name: string;
  race_ethnicity: string[];
}

export default async function StaffStudentsPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);
  const supabase = await createServerClient();

  let appQuery = supabase
    .from("application")
    .select(
      `
      id, status,
      student:student_id (id, first_name, last_name, race_ethnicity, date_of_birth),
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      guardian:guardian_id (first_name, last_name)
    `
    )
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (campusIds.length > 0) {
    appQuery = appQuery.in("campus_id", campusIds);
  }

  const { data: apps } = await appQuery;

  const students: StudentRow[] = (apps ?? []).map(
    (row: Record<string, unknown>) => {
      const student = row.student as Record<string, unknown> | null;
      const campus = row.campus as Record<string, string> | null;
      const grade = row.grade_level as Record<string, string> | null;
      const guardian = row.guardian as Record<string, string> | null;

      return {
        id: (student?.id as string) ?? "",
        first_name: (student?.first_name as string) ?? "",
        last_name: (student?.last_name as string) ?? "",
        grade: grade?.grade ?? "",
        campus_name: campus?.name ?? "",
        status: row.status as string,
        application_id: row.id as string,
        guardian_name: guardian
          ? `${guardian.first_name} ${guardian.last_name}`
          : "",
        race_ethnicity: (student?.race_ethnicity as string[]) ?? [],
      };
    }
  );

  const statusConfig: Record<string, { label: string; variant: string }> = {
    submitted: { label: "Submitted", variant: "default" },
    needs_info: { label: "Needs Info", variant: "warning" },
    verified: { label: "Verified", variant: "success" },
    lottery_assigned: { label: "Lottery", variant: "secondary" },
    offered: { label: "Offered", variant: "default" },
    accepted: { label: "Accepted", variant: "success" },
    registered: { label: "Registered", variant: "success" },
    declined: { label: "Declined", variant: "destructive" },
    withdrawn: { label: "Withdrawn", variant: "secondary" },
    expired: { label: "Expired", variant: "secondary" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <p className="text-sm text-gray-500 mt-1">
          {students.length} student record{students.length !== 1 ? "s" : ""}{" "}
          with active applications
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Student Records</CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No student records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Student
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Campus
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Grade
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Guardian
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Demographics
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const config = statusConfig[s.status] ?? {
                      label: s.status,
                      variant: "secondary",
                    };
                    return (
                      <tr
                        key={s.application_id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-3">
                          <Link
                            href={`/staff/applications/${s.application_id}`}
                            className="no-underline"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-rooted-green/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-rooted-green">
                                  {s.first_name[0]}
                                  {s.last_name[0]}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-gray-900 hover:text-rooted-green-dark">
                                {s.first_name} {s.last_name}
                              </span>
                            </div>
                          </Link>
                        </td>
                        <td className="py-3 text-gray-600">{s.campus_name}</td>
                        <td className="py-3 text-gray-600">
                          Grade {s.grade}
                        </td>
                        <td className="py-3 text-gray-600">
                          {s.guardian_name}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {s.race_ethnicity.map((eth) => (
                              <Badge
                                key={eth}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {eth}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              config.variant as
                                | "default"
                                | "secondary"
                                | "success"
                                | "warning"
                                | "destructive"
                            }
                          >
                            {config.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
