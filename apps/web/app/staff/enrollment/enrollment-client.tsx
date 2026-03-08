"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { staffWithdrawEnrollment, staffSyncSIS } from "./actions";

interface EnrollmentRow {
  id: string;
  status: string;
  student_name: string;
  grade: string;
  campus_name: string;
  enrolled_at: string | null;
  sis_id: string | null;
}

interface EnrollmentStats {
  total: number;
  active: number;
  sis_synced: number;
  withdrawn: number;
}

const enrollmentStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "warning" },
  active: { label: "Active", variant: "success" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
  transferred: { label: "Transferred", variant: "outline" },
};

export function EnrollmentClient({
  enrollments,
  stats,
}: {
  enrollments: EnrollmentRow[];
  stats: EnrollmentStats;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sisInput, setSisInput] = useState<Record<string, string>>({});

  // Auto-clear error messages after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function handleSyncSIS(enrollmentId: string) {
    const sisId = sisInput[enrollmentId]?.trim();
    if (!sisId) return;
    setLoading(enrollmentId);
    setError(null);
    const result = await staffSyncSIS(enrollmentId, sisId);
    if (result.error) setError(result.error);
    else router.refresh();
    setLoading(null);
  }

  async function handleWithdraw(enrollmentId: string) {
    if (!confirm("Are you sure you want to withdraw this enrollment?")) return;
    setLoading(enrollmentId);
    setError(null);
    const result = await staffWithdrawEnrollment(enrollmentId, "Withdrawn by staff.");
    if (result.error) setError(result.error);
    else router.refresh();
    setLoading(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Enrollment</h1>
          <p className="text-sm text-stone mt-1">
            Students who have completed the full enrollment process and are registered.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Total Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{stats.total}</p>
            <p className="text-xs text-stone mt-1">all time</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            <p className="text-xs text-stone mt-1">currently enrolled</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              SIS Synced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.sis_synced}</p>
            <p className="text-xs text-stone mt-1">
              {stats.active > 0
                ? `${Math.round((stats.sis_synced / stats.active) * 100)}% of active`
                : "synced to SIS"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-stone">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Withdrawn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.withdrawn === 0 ? "text-stone/50" : "text-red-600"}`}>
              {stats.withdrawn}
            </p>
            <p className="text-xs text-stone mt-1">
              {stats.withdrawn === 0 ? "none" : "students withdrawn"}
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
                  <TableHead className="w-40">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => {
                  const cfg =
                    enrollmentStatusConfig[enrollment.status] ??
                    enrollmentStatusConfig.pending;
                  const isActive = enrollment.status === "active";
                  const isLoading = loading === enrollment.id;
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
                          <code className="text-xs bg-rooted-gray px-1.5 py-0.5 rounded">
                            {enrollment.sis_id}
                          </code>
                        ) : isActive ? (
                          <div className="flex gap-1 items-center">
                            <Input
                              className="h-7 w-28 text-xs"
                              placeholder="SIS ID"
                              value={sisInput[enrollment.id] ?? ""}
                              onChange={(e) =>
                                setSisInput((prev) => ({
                                  ...prev,
                                  [enrollment.id]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isLoading || !sisInput[enrollment.id]?.trim()}
                              onClick={() => handleSyncSIS(enrollment.id)}
                            >
                              Sync
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-stone">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-stone">
                        {enrollment.enrolled_at ?? "—"}
                      </TableCell>
                      <TableCell>
                        {isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isLoading}
                            onClick={() => handleWithdraw(enrollment.id)}
                          >
                            Withdraw
                          </Button>
                        )}
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
