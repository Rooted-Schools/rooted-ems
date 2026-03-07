export const runtime = "edge";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { getStaffStudents } from "@/lib/queries";

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" | "secondary" }> = {
  submitted: { label: "Submitted", variant: "default" },
  needs_info: { label: "Needs Info", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  lottery_assigned: { label: "In Lottery", variant: "secondary" },
  offered: { label: "Offered", variant: "default" },
  accepted: { label: "Accepted", variant: "success" },
  registered: { label: "Registered", variant: "success" },
  waitlisted: { label: "Waitlisted", variant: "outline" },
  declined: { label: "Declined", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
};

export default async function StaffStudentsPage() {
  const students = await getStaffStudents();

  const totalStudents = students.length;
  const activeCount = students.filter((s) =>
    ["submitted", "verified", "offered", "accepted", "registered"].includes(s.status)
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <p className="text-sm text-gray-500 mt-1">
          All students who have applied to a Rooted School campus.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Applicants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalStudents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active in Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Registered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {students.filter((s) => s.status === "registered").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="👤"
              title="No student records"
              description="Students will appear here once families submit applications."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Students</CardTitle>
            <CardDescription>
              Click a student name to view their application details.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => {
                  const cfg = statusConfig[student.status] ?? { label: student.status, variant: "outline" as const };
                  return (
                    <TableRow key={`${student.id}-${student.application_id}`}>
                      <TableCell className="font-medium">
                        {student.application_id ? (
                          <Link
                            href={`/staff/applications/${student.application_id}`}
                            className="text-rooted-green hover:underline"
                          >
                            {student.first_name} {student.last_name}
                          </Link>
                        ) : (
                          <span>{student.first_name} {student.last_name}</span>
                        )}
                      </TableCell>
                      <TableCell>{student.grade}</TableCell>
                      <TableCell>{student.campus_name}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {student.guardian_name}
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {student.guardian_email}
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
