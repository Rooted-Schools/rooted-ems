export const runtime = "edge";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const MOCK_ENROLLED = [
  {
    id: "enr-001",
    studentName: "Maya Patel",
    grade: "6th Grade",
    campus: "Columbia SC",
    status: "active",
    enrolledAt: "2026-02-20",
    sisId: "RSF-2026-0042",
  },
  {
    id: "enr-002",
    studentName: "Aisha Mohammed",
    grade: "8th Grade",
    campus: "Cleveland OH",
    status: "active",
    enrolledAt: "2026-03-01",
    sisId: "RSF-2026-0058",
  },
];

const enrollmentStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "warning" },
  active: { label: "Active", variant: "success" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
  transferred: { label: "Transferred", variant: "outline" },
};

export default function StaffEnrollmentPage() {
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
            <p className="text-2xl font-bold text-rooted-green">
              {MOCK_ENROLLED.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {MOCK_ENROLLED.filter((e) => e.status === "active").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              SIS Synced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {MOCK_ENROLLED.filter((e) => e.sisId).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Withdrawn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-300">0</p>
          </CardContent>
        </Card>
      </div>

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
              {MOCK_ENROLLED.map((enrollment) => {
                const cfg =
                  enrollmentStatusConfig[enrollment.status] ??
                  enrollmentStatusConfig.pending;
                return (
                  <TableRow key={enrollment.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      {enrollment.studentName}
                    </TableCell>
                    <TableCell>{enrollment.grade}</TableCell>
                    <TableCell>{enrollment.campus}</TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {enrollment.sisId}
                      </code>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {enrollment.enrolledAt}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
