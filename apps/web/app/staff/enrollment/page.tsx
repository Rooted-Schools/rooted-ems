export const runtime = "edge";
export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStaffEnrollments } from "@/lib/queries";

const enrollmentStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "warning" },
  active: { label: "Active", variant: "success" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
  transferred: { label: "Transferred", variant: "outline" },
};

export default async function StaffEnrollmentPage() {
  const { enrollments, stats } = await getStaffEnrollments();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enrollment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Students who have completed the full enrollment process and are registered.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              SIS Synced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.sis_synced}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Withdrawn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.withdrawn === 0 ? "text-gray-300" : "text-red-600"}`}>
              {stats.withdrawn}
            </p>
          </CardContent>
        </Card>
      </div>

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="🎓"
              title="No enrollments yet"
              description="Enrolled students will appear here after they accept an offer and complete registration."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SIS ID</TableHead>
                  <TableHead>Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => {
                  const cfg =
                    enrollmentStatusConfig[enrollment.status] ??
                    enrollmentStatusConfig.pending;
                  return (
                    <TableRow key={enrollment.id}>
                      <TableCell className="font-medium">
                        {enrollment.student_name}
                      </TableCell>
                      <TableCell>{enrollment.grade}</TableCell>
                      <TableCell>{enrollment.campus_name}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {enrollment.sis_id ? (
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                            {enrollment.sis_id}
                          </code>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {enrollment.enrolled_at ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
